/**
 * 품의 정리 데이터 계층 (2026-10-12)
 *
 * - 차수·품의 품목·연결 세 표는 **페이지 매니저만** 읽고 쓴다(RLS `is_purchase_page_manager`).
 *   RLS 차단은 오류가 아니라 0행이라, 쓰기는 반환 행으로 실제 반영을 확인한다.
 * - 차수 상태 변경은 신청 품목 상태까지 바꾸므로 RPC `set_purchase_order_batch_status` 하나로만 한다.
 * - 신청자는 표를 못 읽고 `get_my_purchase_order_progress` 로 차수·단계·확정 품명만 받는다.
 * - 표는 엑셀처럼 셀마다 저장한다(같은 날 후속). 셀 저장은 **화면을 먼저 바꾸고**(낙관적 갱신)
 *   실패하면 되돌린다 — 저장 왕복을 기다리면 칸을 옮겨 다닐 때마다 값이 깜빡인다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import type {
  PurchaseColumn,
  PurchaseOrderBatch,
  PurchaseOrderBatchStatus,
  PurchaseOrderColumn,
  PurchaseOrderLine,
  PurchaseOrderLineInput,
  PurchaseOrderLink,
  PurchaseOrderProgress,
} from '../types';
import type { SelectedPurchaseItem } from '../utils/officialDocument';
import {
  type LinePatch,
  applyQtyDelta,
  planAddToBatch,
  planMergeLines,
} from '../utils/purchaseOrder';

// 새 표가 아직 supabase types.ts 에 없다 — usePurchaseRequests 와 같은 이유로 느슨하게 캐스팅
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

const ORDER_KEY = ['purchase-orders'] as const;
const REQUESTS_KEY = ['purchase-requests'] as const;

export interface PurchaseOrderData {
  batches: PurchaseOrderBatch[];
  lines: PurchaseOrderLine[];
  links: PurchaseOrderLink[];
}

const NO_PERMISSION = '권한이 없습니다. 페이지 작성자·공동 작업자만 품의를 정리할 수 있습니다.';

/** 페이지의 품의 정리 전체 — 매니저 전용. 양이 작아(페이지당 수십 행) 한 번에 읽는다 */
export function usePurchaseOrderData(pageId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...ORDER_KEY, pageId],
    queryFn: async (): Promise<PurchaseOrderData> => {
      if (!pageId) return { batches: [], lines: [], links: [] };
      const [b, l, k] = await Promise.all([
        supabase
          .from('purchase_order_batches')
          .select('*')
          .eq('page_id', pageId)
          .order('sort_order')
          .order('created_at'),
        supabase
          .from('purchase_order_lines')
          .select('*')
          .eq('page_id', pageId)
          .order('sort_order')
          .order('created_at'),
        supabase.from('purchase_order_line_items').select('*').eq('page_id', pageId),
      ]);
      if (b.error) throw b.error;
      if (l.error) throw l.error;
      if (k.error) throw k.error;
      return {
        batches: (b.data || []) as PurchaseOrderBatch[],
        lines: ((l.data || []) as PurchaseOrderLine[]).map((line) => ({
          ...line,
          extra: line.extra ?? {},
        })),
        links: (k.data || []) as PurchaseOrderLink[],
      };
    },
    enabled: !!user?.id && !!pageId && enabled,
  });
}

/** 신청자 화면 — 내 품목의 품의 진행. pageId 를 비우면 모든 페이지 */
export function useMyPurchaseOrderProgress(pageId: string | null | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...ORDER_KEY, 'mine', pageId ?? 'all'],
    queryFn: async (): Promise<PurchaseOrderProgress[]> => {
      const { data, error } = await supabase.rpc('get_my_purchase_order_progress', {
        p_page_id: pageId ?? null,
      });
      if (error) throw error;
      return (data || []) as PurchaseOrderProgress[];
    },
    enabled: !!user?.id && enabled && pageId !== undefined,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (pageId: string, alsoRequests = false) => {
    queryClient.invalidateQueries({ queryKey: [...ORDER_KEY, pageId] });
    queryClient.invalidateQueries({ queryKey: [...ORDER_KEY, 'mine'] });
    if (alsoRequests) {
      // 차수 상태 연동으로 신청 품목 상태가 바뀌었다 — 매니저·신청자 화면 모두
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, pageId] });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'mine-all'] });
    }
  };
}

// ── 공통 쓰기 ─────────────────────────────────────────
async function updateLine(lineId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('purchase_order_lines')
    .update(patch)
    .eq('id', lineId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NO_PERMISSION);
}

