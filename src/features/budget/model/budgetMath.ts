/**
 * 예산 관리 파생 수치 — **단일 출처** (2026-11-10)
 *
 * 화면(목록 막대·운영 표·추경 탭·일정 탭)과 회귀가 모두 여기를 부른다. 다른 곳에서 미배정·반납 위험을
 * 다시 계산하지 말 것(웹·에이전트가 서로 다른 숫자를 말하게 된다 — 이 저장소의 반복 사고).
 *
 * 규칙 (2026 추경 작업에서 사용자가 정한 것)
 *   1. «쓴 돈» = 원인행위. 품의 − 원인행위 = 결재 대기(따로 보인다)
 *   2. 남은 계획 = 상태가 계획·품의 중인 계획 항목의 합(완료 = 원인행위에 이미 들어감, 취소 = 뺌)
 *   3. 미배정 = 예산현액 − 원인행위 − 남은 계획 (음수 = 계획 초과)
 *   4. 추경 제안 = 원인행위 + 남은 계획 (마감 줄 = 원인행위). 계획 밖의 돈은 미배정으로 따로 — 줄을 부풀리지 않는다
 *   5. 목적사업은 사업 총액 고정 — 추경 후 합 = 지금 합
 *   6. 품의액 아래로 줄이면 결재 대기분이 깨진다(경고), 원인행위 아래는 불가(서버도 거절)
 */

export type PlanStatus = 'planned' | 'in_order' | 'done' | 'cancelled';

export interface PlanLike {
  amount: number;
  status: PlanStatus;
  planned_month: string | null; // 'YYYY-MM-01'
}

export interface LineLike {
  id: string;
  budget_amount: number;
  pumui: number;
  wonin: number;
  closed: boolean;
}

export interface LineFigures {
  budget: number;
  pumui: number;
  wonin: number;
  pending: number; // 품의 − 원인행위(결재 대기)
  remainingPlan: number;
  balance: number; // 예산현액 − 원인행위
  unassigned: number; // 예산현액 − 원인행위 − 남은 계획
  executionRate: number; // 원인행위 / 예산현액 (0~)
  proposedAfter: number; // 추경 제안
}

export const OPEN_PLAN_STATUSES: PlanStatus[] = ['planned', 'in_order'];

export function remainingPlanOf(plans: PlanLike[]): number {
  return plans.filter((p) => OPEN_PLAN_STATUSES.includes(p.status)).reduce((s, p) => s + (p.amount || 0), 0);
}

export function lineFigures(line: LineLike, plans: PlanLike[]): LineFigures {
  const remainingPlan = line.closed ? 0 : remainingPlanOf(plans);
  const pending = Math.max(0, line.pumui - line.wonin);
  const balance = line.budget_amount - line.wonin;
  return {
    budget: line.budget_amount,
    pumui: line.pumui,
    wonin: line.wonin,
    pending,
    remainingPlan,
    balance,
    unassigned: balance - remainingPlan,
    executionRate: line.budget_amount > 0 ? line.wonin / line.budget_amount : 0,
    proposedAfter: line.closed ? line.wonin : line.wonin + remainingPlan,
  };
}

export interface ProjectFigures {
  budget: number;
  pumui: number;
  wonin: number;
  pending: number;
  remainingPlan: number;
  unassigned: number;
  executionRate: number;
  /** 계획까지 넣은 비율 = (원인행위 + 남은 계획) / 예산현액 */
  committedRate: number;
  overPlannedLines: number; // 미배정 < 0
  pendingLines: number; // 결재 대기가 있는 줄
}

export function projectFigures(lines: LineLike[], plansByLine: Map<string, PlanLike[]>): ProjectFigures {
  const per = lines.map((l) => lineFigures(l, plansByLine.get(l.id) ?? []));
  const sum = (k: keyof LineFigures) => per.reduce((s, f) => s + (f[k] as number), 0);
  const budget = sum('budget');
  const wonin = sum('wonin');
  const remainingPlan = sum('remainingPlan');
  return {
    budget,
    pumui: sum('pumui'),
    wonin,
    pending: sum('pending'),
    remainingPlan,
    unassigned: budget - wonin - remainingPlan,
    executionRate: budget > 0 ? wonin / budget : 0,
    committedRate: budget > 0 ? (wonin + remainingPlan) / budget : 0,
    overPlannedLines: per.filter((f) => f.unassigned < 0).length,
    pendingLines: per.filter((f) => f.pending > 0).length,
  };
}

// ── 회계연도 (학년도 = 3.1 ~ 다음 해 2월 말일) ─────────────────────────────

export function fiscalStart(year: number): Date {
  return new Date(year, 2, 1);
}

/** 다음 해 2월 말일(윤년 반영) */
export function fiscalEnd(year: number): Date {
  return new Date(year + 1, 2, 0);
}

/** 오늘이 속한 회계연도 — 1·2월은 전년도 */
export function fiscalYearOf(date: Date): number {
  return date.getMonth() < 2 ? date.getFullYear() - 1 : date.getFullYear();
}

