// 관리자의 «학생으로 보기»(2026-11-11). 서버 짝 = public.club_view_as(관리자 전용, 읽기 함수 화이트리스트).
// 고른 학생은 이 모듈에만 둔다 — clubService.call() 이 읽기를 club_view_as 로 돌리고 쓰기는 막는다.
// 동아리 화면은 «학생인가»를 서버가 준 my_role 로만 판단하므로, 읽기만 돌려도 화면 전체가 그 학생 화면이 된다.
import { useSyncExternalStore } from 'react';

export interface ViewAsStudent { resourceId: string; label: string }

/** club_view_as 가 부를 수 있는 읽기 함수 — SQL 화이트리스트와 같아야 한다 */
export const VIEW_AS_READS = new Set([
  'club_list', 'club_get', 'club_activities', 'club_finance_get', 'club_recruit_list',
  'club_recruit_get', 'club_applications', 'club_proposals',
]);

let current: ViewAsStudent | null = null;
const listeners = new Set<() => void>();

export function getViewAs() { return current; }
export function setViewAs(v: ViewAsStudent | null) {
  current = v;
  listeners.forEach((l) => l());
}
/** 학생으로 보는 중 = 학생 화면의 쓰기 버튼을 그대로 보이되 누를 수 없게(눌러도 서버·call() 이 막지만 오류 토스트보다 먼저 알린다) */
export const VIEW_AS_READONLY_TITLE = '학생으로 보는 중 — 읽기 전용';
export function useViewAsReadOnly() { return useViewAs() !== null; }
export function useViewAs() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}
