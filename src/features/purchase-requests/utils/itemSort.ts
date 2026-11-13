/**
 * 품목 표 열 정렬 (순수, React 비의존)
 *
 * 정렬 값은 **화면에 보이는 것**을 기준으로 뽑는다 — 사용자가 누른 열의 글자를 보고
 * 순서를 예상하기 때문이다. 그래서 상태는 `STATUS_OPTIONS` 의 진행 순서를 쓰고
 * (제출됨 → 검토중 → 승인 → 완료 → 불가) 숫자 열은 숫자로 비교한다.
 */
import { SortState, sortRows } from '@/lib/tableSort';
import { PurchaseColumn, PurchaseItemRow, PurchaseRequestStatus } from '../types';
import { STATUS_OPTIONS } from '../purchaseRequestStatus';

/** 페이지 컬럼 id 와 겹치지 않도록 `__` 접두를 쓴다 */
export const REQUESTER_SORT_KEY = '__requester';
export const STATUS_SORT_KEY = '__status';

const STATUS_ORDER = new Map<string, number>(STATUS_OPTIONS.map((o, i) => [o.value, i]));

export interface SortableFlatItem {
  req: { requester?: { name: string } | null };
  row: PurchaseItemRow;
}

/**
 * 정렬된 새 배열. `sort` 가 null 이면 원본 순서 그대로.
 *
 * `Array.prototype.sort` 는 안정 정렬이라 값이 같은 행은 **기존 순서(신청건 정렬 드롭다운
 * 결과)를 유지**한다 — 열 정렬과 기본 정렬이 자연스럽게 겹쳐 쓰인다.
 */
export function sortFlatItems<T extends SortableFlatItem>(
  items: T[],
  sort: SortState | null,
  columns: PurchaseColumn[],
  getStatus: (item: T) => PurchaseRequestStatus,
): T[] {
  const numericColumnIds = new Set(
    columns.filter((c) => c.type === 'number').map((c) => c.id),
  );

  return sortRows(
    items,
    sort,
    (item, key) => {
      if (key === REQUESTER_SORT_KEY) return item.req.requester?.name ?? '';
      if (key === STATUS_SORT_KEY) return STATUS_ORDER.get(getStatus(item)) ?? 99;
      return item.row.cells?.[key];
    },
    (key) => key === STATUS_SORT_KEY || numericColumnIds.has(key),
  );
}
