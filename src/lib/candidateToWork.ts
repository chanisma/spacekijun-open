/**
 * 업무 후보 → Work·Task 만들기 — 순수 로직 (2026-10-05 사용자 요청).
 *
 * ⚠️ 2026-09-24 결정(«후보는 Work 가 아니다 — 승격 경로를 두지 않는다»)을 **사용자가 뒤집었다**:
 * «후보 데이터를 바탕으로 구체적인 내용을 커스터마이징해서 work - task 로 생성할 수 있어야 한다».
 * 그래서 이 모듈은 후보를 **그대로 옮기지 않는다** — 초안만 만들고, 사람이 화면에서 고친 뒤 만든다.
 *
 * 초안의 재료(전부 기존 분석 결과 — 새로 추정하지 않는다):
 *   업무 이름·부서·학년도 = 후보 칼럼
 *   업무 설명            = 상세 요약(공문 본문을 읽은 20개) → 없으면 고른 절차의 요약 → 없으면 후보 한 줄 요약
 *   매니저               = 분장 자리의 «기준일 담당자»(사람이 바뀐 자리도 지금 사람)
 *   순서 있는 할 일      = 절차 검토(2026-09-29)에서 고른 사람의 단계 — 단계 이름·처리한 사람·근거 문서 날짜
 *   일회성 할 일         = 일회성 분석의 «올릴 만함»(분류 오류는 뺀다 — 다른 업무의 일이다)
 *
 * ⚠️ 조용히 틀리는 자리
 *   ① 근거 문서 날짜는 `MM-DD` 뿐이고 **학년도 안**의 날짜다 — 1·2월은 다음 해다(3월이 학년도 시작).
 *   ② 그 날짜는 **지난** 날짜다 — 그대로 쓰면 할 일이 만들어지자마자 «기한 지남»이 된다. 만들 학년도로 옮긴다.
 *   ③ 사람은 이름뿐이다 — 이름이 **정확히 한 명**과 맞을 때만 연결하고, 아니면 «못 찾음»으로 보여 준다(추정 연결 금지).
 *   ④ 링크는 후보가 아니라 **업무**에 남긴다 — 시드가 후보 `meta` 를 통째로 바꿔 쓴다(`build-sql.mts`).
 *   ⑤ 사업비는 옮기지 않는다 — 업무끼리 33% 가 겹친다(합치면 부풀려진다).
 */
import type { ProcedureEntry, WorkCandidate } from './workCandidates';
import { candidateDetail, candidateSummary } from './workCandidates';
import { stepOrderAt } from './taskOrder';

// ---------- 링크 ----------

/** 업무 `meta` 에 남기는 «어느 후보에서 만들었나» — 같은 후보로 두 번 만들지 않게, 지도가 이중으로 세지 않게 */
export const CANDIDATE_LINK_KEY = 'fromCandidate';

export interface CandidateLink {
  id: string;
  /** 후보 식별자 — 사람이 만든 후보는 null(그때는 id 로 잇는다) */
  code: string | null;
  /** 만들 때의 후보 이름(후보가 지워지거나 이름이 바뀌어도 «무엇에서 왔는지»는 남는다) */
  name: string;
  year: number;
  at: string;
}

/** 후보를 가리키는 안정 열쇠 — 시드가 id 를 바꿀 수 있어 artifact 코드를 먼저 쓴다 */
export function candidateLinkKey(c: { id: string; code: string | null; academic_year?: number; year?: number }): string {
  const year = c.academic_year ?? c.year ?? 0;
  return `${year}:${c.code ?? `id:${c.id}`}`;
}

export function candidateLinkOf(meta: unknown): CandidateLink | null {
  const raw = (meta as Record<string, unknown> | null | undefined)?.[CANDIDATE_LINK_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const link = raw as Partial<CandidateLink>;
  if (typeof link.id !== 'string' || typeof link.name !== 'string' || typeof link.year !== 'number') return null;
  return { id: link.id, code: typeof link.code === 'string' ? link.code : null, name: link.name, year: link.year, at: String(link.at ?? '') };
}

/** 업무 목록 → 후보 열쇠별 만든 업무 — 지도·서랍이 «업무로 만듦»을 보여 주고 후보 수에서 뺀다 */
export function convertedCandidates(
  works: Array<{ id: string; name: string; meta?: unknown }>,
): Map<string, { workId: string; workName: string }> {
  const out = new Map<string, { workId: string; workName: string }>();
  for (const work of works) {
    const link = candidateLinkOf(work.meta);
    if (link) out.set(candidateLinkKey(link), { workId: work.id, workName: work.name });
  }
  return out;
}

// ---------- 날짜 ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 근거 문서의 `MM-DD` → 학년도 안의 날짜. 1·2월은 다음 해(조용히 틀리는 자리 ①) */
export function academicDateOf(mmdd: string, academicYear: number): string | null {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd.trim());
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  const year = month < 3 ? academicYear + 1 : academicYear;
  return `${year}-${m[1]}-${m[2]}`;
}

