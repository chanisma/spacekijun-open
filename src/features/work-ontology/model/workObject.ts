// ========================================
// 「한 장 보기」(업무) — 타임라인·연결·단계 판정의 단일 출처 (2026-11-08, P0)
//
// 설계 = docs/plans/2026-11-08-work-ontology-redesign.md §4-B · §10.
// 새로 기록하지 않고 **이미 있는 것을 모은다**:
//   타임라인 = 업무 생성 · work_event(트리거·RPC 기록) · task_status_history · 공문 출처(meta.fromOfficialDoc) · 마감
//   연결     = meta.fromOfficialDoc · meta.rolledOverFrom(계보) · 업무 흐름 선(flow·related·depends_on·handoff)
//   단계     = workPipeline.buildStages(같은 order_index = 같은 단계, 절차형만)
//
// ⚠️ 사람 이름을 싣지 않는다 — work_event 는 «조회·분석은 역할로만»(사용자 결정), 상태 이력의 changed_by 도
//    같은 이유로 쓰지 않는다. 담당자 명단은 책임자에게만(호출부가 `canSeeAssignees` 로 가른다).
// ⚠️ 업무 흐름의 contains·action 선은 표 구조(task.event_id·task_action.task_id)를 다시 그린 것이라 읽지 않는다
//    — 두 곳에서 읽으면 할 일을 옮겼을 때 캔버스 선만 낡는다(§10-2).
// ========================================

import { buildStages, oneTimeTasks, stageStates, type PipelineStage, type StageState } from '@/lib/workPipeline';
import { getTaskDeadlines, pendingDeadlinesForWork } from '@/lib/taskDeadlines';
import { OFFICIAL_DOC_LINK_KEY } from '@/lib/officialDocDecision';
import { daysBetween, toKstDateKey } from './todayFeed';
import { objectHref } from './objectRef';

// ----------------------------------------
// 입력 모양
// ----------------------------------------

