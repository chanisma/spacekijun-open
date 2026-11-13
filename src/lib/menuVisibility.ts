import { isPathBlockedForStaff } from '@/lib/routeAccess';
import {
  MANAGED_MENUS,
  MANAGED_MENUS_BY_SPECIFICITY,
  MANAGED_MENU_BY_KEY,
  type ManagedMenu,
} from '@/config/menuRegistry';

/**
 * 메뉴 활성화 설정의 순수 로직 (React 비의존 — Node 회귀 테스트가 그대로 import 한다).
 *
 * 저장 위치 = `system_settings`의 `menu_visibility` 키 하나(JSONB).
 * 새 테이블을 만들지 않은 이유: 이 표는 이미 **public read + admin write** RLS라
 * (모두가 읽고 관리자만 쓴다) 메뉴 설정에 필요한 권한 모양과 정확히 같다.
 *
 * 형식 (2026-09-21 — 대상을 학생·교사·직원으로 갈랐다):
 * ```json
 * { "/exam-schedule": { "users": false, "admin": true },
 *   "/planner":       { "teacher": false, "staff": false } }
 * ```
 * 키가 없으면 카탈로그(`menuRegistry.ts`)의 코드 기본값이 적용된다.
 *
 * ── 코드에 박혀 있던 닫힘도 여기서 다룬다 (2026-09-21) ───────────────────────
 * 직원에게 닫힌 경로(`routeAccess.ts` 의 `STAFF_BLOCKED_PREFIXES`)와 관리자에게만 주입하던 메뉴
 * (시간표 생성·간격반복 학습)는 없애지 않고 **이 설정의 코드 기본값**이 됐다 — 직원 스위치의 기본이
 * 꺼짐, 세 대상의 기본이 꺼짐. 관리자가 **명시적으로 켠 경우에만** 열린다.
 * ⚠️ 여는 것은 **메뉴와 화면까지**다. 학생 정보 표는 서버 권한(RLS `is_teacher_or_admin`)이 직원을
 * 계속 막으므로, 직원에게 켜면 화면은 열리는데 자료가 비어 보일 수 있다. 서버가 정본이다.
 *
 * **`users` 는 구 형식이자 "세 대상의 기본값"이다.** 대상별 값(`student`·`teacher`·`staff`)이
 * 없으면 `users` 를 따르고, 그것도 없으면 코드 기본값을 따른다. 그래서 예전에 저장된
 * `{users:false}` 는 마이그레이션 없이 "세 대상 모두 끔"으로 계속 읽힌다.
 *
 * ----------------------------------------
 * 이것은 보안 경계가 아니다
 * ----------------------------------------
 * 실제 권한은 종전대로 **RLS + 역할 가드**(`ProtectedRoute`·`RoleGate`)가 지킨다.
 * 여기서 끄는 것은 "쓸 수 있는 기능을 당분간 노출하지 않는다"는 **운영상의 커튼**이며,
 * 그래서 설정을 읽지 못한 상황에서는 조용히 열어 두는 쪽(fail-open)으로 동작한다.
 * 반대로 fail-close 하면 네트워크가 흔들릴 때 앱 전체가 빈 화면이 된다.
 */

export const MENU_VISIBILITY_SETTING_KEY = 'menu_visibility';

/** 일반 사용자의 세 갈래 — `profiles.role` 에서 admin 을 뺀 것 */
export const MENU_AUDIENCES = ['student', 'teacher', 'staff'] as const;
export type MenuAudience = (typeof MENU_AUDIENCES)[number];

export const MENU_AUDIENCE_LABELS: Record<MenuAudience, string> = {
  student: '학생',
  teacher: '교사',
  staff: '직원',
};

export interface MenuVisibility {
  student: boolean;
  teacher: boolean;
  staff: boolean;
  /** 관리자에게 노출 — 개발 중 기능을 관리자만 계속 쓰기 위한 별도 스위치 */
  admin: boolean;
}

/** 저장 형식 — 구 `users`(세 대상의 기본값)를 계속 받는다 */
export interface StoredMenuVisibility extends Partial<MenuVisibility> {
  users?: boolean;
}

/** `system_settings.menu_visibility`의 값. 키 = 메뉴 경로. */
export type MenuVisibilityConfig = Record<string, StoredMenuVisibility>;

export const EMPTY_MENU_VISIBILITY: MenuVisibilityConfig = {};

