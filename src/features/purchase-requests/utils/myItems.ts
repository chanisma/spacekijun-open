/**
 * 신청자 화면 «내 신청 품목» — 신청서 여러 장을 품목 한 목록으로 펼친다 (2026-10-13 화면 개편).
 *
 * 저장 단위는 여전히 **신청건**(`purchase_requests` 한 행 = items 배열)이다. 새 신청 알림이 INSERT
 * 트리거에 걸려 있고(제출 한 번 = 알림 한 번), 품목 상태·품의 연결이 (신청 id, 행 id) 로 묶여 있어
 * 저장 모델을 바꾸면 그 셋이 함께 흔들린다. 그래서 바뀌는 것은 **보여 주는 단위**뿐이고, 품목 하나를
 * 고치거나 지울 때는 여기 함수들이 "그 품목이 든 신청을 어떻게 다시 쓸지" 계획을 만든다.
 *
 * 순수 모듈이다(React·supabase 비의존) — 회귀 `scripts/purchase-requests-test/run-ui-restructure.mts`.
 */
import { PurchaseColumn, PurchaseItemRow, PurchaseRequest, PurchaseRequestStatus } from '../types';
import { getItemStatusEntry } from './itemStatus';
import { meaningfulItemRows, purchaseItemKey } from './purchaseOrder';
import { countByStatusFilter, StatusFilter } from './statusFilter';

type RequestLike = Pick<
  PurchaseRequest,
  'id' | 'items' | 'status' | 'status_reason' | 'meta' | 'created_at' | 'updated_at'
>;

export interface MyItem<R extends RequestLike = RequestLike> {
  /** 품의 정리·매니저 화면과 같은 전역 키 (`요청id::행id`) */
  key: string;
  request: R;
  row: PurchaseItemRow;
  status: PurchaseRequestStatus;
  /** 품목 사유. 품목 상태가 아직 따로 정해지지 않았으면 신청 전체 사유를 따른다 */
  reason: string | null;
}

/** 신청 순서(입력 순서) → 행 순서. 빈 행은 품목이 아니다(매니저 화면과 같은 기준). */
export function flattenMyItems<R extends RequestLike>(
  requests: R[],
  columns: PurchaseColumn[],
): MyItem<R>[] {
  const out: MyItem<R>[] = [];
  for (const request of requests) {
    for (const row of meaningfulItemRows(request.items, columns)) {
      const entry = getItemStatusEntry(request, row.id);
      out.push({
        key: purchaseItemKey(request.id, row.id),
        request,
        row,
        status: entry?.status ?? request.status,
        reason: (entry ? entry.reason : request.status_reason) ?? null,
      });
    }
  }
  return out;
}

export interface MyItemsSummary {
  total: number;
  counts: Record<StatusFilter, number>;
}

export function summarizeMyItems(items: Pick<MyItem, 'status'>[]): MyItemsSummary {
  return { total: items.length, counts: countByStatusFilter(items.map((i) => i.status)) };
}

// ─────────────────────────────────────────────────
// 품목 하나 고치기 / 지우기 → 신청 다시 쓰기 계획
// ─────────────────────────────────────────────────
export type RowEditPlan =
  | { kind: 'update'; requestId: string; items: PurchaseItemRow[] }
  | { kind: 'delete'; requestId: string }
  | { kind: 'missing' };

/**
 * 품목 하나를 바꾼다. **행 id 는 유지한다** — 품목 상태(`meta.itemStatus`)와 품의 연결이 이 id 로
 * 묶여 있어, 새 id 를 주면 매니저가 승인한 품목이 "새로 들어온 품목"이 되고 품의에서 고아가 된다.
 */
export function planReplaceRow(
  request: Pick<RequestLike, 'id' | 'items'>,
  rowId: string,
  cells: PurchaseItemRow['cells'],
): RowEditPlan {
  const items = request.items || [];
  if (!items.some((r) => r.id === rowId)) return { kind: 'missing' };
  return {
    kind: 'update',
    requestId: request.id,
    items: items.map((r) => (r.id === rowId ? { id: r.id, cells: { ...cells } } : r)),
  };
}

/**
 * 품목 하나를 지운다. 지운 뒤 **실제 품목이 하나도 안 남으면 신청 자체를 지운다** — 빈 신청이
 * 남으면 매니저 화면에 "0개 품목" 신청이 생기고 신청자 수에도 잡힌다.
 * 빈 행(값 없는 줄)은 품목이 아니므로 남은 개수에 세지 않는다.
 */
export function planRemoveRow(
  request: Pick<RequestLike, 'id' | 'items'>,
  rowId: string,
  columns: PurchaseColumn[],
): RowEditPlan {
  const items = request.items || [];
  if (!items.some((r) => r.id === rowId)) return { kind: 'missing' };
  const rest = items.filter((r) => r.id !== rowId);
  if (meaningfulItemRows(rest, columns).length === 0) return { kind: 'delete', requestId: request.id };
  return { kind: 'update', requestId: request.id, items: rest };
}

// ─────────────────────────────────────────────────
// 품목 한 줄을 사람이 읽는 모양으로
// ─────────────────────────────────────────────────
export interface ItemField {
  column: PurchaseColumn;
  value: string | number;
}

export interface DescribedItem {
  /** 제목 — 물품명 열 값. 물품명 열이 없거나 비면 null(화면이 대체 문구를 쓴다) */
  title: string | null;
  /** 제목 열을 뺀, 값이 있는 나머지 열(열 순서 그대로) */
  fields: ItemField[];
}

const isBlank = (v: unknown) => v === '' || v === null || v === undefined;

export function describeItemRow(
  row: PurchaseItemRow,
  columns: PurchaseColumn[],
  nameColumn: PurchaseColumn | undefined,
): DescribedItem {
  const rawTitle = nameColumn ? row.cells?.[nameColumn.id] : undefined;
  const title = isBlank(rawTitle) ? null : String(rawTitle).trim() || null;
  const fields: ItemField[] = [];
  for (const column of columns) {
    if (column.id === nameColumn?.id) continue;
    const value = row.cells?.[column.id];
    if (isBlank(value)) continue;
    fields.push({ column, value: value as string | number });
  }
  return { title, fields };
}

/**
 * 필수 열이 빈 곳을 찾는다. 새 신청(여러 줄)과 품목 하나 수정이 **같은 규칙**을 쓴다 —
 * 수정 창만 느슨하면 신청할 때는 막히던 빈 칸이 수정으로 들어온다.
 */
export function missingRequiredColumns(
  cells: PurchaseItemRow['cells'],
  columns: PurchaseColumn[],
): PurchaseColumn[] {
  return columns.filter((c) => c.required && isBlank(cells?.[c.id]));
}

/**
 * 링크 열은 `https://` 가 빠지면 붙인다(빈 값·이미 스킴이 있는 값은 그대로). 새 신청 표와
 * 품목 수정 창이 같은 규칙을 쓴다 — 한쪽만 고치면 같은 링크가 입력 경로에 따라 다르게 저장된다.
 */
export function normalizeCellValue(
  column: Pick<PurchaseColumn, 'type'>,
  value: string | number,
): string | number {
  if (column.type !== 'url') return value;
  const s = String(value ?? '').trim();
  if (!s) return s;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) return s;
  return `https://${s}`;
}