export interface ObjTask {
  id: string;
  title: string;
  type?: string | null;
  status: string;
  order_index: number;
  due_date?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface ObjWork {
  id: string;
  name: string;
  status: string;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
  tasks: ObjTask[];
}

export interface WorkEventRow {
  id: number | string;
  task_id: string | null;
  action_id: string | null;
  kind: string;
  actor_role: string;
  via: string;
  detail: Record<string, unknown> | null;
  at: string;
}

export interface StatusHistoryRow {
  id: string;
  task_id: string;
  old_status: string | null;
  new_status: string | null;
  changed_at: string;
}

/** 업무 흐름 선 하나를 «이 업무 기준»으로 풀어 둔 것 — 호출부가 노드 → 업무를 해석해 넘긴다 */
export interface FlowNeighbor {
  relation: string;
  /** 이 업무가 선의 출발점이면 'out'(다음), 도착점이면 'in'(앞) */
  direction: 'in' | 'out';
  workId: string;
  workName: string;
  workStatus?: string | null;
}

export interface LineageEntry {
  work_id: string;
  name: string;
  year?: number | string;
  generations_ago: number;
}

// ----------------------------------------
// 타임라인
// ----------------------------------------

export type TimelineDot = 'doc' | 'calendar' | 'task' | 'done' | 'agent' | 'plain';

export interface TimelineEntry {
  key: string;
  /** 정렬 키(ISO 또는 YYYY-MM-DD) */
  at: string;
  date: string;
  text: string;
  sub?: string | null;
  dot: TimelineDot;
  future: boolean;
  taskId?: string | null;
  /** 누르면 갈 다른 한 장(작년 업무 등) — 할 일 줄은 taskId 로 연다(2026-11-12) */
  href?: string | null;
  /** 공문 줄 — 누르면 공문 상세 창(2026-11-12) */
  doc?: { docNo: string | null; title: string } | null;
}

const ROLE_LABEL: Record<string, string> = {
  manager: '책임자',
  assignee: '담당자',
  admin: '관리자',
  system: '시스템',
  other: '교직원',
};

const VIA_LABEL: Record<string, string> = { mcp: '에이전트', web: '웹', system: '자동' };

const STATUS_LABEL: Record<string, string> = {
  pending: '진행 중',
  active: '진행 중',
  completed: '완료',
  cancelled: '취소',
};

/** work_event 한 줄의 문장 — 화면 어휘(할 일·작업·책임자) */
export function describeWorkEvent(kind: string, taskTitle: string | null): { text: string; dot: TimelineDot } {
  const t = taskTitle ? `«${taskTitle}»` : '할 일';
  switch (kind) {
    case 'task.created': return { text: `할 일 ${t} 생성`, dot: 'task' };
    case 'task.deleted': return { text: `할 일 ${t} 삭제`, dot: 'plain' };
    case 'task.deadline_changed': return { text: `${t} 마감 변경`, dot: 'calendar' };
    case 'task.assignees_changed': return { text: `${t} 담당자 변경`, dot: 'task' };
    case 'task.step_changed': return { text: `${t} 단계 변경`, dot: 'task' };
    case 'task.visible_from_changed': return { text: `${t} 보이는 날 변경`, dot: 'calendar' };
    case 'task.title_changed': return { text: `할 일 이름 변경 → ${t}`, dot: 'task' };
    case 'action.added': return { text: `${t}에 작업 연결`, dot: 'task' };
    case 'action.removed': return { text: `${t}의 작업 연결 해제`, dot: 'plain' };
    case 'action.archived': return { text: `${t}의 작업 보관`, dot: 'plain' };
    case 'action.config_changed': return { text: `${t}의 작업 설정 변경`, dot: 'plain' };
    case 'agent.preview': return { text: '에이전트가 보낼 내용 미리보기', dot: 'agent' };
    case 'agent.sent': return { text: '에이전트가 지시대로 보냄', dot: 'agent' };
    case 'insight.saved': return { text: '돌아보기 기록 저장', dot: 'agent' };
    case 'insight.decided': return { text: '돌아보기 제안 결정', dot: 'agent' };
    default: return { text: kind, dot: 'plain' };
  }
}

interface OfficialDocLink { doc_no?: string; title?: string; at?: string }

export function officialDocLinkOf(meta: Record<string, unknown> | null | undefined): OfficialDocLink | null {
  const v = meta?.[OFFICIAL_DOC_LINK_KEY];
  if (!v || typeof v !== 'object') return null;
  const o = v as OfficialDocLink;
  return o.doc_no || o.title ? o : null;
}

export function lineageOf(meta: Record<string, unknown> | null | undefined): { workId: string; name?: string; year?: number | string } | null {
  const v = meta?.rolledOverFrom as { workId?: unknown; name?: unknown; year?: unknown } | undefined;
  if (!v || typeof v !== 'object' || typeof v.workId !== 'string') return null;
  return {
    workId: v.workId,
    name: typeof v.name === 'string' ? v.name : undefined,
    year: typeof v.year === 'number' || typeof v.year === 'string' ? v.year : undefined,
  };
}

/**
 * 상태 이력 줄이기 — 담당자가 많은 할 일은 한 사람이 끝내고 되돌릴 때마다 할 일 상태가 오가며 이력이 쌓인다
 * (운영 실측: 담당 53명 할 일이 매주 «완료 → 진행 중»을 되풀이). 타임라인에는
 * ① 할 일마다 **하루에 마지막 하나**만 ② 바로 앞에 남긴 것과 **같은 상태면 버린다**. 시간 순 입력을 가정하지 않는다.
 */
export function collapseStatusHistory(
  history: readonly StatusHistoryRow[],
  /** 다중 마감(회차) 할 일 — 회차마다 할 일 상태가 다시 열리므로 **마지막 하나만** 남긴다 */
  roundTaskIds: ReadonlySet<string> = new Set(),
): StatusHistoryRow[] {
  const sorted = [...history]
    .filter((h) => h.new_status && h.new_status !== h.old_status)
    .sort((a, b) => (a.changed_at < b.changed_at ? -1 : a.changed_at > b.changed_at ? 1 : 0));
  const lastOfDay = new Map<string, StatusHistoryRow>();
  for (const h of sorted) lastOfDay.set(`${h.task_id}|${toKstDateKey(h.changed_at)}`, h);
  const perDay = [...lastOfDay.values()].sort((a, b) => (a.changed_at < b.changed_at ? -1 : 1));
  const prevStatus = new Map<string, string>();
  const out: StatusHistoryRow[] = [];
  for (const h of perDay) {
    if (prevStatus.get(h.task_id) === h.new_status) continue;
    prevStatus.set(h.task_id, h.new_status!);
    out.push(h);
  }
  const lastOfRoundTask = new Map<string, StatusHistoryRow>();
  for (const h of out) if (roundTaskIds.has(h.task_id)) lastOfRoundTask.set(h.task_id, h);
  return out.filter((h) => !roundTaskIds.has(h.task_id) || lastOfRoundTask.get(h.task_id) === h);
}

/** 할 일 이름 찾기 — 지운 할 일은 이벤트 detail 의 title 로(없으면 null) */
function taskTitleFor(work: ObjWork, taskId: string | null, detail: Record<string, unknown> | null): string | null {
  if (taskId) {
    const t = work.tasks.find((x) => x.id === taskId);
    if (t) return t.title;
  }
  const d = detail ?? {};
  for (const key of ['title', 'task_title', 'new', 'after']) {
    const v = (d as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function buildWorkTimeline(
  work: ObjWork,
  events: readonly WorkEventRow[],
  history: readonly StatusHistoryRow[],
  today: string,
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const push = (e: Omit<TimelineEntry, 'date' | 'future'>) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(e.at) ? e.at : toKstDateKey(e.at);
    out.push({ ...e, date, future: (daysBetween(today, date) ?? 0) > 0 });
  };

  if (work.created_at) {
    const lin = lineageOf(work.meta);
    push({
      key: 'work.created',
      at: work.created_at,
      text: '업무 생성',
      sub: lin ? `${lin.year ? `${lin.year}년 ` : ''}«${lin.name ?? '지난 업무'}»에서 이어짐` : null,
      dot: 'task',
      href: lin ? objectHref('work', lin.workId) : null,
    });
  }

  // 공문에서 시작한 업무·할 일
  const docs: Array<{ link: OfficialDocLink; taskId: string | null }> = [];
  const wd = officialDocLinkOf(work.meta);
  if (wd) docs.push({ link: wd, taskId: null });
  for (const t of work.tasks) {
    const d = officialDocLinkOf(t.meta);
    if (d) docs.push({ link: d, taskId: t.id });
  }
  for (const { link, taskId } of docs) {
    push({
      key: `doc:${link.doc_no ?? link.title}:${taskId ?? 'work'}`,
      at: link.at || work.created_at || today,
      text: `공문 «${link.title ?? link.doc_no}»`,
      sub: taskId ? `→ 할 일 «${work.tasks.find((t) => t.id === taskId)?.title ?? ''}»` : '→ 이 업무로',
      dot: 'doc',
      taskId,
      doc: { docNo: link.doc_no ?? null, title: link.title ?? link.doc_no ?? '공문' },
    });
  }

  for (const ev of events) {
    const title = taskTitleFor(work, ev.task_id, ev.detail);
    const d = describeWorkEvent(ev.kind, title);
    push({
      key: `ev:${ev.id}`,
      at: ev.at,
      text: d.text,
      sub: [ROLE_LABEL[ev.actor_role] ?? null, ev.via !== 'web' ? VIA_LABEL[ev.via] ?? ev.via : null].filter(Boolean).join(' · ') || null,
      dot: d.dot,
      taskId: ev.task_id,
    });
  }

  const roundTaskIds = new Set(work.tasks.filter((t) => getTaskDeadlines(t as never).length > 1).map((t) => t.id));
  for (const h of collapseStatusHistory(history, roundTaskIds)) {
    const t = work.tasks.find((x) => x.id === h.task_id);
    if (!t) continue;
    const label = STATUS_LABEL[h.new_status!] ?? h.new_status;
    push({
      key: `hist:${h.id}`,
      at: h.changed_at,
      text: h.new_status === 'completed' ? `«${t.title}» 완료` : `«${t.title}» → ${label}`,
      sub: null,
      dot: h.new_status === 'completed' ? 'done' : 'task',
      taskId: t.id,
    });
  }

  // 마감 — 지난 마감은 «완료/진행» 기록이 말하므로 앞으로의 것만
  for (const t of work.tasks) {
    if (t.status === 'cancelled') continue;
    for (const due of pendingDeadlinesForWork(t as never)) {
      const diff = daysBetween(today, due);
      if (diff === null || diff < 0) continue;
      push({ key: `due:${t.id}:${due}`, at: due, text: `마감 «${t.title}»`, sub: null, dot: 'calendar', taskId: t.id });
    }
  }

  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.key.localeCompare(b.key)));
}

// ----------------------------------------
// 연결
// ----------------------------------------

/** doc·flow·lineage = 옛 연결(meta·흐름 선)에서도 나온다 · schedule·output = 연결 표에서만(P1) */
export type LinkGroupKey = 'doc' | 'flow' | 'lineage' | 'schedule' | 'output';

export interface LinkEntry {
  key: string;
  badge: string;
  label: string;
  href?: string | null;
  sub?: string | null;
  /** 연결 표(ontology_link)의 줄이면 그 id — 옛 연결은 없다(지울 수 없다) */
  linkId?: string;
  /** 지금 사용자가 이 연결을 끊을 수 있는가(만든 사람·관리자) */
  removable?: boolean;
  /** 공문이면 상세 창으로 연다(id = 연결 표, docNo = 옛 출처 meta) — 2026-11-12 */
  doc?: { id?: string; docNo?: string } | null;
  /** 상대 객체 «종류:id» — 같은 상대를 다시 잇지 않게 */
  targetKey?: string;
}

export interface LinkGroup {
  key: LinkGroupKey;
  title: string;
  entries: LinkEntry[];
}

/** 흐름 선 이름 — 업무 흐름 캔버스의 관계 5종 중 업무 사이에 뜻이 있는 것 */
export const FLOW_RELATIONS = ['flow', 'related', 'depends_on', 'handoff'] as const;

export function isMeaningfulRelation(relation: string): boolean {
  return (FLOW_RELATIONS as readonly string[]).includes(relation);
}

function flowBadge(n: FlowNeighbor): string {
  if (n.relation === 'related') return '관련';
  if (n.relation === 'handoff') return n.direction === 'out' ? '넘겨줌' : '넘겨받음';
  if (n.relation === 'depends_on') return n.direction === 'out' ? '선행 필요' : '이것에 기댐';
  return n.direction === 'in' ? '앞' : '다음';
}

export function buildWorkLinks(
  work: ObjWork,
  neighbors: readonly FlowNeighbor[],
  lineage: readonly LineageEntry[],
  hrefOfWork: (id: string) => string,
): LinkGroup[] {
  const groups: LinkGroup[] = [];

  const docEntries: LinkEntry[] = [];
  const seenDoc = new Set<string>();
  const addDoc = (link: OfficialDocLink, sub: string | null) => {
    const k = link.doc_no ?? link.title ?? '';
    if (!k || seenDoc.has(k)) return;
    seenDoc.add(k);
    docEntries.push({ key: `doc:${k}`, badge: '공문', label: link.title ?? link.doc_no ?? '', sub, doc: link.doc_no ? { docNo: link.doc_no } : null });
  };
  const wd = officialDocLinkOf(work.meta);
  if (wd) addDoc(wd, '이 업무의 근거');
  for (const t of work.tasks) {
    const d = officialDocLinkOf(t.meta);
    if (d) addDoc(d, `할 일 «${t.title}»`);
  }
  if (docEntries.length) groups.push({ key: 'doc', title: '근거 공문', entries: docEntries });

  // 흐름 — 같은 이웃이 여러 흐름에 있으면 한 번만, 앞 → 관련 → 다음 순
  const seenFlow = new Set<string>();
  const flowEntries: LinkEntry[] = [];
  const order = (n: FlowNeighbor) => (n.direction === 'in' && n.relation !== 'related' ? 0 : n.relation === 'related' ? 1 : 2);
  for (const n of [...neighbors].filter((x) => isMeaningfulRelation(x.relation) && x.workId !== work.id).sort((a, b) => order(a) - order(b))) {
    const k = `${n.relation}:${n.direction}:${n.workId}`;
    if (seenFlow.has(k)) continue;
    seenFlow.add(k);
    flowEntries.push({
      key: `flow:${k}`,
      badge: flowBadge(n),
      label: n.workName,
      href: hrefOfWork(n.workId),
      sub: n.workStatus ? STATUS_LABEL[n.workStatus] ?? null : null,
    });
  }
  if (flowEntries.length) groups.push({ key: 'flow', title: '흐름 · 앞뒤 업무', entries: flowEntries });

  // 계보 — 지식 RPC 가 준 여러 해, 없으면 meta 의 바로 앞 해 하나
  const linEntries: LinkEntry[] = lineage
    .filter((l) => l.generations_ago > 0 && l.work_id !== work.id)
    .sort((a, b) => a.generations_ago - b.generations_ago)
    .map((l) => ({
      key: `lin:${l.work_id}`,
      badge: l.generations_ago === 1 ? '작년' : `${l.generations_ago}년 전`,
      label: `${l.year != null && l.year !== '' ? `${l.year} ` : ''}${l.name}`,
      href: hrefOfWork(l.work_id),
    }));
  if (linEntries.length === 0) {
    const lin = lineageOf(work.meta);
    if (lin) linEntries.push({ key: `lin:${lin.workId}`, badge: '작년', label: `${lin.year ? `${lin.year} ` : ''}${lin.name ?? '지난 업무'}`, href: hrefOfWork(lin.workId) });
  }
  if (linEntries.length) groups.push({ key: 'lineage', title: '계보 · 지난 해', entries: linEntries });

  return groups;
}

// ----------------------------------------
// 단계·요약
// ----------------------------------------

export interface WorkStages {
  stages: PipelineStage<ObjTask & { status: string }>[];
  states: StageState[];
  oneTime: ObjTask[];
}

export function workStages(work: ObjWork): WorkStages {
  const sorted = [...work.tasks].sort((a, b) => a.order_index - b.order_index || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const stages = buildStages(sorted as never[]) as unknown as WorkStages['stages'];
  return { stages, states: stageStates(stages as never), oneTime: oneTimeTasks(sorted as never[]) as unknown as ObjTask[] };
}

/** «4단계 중 2단계» — 할 일이 절차형 단계 안에 있을 때만 */
export function stageLabelOf(work: ObjWork, taskId: string): string | null {
  const { stages } = workStages(work);
  const i = stages.findIndex((s) => s.tasks.some((t) => t.id === taskId));
  return i >= 0 && stages.length > 1 ? `${stages.length}단계 중 ${i + 1}단계` : null;
}

export function workSummary(work: ObjWork, today: string): { total: number; done: number; nextDue: string | null; overdue: number } {
  const live = work.tasks.filter((t) => t.status !== 'cancelled');
  const done = live.filter((t) => t.status === 'completed').length;
  let nextDue: string | null = null;
  let overdue = 0;
  for (const t of live) {
    if (t.status === 'completed') continue;
    for (const d of pendingDeadlinesForWork(t as never)) {
      const diff = daysBetween(today, d);
      if (diff === null) continue;
      if (diff < 0) { overdue += 1; continue; }
      if (!nextDue || d < nextDue) nextDue = d;
    }
  }
  return { total: live.length, done, nextDue, overdue };
}
