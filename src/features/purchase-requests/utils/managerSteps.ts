/**
 * 매니저 단계 탭의 «남은 일» 숫자 (2026-10-13 화면 개편).
 *
 *   ① 신청 검토 ●N  — 아직 결정하지 않은 품목(처리 대기 = 제출됨·검토중)
 *   ② 품의·구매 ●M  — 품의 차수에 아직 안 담긴 품목(불가 제외)
 *
 * 두 숫자는 각 탭 안의 숫자와 **같은 정의**여야 한다 — ①은 상태 필터의 '처리 대기' 칩,
 * ②는 품의 정리의 '아직 안 담긴 품목'. 그래서 판정을 여기 한 곳에 두고 탭 안에서도 이걸 쓴다.
 * 고아 연결(신청자가 지운 행에 남은 연결)은 `liveLinks` 로 먼저 걸러서 넘겨야 한다.
 */
import { PurchaseColumn, PurchaseOrderLink, PurchaseRequest } from '../types';
import { getItemStatus } from './itemStatus';
import { meaningfulItemRows, purchaseItemKey } from './purchaseOrder';
import { isOpenStatus } from './statusFilter';

type RequestLike = Pick<PurchaseRequest, 'id' | 'items' | 'status' | 'meta'>;

export interface ManagerStepCounts {
  /** 처리 대기 품목 */
  reviewOpen: number;
  /** 품의에 아직 안 담긴 품목(불가 제외) */
  orderUnlinked: number;
}

export function managerStepCounts(
  requests: RequestLike[],
  columns: PurchaseColumn[],
  liveOrderLinks: Pick<PurchaseOrderLink, 'request_id' | 'row_id'>[],
): ManagerStepCounts {
  const linked = new Set(liveOrderLinks.map((l) => purchaseItemKey(l.request_id, l.row_id)));
  let reviewOpen = 0;
  let orderUnlinked = 0;
  for (const req of requests) {
    for (const row of meaningfulItemRows(req.items, columns)) {
      const status = getItemStatus(req, row.id);
      if (isOpenStatus(status)) reviewOpen += 1;
      if (status !== 'rejected' && !linked.has(purchaseItemKey(req.id, row.id))) orderUnlinked += 1;
    }
  }
  return { reviewOpen, orderUnlinked };
}
