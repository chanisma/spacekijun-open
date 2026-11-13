// ========================================
// 연간 업무 템플릿 — 지난 업무를 올해 업무로 가져오기 (2026-09-23)
//
// 학교 업무는 해마다 거의 같은 모양으로 돌아온다(정보공시·정기고사·생기부 점검…).
// 실데이터에서도 `2025년 정보공시` → `2026년 정보공시` 처럼 사람이 손으로 다시 만든 흔적이 있다.
//
// **템플릿을 따로 저장하지 않는다 — 지난해 업무가 곧 템플릿이다.** 템플릿 표를 두면
// 실제 업무와 따로 낡아 가는 두 번째 사본을 관리해야 하고, 누가 고쳤는지도 갈린다.
// 대신 가져온 업무에 `meta.rolledOverFrom` 을 남겨 **계보**를 잇는다(나중에 인계 패키지의 뼈대).
//
// 이 파일은 **판정만** 한다(React·Supabase 비의존). 실제 쓰기는 `services/workRolloverService.ts`.
// 회귀 = `npx tsx scripts/work-rollover-test/run.mts`
// ========================================

import { effectiveFromDeadlines, getTaskDeadlines } from './taskDeadlines';

/**
 * 할 일 `meta` 키별 처리 규칙.
 * - keep: 그대로 가져온다(설정·정의)
 * - shift: 날짜를 옮긴다
 * - rebuild: 새로 만든다(담당자 — 상태를 초기화하고 재직자만 남긴다)
 * - drop: 버린다(작년의 **진척·결과·출처** — 가져오면 새 업무가 이미 끝난 것처럼 보인다)
 *
 * **목록에 없는 키는 버린다.** 모르는 키를 살리면 새로 생긴 진척 기록이 조용히 따라오는데,
 * 그건 "만들자마자 완료된 업무"라는 눈에 띄지 않는 사고가 된다. 반대로 설정 키를 새로 만들면
 * 여기 `keep` 으로 적어야 가져오기에 실린다 — 회귀가 알려진 키 전부의 분류를 검사한다.
 */
export const TASK_META_ROLLOVER_POLICY = {
  units: 'keep',
  submission: 'keep',
  // 인계 노트 — 이 값이 내년으로 따라가는 것이 «지난 업무 가져오기»의 나머지 절반이다
  // (작년 절차는 옮겨지는데 «작년에 뭐가 문제였나»가 안 따라가면 인계가 아니다)
  handoverNote: 'keep',
  // 업무 진행 화면(2026-09-27) — «무엇을 남기는가»의 선언. 값 자체(task_output_value)는 따라가지 않는다
  output: 'keep',
  deadlines: 'shift',
  // 담당자에게 보이는 날(2026-10-05) — 마감처럼 해를 옮긴다(작년 3/2 공개면 올해 3/2 공개)
  visibleFrom: 'shift',
  assignees: 'rebuild',
  unitProgress: 'drop',
  deadlineProgress: 'drop',
  assignmentIssues: 'drop',
  // 작업 연결 id 목록이라 새 할 일에서는 가리킬 대상이 없다(연결은 새 id 로 만들어진다) —
  // 버리면 기본 순서(제출 받기 → 연결 순)로 돌아간다. 옛 id 를 새 id 로 옮기려면 rebuild 로.
  actionFlow: 'drop',
  documentAnalysisId: 'drop',
  documentAnalysisCandidateId: 'drop',
  files: 'drop',
  rolledOverFrom: 'rebuild',
  // 공문 판단함에서 만든 할 일의 출처(2026-10-30) — 그 해 공문 기록이라 다음 해로 옮기지 않는다
  fromOfficialDoc: 'drop',
  // «비슷한 일 참고»로 만든 할 일의 출처(2026-11-12) — 계보가 아니다(지식이 따라가지 않는다). 다음 복사로 옮기지 않는다
  copiedFrom: 'rebuild',
} as const satisfies Record<string, 'keep' | 'shift' | 'rebuild' | 'drop'>;

