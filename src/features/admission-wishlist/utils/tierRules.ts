// 지원희망 / 관심대학 정원 규칙.
//
// ★ 상한은 **총합 하나**다 (2026-09-01 사용자 결정) ★
//
// 종전엔 칸마다 상한을 뒀다(지원희망 6 · 관심대학 15). 그랬더니 **지원희망 6 + 관심대학 15**
// 인 상태에서 지원희망 한 곳을 관심대학으로 내릴 수 없었다 — 관심대학이 가득 차서다.
// 그런데 **칸 이동은 총합을 바꾸지 않는다.** 총합만 제한하면 이동은 절대 막히지 않는다.
//
//   총 16곳까지 담을 수 있고, 그 안에서 어떻게 나누든 자유다.
//   지원희망 0 + 관심대학 16 도, 지원희망 6 + 관심대학 10 도 된다.
//
// 지원희망 6은 **제도상의 사실**(수시 6회 지원 제한)이라 남기되 성질이 다르다:
// 목록을 짜는 도중 넘겨 담는 것이 정상이라 **막지 않고 경고**한다. 실제로 막는 것은
// 총합뿐이다.
//
// DB 에 넣지 않은 이유: 행 개수 제약은 CHECK(행 단위)로 표현할 수 없고, 트리거로
// 강제하면 대량 이동·정리가 중간 상태에서 걸린다. DB 는 값 도메인만 지킨다.
//
// React 비의존 순수 모듈 — Node 회귀 테스트가 그대로 import 한다.

import { MAX_APPLY_SLOTS, MAX_TOTAL_SLOTS, TIER_LABELS, type WishlistTier } from '../types';

export interface SlotCounts {
  apply: number;
  interest: number;
}

export function totalCount(c: SlotCounts): number {
  return c.apply + c.interest;
}

/** 총합이 가득 찼는가 — **실제로 막는 유일한 상한** */
export function isTotalFull(c: SlotCounts): boolean {
  return totalCount(c) >= MAX_TOTAL_SLOTS;
}

/**
 * 새로 담을 수 있는가.
 * **칸과 무관하게 총합만 본다** — 지원희망이 6을 넘어도 추가는 막지 않는다(경고만).
 */
export function canAdd(c: SlotCounts): boolean {
  return !isTotalFull(c);
}

/**
 * 담을 수 없을 때의 안내. 담을 수 있으면 null.
 * 막는 이유와 **다음에 할 일**을 함께 적는다 — "가득 참"만으로는 사용자가 멈춘다.
 */
export function addRejectReason(c: SlotCounts): string | null {
  if (canAdd(c)) return null;
  return `지원희망과 관심대학을 합쳐 최대 ${MAX_TOTAL_SLOTS}곳까지 담을 수 있습니다. 먼저 필요 없는 곳을 정리하세요.`;
}

/**
 * 칸 이동은 **언제나 가능하다**.
 * 총합이 변하지 않으므로 정원 때문에 막힐 이유가 없다 — 이 함수가 존재하는 이유는
 * 호출부가 "이동도 검사해야 하나?"를 다시 고민하지 않게 하기 위해서다.
 */
export function canMoveTier(): true {
  return true;
}

/** 지원희망이 수시 6회 제한을 넘었는지 (넘은 개수, 0이면 정상 — 막지 않고 경고만) */
export function applyOverflow(applyCount: number): number {
  return Math.max(0, applyCount - MAX_APPLY_SLOTS);
}

/** 남은 자리 수 (표시용) */
export function remainingSlots(c: SlotCounts): number {
  return Math.max(0, MAX_TOTAL_SLOTS - totalCount(c));
}

/** 목록을 두 칸으로 가른다 (tier 값이 없는 레거시 행은 지원희망으로 본다) */
export function splitByTier<T extends { tier?: WishlistTier | null }>(
  items: T[],
): { apply: T[]; interest: T[] } {
  const apply: T[] = [];
  const interest: T[] = [];
  for (const it of items) {
    if (it.tier === 'interest') interest.push(it);
    else apply.push(it);
  }
  return { apply, interest };
}

/** 칸 이름 (안내 문구용) */
export function tierLabel(tier: WishlistTier): string {
  return TIER_LABELS[tier];
}
