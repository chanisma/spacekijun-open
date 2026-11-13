/**
 * 펫이 «다음에 부를 때» — 탭을 닫아도 부르기(2026-10-07 Phase 4).
 *
 * 펫은 지연 계산이라 서버는 펫이 언제 배고파지는지 모른다. 그래서 앱이 저장할 때마다 이 함수로 앞날을 미리
 * 돌려 보고(`advancePet` 과 같은 규칙 — 다른 규칙을 새로 쓰지 않는다) 그 시각을 서버에 맡긴다
 * (`tama_pet_schedule_call`). 서버의 pg_cron 이 때가 되면 알림을 만들고, 알림이 Web Push 를 탄다.
 *
 * 규칙
 *  · 지금 이미 부르고 있으면(돌봐 주지 않고 떠났으면) 30분 뒤에 한 번 더 — 단 깨어 있는 칸으로 미룬다
 *    (수업 중엔 시간이 멈추고 휴대폰을 볼 수 없다).
 *  · 아니면 앞으로 하루 안에 부름이 «새로 생기는» 첫 칸. 없으면 부르지 않는다.
 *  · 알·아직 안 깬 펫은 부르지 않는다(부를 일이 없다). 별이 된 펫도(죽음 옵션 — 2026-10-19).
 */
import { activityOfTick, tickOf, tickStartMs, type SchoolSchedule } from './clock';
import { advancePet, type AttentionReason, type PetState } from './petModel';

export interface PetCall {
  atMs: number;
  reason: AttentionReason;
}

/** 앞날을 얼마나 돌려 보는가 — 서버가 26시간 넘는 예약을 거부한다 */
export const CALL_LOOKAHEAD_TICKS = 24 * 12;
/** 부르고 있는데 떠났을 때 다시 부르기까지 */
export const CALL_REMIND_TICKS = 6;

export function predictNextCall(state: PetState, schedule: SchoolSchedule, nowMs: number): PetCall | null {
  if (state.stage === 'egg' || state.dead) return null;
  const now = advancePet(state, nowMs, schedule);
  const nowTick = tickOf(nowMs);

  if (now.attention) {
    for (let t = nowTick + CALL_REMIND_TICKS; t <= nowTick + CALL_LOOKAHEAD_TICKS; t += 1) {
      if (activityOfTick(t, schedule) === 'awake' || now.attention.reason === 'lights') {
        return { atMs: tickStartMs(t), reason: now.attention.reason };
      }
    }
    return null;
  }

  // 한 칸씩 앞으로 — advancePet 은 지난 칸만 계산하므로 «그 칸의 시작 시각»을 지금으로 삼아 한 칸씩 민다
  let s = now;
  for (let t = nowTick + 1; t <= nowTick + CALL_LOOKAHEAD_TICKS; t += 1) {
    s = advancePet(s, tickStartMs(t), schedule);
    if (s.attention) return { atMs: tickStartMs(t), reason: s.attention.reason };
  }
  return null;
}

/** 서버에 다시 보낼 만큼 달라졌는가(같은 예약을 저장마다 보내지 않는다) */
export function sameCall(a: PetCall | null, b: PetCall | null): boolean {
  if (!a || !b) return a === b;
  return a.reason === b.reason && Math.abs(a.atMs - b.atMs) < 60_000;
}
