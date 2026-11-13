// 메뉴 숫자 배지 — 판정은 `lib/navBadges`, 여기서는 조회만 한다(2026-09-27).
// 입력 요청은 교직원에게만 온다 — 학생(미리보기 포함)은 조회하지 않는다.
// 내 할 일·홈 카드와 같은 쿼리 키라 한 번만 요청된다(react-query 가 합친다).
import { useAuth } from '@/components/auth/AuthProvider';
import { useMyCollectRequests } from '@/features/task-workflow/hooks/useCollectInput';
import { pendingCollectRequests } from '@/lib/collectInput';
import { buildNavBadges, EMPTY_NAV_BADGES, type NavBadgeMap } from '@/lib/navBadges';
import { FACULTY_ROLES } from '@/lib/roles';

export function useNavBadges(): NavBadgeMap {
  const { effectiveRole, isStudentView } = useAuth();
  const enabled = !isStudentView && !!effectiveRole && FACULTY_ROLES.includes(effectiveRole);
  const { data = [] } = useMyCollectRequests(enabled);
  if (!enabled) return EMPTY_NAV_BADGES;
  return buildNavBadges({ pendingCollect: pendingCollectRequests(data).length });
}
