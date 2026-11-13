/**
 * 공문 판단함 2단계 — 결정 초안·저장 값·규칙 조건의 단일 출처 (2026-10-30). 화면은 그리기만 한다.
 * 설계 = docs/plans/2026-10-30-official-doc-triage.md
 *
 * 결정 다섯 갈래:
 *   link_work   기존 업무에 «할 일»을 더한다(공문 한 건 = 할 일 한 개가 흔하다)
 *   create_work 새 업무 + 첫 할 일 (후보가 있으면 후보 창으로 풍부한 초안을 만들 수도 있다)
 *   reassign    다른 사람 일이라고 적어 둔다(업무는 만들지 않는다)
 *   info        참고만 · ignore 무시
 * 결정은 지우지 않고 새 행으로 덮는다 — 이력 자체가 다음 판정의 사례 지식이다.
 */
import type { CandidateWorkInsert, PersonOption } from '@/lib/candidateToWork';
import type { DocNature, OfficialDoc } from '@/features/official-docs/officialDocService';

export const OFFICIAL_DOC_LINK_KEY = 'fromOfficialDoc';

export type DecisionKind = 'link_work' | 'create_work' | 'reassign' | 'info' | 'ignore';

export const DECISION_CHOICES: Array<{ value: DecisionKind; label: string; hint: string }> = [
  { value: 'link_work', label: '기존 업무에 할 일 추가', hint: '이미 있는 업무 안에 이 공문의 할 일을 만듭니다' },
  { value: 'create_work', label: '새 업무 만들기', hint: '맞는 업무가 없을 때 — 업무와 첫 할 일을 만듭니다' },
  { value: 'reassign', label: '다른 사람 일', hint: '업무는 만들지 않고 누구 일인지만 남깁니다' },
  { value: 'info', label: '참고만', hint: '할 일은 없지만 알아 둘 내용' },
  { value: 'ignore', label: '무시', hint: '이 학교와 관계없거나 볼 필요 없음' },
];

/** 결정 창에서 고를 수 있는 성격(«업무»는 1판 이력용이라 빼 둔다) */
export const NATURES: DocNature[] = ['제출', '추천', '설문', '참석', '실시', '지침', '기회', '홍보', '무관'];

export interface DecisionDraft {
  kind: DecisionKind;
  nature: DocNature | null;
  workId: string | null;
  candidateId: string | null;
  newWorkName: string;
  managers: PersonOption[];
  taskTitle: string;
  taskDue: string | null;
  assignees: PersonOption[];
  reason: string;
  makeRule: boolean;
  ruleSender: string;
  ruleKeywords: string;
  /** 새 업무의 목표일(업무노트 «새 업무로», 2026-11-12) — 있으면 work.meta.targetDate */
  workTargetDate?: string | null;
}

/** 공문 링크 — 업무·할 일 meta 에 남긴다(어느 공문에서 왔는가) */
export interface OfficialDocLink { doc_no: string; title: string; at: string }

export function docLink(doc: Pick<OfficialDoc, 'doc_no' | 'title'>, now = new Date()): OfficialDocLink {
  return { doc_no: doc.doc_no, title: doc.title, at: now.toISOString() };
}

/** 이름 → 명단의 사람(정확히 한 명일 때만). 못 찾은 이름은 버린다 — 추측해서 넣지 않는다 */
export function peopleByNames(names: Array<string | null | undefined>, roster: PersonOption[]): PersonOption[] {
  const out: PersonOption[] = [];
  for (const raw of names) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    const hits = roster.filter((r) => r.name === name);
    if (hits.length === 1 && !out.some((p) => p.id === hits[0].id)) out.push(hits[0]);
  }
  return out;
}

/** 발신 기관에서 규칙 조건으로 쓸 부분 — «전북특별자치도교육청 재무과» 처럼 기관+부서 그대로 */
export function senderForRule(sender: string | null | undefined): string {
  return (sender ?? '').replace(/\s+/g, ' ').trim();
}

/** 제목에서 규칙 낱말 후보 — 괄호 꼬리표·기호를 걷어 낸 의미 있는 낱말 2~3개 */
export function titleKeywords(title: string): string[] {
  const STOP = new Set(['요청', '안내', '제출', '관련', '협조', '알림', '실시', '개최', '결과', '계획', '추진', '운영', '대한', '위한', '및', '등', '년', '학년도']);
  return title
    .replace(/\[[^\]]*\]|\([^)]*\)|「|」|『|』|<[^>]*>/g, ' ')
    .split(/[\s·,./]+/)
    .map((w) => w.replace(/[^가-힣A-Za-z0-9]/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w))
    .slice(0, 3);
}

/** 처음 열 때의 초안 — AI 판정에서 채운다(사람이 고친다) */
export function initialDraft(doc: OfficialDoc, roster: PersonOption[]): DecisionDraft {
  const r = doc.triage?.result ?? {};
  const top = (r.work_candidates ?? [])[0];
  const assignees = peopleByNames([...(r.assignees ?? []).map((a) => a.name), doc.approver_name], roster).slice(0, 2);
  const kind: DecisionKind = !doc.triage
    ? 'info'
    : doc.triage.needs_action || r.needs_action
      ? 'link_work'
      : doc.triage.nature === '무관' || doc.triage.nature === '홍보' ? 'ignore' : 'info';
  return {
    kind,
    nature: doc.triage?.nature ?? r.nature ?? null,
    workId: null,
    candidateId: top?.id ?? null,
    newWorkName: top?.name ?? '',
    managers: assignees.slice(0, 1),
    taskTitle: doc.title.replace(/^\s*\[[^\]]*\]\s*/, '').slice(0, 120),
    taskDue: doc.triage?.deadline ?? (r.deadline || null),
    assignees,
    reason: '',
    makeRule: false,
    ruleSender: senderForRule(doc.sender),
    ruleKeywords: titleKeywords(doc.title).join(', '),
  };
}