const DAY = 24 * 60 * 60 * 1000;

/** 회계연도 경과 비율(0~1) — 집행 진도 기준선 */
export function fiscalProgress(year: number, today: Date): number {
  const start = fiscalStart(year).getTime();
  const end = fiscalEnd(year).getTime() + DAY;
  const t = today.getTime();
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

export function daysLeftInFiscal(year: number, today: Date): number {
  const end = fiscalEnd(year);
  const ms = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
    - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.round(ms / DAY));
}

/** 회계연도의 12달(3월 ~ 2월) — 'YYYY-MM-01' */
export function fiscalMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, 2 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export type PlanTiming = 'ok' | 'overdue' | 'outOfYear' | 'unscheduled';

/** 계획 항목의 시기 판정 — 지난 달인데 아직 «계획» = 늦음, 회계연도 밖 = 쓸 수 없음 */
export function planTiming(plan: PlanLike, year: number, today: Date): PlanTiming {
  if (!plan.planned_month) return 'unscheduled';
  const months = fiscalMonths(year);
  if (plan.planned_month < months[0] || plan.planned_month > months[11]) return 'outOfYear';
  if (plan.status === 'planned' && plan.planned_month < monthKey(today)) return 'overdue';
  return 'ok';
}

// ── 추경 시뮬레이션 ───────────────────────────────────────────────────────

export type RevisionIssue =
  | { kind: 'totalMismatch'; diff: number } // 목적사업: 추경 후 합 − 지금 합
  | { kind: 'belowWonin'; lineId: string; amount: number; wonin: number }
  | { kind: 'belowPumui'; lineId: string; amount: number; pumui: number }
  /** 초안이 건드리지 않은 줄인데 이미 원인행위가 예산을 넘음(카드 실례: 정보 교과 2,740,000 > 2,500,000) — 올려야 하지만 막지는 않는다 */
  | { kind: 'overspent'; lineId: string; amount: number; wonin: number }
  | { kind: 'negative'; lineId: string };

export interface RevisionDraftLine {
  lineId: string;
  amount: number;
}

export function checkRevision(
  projectKind: 'purpose' | 'total' | 'basic',
  lines: LineLike[],
  draft: RevisionDraftLine[],
): RevisionIssue[] {
  const issues: RevisionIssue[] = [];
  const byId = new Map(lines.map((l) => [l.id, l]));
  const draftById = new Map(draft.map((d) => [d.lineId, d.amount]));
  for (const d of draft) {
    const l = byId.get(d.lineId);
    if (!l) continue;
    const untouched = d.amount === l.budget_amount;
    if (d.amount < 0) issues.push({ kind: 'negative', lineId: d.lineId });
    else if (untouched && d.amount < l.wonin) issues.push({ kind: 'overspent', lineId: d.lineId, amount: d.amount, wonin: l.wonin });
    else if (d.amount < l.wonin) issues.push({ kind: 'belowWonin', lineId: d.lineId, amount: d.amount, wonin: l.wonin });
    else if (d.amount < l.pumui) issues.push({ kind: 'belowPumui', lineId: d.lineId, amount: d.amount, pumui: l.pumui });
  }
  if (projectKind === 'purpose') {
    const now = lines.reduce((s, l) => s + l.budget_amount, 0);
    const after = lines.reduce((s, l) => s + (draftById.has(l.id) ? (draftById.get(l.id) as number) : l.budget_amount), 0);
    if (after !== now) issues.push({ kind: 'totalMismatch', diff: after - now });
  }
  return issues;
}

/**
 * «제안대로 채우기» — 줄마다 원인행위 + 남은 계획(마감 = 원인행위).
 * 남는 금액(목적사업 총액 − 제안 합)은 `leftoverLineId` 줄에 더한다(사용자가 고른 줄 — 2026 추경은 동아리 줄).
 * 고르지 않았으면 남는 금액을 돌려주기만 한다(화면이 «미배정 n원 — 어느 줄에?»를 묻는다).
 */
export function proposeRevision(
  lines: LineLike[],
  plansByLine: Map<string, PlanLike[]>,
  leftoverLineId: string | null,
): { draft: RevisionDraftLine[]; leftover: number } {
  const draft = lines.map((l) => ({ lineId: l.id, amount: lineFigures(l, plansByLine.get(l.id) ?? []).proposedAfter }));
  const total = lines.reduce((s, l) => s + l.budget_amount, 0);
  const leftover = total - draft.reduce((s, d) => s + d.amount, 0);
  if (leftoverLineId && leftover !== 0) {
    const target = draft.find((d) => d.lineId === leftoverLineId);
    if (target) {
      target.amount += leftover;
      return { draft, leftover: 0 };
    }
  }
  return { draft, leftover };
}

// ── 표시 ────────────────────────────────────────────────────────────────

export function won(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function signedWon(n: number): string {
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${won(Math.abs(n))}`;
}

export function percent(rate: number, digits = 0): string {
  return `${(rate * 100).toFixed(digits)}%`;
}
