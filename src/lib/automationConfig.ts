// ========================================
// 자동화 업무 — 설정·상태 클라이언트 단일 출처 (2026-10-23)
//
// ⚠️ 두 벌: 본문 변수 목록은 서버 `automation_private.known_tokens`(검증) · `render`(채우기)와 짝이다.
//    이름을 하나만 바꾸면 저장이 CHECK 에서 거부된다 → 회귀가 마이그레이션 파일의 목록과 대조한다.
// 설계 = docs/plans/2026-10-23-automation-scheduler.md
// ========================================
import type { AudienceCriterion, AudienceRule } from '@/lib/audienceRule';

export type AutomationKind = 'coolmsg.send';
export type BodyMode = 'fixed' | 'date' | 'data';

export const AUTOMATION_KIND_LABEL: Record<AutomationKind, string> = {
  'coolmsg.send': '쿨메신저 쪽지',
};

/** 쿨메신저로 나가는 계정 — 학교 서버 PC 에 로그인해 둔 공용 계정 */
export const COOLMSG_SENDER_NAME = '기전봇';

export const BODY_MODE_LABEL: Record<BodyMode, string> = {
  fixed: '고정 문구',
  date: '날짜 넣기',
  data: '날짜 + 학교 데이터 넣기',
};

export interface AutomationToken {
  name: string;
  hint: string;
  /** 받는 사람마다 내용이 달라진다 → 사람마다 한 통 */
  perRecipient?: boolean;
}

const DATE_TOKENS: AutomationToken[] = [
  { name: '날짜', hint: '보내는 날 — 10월 23일' },
  { name: '요일', hint: '보내는 날의 요일 — 금' },
  { name: '내일 날짜', hint: '다음 날 — 10월 24일' },
  { name: '내일 요일', hint: '다음 날의 요일 — 토' },
];

const DATA_TOKENS: AutomationToken[] = [
  { name: '급식지도 당번', hint: '그날 급식지도 일정의 담당자 이름' },
  { name: '자습 감독', hint: '그날 자습 감독 일정(학년·시간대·이름) 줄 목록' },
  { name: '오늘 학사일정', hint: '그날의 학사일정 제목' },
  { name: '오늘 연수', hint: '그날의 연수(시각 · 제목) 줄 목록' },
  { name: '내 마감 임박 업무', hint: '받는 사람의 3일 안 마감 할 일 — 사람마다 한 통, 없는 사람에게는 보내지 않음', perRecipient: true },
];

/** 서버 known_tokens 와 같은 순서·같은 이름 */
export function tokensForMode(mode: BodyMode): AutomationToken[] {
  if (mode === 'fixed') return [];
  if (mode === 'date') return DATE_TOKENS;
  return [...DATE_TOKENS, ...DATA_TOKENS];
}

export const PER_RECIPIENT_TOKEN = '내 마감 임박 업무';

export function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{([^{}]{1,30})\}/g)].map((m) => m[1]);
}

/** 교직원 규칙 — 서버 resolve_faculty_rule 의 모양 */
export interface StoredFacultyRule {
  include: { all: AudienceCriterion[] }[];
  exclude: { all: AudienceCriterion[] }[];
}

export interface CoolmsgConfig {
  title: string;
  body: string;
  body_mode: BodyMode;
  recipients: {
    rule: StoredFacultyRule | null;
    people: string[];
  };
}

/**
 * 화면의 포함/제외 목록(메시지 보내기와 같은 `AudienceRuleBuilder`) → 서버 묶음 규칙.
 * 조건 하나 = 묶음 하나라 «조건끼리 또는» — 메시지 보내기의 resolve_audience 와 같은 뜻.
 */
export function audienceToFacultyRule(rule: AudienceRule): StoredFacultyRule | null {
  if (rule.include.length === 0) return null;
  return {
    include: rule.include.map((c) => ({ all: [c] })),
    exclude: rule.exclude.map((c) => ({ all: [c] })),
  };
}

