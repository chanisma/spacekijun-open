import type { AppRole } from '@/lib/roles';

/**
 * 직원(staff)에게 닫힌 경로 접두사.
 *
 * **`App.tsx`에서 `TEACHER_ROLES`로 감싼 라우트와 짝이다** — 라우트를 옮기거나
 * 추가하면 여기도 같이 고쳐야 한다. 라우트 가드가 정본이고 이 목록은 **메뉴에서
 * 미리 감추기 위한 거울**이다(어긋나도 접근이 뚫리진 않고, 눌렀을 때 홈으로
 * 튕기는 예전 동작으로 돌아갈 뿐이다).
 *
 * 접두사 매칭이라 `/timetable`은 `/timetable-generator`도 함께 덮는다.
 */
export const STAFF_BLOCKED_PREFIXES = [
  '/admin',
  '/dev-tools',
  // 학생 개인정보
  '/evalog',
  '/rescue-note',
  '/evalearn',
  '/student-dashboard',
  '/course-analyze',
  '/course-selection',
  '/admission-wishlist',
  '/inquiry-design',
  '/activities',
  '/world-today',
  '/academy',
  '/planner',
  '/knowledge-graph',
  '/class-assignment',
  '/seat-arrangement',
  '/study-room-stats',
  '/spaced-repetition',
  '/interview-prep',
  // 다마고찌 — 라우트가 학생·교사·관리자만(App.tsx). 메뉴 기본 공개(2026-10-07)가 직원에게 새지 않게
  '/tamagotchi',
  // 별까지 쌓기 — 라우트가 학생·교사·관리자만(App.tsx) · 서버 tower_private.actor() 도 직원 거부
  '/star-tower',
  // 이세계 사회인 — 라우트가 학생·교사·관리자만(App.tsx) · 서버 isekai3d_require_player() 도 직원 거부
  '/isekai',
  // 코인 얻는 법 — 라우트가 학생·교사·관리자만(App.tsx) · 직원은 통합 지갑 보상 대상이 아니다
  '/coins',
  // 교무
  '/timetable',
  '/exam-schedule',
  '/training-certificates',
  '/training-sign',
  '/ipsi',
] as const;

/** 절대 URL(외부 메뉴)이 아닌 내부 경로가 직원에게 닫혀 있는가. */
export const isPathBlockedForStaff = (href: string | undefined): boolean => {
  if (!href || !href.startsWith('/')) return false;
  return STAFF_BLOCKED_PREFIXES.some(
    (prefix) => href === prefix || href.startsWith(`${prefix}/`)
  );
};

/** 해당 역할이 이 경로를 메뉴에서 볼 수 있는가. staff 외 역할은 종전대로 전부 노출. */
export const canRoleSeePath = (role: AppRole | null, href: string | undefined): boolean =>
  role === 'staff' ? !isPathBlockedForStaff(href) : true;