/**
 * 저장된 JSONB를 안전하게 파싱한다.
 *
 * 알 수 없는 키·형식이 어긋난 값은 **버리지 않고 무시**만 한다 — 카탈로그에서 잠시
 * 빠진 메뉴(기능 개편 중)의 설정이 저장 한 번에 증발하지 않도록, 파싱은 관대하게 하고
 * 해석(`resolveMenuVisibility`)에서 카탈로그 기준으로 판정한다.
 */
export function parseMenuVisibilityConfig(value: unknown): MenuVisibilityConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const out: MenuVisibilityConfig = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.startsWith('/')) continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;

    const entry = raw as Record<string, unknown>;
    const parsed: StoredMenuVisibility = {};
    for (const field of ['users', 'admin', ...MENU_AUDIENCES] as const) {
      if (typeof entry[field] === 'boolean') parsed[field] = entry[field] as boolean;
    }
    if (Object.keys(parsed).length > 0) out[key] = parsed;
  }
  return out;
}

/** 카탈로그가 선언한 코드 기본값. */
export function defaultVisibilityOf(menu: ManagedMenu): MenuVisibility {
  const users = menu.defaultVisibleToUsers;
  return {
    student: users,
    teacher: users,
    // 직원에게 역할상 닫힌 경로 — 기본이 꺼짐이고, 관리자가 켜면 열린다
    staff: users && !isPathBlockedForStaff(menu.key),
    admin: menu.defaultVisibleToAdmin,
  };
}

/** 직원에게 **기본으로** 닫혀 있는 메뉴인가 — 관리 화면이 안내를 붙이고, 라우트 가드가 예외를 판정한다 */
export function isStaffClosedByDefault(key: string): boolean {
  return isPathBlockedForStaff(key);
}

const ALL_VISIBLE: MenuVisibility = { student: true, teacher: true, staff: true, admin: true };

export function isSameVisibility(a: MenuVisibility, b: MenuVisibility): boolean {
  return a.admin === b.admin && MENU_AUDIENCES.every((aud) => a[aud] === b[aud]);
}

/**
 * 메뉴 하나의 실효 설정. 저장값이 없는 항목은 코드 기본값으로 채운다.
 * 관리 대상이 아닌 키(카탈로그에 없음)는 항상 전부 노출로 본다.
 */
export function resolveMenuVisibility(
  config: MenuVisibilityConfig,
  key: string
): MenuVisibility {
  const menu = MANAGED_MENU_BY_KEY.get(key);
  const base = menu ? defaultVisibilityOf(menu) : ALL_VISIBLE;
  const saved = config[key];
  if (!saved) return base;
  // 대상별 값 → 구 `users` → 코드 기본값
  return {
    student: saved.student ?? saved.users ?? base.student,
    teacher: saved.teacher ?? saved.users ?? base.teacher,
    // 직원에게 닫힌 경로는 **`staff` 를 명시해야만** 열린다 — 예전에 저장된 `{users:true}` 는
    // 직원에게 열겠다는 뜻이 아니었다(그때는 역할 차단이 따로 막고 있었다).
    staff: saved.staff ?? (isStaffClosedByDefault(key) ? base.staff : saved.users ?? base.staff),
    admin: saved.admin ?? base.admin,
  };
}

/**
 * 직원에게 기본으로 닫힌 경로를 관리자가 **메뉴 관리에서 명시적으로 열었는가.**
 * `ProtectedRoute` 가 이것으로 역할 차단의 예외를 둔다 — 메뉴만 열리고 눌러도 튕기면 고장처럼 보인다.
 */
export function isStaffOpenedByMenu(config: MenuVisibilityConfig, pathname: string | undefined): boolean {
  if (!pathname) return false;
  const menu = findManagedMenuForPath(pathname);
  if (!menu || !isStaffClosedByDefault(menu.key)) return false;
  return resolveMenuVisibility(config, menu.key).staff;
}

/** 카탈로그 전체의 실효 설정. 관리 화면이 표를 그릴 때 쓴다. */
export function resolveAllMenuVisibility(
  config: MenuVisibilityConfig
): Array<{ menu: ManagedMenu; visibility: MenuVisibility; isDefault: boolean }> {
  return MANAGED_MENUS.map((menu) => {
    const visibility = resolveMenuVisibility(config, menu.key);
    const base = defaultVisibilityOf(menu);
    return {
      menu,
      visibility,
      isDefault: isSameVisibility(visibility, base),
    };
  });
}

