/**
 * 이세계 사회인 관리자 통계(2026-10-21) — 서버 `isekai3d_admin_stats()` 의 모양과 화면이 쓰는 이름·파생값.
 *
 * 집계는 서버가 한다(isekai3d_* 표는 RPC 전용이라 화면에서 셀 수 없다). 통계에는 숫자만 온다 — 학생별 답은
 * 아래 «학생별 답 보기» 타입이 따로(2026-10-22 관리자 열람 허용). 관리자 계정은 서버가 이미 뺐다.
 */

export interface Isekai3dAdminStats {
  generated_at: string;
  today: string;
  rule: { per_coin: number; max_coins: number; price: number };
  admins_excluded: number;
  players: {
    total: number; by_role: Record<string, number>; played_ever: number;
    active_7d: number; active_today: number; with_saves: number; memory_off: number;
  };
  play: {
    days: number; coins: number; paid_coins: number; minutes: number;
    /** 그날 넣은 동전 1·2·…·max_coins 번인 날 수 */
    coins_hist: number[];
    /** 넣은 분량을 쓴 비율 0~10%·…·90~100% 인 날 수 */
    use_hist: number[];
  };
  daily: { day: string; people: number; coins: number; minutes: number }[];
  questions: {
    made: number; delivered: number; answered: number;
    by_kind: Partial<Record<Isekai3dQuestionKind, { made: number; delivered: number; answered: number }>>;
    careers: { id: string; label: string | null; made: number; answered: number; junior: number; expert: number; leader: number }[];
    life_events: Record<string, { made: number; answered: number }>;
  };
  saves: { slots: number; by_slot: number[]; day_hist: { label: string; n: number }[] };
  list: Isekai3dAdminPlayer[];
}

export interface Isekai3dAdminPlayer {
  name: string;
  role: string | null;
  days: number;
  coins: number;
  paid: number;
  /** 쓴 게임 시간(분) */
  minutes: number;
  last_day: string | null;
  saves: number;
  game_day: number | null;
  questions: number;
  answered: number;
}

export type Isekai3dQuestionKind = 'career' | 'life' | 'explore';

export const QUESTION_KIND_LABEL: Record<Isekai3dQuestionKind, string> = {
  career: '근무 중 질문 카드',
  life: '인생의 큰 사건 성찰',
  explore: '진로 탐색 질문',
};

/** 큰 사건 — 엣지 함수 `_shared/isekai3dQuestion.ts` 의 LIFE_EVENTS 와 같은 이름 */
export const LIFE_EVENT_LABEL: Record<string, string> = {
  firstJob: '처음으로 일을 시작함',
  childBorn: '아이가 태어남',
  parentDied: '부모님을 떠나보냄',
  retired: '오래 한 일에서 은퇴함',
};

/** 게임 시간(분) → «N일 M시간» — 동전 하나 = 게임 하루 1440분 */
export function gameTimeLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d && h) return `${d}일 ${h}시간`;
  if (d) return `${d}일`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

/**
 * 동전 하나(게임 분)가 실제로 몇 분인가 — 관리 화면 안내용(2026-10-23).
 * 게임 1분 = 보통 0.5초 · 빠르게 1/6초(isekai3d 20261020100000 머리 · src/cloud/playPass.ts). 1440분이면 보통 12분 · 빠르게 4분.
 */
export const GAME_SECONDS_PER_MINUTE = { normal: 0.5, fast: 1 / 6 } as const;
export function realPlayLabel(gameMinutes: number): string {
  const real = (sec: number) => {
    const m = sec / 60;
    return m < 1 ? `${Math.max(1, Math.round(sec))}초` : `${Math.round(m * 10) / 10}분`.replace('.0분', '분');
  };
  return `실제로 보통 속도 약 ${real(gameMinutes * GAME_SECONDS_PER_MINUTE.normal)} · 빠르게 약 ${real(gameMinutes * GAME_SECONDS_PER_MINUTE.fast)}`;
}

/** 설정 키 — 서버 coin_economy_setting(정본). 동전 하나로 하는 시간은 게임 분 */
export const ISEKAI3D_PLAY_KEYS = { perCoin: 'isekai3d.per_coin', maxCoins: 'isekai3d.max_coins', price: 'isekai3d.coin_price' } as const;

