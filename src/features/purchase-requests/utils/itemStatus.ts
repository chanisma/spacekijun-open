/**
 * 품목(항목) 단위 승인 — 읽기·파생 규칙 (순수 로직, React 비의존)
 *
 * 2026-09-02 이전에는 상태가 신청건 1건에 하나뿐이라 "3개 중 2개만 승인"을 표현할 수 없었다.
 * 지금은 품목마다 상태를 갖고 **신청건 상태는 품목 상태에서 파생**된다(단일 출처).
 *
 * 저장 위치 = `purchase_requests.meta.itemStatus` = `{ [items[].id]: {status, reason, at, by} }`
 *  - 쓰기는 `set_purchase_request_item_status` RPC 하나뿐이다. JSONB read-modify-write 라
 *    클라이언트가 직접 쓰면 동시 승인 시 서로를 덮어쓰고, `guard_purchase_request_status`
 *    트리거가 비매니저의 직접 쓰기를 되돌린다.
 *  - **파생 규칙은 여기와 SQL `purchase_derive_request_status()` 두 곳에 있다.** 한쪽만 고치면
 *    화면과 서버가 다른 상태를 말한다 — 회귀 테스트가 이 표를 고정한다.
 *
 * 호환: 품목 상태가 아직 없는 기존 신청은 **모든 품목이 신청 상태를 따른다**(마이그레이션 불요).
 * RPC 가 처음 호출될 때 나머지 품목을 현재 신청 상태로 채워 기준선을 만들기 때문에,
 * 이 폴백과 파생이 서로를 참조하는 순환은 생기지 않는다.
 */
import { PurchaseItemRow, PurchaseRequest, PurchaseRequestStatus } from '../types';

export const ITEM_STATUS_META_KEY = 'itemStatus';

export interface PurchaseItemStatusEntry {
  status: PurchaseRequestStatus;
  reason?: string | null;
  /** ISO 8601 (UTC) */
  at?: string | null;
  /** 상태를 바꾼 매니저 이름 (표시용 스냅샷) */
  by?: string | null;
}

export type PurchaseItemStatusMap = Record<string, PurchaseItemStatusEntry>;

const VALID_STATUSES: PurchaseRequestStatus[] = [
  'submitted',
  'pending',
  'approved',
  'completed',
  'rejected',
];

const isStatus = (v: unknown): v is PurchaseRequestStatus =>
  typeof v === 'string' && (VALID_STATUSES as string[]).includes(v);

/** meta 는 자유 JSONB 라 모양을 믿지 않는다 — 알 수 없는 값은 통째로 버린다. */
export function readItemStatusMap(meta: unknown): PurchaseItemStatusMap {
  if (!meta || typeof meta !== 'object') return {};
  const raw = (meta as Record<string, unknown>)[ITEM_STATUS_META_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const out: PurchaseItemStatusMap = {};
  for (const [rowId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    if (!isStatus(entry.status)) continue;
    out[rowId] = {
      status: entry.status,
      reason: typeof entry.reason === 'string' ? entry.reason : null,
      at: typeof entry.at === 'string' ? entry.at : null,
      by: typeof entry.by === 'string' ? entry.by : null,
    };
  }
  return out;
}

type RequestLike = Pick<PurchaseRequest, 'status' | 'meta'> &
  Partial<Pick<PurchaseRequest, 'status_reason' | 'status_updated_at'>>;

/** 품목 상태 항목. 아직 설정된 적이 없으면 null(= 신청 상태를 따른다). */
export function getItemStatusEntry(
  request: RequestLike,
  rowId: string,
): PurchaseItemStatusEntry | null {
  return readItemStatusMap(request.meta)[rowId] ?? null;
}

/** 화면에 그릴 품목 상태. 미설정이면 신청 상태로 폴백한다. */
export function getItemStatus(request: RequestLike, rowId: string): PurchaseRequestStatus {
  return getItemStatusEntry(request, rowId)?.status ?? request.status;
}

/** 품목에 붙은 사유. 미설정이면 신청 전체 사유로 폴백한다. */
export function getItemReason(request: RequestLike, rowId: string): string | null {
  const entry = getItemStatusEntry(request, rowId);
  if (entry) return entry.reason ?? null;
  return request.status_reason ?? null;
}

/** 이 신청이 품목별 승인을 쓰고 있는가 (기준선이 만들어졌는가) */
export function hasItemStatuses(request: RequestLike): boolean {
  return Object.keys(readItemStatusMap(request.meta)).length > 0;
}

/**
 * 신청건 상태 파생. **SQL `purchase_derive_request_status()` 와 같은 표를 구현한다.**
 *
 * - 전부 같으면 그 상태
 * - 미결(submitted·pending)이 하나라도 있으면 `pending` — 아직 처리 중인 신청이다
 * - 전부 종결이면: completed·rejected 조합만 `completed`, 그 외 혼재는 `approved`
 *   (승인만 되고 아직 안 산 품목이 남아 있으면 '완료'라고 말하면 안 된다)
 */
export function deriveRequestStatus(
  itemStatuses: PurchaseRequestStatus[],
  fallback: PurchaseRequestStatus,
): PurchaseRequestStatus {
  if (itemStatuses.length === 0) return fallback;
  const uniq = new Set(itemStatuses);
  if (uniq.size === 1) return itemStatuses[0];
  if (itemStatuses.some((s) => s === 'submitted' || s === 'pending')) return 'pending';
  if (itemStatuses.every((s) => s === 'completed' || s === 'rejected')) return 'completed';
  return 'approved';
}

export interface ItemStatusSummary {
  /** 상태별 품목 수 (0인 상태도 키는 존재) */
  counts: Record<PurchaseRequestStatus, number>;
  total: number;
  /** 품목 상태가 서로 다른가 — 신청건 배지만으로는 설명이 안 되는 상태 */
  mixed: boolean;
  /** 품목 상태에서 파생한 신청건 상태 */
  derived: PurchaseRequestStatus;
}

/** 신청 1건의 품목 상태 분포. 표 헤더 칩·요약에 쓴다. */
export function summarizeItemStatuses(
  request: RequestLike,
  rows: PurchaseItemRow[],
): ItemStatusSummary {
  const counts = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0])) as Record<
    PurchaseRequestStatus,
    number
  >;
  const statuses = rows.map((row) => getItemStatus(request, row.id));
  for (const s of statuses) counts[s] += 1;
  return {
    counts,
    total: statuses.length,
    mixed: new Set(statuses).size > 1,
    derived: deriveRequestStatus(statuses, request.status),
  };
}
