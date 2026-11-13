import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useRequesterResourceId } from './useRequesterResourceId';
import {
  PurchaseItemRow,
  PurchaseRequest,
  PurchaseRequestPage,
  PurchaseRequestStatus,
  PurchaseRequestWithRequester,
} from '../types';

// 새 테이블이 아직 supabase types.ts에 반영되지 않아 from() 호출 시 타입 오버로드 매칭이 실패함.
// 안전한 도메인 타입은 ../types에서 별도 관리하므로 supabase 클라이언트 자체만 느슨하게 캐스팅.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

const REQUESTS_KEY = ['purchase-requests'] as const;

// 페이지의 모든 신청 (매니저 전용 — RLS가 본인 외 신청을 자동 필터링)
export function usePurchaseRequests(pageId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...REQUESTS_KEY, pageId],
    queryFn: async (): Promise<PurchaseRequestWithRequester[]> => {
      if (!pageId) return [];

      const { data, error } = await supabase
        .from('purchase_requests')
        .select(`
          *,
          requester:requester_id(id, name, type, meta)
        `)
        .eq('page_id', pageId)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as PurchaseRequestWithRequester[];
    },
    enabled: !!user?.id && !!pageId,
  });
}

// 본인 신청 조회 (다건 가능)
export function useMyPurchaseRequests(pageId: string | undefined) {
  const { user } = useAuth();
  const { data: resourceId } = useRequesterResourceId();

  return useQuery({
    queryKey: [...REQUESTS_KEY, pageId, 'mine', resourceId],
    queryFn: async (): Promise<PurchaseRequest[]> => {
      if (!pageId || !resourceId) return [];

      const { data, error } = await supabase
        .from('purchase_requests')
        .select('*')
        .eq('page_id', pageId)
        .eq('requester_id', resourceId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as PurchaseRequest[];
    },
    enabled: !!user?.id && !!pageId && !!resourceId,
  });
}

// 게시판 메인 "내 신청 모아보기" — 페이지 구분 없이 내 신청 전부 + 소속 페이지 정보.
// RLS(requester 본인 행)만으로 안전하게 조회된다.
export interface MyPurchaseRequestWithPage extends PurchaseRequest {
  page?: Pick<
    PurchaseRequestPage,
    'id' | 'title' | 'period_start' | 'period_end' | 'columns' | 'is_archived'
  > | null;
}

export function useMyPurchaseRequestsAllPages() {
  const { user } = useAuth();
  const { data: resourceId } = useRequesterResourceId();

  return useQuery({
    queryKey: [...REQUESTS_KEY, 'mine-all', resourceId],
    queryFn: async (): Promise<MyPurchaseRequestWithPage[]> => {
      if (!resourceId) return [];

      const { data, error } = await supabase
        .from('purchase_requests')
        .select(`
          *,
          page:page_id(id, title, period_start, period_end, columns, is_archived)
        `)
        .eq('requester_id', resourceId)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MyPurchaseRequestWithPage[];
    },
    enabled: !!user?.id && !!resourceId,
  });
}

// 신청 생성/수정 (upsert)
export function useUpsertPurchaseRequest() {
  const queryClient = useQueryClient();
  const { data: resourceId } = useRequesterResourceId();

  return useMutation({
    mutationFn: async ({
      pageId,
      items,
      requestId,
    }: {
      pageId: string;
      items: PurchaseItemRow[];
      requestId?: string;
    }): Promise<PurchaseRequest> => {
      if (!resourceId) throw new Error('현재 사용자의 resource_id를 찾을 수 없습니다.');

      if (requestId) {
        const { data, error } = await supabase
          .from('purchase_requests')
          .update({ items: items as unknown as any })
          .eq('id', requestId)
          .select()
          .single();
        if (error) throw error;
        return data as PurchaseRequest;
      }

      const { data, error } = await supabase
        .from('purchase_requests')
        .insert({
          page_id: pageId,
          requester_id: resourceId,
          items: items as unknown as any,
          status: 'submitted',
        })
        .select()
        .single();
      if (error) throw error;
      return data as PurchaseRequest;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, vars.pageId] });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, vars.pageId, 'mine'] });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'mine-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-request-pages'] });
    },
  });
}

// 신청 삭제
export function useDeletePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, pageId }: { requestId: string; pageId: string }) => {
      const { error } = await supabase
        .from('purchase_requests')
        .delete()
        .eq('id', requestId);
      if (error) throw error;
      return { pageId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, data.pageId] });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, data.pageId, 'mine'] });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'mine-all'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-request-pages'] });
    },
  });
}