export function rateLabel(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

/** 날마다 넣은 분량을 얼마나 썼나 — 열 칸을 세 묶음으로(조금 · 절반쯤 · 거의 다) */
export function usageBands(hist: number[]): { label: string; n: number }[] {
  const sum = (a: number, b: number) => hist.slice(a, b).reduce((s, n) => s + (n ?? 0), 0);
  return [
    { label: '30% 미만', n: sum(0, 3) },
    { label: '30~90%', n: sum(3, 9) },
    { label: '90% 이상', n: sum(9, 10) },
  ];
}

// ── 학생별 답 보기 (2026-10-22 정책 변경 — 관리자도 본다, 20261022120000) ─────────────────────────────
// 서버 `isekai3d_my_students()` · `isekai3d_student_overview(학생)` 그대로. 판정은 서버 `isekai3d_can_view` 한 곳.

export interface Isekai3dStudentRow {
  user_id: string; grade: number | null; class: number | null; number: number | null; name: string;
  answered: number; last_answered: string | null;
}

export interface Isekai3dCareerChoice { label: string; approach?: string; win?: { text: string }; lose?: { text: string } }
export interface Isekai3dCard { text?: string; choices?: Isekai3dCareerChoice[]; options?: string[] }

export interface Isekai3dAnswer {
  kind: Isekai3dQuestionKind; contextKey: string | null; card: Isekai3dCard;
  choice: number | null; text: string | null; deliveredAt: string; answeredAt: string | null;
}

export interface Isekai3dOverview {
  knowledge: { insights?: { id?: string; txt?: string }[] } | null;
  memory: boolean | null;
  answers: Isekai3dAnswer[];
}

/** 근무 카드 답의 방식 — 게임은 학생에게 보이지 않게 쌓는다(엣지 함수 APPROACHES) */
export const APPROACH_LABEL: Record<string, string> = { self: '스스로 해결', together: '함께 해결', safe: '원칙·안전' };

/**
 * 카드 글의 심 이름 자리 `{n}` · `{n:은/는}` → «심» + 조사. «심»은 받침이 있어 짝의 앞쪽(은·이·을·과)을 쓴다.
 * 게임이 실제 심 이름으로 바꾸는 자리라 원문 그대로 두면 `{n:은/는}` 가 화면에 찍힌다.
 */
export function cardText(text: string | undefined): string {
  return (text ?? '').replace(/\{n(?::([^}/]*)\/[^}]*)?\}/g, (_m, first: string | undefined) => `심${first ?? ''}`);
}

/** 맥락 키 → 사람이 읽는 이름. 'career:doctor:4' → '의사 · 5단계', 'life:firstJob' → '처음으로 일을 시작함' */
export function contextLabel(key: string | null, careerLabels: Record<string, string>): string | null {
  if (!key) return null;
  const [kind, a, b] = key.split(':');
  if (kind === 'career' && a) {
    const level = Number(b);
    return `${careerLabels[a] ?? a}${Number.isFinite(level) ? ` · ${level + 1}단계` : ''}`;
  }
  if (kind === 'life' && a) return LIFE_EVENT_LABEL[a] ?? a;
  return null;
}

/** 고른 답의 글 — 범위를 벗어난 번호는 null(카드가 바뀐 옛 답을 엉뚱한 보기로 보이지 않게) */
export function chosenLabel(a: Pick<Isekai3dAnswer, 'card' | 'choice'>): string | null {
  if (a.choice == null) return null;
  const list = a.card.choices?.map((c) => c.label) ?? a.card.options ?? [];
  return list[a.choice] ?? null;
}

/** 받기만 하고 답하지 않음 / 건너뜀(답했지만 고른 것·쓴 글 없음) / 답함 */
export function answerState(a: Pick<Isekai3dAnswer, 'answeredAt' | 'choice' | 'text'>): 'open' | 'skipped' | 'answered' {
  if (!a.answeredAt) return 'open';
  return a.choice == null && !a.text ? 'skipped' : 'answered';
}

export function studentLabel(s: Pick<Isekai3dStudentRow, 'grade' | 'class' | 'number' | 'name'>): string {
  const code = s.grade && s.class ? `${s.grade}-${s.class}${s.number ? ` ${s.number}번` : ''}` : '';
  return code ? `${code} ${s.name}` : s.name;
}