/** 업무(`work.meta`) 키별 처리 규칙 — 할 일과 같은 원칙 */
export const WORK_META_ROLLOVER_POLICY = {
  department: 'keep',
  year: 'rebuild',
  managers: 'rebuild',
  files: 'drop',
  documentAnalysisId: 'drop',
  rolledOverFrom: 'rebuild',
  // 업무 후보에서 만든 업무의 링크(candidateToWork.ts) — «그 해 후보에서 만들었다»는 기록이라 다음 해로 옮기지 않는다.
  // 옮기면 다음 해 업무가 작년 후보를 가리켜 지도가 그 후보를 «이미 만듦»으로 두 번 센다
  fromCandidate: 'drop',
  // 공문 판단함에서 만든 업무의 출처(2026-10-30) — 다음 해로 옮기지 않는다
  fromOfficialDoc: 'drop',
  // 업무 작업실(2026-11-12) — 목표일은 그 해 날짜라 버리고(내년엔 새로 정한다), 목표 한 줄은 일의 뜻이라 따라간다
  targetDate: 'drop',
  goal: 'keep',
  startedIn: 'drop',
  // «비슷한 일 참고»의 출처(2026-11-12) — 계보(rolledOverFrom)와 일부러 다른 키. 계보에 넣으면 남의 업무 지식이 «작년»으로 섞인다
  referencedFrom: 'rebuild',
} as const satisfies Record<string, 'keep' | 'rebuild' | 'drop'>;

