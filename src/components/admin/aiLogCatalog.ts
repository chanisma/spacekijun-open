/**
 * 관리자 «AI 기록» 탭의 순수 규칙(2026-10-15). 화면(`AiLogManagement.tsx`)은 그리기만 하고,
 * 이름·색·비율은 여기서 정한다 — 회귀(`scripts/ai-log-test/run.mts`)가 같은 함수를 부른다.
 *
 * 데이터 = RPC `admin_ai_log_summary` · `admin_ai_log_feed` (마이그레이션 20261015150000).
 * 기록의 출처는 셋이다:
 *   - 호출(call)    : 엣지 함수가 공급자(OpenAI·Upstage)를 한 번 부른 것 — 성공까지 남는다
 *   - 요청(request) : 공급자에 닿기 전후로 요청 전체가 실패한 것(권한·DB 조회·응답 해석)
 *   - 화면(client)  : 브라우저가 알아챈 실패(`ai_error_log` — 2026-09-12 부터, 탐구 설계 화면)
 */
import { MANAGED_MENU_BY_KEY } from '@/config/menuRegistry';

export type AiOutcome = 'success' | 'error' | 'empty' | 'truncated';
export type AiLogLevel = 'call' | 'request' | 'client';

export interface AiLogSummaryRow {
  feature: string;
  calls: number;
  ok_calls: number;
  error_calls: number;
  empty_calls: number;
  truncated_calls: number;
  request_failures: number;
  client_errors: number;
  users: number;
  p50_ms: number | null;
  p90_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  last_at: string | null;
  last_problem_at: string | null;
  last_problem_message: string | null;
}

export interface AiLogFeedRow {
  source: 'server' | 'client';
  id: string;
  created_at: string;
  feature: string;
  fn: string | null;
  action: string | null;
  label: string | null;
  app_path: string | null;
  level: AiLogLevel;
  outcome: AiOutcome;
  provider: string | null;
  model: string | null;
  http_status: number | null;
  duration_ms: number | null;
  finish_reason: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  reasoning_tokens: number | null;
  message: string | null;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  student_id: string | null;
  detail: Record<string, unknown> | null;
}

/**
 * 기능 키 → 이름. 키는 화면 주소의 첫 마디이므로 메뉴 목록에서 먼저 찾고, 메뉴가 아닌 것(아카데미의 서버 기능 ·
 * 미분류)과 메뉴 이름이 기능을 잘 말하지 못하는 것만 여기 적는다.
 */
const FEATURE_LABELS: Record<string, string> = {
  'inquiry-design': '탐구 설계',
  academy: '별빛 아카데미',
  'interview-prep': '면접 준비',
  'world-today': '요즘 세상(분야 분류)',
  evalog: '생기부 분석',
  ipsi: '입시 정보',
  unclassified: '미분류',
  home: '홈',
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? MANAGED_MENU_BY_KEY.get(`/${feature}`)?.label ?? feature;
}

export const OUTCOME_META: Record<AiOutcome, { label: string; tone: string; hint: string }> = {
  success: { label: '성공', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', hint: '응답을 받았습니다' },
  error: { label: '실패', tone: 'bg-rose-50 text-rose-700 ring-rose-200', hint: '공급자 오류 · 시간 초과 · 요청 처리 실패' },
  empty: { label: '빈 응답', tone: 'bg-amber-50 text-amber-800 ring-amber-200', hint: '본문 없이 끝났습니다 — 대개 추론이 출력 예산을 다 썼습니다' },
  truncated: { label: '잘림', tone: 'bg-orange-50 text-orange-800 ring-orange-200', hint: '출력 예산에서 끊겼습니다(finish_reason=length)' },
};

export const LEVEL_LABEL: Record<AiLogLevel, string> = { call: '호출', request: '요청', client: '화면' };

export const PERIODS = [
  { key: '1d', label: '24시간', ms: 24 * 3600_000 },
  { key: '7d', label: '7일', ms: 7 * 24 * 3600_000 },
  { key: '30d', label: '30일', ms: 30 * 24 * 3600_000 },
  { key: '90d', label: '90일', ms: 90 * 24 * 3600_000 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

/** 문제가 된 공급자 호출(실패 + 빈 응답 + 잘림) */
export function problemCalls(row: AiLogSummaryRow): number {
  return row.error_calls + row.empty_calls + row.truncated_calls;
}

/** 이 기능에서 «문제»로 보이는 기록 전부 — 호출 문제 + 요청 실패 + 화면 오류 */
export function problemTotal(row: AiLogSummaryRow): number {
  return problemCalls(row) + row.request_failures + row.client_errors;
}

/**
 * 호출 오류율 = 문제 호출 / 호출. 호출이 0이면 null(«0%»로 쓰면 «문제없다»로 읽힌다 — 실은 셀 것이 없다).
 */
export function callProblemRate(row: AiLogSummaryRow): number | null {
  return row.calls > 0 ? problemCalls(row) / row.calls : null;
}

export function percentLabel(rate: number | null): string {
  if (rate === null) return '—';
  if (rate > 0 && rate < 0.001) return '<0.1%';
  return `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`;
}

export function durationLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}초`;
  const m = Math.floor(ms / 60_000);
  return `${m}분 ${Math.round((ms % 60_000) / 1000)}초`;
}

export function tokenLabel(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** 기록 한 줄의 «무엇을 했나» — 동작 이름이 있으면 그것, 없으면 함수·동작 키 */
export function actionLabel(row: Pick<AiLogFeedRow, 'label' | 'action' | 'fn'>): string {
  if (row.label) return row.label.replace(/\s*실패$/, '');
  return [row.fn, row.action].filter(Boolean).join(' · ') || '—';
}

/** 요약 행 정렬: 문제가 있는 기능 먼저(최근 문제 순), 그다음 최근 활동 순 */
export function sortSummary(rows: AiLogSummaryRow[]): AiLogSummaryRow[] {
  return [...rows].sort((a, b) => {
    const pa = problemTotal(a) > 0 ? 1 : 0;
    const pb = problemTotal(b) > 0 ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ka = (pa ? a.last_problem_at : a.last_at) ?? '';
    const kb = (pb ? b.last_problem_at : b.last_at) ?? '';
    return kb.localeCompare(ka);
  });
}

export function totals(rows: AiLogSummaryRow[]) {
  return rows.reduce(
    (t, r) => ({
      calls: t.calls + r.calls,
      problemCalls: t.problemCalls + problemCalls(r),
      requestFailures: t.requestFailures + r.request_failures,
      clientErrors: t.clientErrors + r.client_errors,
    }),
    { calls: 0, problemCalls: 0, requestFailures: 0, clientErrors: 0 },
  );
}
