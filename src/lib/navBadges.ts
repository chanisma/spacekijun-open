// ========================================
// 메뉴 숫자 배지 (2026-09-27)
//
// 메뉴 정의(`config/navigation.ts`)에 숫자를 싣지 않는다 — 그 형태는 코드 기본 배치 → 권한 주입 →
// 관리자 배치 설정(`navLayout`) → 모바일 재배치를 차례로 거치므로, 거기 숫자를 넣으면 배치 층마다
// 숫자를 옮겨 실어야 한다. 대신 **경로 → 숫자** 지도를 따로 두고 렌더러(사이드바·모바일 하단·모바일
// 시트)가 `item.href` 로 찾는다. 배치가 어떻게 바뀌어도 같은 메뉴에 같은 숫자가 붙는다.
//
// 지금 배지는 하나 — 「내 할 일」 = 아직 채울 칸이 남은 **입력 요청** 수.
//   입력 받기의 응답자는 할 일 담당자가 아니라서 내 할 일 목록 본체에 없고, 메뉴를 열기 전에는
//   요청이 와 있는지 알 길이 알림뿐이었다.
//   ⚠️ 할 일 개수(기한 지남 등)를 여기 섞지 말 것 — 숫자가 «무엇의 개수인가»를 잃는다. 넣으려면 따로 정하고
//   aria 문구를 함께 바꿀 것.
// ========================================

import { MY_TASKS_PATH } from '@/lib/taskTabs';

export type NavBadgeMap = Readonly<Record<string, number>>;

export const EMPTY_NAV_BADGES: NavBadgeMap = Object.freeze({});

export function buildNavBadges({ pendingCollect }: { pendingCollect: number }): NavBadgeMap {
  return pendingCollect > 0 ? { [MY_TASKS_PATH]: pendingCollect } : EMPTY_NAV_BADGES;
}

/** 경로의 배지 수(없으면 0) — 외부 메뉴(절대 URL)는 배지가 없다 */
export function navBadgeCount(badges: NavBadgeMap, href: string): number {
  const n = badges[href];
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** 배지 글자 — 좁은 자리라 두 자리를 넘으면 접는다 */
export function navBadgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** 화면 읽기용 이름 — 숫자만 읽히면 무엇의 개수인지 모른다 */
export function navBadgeLabel(name: string, count: number): string {
  return count > 0 ? `${name}, 요청 ${count}건` : name;
}
