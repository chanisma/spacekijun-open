/**
 * 매니저 «신청 검토» 의 상태 필터 (2026-10-13 화면 개편).
 *
 * 종전엔 상태 다섯 개(제출됨·검토중·승인·완료·불가)를 칩으로 나란히 두었다. 그런데 매니저가
 * 실제로 묻는 것은 "아직 처리 안 한 게 뭐냐" 하나이고, 운영 데이터에서 '검토중' 은 거의 쓰이지
 * 않는다(2026-10-13 실측 — 라이브 신청 69건·품목 상태 기록 모두 0건). 그래서 미결 두 상태를 **처리 대기** 하나로
 * 묶는다. 단계 탭의 숫자(① 신청 검토 ●N)도 같은 함수로 센다 — 탭 숫자와 칩 숫자가 어긋나면
 * "3건 남았다더니 눌러 보니 2건" 이 된다.
 */
import { PurchaseRequestStatus } from '../types';

export type StatusFilter = 'all' | 'open' | 'approved' | 'completed' | 'rejected';

/** 미결 = 매니저가 아직 결정을 내리지 않은 상태 */
export const OPEN_STATUSES: readonly PurchaseRequestStatus[] = ['submitted', 'pending'];

export const isOpenStatus = (status: PurchaseRequestStatus): boolean =>
  OPEN_STATUSES.includes(status);

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '처리 대기' },
  { value: 'approved', label: '승인' },
  { value: 'completed', label: '완료' },
  { value: 'rejected', label: '불가' },
];

export function matchesStatusFilter(status: PurchaseRequestStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return isOpenStatus(status);
  return status === filter;
}

/** 필터마다 몇 개가 걸리는가. `all` 은 전체 수. */
export function countByStatusFilter(
  statuses: PurchaseRequestStatus[],
): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: statuses.length,
    open: 0,
    approved: 0,
    completed: 0,
    rejected: 0,
  };
  for (const s of statuses) {
    if (isOpenStatus(s)) counts.open += 1;
    else if (s === 'approved' || s === 'completed' || s === 'rejected') counts[s] += 1;
  }
  return counts;
}
