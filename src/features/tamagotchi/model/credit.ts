/**
 * 코인(credit) 규칙 · 펫 일기 · 함께 집중 — Phase 2 의 순수한 부분(2026-10-07).
 *
 * 재화는 아카데미 코인(`academy_user_stats.coins`)을 함께 쓴다(결정 #2). 서버 원장 `tama_credit_ledger` 가
 * 같은 출처의 두 번 지급과 하루 상한을 막는다. **아래 CREDIT_RULES 는 서버 `tama_private.credit_rule` 과 같아야 한다**
 * — 회귀(`scripts/tamagotchi-test/run.mts`)가 마이그레이션 SQL 의 숫자와 대조한다. 한쪽만 바꾸면 화면은 «+1»이라 말하는데
 * 서버는 주지 않는(또는 반대) 상태가 오류 없이 생긴다.
 *
 * «실천(계획 완료)»은 여기 없다 — 플래너 «오늘 완료 +5»가 이미 그 보상이다(이중 지급 금지, §6-2).
 */

export type CreditKind = 'plan' | 'reflect' | 'focus' | 'diary';

export interface CreditRule {
  amount: number;
  /** 하루(한국 날짜)에 몇 번까지 */
  cap: number;
  label: string;
  /** 어떻게 받는가 — 화면 문구 */
  how: string;
}

// 한 번에 2코인(2026-10-08 — 플래너 «오늘 완료» +5 · 장 +50 과 같은 규모로. 서버 20261008100000)
export const CREDIT_RULES: Record<CreditKind, CreditRule> = {
  plan: { amount: 2, cap: 2, label: '계획 세우기', how: '플래너에 오늘·내일 계획을 적으면' },
  reflect: { amount: 2, cap: 1, label: '돌아보기', how: '계획에 돌아보기를 열 글자 넘게 남기면' },
  focus: { amount: 2, cap: 2, label: '함께 집중', how: '펫과 함께 집중을 끝까지 하면' },
  diary: { amount: 2, cap: 1, label: '펫 일기', how: '펫에게 일기를 한 줄 쓰면' },
};

export const CREDIT_KINDS = Object.keys(CREDIT_RULES) as CreditKind[];

const dailyPetMax = () => CREDIT_KINDS.reduce((sum, k) => sum + CREDIT_RULES[k].amount * CREDIT_RULES[k].cap, 0);

/** 하루 최대 — 펫 원장만(플래너 «오늘 완료 +5»는 따로) */
export let DAILY_PET_MAX = dailyPetMax();

/** 플래너가 이미 주는 «오늘 완료» 보상 — 펫 원장과 겹치지 않는다(시뮬레이션·문구용) */
export let PLANNING_REWARD = 5;

/**
 * 관리자 코인 설정 반영(2026-10-21 — `model/economySync.ts` 가 부른다). 위 값들은 기본값이고,
 * 서버 정본은 `coin_economy_setting`(`tama.<kind>.amount|cap` · `academy.planning_reward`).
 */
export function setCreditEconomy(rules: Partial<Record<CreditKind, { amount: number; cap: number }>>, planningReward: number): void {
  for (const k of CREDIT_KINDS) {
    const r = rules[k];
    if (r) Object.assign(CREDIT_RULES[k], { amount: r.amount, cap: r.cap });
  }
  DAILY_PET_MAX = dailyPetMax();
  PLANNING_REWARD = planningReward;
}

// ── 펫 일기 ──────────────────────────────────────────────────────────

export type DiaryKind = 'good' | 'hard' | 'praise' | 'question';

export const DIARY_KINDS: { kind: DiaryKind; label: string; prompt: string; placeholder: string }[] = [
  { kind: 'good', label: '좋은 기억', prompt: '오늘 좋았던 일 하나', placeholder: '예) 점심에 친구랑 웃으며 이야기했다' },
  { kind: 'hard', label: '힘들었던 기억', prompt: '오늘 힘들었던 일', placeholder: '털어놓고 싶은 만큼만 써도 괜찮아요' },
  { kind: 'praise', label: '나 칭찬하기', prompt: '오늘 잘한 나에게 한마디', placeholder: '예) 미루지 않고 숙제를 먼저 했다' },
  // Phase 3 — 질문 글은 날마다 바뀐다(questions.ts). prompt 는 화면이 오늘의 질문으로 바꿔 쓴다
  { kind: 'question', label: '오늘의 질문', prompt: '', placeholder: '정답은 없어요. 떠오르는 대로' },
];

