/**
 * 집중 권하기 (2026-10-15 — 사용자 요청 «자습 신청·플래너 계획 시간이 되면 강제가 아니라 집중을 시작할 선택권»).
 *
 * 수업 시간은 펫이 «수업 중»으로 멈추지만(시간표 — clock.ts), 자습·계획 시간은 **권하기만** 한다:
 * 그 시간이 되면 펫이 «같이 집중할래?» 하고 [함께 집중 N분]을 내민다. 누르지 않으면 아무 일도 없고,
 * [나중에]를 누르면 펫이 조금 아쉬워할 뿐(상태 수치는 그대로) 그 시간대에는 다시 권하지 않는다.
 *
 * 재료 두 가지 — 둘 다 이미 학생이 정해 둔 것이다:
 *  · 자습 신청 = seaton 예약(RPC academy_study_read 의 오늘 줄 — 열람실 교시의 시작·끝 시각이 있는 것만.
 *    [아침] 열람실은 교시가 없어 시각을 모른다 → 권하지 않는다)
 *  · 플래너 계획 = 오늘의 할 일 중 시간표에 놓인 것(start_time·end_time), 아직 안 끝낸 것
 *
 * 집중 길이는 함께 집중이 받는 15·25·45분 중 «남은 시간에 들어가는 가장 긴 것»(사용자 결정 — 서버 길이 그대로).
 * 한 번 끝내고도 시간이 남으면 다음 한 번을 다시 권한다.
 *
 * 서버의 휴대폰 알림(tama_private.dispatch_focus_invites)도 같은 열쇠(source key)와 같은 «15분 이상 남았나» 규칙을 쓴다 —
 * 한쪽만 바꾸면 알림은 오는데 기기는 조용하거나 그 반대가 된다(회귀가 대조한다).
 */
import { FOCUS_MINUTES } from './credit';

export type InviteKind = 'study' | 'plan';

/** 오늘의 한 덩어리 — 분은 한국 시각 자정부터 */
export interface InviteBlock {
  /** 서버 알림과 같은 열쇠: study:<예약 id> · plan:<할 일 id>:<날짜>:<HH:MM> */
  key: string;
  kind: InviteKind;
  /** 화면에 보일 이름 — 열람실 이름 · 계획 제목 */
  title: string;
  start: number;
  end: number;
  /** 계획이면 함께 집중에 이을 할 일 id */
  taskId: string | null;
}

export interface FocusInvite extends InviteBlock {
  /** 권할 집중 길이(15·25·45) */
  minutes: number;
  /** 남은 분 */
  remaining: number;
}

/** 권할 수 있는 가장 짧은 집중 — 남은 시간이 이보다 짧으면 권하지 않는다(서버 알림도 같은 값) */
export const MIN_INVITE_MINUTES = Math.min(...FOCUS_MINUTES);

/** 남은 분에 들어가는 가장 긴 집중 길이(없으면 null) */
export function focusMinutesFor(remaining: number): number | null {
  const fits = [...FOCUS_MINUTES].sort((a, b) => b - a).find((m) => m <= remaining);
  return fits ?? null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)/;