/** 저장 전 검사 — 문제가 없으면 null */
export function validateDraft(d: DecisionDraft): string | null {
  if (d.kind === 'link_work' && !d.workId) return '연결할 업무를 고르세요.';
  if (d.kind === 'create_work' && !d.newWorkName.trim()) return '새 업무 이름을 적으세요.';
  if (d.kind === 'create_work' && d.managers.length === 0) return '새 업무의 책임자를 한 명 이상 고르세요.';
  if ((d.kind === 'link_work' || d.kind === 'create_work') && !d.taskTitle.trim()) return '할 일 제목을 적으세요.';
  if (d.kind === 'reassign' && d.assignees.length === 0) return '누구 일인지 고르세요.';
  if (d.taskDue && !/^\d{4}-\d{2}-\d{2}$/.test(d.taskDue)) return '기한은 YYYY-MM-DD 로 적으세요.';
  if (d.makeRule && !d.ruleSender.trim() && !ruleKeywordList(d).length) return '규칙의 조건(발신 또는 낱말)을 하나 이상 적으세요.';
  return null;
}

export function ruleKeywordList(d: Pick<DecisionDraft, 'ruleKeywords'>): string[] {
  return d.ruleKeywords.split(/[,，]/).map((w) => w.trim()).filter(Boolean).slice(0, 5);
}

/** 할 일 하나(기존 업무에 더하거나 새 업무의 첫 할 일) */
export function taskInsert(d: DecisionDraft, doc: OfficialDoc, now = new Date()) {
  const summary = doc.triage?.result?.summary;
  return {
    title: d.taskTitle.trim(),
    description: [summary, `공문 ${doc.doc_no} «${doc.title}»`].filter(Boolean).join('\n'),
    type: 'one_time' as const,
    order_index: 0,
    due_date: d.taskDue,
    keywords: [] as string[],
    meta: {
      assignees: d.assignees.map((a) => ({ id: a.id, name: a.name, status: 'pending', assigned_at: now.toISOString() })),
      [OFFICIAL_DOC_LINK_KEY]: docLink(doc, now),
    },
  };
}

/** 새 업무 + 첫 할 일 — 저장은 후보 경로와 같은 `createWorkFromCandidate`(업무 → 할 일, 실패 시 되돌림) */
export function workInsert(d: DecisionDraft, doc: OfficialDoc, year: number, department: string | null, now = new Date()): CandidateWorkInsert {
  return {
    work: {
      name: d.newWorkName.trim(),
      description: doc.triage?.result?.summary ?? '',
      keywords: [],
      meta: {
        ...(department ? { department } : {}),
        year,
        ...(d.workTargetDate ? { targetDate: d.workTargetDate, startedIn: 'official_doc' } : {}),
        [OFFICIAL_DOC_LINK_KEY]: docLink(doc, now),
      },
    },
    managers: d.managers,
    tasks: [taskInsert(d, doc, now)],
  };
}

/** 규칙 한 줄 — 사람이 «규칙으로 남기기»를 고른 결정에서만. 조건은 발신(부분 일치) + 제목 낱말(모두 포함) */
export function ruleInsert(d: DecisionDraft, decisionId: string, ids: { workId: string | null; candidateId: string | null }, year: number) {
  const condition: Record<string, unknown> = {};
  if (d.ruleSender.trim()) condition.sender = d.ruleSender.trim();
  const words = ruleKeywordList(d);
  if (words.length) condition.title_all = words;
  const outcome: Record<string, unknown> = { decision: d.kind };
  if (d.nature) outcome.nature = d.nature;
  if (ids.workId) outcome.work_id = ids.workId;
  if (ids.candidateId) outcome.work_candidate_id = ids.candidateId;
  if (d.assignees.length) outcome.assignee_names = d.assignees.map((a) => a.name);
  return {
    kind: 'route' as const,
    condition,
    outcome,
    note: d.reason.trim() || null,
    status: 'active' as const,
    academic_year: year,
    source_decision_ids: [decisionId],
  };
}

/** AI 1순위가 사람의 결정과 맞았나 — 정확도 측정(같은 업무·후보를 골랐거나, 할 일 없음 판정이 같으면 일치) */
export function agreesWithTriage(doc: OfficialDoc): boolean | null {
  const dec = doc.decision;
  const t = doc.triage;
  if (!dec || !t) return null;
  const aiAction = t.needs_action ?? t.result?.needs_action ?? null;
  const humanAction = dec.decision === 'link_work' || dec.decision === 'link_task' || dec.decision === 'create_work';
  if (aiAction !== null && aiAction !== humanAction) return false;
  if (!humanAction) return true;
  const top = t.result?.work_candidates?.[0];
  if (!top) return dec.decision === 'create_work';
  return (!!dec.work_candidate_id && dec.work_candidate_id === top.id) || (!!dec.work_id && dec.work_id === top.id);
}
