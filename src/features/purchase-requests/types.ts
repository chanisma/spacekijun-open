// Purchase Request feature types

export type PurchaseColumnType = 'text' | 'number' | 'url';

export interface PurchaseColumn {
  id: string;
  name: string;
  type: PurchaseColumnType;
  required: boolean;
  isDefault: boolean;
}

export interface PurchaseItemRow {
  id: string;
  cells: Record<string, string | number>;
}

export type TargetRole = 'student' | 'teacher';

export interface PurchaseRequestPage {
  id: string;
  title: string;
  target_roles: TargetRole[];
  description: string | null;
  period_start: string;
  period_end: string;
  columns: PurchaseColumn[];
  is_archived: boolean;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseRequestPageWithRelations extends PurchaseRequestPage {
  creator?: { id: string; name: string };
  collaborators?: Array<{
    id: string;
    resource_id: string;
    resource: { id: string; name: string };
  }>;
  request_count?: number;
  my_request_ids?: string[];
}

export interface PurchaseRequestCollaborator {
  id: string;
  page_id: string;
  resource_id: string;
  created_at: string;
  resource?: { id: string; name: string };
}

export type PurchaseRequestStatus = 'submitted' | 'approved' | 'completed' | 'rejected' | 'pending';

export interface PurchaseRequest {
  id: string;
  page_id: string;
  requester_id: string;
  items: PurchaseItemRow[];
  status: PurchaseRequestStatus;
  // 매니저가 입력한 상태 변경 사유 (최신 1개만 보관)
  status_reason?: string | null;
  // 매니저가 상태/사유를 마지막으로 바꾼 시각
  status_updated_at?: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PurchaseRequestWithRequester extends PurchaseRequest {
  requester?: { id: string; name: string; type?: string; meta?: Record<string, unknown> };
}

// 페이지 생성/수정 입력
export interface CreatePurchaseRequestPageInput {
  title: string;
  target_roles: TargetRole[];
  description?: string;
  period_start: string;
  period_end: string;
  columns: PurchaseColumn[];
  collaborator_resource_ids?: string[];
}

export interface UpdatePurchaseRequestPageInput {
  title?: string;
  target_roles?: TargetRole[];
  description?: string | null;
  period_start?: string;
  period_end?: string;
  columns?: PurchaseColumn[];
  is_archived?: boolean;
  collaborator_resource_ids?: string[];
}

// 기본 6개 컬럼 정의 — 물품명 → 상세 옵션 → 주소 → 개별 가격 → 개수 → 비고
export const DEFAULT_COLUMNS: PurchaseColumn[] = [
  { id: 'default-name', name: '물품명', type: 'text', required: true, isDefault: true },
  { id: 'default-option', name: '상세 옵션', type: 'text', required: false, isDefault: true },
  { id: 'default-url', name: '구매 가능한 주소', type: 'url', required: true, isDefault: true },
  { id: 'default-price', name: '개별 가격', type: 'number', required: true, isDefault: true },
  { id: 'default-qty', name: '개수', type: 'number', required: true, isDefault: true },
  { id: 'default-note', name: '비고(필요한 이유)', type: 'text', required: false, isDefault: true },
];

// price * qty 합계 계산 (기본 컬럼이 모두 존재할 때만)
export function computeRowsTotalKRW(
  rows: PurchaseItemRow[],
  columns: PurchaseColumn[],
): number | null {
  const priceCol = columns.find((c) => c.id === 'default-price');
  const qtyCol = columns.find((c) => c.id === 'default-qty');
  if (!priceCol || !qtyCol) return null;
  let sum = 0;
  for (const row of rows) {
    const p = Number(row.cells?.[priceCol.id]) || 0;
    const q = Number(row.cells?.[qtyCol.id]) || 0;
    sum += p * q;
  }
  return sum;
}

// 접힌 카드·목록 행에서 쓰는 품목 한 줄 요약 — "보드마카 외 2건"
export function summarizeItemNames(
  rows: PurchaseItemRow[],
  columns: PurchaseColumn[],
): string | null {
  const nameCol =
    columns.find((c) => c.id === 'default-name') ?? columns.find((c) => c.type === 'text');
  if (!nameCol) return null;
  const meaningful = rows.filter((r) =>
    columns.some((c) => {
      const v = r.cells?.[c.id];
      return v !== '' && v !== null && v !== undefined;
    }),
  );
  const names = meaningful
    .map((r) => String(r.cells?.[nameCol.id] ?? '').trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  return meaningful.length === 1 ? names[0] : `${names[0]} 외 ${meaningful.length - 1}건`;
}

export function getPagePeriodStatus(page: Pick<PurchaseRequestPage, 'period_start' | 'period_end'>): 'upcoming' | 'open' | 'closed' {
  const now = Date.now();
  const start = new Date(page.period_start).getTime();
  const end = new Date(page.period_end).getTime();
  if (now < start) return 'upcoming';
  if (now > end) return 'closed';
  return 'open';
}

// =================================================
// 품의 정리 (2026-10-12) — 신청과 공문 사이의 매니저 단계
// 표 = purchase_order_batches / purchase_order_lines / purchase_order_line_items
// =================================================

/** draft = 작성 중 · submitted = 품의 완료 · purchased = 구매 완료 */
export type PurchaseOrderBatchStatus = 'draft' | 'submitted' | 'purchased';

/** 품의 차수 — 「1차 품의」처럼 한 번에 올리는 묶음 */
export interface PurchaseOrderBatch {
  id: string;
  page_id: string;
  title: string;
  status: PurchaseOrderBatchStatus;
  note: string | null;
  sort_order: number;
  status_updated_at: string | null;
  created_by: string | null;
  /** 이 차수 표의 열 정의. 빈 배열 = 기본 열 (utils/purchaseOrder.resolveOrderColumns) */
  columns: PurchaseOrderColumn[];
  created_at: string;
  updated_at: string;
}

/**
 * 품의 품목의 기본 칸 — 실제 DB 컬럼이다. 금액·공문·신청자 진행 조회가 이 칸을 읽는다.
 * (사용자가 만든 열은 `extra` 에 들어간다)
 */
export type PurchaseOrderField =
  | 'name'
  | 'spec'
  | 'usage_period'
  | 'unit_price'
  | 'qty'
  | 'vendor'
  | 'url'
  | 'payment_method'
  | 'budget_item'
  | 'note';

/** 품의 표의 열. `field` 가 있으면 기본 칸, 없으면 사용자 열(값은 line.extra[id]) */
export interface PurchaseOrderColumn {
  id: string;
  name: string;
  type: PurchaseColumnType;
  field?: PurchaseOrderField;
}

/** 품의 품목 — 기본 칸 + 사용자 열 값(extra) */
export interface PurchaseOrderLine {
  id: string;
  batch_id: string;
  page_id: string;
  sort_order: number;
  name: string;
  spec: string | null;
  unit_price: number | null;
  qty: number | null;
  usage_period: string | null;
  vendor: string | null;
  url: string | null;
  payment_method: string | null;
  budget_item: string | null;
  note: string | null;
  /** 사용자 열 값 { 열 id: 값 } */
  extra: Record<string, string | number | null>;
  created_at: string;
  updated_at: string;
}

/** 품의 품목에서 사람이 고칠 수 있는 기본 칸 */
export type PurchaseOrderLineInput = Pick<
  PurchaseOrderLine,
  | 'name'
  | 'spec'
  | 'unit_price'
  | 'qty'
  | 'usage_period'
  | 'vendor'
  | 'url'
  | 'payment_method'
  | 'budget_item'
  | 'note'
>;

/** 신청 품목(purchase_requests.items[].id) → 품의 품목. 신청 품목 하나는 한 곳에만 들어간다 */
export interface PurchaseOrderLink {
  id: string;
  line_id: string;
  page_id: string;
  request_id: string;
  row_id: string;
  created_at: string;
}

/** 신청자가 보는 품의 진행 — 단가·구매처는 싣지 않는다(get_my_purchase_order_progress) */
export interface PurchaseOrderProgress {
  request_id: string;
  row_id: string;
  line_name: string;
  batch_title: string;
  batch_status: PurchaseOrderBatchStatus;
  status_updated_at: string | null;
}
