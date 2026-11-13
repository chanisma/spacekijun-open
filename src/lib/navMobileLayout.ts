/**
 * 모바일 하단 바 — 순수 판정 단일 출처 (2026-10-25 개편).
 *
 * React·훅에 의존하지 않으므로 회귀 테스트가 **실제로 쓰이는 이 함수를** 그대로
 * 부를 수 있다(`scripts/nav-mobile-bottom-test`).
 *
 * ## 하단 바는 메뉴 순서와 따로 논다
 * 종전엔 하단 5칸이 `flatItems.slice(0, 5)` — **섹션 순서의 부산물**이었다. 그래서 하단 5칸을 지키려고
 * 모바일 햄버거 시트의 메뉴 순서를 데스크톱과 다르게 비틀었고(입시 정보를 [오늘] 끝으로, 공지사항을 뒤로),
 * 맨 앞 섹션에 메뉴를 끼우면 5번째 칸이 조용히 밀려났다(2026-09-14 학생 하단 5칸 사고).
 * 이제 하단 바는 **href 목록**(관리자 설정 `menu_layout.<kind>.mobileBottom`, 없으면 아래 기본값)이고,
 * 전체 메뉴(시트)는 데스크톱 사이드바와 **같은 순서**다(사용자 결정 2026-10-25).
 */
import type { NavItem } from '@/config/navigation';

/** 하단 바 칸 수 상한 — 휴대폰 폭에서 이름이 읽히는 최대치 */
export const MOBILE_BOTTOM_MAX = 5;

/**
 * 기본 하단 칸 — 관리자가 정하지 않았을 때. **이 배열이 곧 하단 바의 순서다.**
 * 학생 = 2026-09-14 사용자 결정, 교사 4번째 칸 = 내 할 일(2026-09-21 사용자 결정).
 */
export const DEFAULT_MOBILE_BOTTOM_HREFS = {
  teacher: ['/', '/timetable', '/schedule', '/work', '/ipsi'],
  student: ['/', '/timetable', '/schedule', '/world-today', '/ipsi'],
} as const satisfies Record<'teacher' | 'student', readonly string[]>;

/** 종전 이름 — 학생 기본값 */
export const STUDENT_MOBILE_BOTTOM_HREFS: readonly string[] = DEFAULT_MOBILE_BOTTOM_HREFS.student;

/** 저장값 정리 — 문자열 href 만, 중복 없이, 상한까지. 비면 null(= 기본값) */
export function normalizeMobileBottom(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const href of raw) {
    if (typeof href !== 'string' || !href.trim() || out.includes(href)) continue;
    out.push(href);
    if (out.length >= MOBILE_BOTTOM_MAX) break;
  }
  return out.length > 0 ? out : null;
}

/**
 * 하단 바에 놓을 메뉴 — `flatItems`(이미 권한·노출 설정으로 걸러진 것)에서 href 로 찾는다.
 *
 * 못 찾은 칸은 **건너뛴다** — 관리자가 메뉴를 껐거나 그 사람 역할에 없는 메뉴다(직원에게 시간표가 닫힌 경우 등).
 * 그렇다고 하단 바를 비우지는 않는다: 하나도 못 찾으면 메뉴 순서의 앞 5개로 대신한다.
 */
export function pickMobileBottomItems(flatItems: readonly NavItem[], hrefs: readonly string[] | null | undefined, kind: 'teacher' | 'student'): NavItem[] {
  const wanted = hrefs && hrefs.length > 0 ? hrefs : DEFAULT_MOBILE_BOTTOM_HREFS[kind];
  const picked: NavItem[] = [];
  for (const href of wanted) {
    const item = flatItems.find((entry) => entry.href === href);
    if (item && !picked.includes(item)) picked.push(item);
    if (picked.length >= MOBILE_BOTTOM_MAX) break;
  }
  return picked.length > 0 ? picked : flatItems.slice(0, MOBILE_BOTTOM_MAX);
}

/** 기본값과 같은가 — 같으면 저장하지 않는다(코드 기본값이 바뀌면 따라가게) */
export function isDefaultMobileBottom(hrefs: readonly string[] | null | undefined, kind: 'teacher' | 'student'): boolean {
  const defaults = DEFAULT_MOBILE_BOTTOM_HREFS[kind];
  if (!hrefs || hrefs.length === 0) return true;
  return hrefs.length === defaults.length && hrefs.every((href, i) => href === defaults[i]);
}