/**
 * 매니저의 품목 셀 수정 (물품명 교정용, 2026-09-02)
 *
 * - 권한: `purchase_requests` RLS `update_own_or_manager` 가 페이지 매니저를 이미 허용한다.
 *   **RLS 차단은 오류가 아니라 0행**이므로 `.select('id')` 반환 행으로 실제 반영을 확인한다.
 * - 감사: `purchase_request_history` 트리거가 items 변경 시 OLD 스냅샷을 남기므로
 *   누가 무엇을 고쳤는지 추적할 별도 저장이 필요 없다.
 * - 동시성: items 는 JSONB 한 덩어리라 화면 캐시로 read-modify-write 하면 그 사이
 *   신청자가 추가한 행이 사라진다. **저장 직전에 서버에서 다시 읽어** 해당 행만 갈아끼운다.
 *   같은 이유로 여러 행을 바꿀 때도 **신청 하나당 한 번만** 읽고 쓴다(행마다 부르면
 *   연속 read-modify-write 가 되어 앞 결과를 덮어쓸 여지가 생긴다).
 */
export function useUpdatePurchaseRequestItemCell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      rowIds,
      columnId,
      value,
    }: {
      requestId: string;
      /** 한 신청 안의 여러 행을 **한 번의 read-modify-write** 로 바꾼다(일괄 물품명 통일) */
      rowIds: string[];
      columnId: string;
      value: string;
      pageId: string;
    }): Promise<{ updated: number }> => {
      const targets = new Set(rowIds);
      if (targets.size === 0) return { updated: 0 };

      const { data: current, error: readError } = await supabase
        .from('purchase_requests')
        .select('items')
        .eq('id', requestId)
        .single();
      if (readError) throw readError;

      const rows = (current?.items as PurchaseItemRow[]) || [];
      let updated = 0;
      const items = rows.map((row) => {
        if (!targets.has(row.id)) return row;
        updated += 1;
        return { ...row, cells: { ...row.cells, [columnId]: value } };
      });
      if (updated === 0) {
        throw new Error('해당 품목을 찾을 수 없습니다. 신청자가 이미 삭제했을 수 있습니다.');
      }

      const { data, error } = await supabase
        .from('purchase_requests')
        .update({ items })
        .eq('id', requestId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('수정 권한이 없습니다. 페이지 작성자·공동 작업자만 품목을 고칠 수 있습니다.');
      }
      return { updated };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, vars.pageId] });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, vars.pageId, 'mine'] });
      queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'mine-all'] });
    },
  });
}

// 신청 수정 이력 조회 (트리거가 OLD 스냅샷을 자동 적재)
export interface PurchaseRequestHistoryEntry {
  id: string;
  request_id: string;
  page_id: string;
  requester_id: string;
  items: PurchaseItemRow[];
  status: PurchaseRequestStatus;
  status_reason?: string | null;
  /** 변경 전 meta 스냅샷 — 품목별 승인(`meta.itemStatus`) 이력 추적용 (2026-09-02) */
  meta?: Record<string, unknown> | null;
  snapshot_at: string;
}

export function usePurchaseRequestHistory(requestId: string | undefined, enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...REQUESTS_KEY, 'history', requestId],
    queryFn: async (): Promise<PurchaseRequestHistoryEntry[]> => {
      if (!requestId) return [];

      const { data, error } = await supabase
        .from('purchase_request_history')
        .select('*')
        .eq('request_id', requestId)
        .order('snapshot_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PurchaseRequestHistoryEntry[];
    },
    enabled: !!user?.id && !!requestId && enabled,
  });
}

/**
 * 상태 변경 (매니저 전용) — **품목 단위가 기본이고 신청건 전체는 그 특수 사례다** (2026-09-02).
 *
 * `rowIds`
 *  - 생략(undefined/null) → 신청건의 **모든 품목**을 그 상태로. 종전 "신청건 승인"과 같은 동작.
 *  - 배열 → 지정한 품목만. 신청건 상태는 서버가 나머지 품목까지 보고 파생한다.
 *
 * 쓰기는 `set_purchase_request_item_status` RPC 하나뿐이다 — 직접 UPDATE 를 쓰면
 * ①JSONB read-modify-write 로 동시 승인이 서로를 덮어쓰고 ②신청건 status 파생이
 * 클라이언트로 새어 나가 화면마다 답이 갈린다.
 */
export function useUpdatePurchaseRequestStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      status,
      reason,
      rowIds,
    }: {
      requestId: string;
      status: PurchaseRequestStatus;
      reason?: string | null;
      /** 지정하면 그 품목만, 없으면 신청건 전체 */
      rowIds?: string[] | null;
      pageId?: string;
    }) => {
      const { error } = await supabase.rpc('set_purchase_request_item_status', {
        p_request_id: requestId,
        p_status: status,
        p_row_ids: rowIds && rowIds.length > 0 ? rowIds : null,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      if (vars.pageId) {
        // 매니저 목록 + 신청자 본인 조회 둘 다 무효화 → 신청자 화면 즉시 반영
        queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, vars.pageId] });
        queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, vars.pageId, 'mine'] });
        queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'mine-all'] });
      } else {
        queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      }
    },
  });
}
