/**
 * 여러 캐릭터(Phase 6) — 펫 자리 · 쉬는 펫의 멈춘 시간.
 *
 * 자리: 기본 1. 어른이 되고 함께한 지 30일이 지난 펫마다 +1, 최대 3(계획 §8 «첫 펫 성체 + 30일 돌봄 → 슬롯 +1»).
 *   + 산 자리(2026-10-13 — 코인으로 최대 3개, 값 100·150·200) → 모두 최대 6. 서버 tama_pet_slot_buy · tama_private.slot_price
 *   ⚠️ 서버 `tama_private.pet_slots` 와 같은 규칙이어야 한다(회귀가 대조) — 화면이 «자리 있음»이라 했는데 서버가 거부하면 고장처럼 보인다.
 * 쉬는 펫: 시간이 멈춘다. 다시 함께할 때 «시계» 칸만 지금으로 옮긴다(배고픔·나이가 그동안 늘지 않는다).
 *   사건(events)의 칸은 옮기지 않는다 — 앨범 트리거가 «지난 저장 이후의 사건»을 쌓으므로, 옮기면 옛 사건이 새 사건으로 다시 쌓인다.
 */
import { tickOf } from './clock';
import type { PetState } from './petModel';

/** 얻는 자리의 최대(돌봄으로) */
export const MAX_PET_SLOTS = 3;
/** 살 수 있는 자리 · 값(살수록 오른다) — 서버 tama_private.slot_price 와 같다 */
export const MAX_BOUGHT_SLOTS = 3;
/** 기본값 — 관리자 코인 설정(`tama.pet_slot.1~3`)이 그 자리에서 바꾼다(model/economySync) */
export const SLOT_PRICES: number[] = [100, 150, 200];
export const MAX_TOTAL_SLOTS = MAX_PET_SLOTS + MAX_BOUGHT_SLOTS;
/** 다음 자리 값 — 더 살 수 없으면 null */
export const slotPriceOf = (bought: number): number | null => SLOT_PRICES[bought] ?? null;
export const SLOT_UNLOCK_DAYS = 30;
const DAY_MS = 86_400_000;

export interface SlotPet { stage: string; createdAt: string | number }

export function earnedSlots(pets: SlotPet[], nowMs: number): number {
  const grown = pets.filter((p) => p.stage === 'adult' && nowMs - new Date(p.createdAt).getTime() >= SLOT_UNLOCK_DAYS * DAY_MS).length;
  return Math.min(MAX_PET_SLOTS, 1 + grown);
}

/** 자리 수 = 얻은 자리 + 산 자리 */
export function petSlots(pets: SlotPet[], nowMs: number, bought = 0): number {
  return earnedSlots(pets, nowMs) + Math.max(0, Math.min(MAX_BOUGHT_SLOTS, bought));
}

/**
 * 다음 자리까지 — 화면 문구용. 이미 최대거나 남은 자리가 있으면 null.
 * @param occupied 자리를 차지한 펫 수 — 별이 된 펫은 자리를 차지하지 않는다(2026-10-25, 서버 tama_pet_adopt 와 짝).
 *   얻는 자리 계산(`pets`)에는 별이 된 펫도 든다 — 어른 + 30일로 얻은 자리는 남는다.
 */
export function nextSlotHint(pets: SlotPet[], nowMs: number, bought = 0, occupied = pets.length): string | null {
  const slots = petSlots(pets, nowMs, bought);
  if (occupied < slots || earnedSlots(pets, nowMs) >= MAX_PET_SLOTS) return null;
  const candidates = pets.filter((p) => !(p.stage === 'adult' && nowMs - new Date(p.createdAt).getTime() >= SLOT_UNLOCK_DAYS * DAY_MS));
  if (!candidates.length) return null;
  const best = candidates
    .map((p) => ({ adult: p.stage === 'adult', days: Math.floor((nowMs - new Date(p.createdAt).getTime()) / DAY_MS) }))
    .sort((a, b) => Number(b.adult) - Number(a.adult) || b.days - a.days)[0];
  const daysLeft = Math.max(0, SLOT_UNLOCK_DAYS - best.days);
  if (!best.adult && daysLeft > 0) return `펫이 어른이 되고 함께한 지 ${SLOT_UNLOCK_DAYS}일이 되면 자리가 하나 늘어요(지금 ${best.days}일).`;
  if (!best.adult) return '펫이 어른이 되면 자리가 하나 늘어요.';
  return `${daysLeft}일 더 함께하면 자리가 하나 늘어요.`;
}

/** 쉬던 펫을 지금으로 — 시계 칸만 옮긴다(사건 칸은 그대로) */
export function restPetState(state: PetState, nowMs: number): PetState {
  const delta = tickOf(nowMs) - state.tick;
  if (delta <= 0) return state;
  return {
    ...state,
    tick: state.tick + delta,
    bornTick: state.bornTick + delta,
    hatchTick: state.hatchTick + delta,
    stageTick: state.stageTick + delta,
    lastPatTick: state.lastPatTick >= 0 ? state.lastPatTick + delta : state.lastPatTick,
    attention: state.attention ? { ...state.attention, since: state.attention.since + delta } : null,
    events: state.events.map((e) => ({ ...e })),
  };
}