/** 날짜를 학년도 차이만큼 옮긴다. 2월 29일이 없는 해로 가면 28일로 */
export function shiftByYears(date: string, years: number): string {
  if (!DATE_RE.test(date) || years === 0) return date;
  const y = Number(date.slice(0, 4)) + years;
  let md = date.slice(5);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (md === '02-29' && !leap) md = '02-28';
  return `${y}-${md}`;
}

// ---------- 사람 ----------

export interface PersonOption { id: string; name: string }

/**
 * 이름 → 사람. 정확히 한 명과 맞을 때만 잇는다(조용히 틀리는 자리 ③).
 * `권선우·서예준` 처럼 가운뎃점으로 이어진 이름은 나눈다. 같은 사람이 두 번 나오면 한 번만.
 */
export function matchPeople(names: Array<string | null | undefined>, roster: PersonOption[]): { matched: PersonOption[]; unmatched: string[] } {
  const byName = new Map<string, PersonOption[]>();
  for (const p of roster) byName.set(p.name, [...(byName.get(p.name) ?? []), p]);
  const matched: PersonOption[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    for (const name of (raw ?? '').split(/[·,]/).map((s) => s.trim()).filter(Boolean)) {
      const hits = byName.get(name) ?? [];
      if (hits.length === 1) {
        if (!seen.has(hits[0].id)) { seen.add(hits[0].id); matched.push(hits[0]); }
      } else if (!unmatched.includes(name)) {
        unmatched.push(name);
      }
    }
  }
  return { matched, unmatched };
}

// ---------- 초안 ----------

export type DraftTaskType = 'procedural' | 'one_time';

export interface DraftTask {
  /** 화면의 행 열쇠 — 고치고 지우고 옮겨도 흔들리지 않는다 */
  key: string;
  type: DraftTaskType;
  title: string;
  description: string;
  /** YYYY-MM-DD 또는 null(기한 없음) */
  due: string | null;
  assignees: PersonOption[];
  /** 이름은 있었는데 사람을 못 찾은 것 — 화면이 알려 준다 */
  unmatched: string[];
  /** 어디서 왔나 — 화면 표시용 */
  source: string;
}

export interface CandidateWorkDraft {
  name: string;
  description: string;
  department: string | null;
  year: number;
  managers: PersonOption[];
  tasks: DraftTask[];
}

/** 순서 있는 할 일의 바탕이 될 수 있는 검토 — 절차이고 단계가 있는 것, 단계 많은 순 */
export function procedureBases(entries: ProcedureEntry[]): ProcedureEntry[] {
  return entries.filter((e) => e.kind === '절차' && e.steps.length > 0).sort((a, b) => b.steps.length - a.steps.length);
}

/** 일회성 할 일로 덧붙일 수 있는 검토 — «올릴 만함»이고 분류 오류가 아닌 것 */
export function onceOptions(entries: ProcedureEntry[]): ProcedureEntry[] {
  return entries.filter((e) => e.kind === '일회성' && e.once?.promote === '올릴 만함' && e.once.owner !== '분류 오류');
}

let keySeq = 0;
export function newDraftKey(prefix = 't'): string {
  keySeq += 1;
  return `${prefix}${Date.now().toString(36)}${keySeq}`;
}

interface DraftOptions {
  candidateYear: number;
  targetYear: number;
  roster: PersonOption[];
}

/** 절차 한 건 → 순서 있는 할 일. 기한 = 그 단계의 마지막 근거 문서 날짜를 만들 학년도로 옮긴 것 */
export function stepsToTasks(entry: ProcedureEntry, opts: DraftOptions): DraftTask[] {
  const shift = opts.targetYear - opts.candidateYear;
  return entry.steps.map((step, i) => {
    const dates = step.docs.map((d) => academicDateOf(d.date, opts.candidateYear)).filter((d): d is string => !!d).sort();
    const last = dates[dates.length - 1] ?? null;
    const { matched, unmatched } = matchPeople([step.by ?? entry.person], opts.roster);
    const school = step.docs.filter((d) => d.dir === 1).length;
    return {
      key: newDraftKey('s'),
      type: 'procedural' as const,
      title: step.name,
      description: dates.length
        ? `${opts.candidateYear}학년도에는 ${dates[0].slice(5).replace('-', '.')}${dates.length > 1 ? `~${last!.slice(5).replace('-', '.')}` : ''}에 처리했습니다(근거 공문 ${step.docs.length}건${school ? `, 학교 기안 ${school}건` : ''}).`
        : '',
      due: last ? shiftByYears(last, shift) : null,
      assignees: matched,
      unmatched,
      source: `${entry.person} 선생님 절차 ${i + 1}단계`,
    };
  });
}