/** 저장된 묶음 규칙 → 화면 목록. 묶음 안에 조건이 둘 이상이면(이 화면이 만들지 않는 모양) null */
export function facultyRuleToAudience(stored: StoredFacultyRule | null | undefined): AudienceRule | null {
  if (!stored) return { include: [], exclude: [] };
  const flat = (groups: { all: AudienceCriterion[] }[]) =>
    groups.every((g) => Array.isArray(g.all) && g.all.length === 1) ? groups.map((g) => g.all[0]) : null;
  const include = flat(stored.include ?? []);
  const exclude = flat(stored.exclude ?? []);
  return include && exclude ? { include, exclude } : null;
}

export function isPerRecipient(config: Pick<CoolmsgConfig, 'title' | 'body' | 'body_mode'>): boolean {
  return config.body_mode === 'data'
    && [config.title, config.body].some((t) => t.includes(`{${PER_RECIPIENT_TOKEN}}`));
}

/** 저장 전 검사 — 서버 config_valid 와 같은 규칙. 문제가 없으면 null */
export function validateCoolmsgConfig(config: CoolmsgConfig): string | null {
  const title = config.title.trim();
  const body = config.body.trim();
  if (title.length < 1) return '쪽지 제목을 적어 주세요.';
  if (title.length > 60) return '쪽지 제목은 60자까지입니다.';
  if (body.length < 1) return '쪽지 본문을 적어 주세요.';
  if (body.length > 4000) return '쪽지 본문은 4,000자까지입니다.';
  if (!config.recipients.rule && config.recipients.people.length === 0) return '받는 사람을 정해 주세요.';
  if (config.recipients.people.length > 300) return '직접 고른 사람은 300명까지입니다.';
  const known = new Set(tokensForMode(config.body_mode).map((t) => t.name));
  const unknown = tokensIn(`${config.title} ${config.body}`).filter((t) => !known.has(t));
  if (unknown.length > 0) {
    return config.body_mode === 'fixed'
      ? `고정 문구에는 {…} 변수를 쓸 수 없습니다: {${unknown[0]}} — 본문 방식을 바꾸거나 지워 주세요.`
      : `이 방식에서 쓸 수 없는 변수입니다: {${unknown[0]}}`;
  }
  return null;
}

// ── 상태 ─────────────────────────────────────────────────────

export interface AutomationStateInput {
  enabled: boolean;
  paused: boolean;
  approved_at: string | null;
  ends_on: string | null;
}

export type AutomationState = 'draft' | 'active' | 'paused' | 'ended';

export const AUTOMATION_STATE_LABEL: Record<AutomationState, string> = {
  draft: '승인 대기',
  active: '켜짐',
  paused: '일시정지',
  ended: '기간 끝',
};

export const AUTOMATION_STATE_TONE: Record<AutomationState, string> = {
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  active: 'bg-blue-50 text-blue-700 ring-blue-200',
  paused: 'bg-slate-100 text-slate-600 ring-slate-200',
  ended: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export function automationState(a: AutomationStateInput, todayKey: string): AutomationState {
  if (a.ends_on && a.ends_on < todayKey) return 'ended';
  if (!a.approved_at || !a.enabled) return 'draft';
  if (a.paused) return 'paused';
  return 'active';
}

export type RunStatus = 'pending' | 'claimed' | 'sent' | 'unknown' | 'failed' | 'skipped' | 'expired' | 'cancelled';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: '보낼 차례',
  claimed: '보내는 중',
  sent: '보냄',
  unknown: '확인 필요',
  failed: '실패',
  skipped: '건너뜀',
  expired: '시간 지남',
  cancelled: '취소',
};

/** 색이 상태를 말한다 — 에메랄드=완료 · 블루=진행 · 슬레이트=대기/건너뜀 · 로즈=실패 · 앰버=확인 필요 */
export const RUN_STATUS_TONE: Record<RunStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  claimed: 'bg-blue-50 text-blue-700',
  sent: 'bg-emerald-50 text-emerald-700',
  unknown: 'bg-amber-50 text-amber-800',
  failed: 'bg-rose-50 text-rose-700',
  skipped: 'bg-slate-100 text-slate-500',
  expired: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
};