// ---------- 날짜 ----------

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 저장값(`2026-03-20T00:00:00+09:00` 또는 `2026-03-20`)을 날짜 키로. 앱 전역 관례와 같다(앞 10자) */
export function toDateKey(value: string | null | undefined): string | null {
  const s = (value ?? '').slice(0, 10);
  return DATE_KEY.test(s) ? s : null;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * 날짜를 N년 옮긴다. 월·일은 그대로 두고, 평년의 2월 29일만 28일로 당긴다.
 * (요일은 해마다 1~2일씩 밀린다 — 그래서 주말에 떨어진 날을 따로 알려 준다)
 */
export function shiftDateKey(key: string, years: number): string {
  const m = DATE_KEY.exec(key);
  if (!m) return key;
  const y = Number(m[1]) + years;
  let d = m[3];
  if (m[2] === '02' && d === '29' && !isLeapYear(y)) d = '28';
  return `${y}-${m[2]}-${d}`;
}

/** 주말인가 — 달력 계산이라 타임존과 무관하다 */
export function isWeekendDateKey(key: string): boolean {
  const m = DATE_KEY.exec(key);
  if (!m) return false;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return dow === 0 || dow === 6;
}

// ---------- 연도 ----------

const YEAR_IN_NAME = /(?<!\d)(20\d{2})(?=\s*(?:년|학년도))/;

/**
 * 업무의 연도. `meta.year` → 이름의 `YYYY년`/`YYYY학년도` → 생성일 순.
 * 라이브 30건 중 6건은 `meta.year` 가 없고 이름에만 연도가 있다(2026-09-23).
 */
export function inferWorkYear(work: {
  name?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
}): number | null {
  const raw = work.meta?.year;
  const metaYear = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (Number.isInteger(metaYear) && metaYear >= 2000 && metaYear <= 2100) return metaYear;

  const fromName = YEAR_IN_NAME.exec(work.name ?? '');
  if (fromName) return Number(fromName[1]);

  const created = toDateKey(work.created_at);
  return created ? Number(created.slice(0, 4)) : null;
}

/**
 * 이름 안의 연도를 바꾼다(`2025년 정보공시` → `2026년 정보공시`).
 * **`년`·`학년도` 앞의 원본 연도만** 바꾼다 — `2학년`·`1차` 같은 숫자는 건드리지 않는다.
 * 바꿀 연도가 없으면 이름을 그대로 두고 `replaced=false` — 화면이 이름을 고치라고 말한다.
 */
export function rolloverWorkName(
  name: string,
  fromYear: number,
  toYear: number,
): { name: string; replaced: boolean } {
  const re = new RegExp(`(?<!\\d)${fromYear}(?=\\s*(?:년|학년도))`, 'g');
  const next = name.replace(re, String(toYear));
  return { name: next, replaced: next !== name };
}

// ---------- 계획 ----------

export interface RolloverAssigneeLike {
  id: string;
  name?: string | null;
}

export interface RolloverSourceTask {
  id: string;
  title: string;
  description?: string | null;
  type?: string | null;
  order_index?: number | null;
  due_date?: string | null;
  keywords?: string[] | null;
  meta?: Record<string, unknown> | null;
}

export interface RolloverSourceWork {
  id: string;
  name: string;
  description?: string | null;
  keywords?: string[] | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
  tasks?: RolloverSourceTask[] | null;
}

/** 재직 판정에 쓰는 리소스 — id → 이름. **여기 없는 id 는 재직자가 아니다** */
export type ActiveResourceMap = Map<string, string>;

export interface RolloverDateChange {
  from: string;
  to: string;
  weekend: boolean;
}

export interface RolloverTaskPlan {
  sourceTaskId: string;
  title: string;
  description: string | null;
  type: string;
  order_index: number;
  due_date: string | null;
  keywords: string[];
  meta: Record<string, unknown>;
  dates: RolloverDateChange[];
  keptAssignees: RolloverAssigneeLike[];
  droppedAssignees: RolloverAssigneeLike[];
  /** 작년 진척 기록이 있었는가(버려졌다는 것을 화면이 말할 때 쓴다) */
  hadProgress: boolean;
  /** 규칙표에 없어 버린 키 — 비어 있어야 정상. 있으면 규칙표를 갱신할 것 */
  unknownKeys: string[];
}

/**
 * 참고해서 시작(2026-11-12) — 두 모드:
 * - continue  작년 같은 일 이어가기. 날짜를 해만큼 옮기고 계보(`rolledOverFrom`)를 잇는다 → 업무 지식이 따라온다
 * - reference 비슷한 일 참고. 할 일·작업의 **모양만** 가져온다 — 날짜는 비우고, 출처는 `copiedFrom`/`referencedFrom`(계보 아님)
 */
export type ReferenceMode = 'continue' | 'reference';

export interface RolloverPlan {
  mode: ReferenceMode;
  sourceWorkId: string;
  sourceYear: number;
  targetYear: number;
  name: string;
  nameReplaced: boolean;
  description: string | null;
  keywords: string[];
  workMeta: Record<string, unknown>;
  managers: RolloverAssigneeLike[];
  droppedManagers: RolloverAssigneeLike[];
  tasks: RolloverTaskPlan[];
}

export interface RolloverOptions {
  targetYear: number;
  /** 작년 담당자를 그대로 둘 것인가(인사이동이 큰 해에는 끄고 새로 지정한다) */
  keepAssignees: boolean;
  activeResources: ActiveResourceMap;
  /**
   * 사람이 고른 매니저(선택기가 재직 교직원 목록에서만 고르게 한다). 없으면 원본 매니저 중 재직자.
   * 빈 배열도 "고른 결과"로 존중한다 — 저장 단계가 매니저 0명을 거부한다.
   */
  managers?: RolloverAssigneeLike[];
  now?: Date;
  /** 기본 continue(종전 «지난 업무 가져오기») */
  mode?: ReferenceMode;
  /** 가져올 할 일(원본 id) — 없으면 전부 */
  taskIds?: ReadonlySet<string> | null;
  /** 모든 할 일의 담당자를 이 사람 한 명으로(keepAssignees 보다 앞선다) — «내가 할 일» */
  assignAllTo?: RolloverAssigneeLike | null;
}

function readPeople(value: unknown): RolloverAssigneeLike[] {
  if (!Array.isArray(value)) return [];
  const out: RolloverAssigneeLike[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (!v || typeof v !== 'object') continue;
    const id = (v as { id?: unknown }).id;
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    const name = (v as { name?: unknown }).name;
    out.push({ id, name: typeof name === 'string' ? name : null });
  }
  return out;
}

function splitActive(people: RolloverAssigneeLike[], active: ActiveResourceMap) {
  const kept: RolloverAssigneeLike[] = [];
  const dropped: RolloverAssigneeLike[] = [];
  for (const p of people) {
    if (active.has(p.id)) kept.push({ id: p.id, name: active.get(p.id) ?? p.name ?? null });
    else dropped.push(p);
  }
  return { kept, dropped };
}

function hasContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

/** 할 일 하나를 새 해의 모양으로 */
export function planTaskRollover(
  task: RolloverSourceTask,
  yearShift: number,
  opts: Pick<RolloverOptions, 'keepAssignees' | 'activeResources' | 'now' | 'mode' | 'assignAllTo'> & { sourceWorkId: string },
): RolloverTaskPlan {
  const mode: ReferenceMode = opts.mode ?? 'continue';
  const meta = task.meta ?? {};
  const policy = TASK_META_ROLLOVER_POLICY as Record<string, string>;
  const nextMeta: Record<string, unknown> = {};
  const unknownKeys: string[] = [];

  for (const [key, value] of Object.entries(meta)) {
    const rule = policy[key];
    if (rule === 'keep' && value != null) nextMeta[key] = value;
    else if (rule === undefined) unknownKeys.push(key);
  }

  // 날짜 — 다중 마감이면 회차 전부, 아니면 due_date 하나. 참고 모드는 날짜를 가져오지 않는다(남의 일정이다)
  const sourceDates = mode === 'continue' ? getTaskDeadlines({ due_date: task.due_date ?? null, meta }) : [];
  const dates = sourceDates.map((from) => {
    const to = shiftDateKey(from, yearShift);
    return { from, to, weekend: isWeekendDateKey(to) };
  });
  const shifted = dates.map((d) => d.to);
  let due: string | null = null;
  if (shifted.length > 1) {
    nextMeta.deadlines = shifted;
    due = effectiveFromDeadlines(shifted, opts.now ?? new Date());
  } else if (shifted.length === 1) {
    due = shifted[0];
  }

  // 보이는 날 — 마감과 같은 해 이동. 형식이 틀린 값은 버린다(서버도 무시한다)
  const visibleFromKey = mode === 'continue' ? toDateKey(typeof meta.visibleFrom === 'string' ? meta.visibleFrom : null) : null;
  if (visibleFromKey) nextMeta.visibleFrom = shiftDateKey(visibleFromKey, yearShift);

  // 담당자 — 상태는 전원 대기로, 재직자만
  const people = readPeople(meta.assignees);
  const { kept, dropped } = opts.assignAllTo
    ? { kept: [opts.assignAllTo], dropped: [] }
    : opts.keepAssignees
      ? splitActive(people, opts.activeResources)
      : { kept: [], dropped: [] };
  const assignedAt = (opts.now ?? new Date()).toISOString();
  nextMeta.assignees = kept.map((p) => ({
    id: p.id,
    name: p.name ?? undefined,
    status: 'pending',
    assigned_at: assignedAt,
  }));

  if (mode === 'continue') nextMeta.rolledOverFrom = { workId: opts.sourceWorkId, taskId: task.id };
  else nextMeta.copiedFrom = { workId: opts.sourceWorkId, taskId: task.id };

  return {
    sourceTaskId: task.id,
    title: task.title,
    description: task.description ?? null,
    type: task.type === 'one_time' ? 'one_time' : 'procedural',
    order_index: task.order_index ?? 0,
    due_date: due,
    keywords: task.keywords ?? [],
    meta: nextMeta,
    dates,
    keptAssignees: kept,
    droppedAssignees: dropped,
    hadProgress:
      hasContent(meta.unitProgress) ||
      hasContent(meta.deadlineProgress) ||
      (Array.isArray(meta.assignees) &&
        (meta.assignees as Array<{ status?: unknown } | null>).some((a) => a?.status === 'completed')),
    unknownKeys,
  };
}

/** 업무 전체를 새 해의 모양으로 */
export function planWorkRollover(work: RolloverSourceWork, opts: RolloverOptions): RolloverPlan {
  const mode: ReferenceMode = opts.mode ?? 'continue';
  const sourceYear = inferWorkYear(work) ?? opts.targetYear - 1;
  const yearShift = opts.targetYear - sourceYear;
  const { name, replaced } = rolloverWorkName(work.name, sourceYear, opts.targetYear);
  const meta = work.meta ?? {};

  const sourceManagers = readPeople(meta.managers);
  const split = splitActive(sourceManagers, opts.activeResources);
  const managers = opts.managers ?? split.kept;

  const workMeta: Record<string, unknown> = {};
  const workPolicy = WORK_META_ROLLOVER_POLICY as Record<string, string>;
  for (const [key, value] of Object.entries(meta)) {
    if (workPolicy[key] === 'keep' && value != null) workMeta[key] = value;
  }
  workMeta.year = opts.targetYear;
  workMeta.managers = managers.map((m) => ({ id: m.id, name: m.name ?? '' }));
  if (mode === 'continue') workMeta.rolledOverFrom = { workId: work.id, year: sourceYear, name: work.name };
  else workMeta.referencedFrom = { workId: work.id, year: sourceYear, name: work.name };

  const pick = opts.taskIds ?? null;
  const tasks = [...(work.tasks ?? [])]
    .filter((t) => !pick || pick.has(t.id))
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((t) => planTaskRollover(t, yearShift, { ...opts, sourceWorkId: work.id }));

  return {
    mode,
    sourceWorkId: work.id,
    sourceYear,
    targetYear: opts.targetYear,
    name,
    nameReplaced: replaced,
    description: work.description ?? null,
    keywords: work.keywords ?? [],
    workMeta,
    managers,
    droppedManagers: split.dropped,
    tasks,
  };
}

/**
 * 같은 원본을 같은 해로 이미 가져왔는가 — 두 번 누르면 업무가 둘 생긴다.
 * 판정 = 계보(`meta.rolledOverFrom.workId`) + 연도. 이름으로 판정하지 않는다(사람이 바꾼다).
 */
export function findExistingRollover<T extends { meta?: Record<string, unknown> | null; name?: string | null; created_at?: string | null }>(
  works: T[],
  sourceWorkId: string,
  targetYear: number,
): T | undefined {
  return works.find((w) => {
    const from = w.meta?.rolledOverFrom as { workId?: unknown } | undefined;
    return from?.workId === sourceWorkId && inferWorkYear(w) === targetYear;
  });
}

/**
 * 값 제출 할 일의 `submission.actionId` 를 새 실행으로 다시 잇는다.
 * 그대로 두면 새 할 일이 **작년 할 일의 실행**을 가리킨다. 새로 만들지 못한 실행은 연결을 끊는다
 * (양식 사본 `template` 은 남으므로 매니저가 업무 편집에서 다시 고르면 된다).
 */
export function remapSubmissionAction(
  meta: Record<string, unknown>,
  actionIdMap: Map<string, string>,
): { meta: Record<string, unknown>; changed: boolean } {
  const sub = meta.submission as { actionId?: unknown } | undefined;
  if (!sub || typeof sub !== 'object' || typeof sub.actionId !== 'string') {
    return { meta, changed: false };
  }
  const nextSub: Record<string, unknown> = { ...(sub as Record<string, unknown>) };
  const mapped = actionIdMap.get(sub.actionId);
  if (mapped) nextSub.actionId = mapped;
  else delete nextSub.actionId;
  return { meta: { ...meta, submission: nextSub }, changed: true };
}