/** 일회성 «올릴 만함» → 일회성 할 일. 단계·날짜가 없으므로 기한은 비워 둔다 */
export function onceToTask(entry: ProcedureEntry, opts: DraftOptions): DraftTask {
  const { matched, unmatched } = matchPeople([entry.person], opts.roster);
  const firstSentence = entry.summary.split(/(?<=[.다])\s/)[0] ?? entry.summary;
  return {
    key: newDraftKey('o'),
    type: 'one_time',
    title: (entry.once?.action && entry.once.action !== '기타' ? `${entry.once.action} — ` : '') + firstSentence.slice(0, 60),
    description: [entry.summary, entry.once?.promoteWhy ? `올릴 만한 이유: ${entry.once.promoteWhy}` : ''].filter(Boolean).join('\n'),
    due: null,
    assignees: matched,
    unmatched,
    source: `${entry.person} 선생님 일회성 업무`,
  };
}

/** 업무 설명 — 상세 요약 → 고른 절차 요약 → 후보 한 줄 요약 */
export function draftDescription(candidate: WorkCandidate, base: ProcedureEntry | null): string {
  const memo = candidateDetail(candidate)?.memo?.요약;
  if (memo) return memo;
  if (base?.summary) return base.summary;
  return candidateSummary(candidate);
}

export function buildCandidateWorkDraft(input: {
  candidate: WorkCandidate;
  base: ProcedureEntry | null;
  once: ProcedureEntry[];
  targetYear: number;
  roster: PersonOption[];
  managers: PersonOption[];
}): CandidateWorkDraft {
  const opts: DraftOptions = { candidateYear: input.candidate.academic_year, targetYear: input.targetYear, roster: input.roster };
  return {
    name: input.candidate.name,
    description: draftDescription(input.candidate, input.base),
    department: input.candidate.department,
    year: input.targetYear,
    managers: input.managers,
    tasks: [
      ...(input.base ? stepsToTasks(input.base, opts) : []),
      ...input.once.map((e) => onceToTask(e, opts)),
    ],
  };
}

/** 만들 학년도를 바꾸면 기한도 함께 옮긴다(이미 사람이 고친 기한도 같은 차이만큼) */
export function retargetDraftYear(draft: CandidateWorkDraft, nextYear: number): CandidateWorkDraft {
  const diff = nextYear - draft.year;
  if (diff === 0) return draft;
  return { ...draft, year: nextYear, tasks: draft.tasks.map((t) => ({ ...t, due: t.due ? shiftByYears(t.due, diff) : null })) };
}

export function validateCandidateWorkDraft(draft: CandidateWorkDraft): string | null {
  if (!draft.name.trim()) return '업무 이름을 적어 주세요.';
  if (draft.managers.length === 0) return '책임자를 한 명 이상 지정해 주세요.';
  const blank = draft.tasks.findIndex((t) => !t.title.trim());
  if (blank >= 0) return `${blank + 1}번째 할 일의 제목이 비어 있습니다.`;
  const badDate = draft.tasks.find((t) => t.due && !DATE_RE.test(t.due));
  if (badDate) return `«${badDate.title}» 의 기한 형식이 맞지 않습니다.`;
  return null;
}

export interface CandidateWorkInsert {
  work: { name: string; description: string; keywords: string[]; meta: Record<string, unknown> };
  managers: PersonOption[];
  tasks: Array<{
    title: string;
    description: string;
    type: DraftTaskType;
    order_index: number;
    due_date: string | null;
    keywords: string[];
    meta: Record<string, unknown>;
  }>;
}

/**
 * 초안 → 저장할 값. 순서 있는 할 일은 화면에 놓인 순서대로 1단계부터 번호를 매기고,
 * 일회성은 0(이 앱의 규약 — `taskOrder.ts`).
 */
export function draftToInsert(draft: CandidateWorkDraft, candidate: WorkCandidate, now = new Date()): CandidateWorkInsert {
  const link: CandidateLink = {
    id: candidate.id,
    code: candidate.code,
    name: candidate.name,
    year: candidate.academic_year,
    at: now.toISOString(),
  };
  let step = 0;
  const assignedAt = now.toISOString();
  return {
    work: {
      name: draft.name.trim(),
      description: draft.description.trim(),
      keywords: [candidate.work_type, candidate.brm].filter((v): v is string => !!v),
      meta: {
        ...(draft.department ? { department: draft.department } : {}),
        year: draft.year,
        [CANDIDATE_LINK_KEY]: link,
      },
    },
    managers: draft.managers,
    tasks: draft.tasks.map((t) => ({
      title: t.title.trim(),
      description: t.description.trim(),
      type: t.type,
      order_index: t.type === 'procedural' ? stepOrderAt(step++) : 0,
      due_date: t.due,
      keywords: [],
      meta: {
        assignees: t.assignees.map((a) => ({ id: a.id, name: a.name, status: 'pending', assigned_at: assignedAt })),
      },
    })),
  };
}