/** 'HH:MM' · 'HH:MM:SS' → 분. 모르는 모양이면 null */
export function minutesOfTime(value: string | null | undefined): number | null {
  const m = value ? HHMM.exec(value) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 자습 신청 → 오늘의 덩어리(시작·끝 시각을 아는 것만) */
export function studyBlocks(
  entries: readonly { id: string; day: string; room: string; start_time: string | null; end_time: string | null }[],
  today: string,
): InviteBlock[] {
  const out: InviteBlock[] = [];
  for (const e of entries) {
    if (e.day !== today) continue;
    const start = minutesOfTime(e.start_time);
    const end = minutesOfTime(e.end_time);
    if (start == null || end == null || end <= start) continue;
    out.push({ key: `study:${e.id}`, kind: 'study', title: e.room, start, end, taskId: null });
  }
  return out;
}

/** 플래너 계획 → 오늘의 덩어리(시간표에 놓였고 아직 안 끝낸 것) */
export function planBlocks(
  tasks: readonly { id: string; title: string; task_date: string; completed: boolean; start_time?: string | null; end_time?: string | null }[],
  today: string,
): InviteBlock[] {
  const out: InviteBlock[] = [];
  for (const t of tasks) {
    if (t.task_date !== today || t.completed) continue;
    const start = minutesOfTime(t.start_time);
    const end = minutesOfTime(t.end_time);
    if (start == null || end == null || end <= start) continue;
    out.push({ key: `plan:${t.id}:${today}:${hhmm(start)}`, kind: 'plan', title: t.title, start, end, taskId: t.id });
  }
  return out;
}

/**
 * 지금 권할 것 하나. 없으면 null.
 *  · 집중이 열려 있으면 권하지 않는다(이미 하고 있다)
 *  · 수업 중·자는 시간이면 권하지 않는다(수업은 수업대로 멈추고, 밤에는 자라고 한다)
 *  · [나중에]를 누른 덩어리는 그 시간대 동안 다시 권하지 않는다
 *  · 겹치면 계획이 먼저(무엇을 할지 학생이 이미 적어 두었다 — 집중 기록이 그 계획에 이어진다), 같은 종류면 늦게 시작한 것
 */
export function pickFocusInvite(input: {
  blocks: readonly InviteBlock[];
  /** 지금(한국 시각, 자정부터 분) */
  nowMin: number;
  focusOpen: boolean;
  /** 지금은 권할 때가 아니다 — 수업 중 · 자는 시간 · 아직 펫이 없음 */
  busy: boolean;
  dismissed: ReadonlySet<string>;
}): FocusInvite | null {
  if (input.focusOpen || input.busy) return null;
  let best: FocusInvite | null = null;
  for (const b of input.blocks) {
    if (input.dismissed.has(b.key)) continue;
    if (input.nowMin < b.start || input.nowMin >= b.end) continue;
    const remaining = b.end - input.nowMin;
    const minutes = focusMinutesFor(remaining);
    if (minutes == null) continue;
    const cand: FocusInvite = { ...b, minutes, remaining };
    if (!best
      || (cand.kind === 'plan' && best.kind !== 'plan')
      || (cand.kind === best.kind && cand.start > best.start)) best = cand;
  }
  return best;
}

/**
 * [나중에] 가 접을 열쇠 — 지금 걸쳐 있는 덩어리 전부. «나중에»는 «지금은 말고»라서, 계획을 접자마자 겹친 자습을
 * 다시 권하면 아쉬워하는 말이 곧바로 «같이 집중할래?»로 덮인다(2026-10-15 브라우저 확인에서 실제로 그랬다).
 */
export function activeBlockKeys(blocks: readonly InviteBlock[], nowMin: number): string[] {
  return blocks.filter((b) => nowMin >= b.start && nowMin < b.end).map((b) => b.key);
}

/** 권하는 말 — 기기 말풍선(짧게)과 카드(길게) */
export function inviteLines(invite: FocusInvite): { short: string; title: string; detail: string } {
  const span = `${hhmm(invite.start)}~${hhmm(invite.end)}`;
  return invite.kind === 'study'
    ? { short: '같이 집중할래?', title: '자습 시간이에요', detail: `${invite.title} · ${span}` }
    : { short: '같이 집중할래?', title: '계획한 시간이에요', detail: `«${invite.title}» · ${span}` };
}

/** [나중에] — 펫이 조금 아쉬워한다(상태 수치는 건드리지 않는다) */
export const SULK_LINES = ['아쉽다…', '다음엔 같이 해!', '그럼 이따가…'] as const;
export function sulkLine(seed: number): string {
  return SULK_LINES[Math.abs(Math.floor(seed)) % SULK_LINES.length];
}