/**
 * 경로가 어떤 메뉴에 속하는지 (세그먼트 단위, 가장 구체적인 키가 이긴다).
 *
 * **세그먼트 경계를 지키는 것이 핵심**이다. 단순 `startsWith`였다면 `/timetable`을 끄는
 * 순간 `/timetable-generator`까지 함께 죽는다 — 실제로 이 저장소에는 그런 접두 충돌 쌍이
 * 존재한다(시간표 / 시간표 생성).
 */
export function findManagedMenuForPath(pathname: string): ManagedMenu | null {
  if (!pathname.startsWith('/')) return null; // 외부 메뉴(절대 URL)는 관리 대상 아님
  for (const menu of MANAGED_MENUS_BY_SPECIFICITY) {
    if (pathname === menu.key || pathname.startsWith(`${menu.key}/`)) return menu;
  }
  return null;
}

export interface MenuViewer {
  /** 미리보기를 반영한 `useAuth().isAdmin` — 미리보기 중에는 false여야 한다. */
  isAdmin: boolean;
  /**
   * 미리보기를 반영한 `useAuth().effectiveRole`. 관리자가 학생·직원 미리보기 중이면 그 역할이다.
   * **아직 모르면(null·undefined)** 세 대상 중 하나라도 켜져 있으면 보이는 것으로 본다 —
   * 역할이 풀리기 전에 멀쩡한 메뉴가 깜빡이지 않게 하되, 셋 다 꺼 둔 "개발 중" 메뉴는 그 사이에도 감춘다.
   */
  role?: string | null;
}

function audienceOf(role: string | null | undefined): MenuAudience | null {
  return role === 'student' || role === 'teacher' || role === 'staff' ? role : null;
}

/**
 * 이 경로(또는 메뉴 href)를 이 사용자가 볼 수 있는가.
 * 관리 대상이 아닌 경로는 항상 true.
 */
export function isPathVisible(
  config: MenuVisibilityConfig,
  pathname: string | undefined,
  viewer: MenuViewer
): boolean {
  if (!pathname) return true;
  const menu = findManagedMenuForPath(pathname);
  if (!menu) return true;
  const visibility = resolveMenuVisibility(config, menu.key);
  if (viewer.isAdmin) return visibility.admin;
  const audience = audienceOf(viewer.role);
  if (audience) return visibility[audience];
  return MENU_AUDIENCES.some((aud) => visibility[aud]);
}

/** `isPathVisible`의 부정 — 라우트 게이트에서 읽기 쉬우라고 둔 별칭. */
export function isPathHidden(
  config: MenuVisibilityConfig,
  pathname: string | undefined,
  viewer: MenuViewer
): boolean {
  return !isPathVisible(config, pathname, viewer);
}

/**
 * 관리 화면 저장용 — 코드 기본값과 같은 항목은 아예 빼서 JSON을 작게 유지한다.
 *
 * 기본값과 같은 값을 굳이 적어 두면, 나중에 카탈로그 기본값을 바꿨을 때
 * "설정을 건드린 적도 없는데 옛날 값에 고정"되는 유령 설정이 남는다.
 */
export function buildMenuVisibilityPayload(
  draft: Record<string, MenuVisibility>
): MenuVisibilityConfig {
  const out: MenuVisibilityConfig = {};
  for (const menu of MANAGED_MENUS) {
    const value = draft[menu.key];
    if (!value) continue;
    const base = defaultVisibilityOf(menu);
    if (isSameVisibility(value, base)) continue;
    // 바뀐 필드만 적는다. 세 대상의 기본값이 같고 세 값도 같으면 `users` 하나로 접어 구 형식과
    // 같은 모양을 유지한다. 직원 기본값이 다른 메뉴(직원에게 닫힌 경로)는 접지 않는다 —
    // `users` 는 그런 경로의 직원에게 적용되지 않으므로 접으면 왕복이 깨진다.
    const entry: StoredMenuVisibility = {};
    // (기본값 셋이 우연히 같아도 — 개발 중이라 전원 꺼짐인 시험 시간표처럼 — 닫힌 경로면 접지 않는다)
    const foldable =
      !isStaffClosedByDefault(menu.key) &&
      base.student === base.teacher && base.teacher === base.staff &&
      value.student === value.teacher && value.teacher === value.staff;
    if (foldable) {
      if (value.student !== base.student) entry.users = value.student;
    } else {
      for (const aud of MENU_AUDIENCES) if (value[aud] !== base[aud]) entry[aud] = value[aud];
    }
    if (value.admin !== base.admin) entry.admin = value.admin;
    out[menu.key] = entry;
  }
  return out;
}