async function insertLine(
  pageId: string,
  batchId: string,
  values: PurchaseOrderLineInput,
  sortOrder: number,
): Promise<PurchaseOrderLine> {
  // page_id 는 트리거가 차수에서 채운다(NOT NULL 이라 자리만 보낸다)
  const { data, error } = await supabase
    .from('purchase_order_lines')
    .insert({ ...values, batch_id: batchId, page_id: pageId, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data as PurchaseOrderLine;
}

async function upsertLinks(
  pageId: string,
  lineId: string,
  items: { requestId: string; rowId: string }[],
): Promise<void> {
  if (items.length === 0) return;
  // (request_id, row_id) 유니크 — 이미 다른 품의 품목에 있으면 line_id 만 바뀐다(옮기기)
  const { data, error } = await supabase
    .from('purchase_order_line_items')
    .upsert(
      items.map((it) => ({
        line_id: lineId,
        page_id: pageId,
        request_id: it.requestId,
        row_id: it.rowId,
      })),
      { onConflict: 'request_id,row_id' },
    )
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NO_PERMISSION);
}

async function deleteLines(lineIds: string[]) {
  if (lineIds.length === 0) return;
  const { data, error } = await supabase
    .from('purchase_order_lines')
    .delete()
    .in('id', lineIds)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NO_PERMISSION);
}

// ── 차수 ─────────────────────────────────────────────
export function useCreatePurchaseOrderBatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      pageId: string;
      title: string;
      sortOrder: number;
      createdBy?: string | null;
      /** 직전 차수의 열 정의 — 사용자가 만든 열이 새 차수에도 이어진다 */
      columns?: PurchaseOrderColumn[];
    }): Promise<PurchaseOrderBatch> => {
      const { data, error } = await supabase
        .from('purchase_order_batches')
        .insert({
          page_id: input.pageId,
          title: input.title.trim(),
          sort_order: input.sortOrder,
          created_by: input.createdBy ?? null,
          columns: input.columns ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as PurchaseOrderBatch;
    },
    onSuccess: (_, vars) => invalidate(vars.pageId),
  });
}

export function useUpdatePurchaseOrderBatch() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pageId: string;
      batchId: string;
      patch: Partial<Pick<PurchaseOrderBatch, 'title' | 'note' | 'columns'>>;
    }) => {
      const { data, error } = await supabase
        .from('purchase_order_batches')
        .update(input.patch)
        .eq('id', input.batchId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NO_PERMISSION);
    },
    // 열 추가·이름 바꾸기가 바로 보이도록 먼저 바꾼다
    onMutate: async (input) => {
      const key = [...ORDER_KEY, input.pageId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<PurchaseOrderData>(key);
      if (prev) {
        queryClient.setQueryData<PurchaseOrderData>(key, {
          ...prev,
          batches: prev.batches.map((b) => (b.id === input.batchId ? { ...b, ...input.patch } : b)),
        });
      }
      return { prev };
    },
    onError: (_e, input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([...ORDER_KEY, input.pageId], ctx.prev);
    },
    onSettled: (_, __, vars) => invalidate(vars.pageId),
  });
}

export function useDeletePurchaseOrderBatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { pageId: string; batchId: string }) => {
      const { data, error } = await supabase
        .from('purchase_order_batches')
        .delete()
        .eq('id', input.batchId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NO_PERMISSION);
    },
    onSuccess: (_, vars) => invalidate(vars.pageId),
  });
}

/** 차수 상태 — 연결된 신청 품목 상태까지 서버가 함께 바꾼다 */
export function useSetPurchaseOrderBatchStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      pageId: string;
      batchId: string;
      status: PurchaseOrderBatchStatus;
    }): Promise<{ updatedItems: number }> => {
      const { data, error } = await supabase.rpc('set_purchase_order_batch_status', {
        p_batch_id: input.batchId,
        p_status: input.status,
      });
      if (error) throw error;
      return { updatedItems: Number(data?.updatedItems ?? 0) };
    },
    onSuccess: (_, vars) => invalidate(vars.pageId, true),
  });
}

// ── 표 셀 ─────────────────────────────────────────────
/**
 * 품목 셀 저장 — 여러 행을 한 번에(붙여넣기). 행마다 UPDATE 한 번.
 * 화면은 먼저 바꾸고 실패하면 되돌린다.
 */
export function useUpdatePurchaseOrderLines() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pageId: string;
      updates: { lineId: string; patch: LinePatch }[];
    }) => {
      for (const u of input.updates) await updateLine(u.lineId, u.patch);
    },
    onMutate: async (input) => {
      const key = [...ORDER_KEY, input.pageId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<PurchaseOrderData>(key);
      if (prev) {
        const byId = new Map(input.updates.map((u) => [u.lineId, u.patch]));
        queryClient.setQueryData<PurchaseOrderData>(key, {
          ...prev,
          lines: prev.lines.map((l) => {
            const p = byId.get(l.id);
            return p ? ({ ...l, ...p } as PurchaseOrderLine) : l;
          }),
        });
      }
      return { prev };
    },
    onError: (_e, input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([...ORDER_KEY, input.pageId], ctx.prev);
    },
    onSettled: (_, __, vars) => invalidate(vars.pageId),
  });
}