export const DIARY_PRIVACY_NOTE = '이 일기는 나만 볼 수 있어요. 선생님도, 관리자도 볼 수 없고 AI 도 읽지 않아요.';

/**
 * 힘들었던 기억 아래 늘 보이는 연락처(§6-3 — 글을 읽지 않고도 할 수 있는 유일한 안전장치).
 * 개인 번호가 아니라 공공 상담 창구·학교 상담실만 적는다.
 */
export const COUNSEL_CONTACTS: { name: string; detail: string }[] = [
  { name: '학교 Wee 클래스', detail: '상담 선생님께 직접 찾아가도 돼요' },
  { name: '청소년 상담 1388', detail: '전화·문자 1388 · 24시간' },
  { name: '자살예방 상담 109', detail: '전화 109 · 24시간' },
];

/** 펫의 대답 — 미리 써 둔 말 가운데 하나(AI 없음, 결정 #6). 같은 말이 연달아 나오지 않게 고른다. */
export const DIARY_REPLIES: Record<DiaryKind, string[]> = {
  good: ['나도 같이 기뻐!', '그 이야기 또 해 줘!', '좋은 하루였구나', '기억해 둘게!', '듣기만 해도 신나!'],
  hard: ['많이 힘들었겠다', '말해 줘서 고마워', '내가 옆에 있을게', '오늘은 푹 쉬자', '천천히 해도 괜찮아', '너는 잘하고 있어'],
  praise: ['정말 잘했어!', '멋져!', '역시 너야!', '나도 자랑스러워!', '오늘의 너 최고!'],
  question: ['그렇구나!', '너를 더 알게 됐어', '멋진 대답이야', '내일 질문도 기대해!', '흥미로운걸!'],
};

export function pickReply(kind: DiaryKind, rand: number, last: string | null): string {
  const pool = DIARY_REPLIES[kind].filter((r) => r !== last);
  return pool[Math.floor(Math.max(0, Math.min(0.999999, rand)) * pool.length)];
}

// ── 함께 집중 ────────────────────────────────────────────────────────

/** 서버가 받는 길이(분) — `tama_focus.planned_seconds in (900, 1500, 2700)` 과 같다 */
export const FOCUS_MINUTES = [15, 25, 45] as const;

/** 끝난 뒤 이만큼 안에 [끝내기]를 눌러야 완주로 친다(서버 `tama_focus_finish` 와 같다) */
export const FOCUS_GRACE_MS = 15 * 60 * 1000;

export interface FocusSession {
  id: string;
  task_id: string | null;
  planned_seconds: number;
  started_at: string;
}

export type FocusPhase = 'running' | 'done' | 'late';

/** 지금 이 집중은 어디쯤인가 — 남은 ms 와 단계. `now` 는 서버 시각 기준. */
export function focusProgress(session: FocusSession, now: number): { phase: FocusPhase; remainingMs: number; endsAt: number } {
  const endsAt = Date.parse(session.started_at) + session.planned_seconds * 1000;
  const remainingMs = Math.max(0, endsAt - now);
  const phase: FocusPhase = now < endsAt ? 'running' : now <= endsAt + FOCUS_GRACE_MS ? 'done' : 'late';
  return { phase, remainingMs, endsAt };
}

export const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ── 펫의 기쁨 — 새로 받은 코인을 펫이 알아챈다 ─────────────────────────

export interface LedgerRow {
  kind: CreditKind;
  amount: number;
  earned_on: string;
  at: string;
}

/**
 * 마지막으로 펫이 알아챈 시각 이후의 지급만 골라 한 줄로 요약한다.
 * 펫 화면을 안 연 사이 플래너에서 번 것도 열었을 때 한꺼번에 기뻐한다(지연 계산 — 생명 모델과 같은 생각).
 */
export function newCredits(recent: LedgerRow[], seenAt: string | null): { rows: LedgerRow[]; total: number; text: string; latest: string | null } {
  const seen = seenAt ? Date.parse(seenAt) : 0;
  const rows = recent.filter((r) => Date.parse(r.at) > seen);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byKind = CREDIT_KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length] as const).filter(([, n]) => n > 0);
  const text = byKind.map(([k, n]) => (n > 1 ? `${CREDIT_RULES[k].label} ${n}` : CREDIT_RULES[k].label)).join(' · ');
  const latest = recent.reduce<string | null>((m, r) => (!m || Date.parse(r.at) > Date.parse(m) ? r.at : m), seenAt);
  return { rows, total, text, latest };
}