/** 표 맨 아래 빈 줄에 품명을 적으면 새 품목 */
export function useCreatePurchaseOrderLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      pageId: string;
      batchId: string;
      values: PurchaseOrderLineInput;
      sortOrder: number;
    }) => insertLine(input.pageId, input.batchId, input.values, input.sortOrder),
    onSuccess: (_, vars) => invalidate(vars.pageId),
  });
}

// ── ▲ 올리기 · 내리기 · 합치기 · 빼기 ──────────────────
export interface AddToBatchResult {
  created: number;
  appended: number;
  moved: number;
  skipped: number;
}

/**
 * 고른 신청 품목을 차수에 올린다 — 같은 물품은 한 줄로, 이미 같은 이름의 줄이 있으면 거기에.
 * 계획은 `planAddToBatch`(순수)가 세우고 여기서는 쓰기만 한다.
 */
export function useAddItemsToBatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      pageId: string;
      batchId: string;
      selection: SelectedPurchaseItem[];
      columns: PurchaseColumn[];
      lines: PurchaseOrderLine[];
      links: PurchaseOrderLink[];
    }): Promise<AddToBatchResult> => {
      const batchLines = input.lines.filter((l) => l.batch_id === input.batchId);
      const plan = planAddToBatch(input.selection, input.columns, batchLines, input.links);
      const toItems = (items: SelectedPurchaseItem[]) =>
        items.map((s) => ({ requestId: s.requestId, rowId: s.row.id }));

      let sort = batchLines.reduce((m, l) => Math.max(m, l.sort_order + 1), 0);
      for (const c of plan.creates) {
        const line = await insertLine(input.pageId, input.batchId, c.values, sort++);
        await upsertLinks(input.pageId, line.id, toItems(c.items));
      }
      for (const a of plan.appends) await upsertLinks(input.pageId, a.lineId, toItems(a.items));

      const lineById = new Map(input.lines.map((l) => [l.id, l]));
      for (const [lineId, delta] of plan.qtyDelta) {
        const line = lineById.get(lineId);
        if (!line || line.qty === null) continue;
        await updateLine(lineId, { qty: applyQtyDelta(line.qty, delta) });
      }
      return {
        created: plan.creates.length,
        appended: plan.appends.reduce((n, a) => n + a.items.length, 0),
        moved: plan.moved,
        skipped: plan.skipped,
      };
    },
    onSuccess: (_, vars) => invalidate(vars.pageId),
  });
}

/** 차수에서 내리기 — 품의 품목을 지운다. 연결된 신청 품목은 '아직 안 담긴' 쪽으로 돌아간다 */
export function useRemovePurchaseOrderLines() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { pageId: string; lineIds: string[] }) => deleteLines(input.lineIds),
    onSuccess: (_, vars) => invalidate(vars.pageId),
  });
}

/** 여러 품목을 맨 위 품목 하나로 합친다 — 연결을 옮기고 수량을 더한 뒤 나머지를 지운다 */
export function useMergePurchaseOrderLines() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { pageId: string; lines: PurchaseOrderLine[] }) => {
      const plan = planMergeLines(input.lines);
      if (!plan) return;
      const removeIds = plan.remove.map((l) => l.id);
      // 연결을 먼저 옮긴다 — 품목부터 지우면 cascade 로 연결이 사라진다
      const { error } = await supabase
        .from('purchase_order_line_items')
        .update({ line_id: plan.keep.id })
        .in('line_id', removeIds);
      if (error) throw error;
      if (plan.qty !== plan.keep.qty) await updateLine(plan.keep.id, { qty: plan.qty });
      await deleteLines(removeIds);
    },
    onSuccess: (_, vars) => invalidate(vars.pageId),
  });
}

/** 품의 품목에서 신청 품목 하나를 뺀다 — 수량이 적혀 있으면 그 품목만큼 줄인다 */
export function useUnlinkPurchaseOrderItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      pageId: string;
      linkId: string;
      line: PurchaseOrderLine;
      qtyDelta: number;
    }) => {
      const { data, error } = await supabase
        .from('purchase_order_line_items')
        .delete()
        .eq('id', input.linkId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NO_PERMISSION);
      if (input.line.qty !== null && input.qtyDelta !== 0) {
        await updateLine(input.line.id, { qty: applyQtyDelta(input.line.qty, input.qtyDelta) });
      }
    },
    onSuccess: (_, vars) => invalidate(vars.pageId),
  });
}
