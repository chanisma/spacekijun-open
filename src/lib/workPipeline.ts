// ========================================
// 업무 진행 화면(반자동 파이프라인) — 단계·산출물·흐름의 단일 출처 (2026-09-27)
//
// 근거 = docs/plans/2026-09-27-task-automation-research.md §3·§6
// 화면(src/pages/WorkPipeline.tsx)과 서비스(src/services/workPipelineService.ts)는 여기 판정을
// 그리거나 실어 나르기만 한다. React·supabase 에 의존하지 않는다(회귀가 그대로 부른다).
//
// ── 핵심 생각 ────────────────────────────────────────────────────────────────
// 단계 사이로 넘어가는 것은 종류가 많아 보이지만(라이브 8종) **운반 형태는 여섯**이다 —
// 신호 · 값 · 명단 · 표 · 스펙 문서(값) · 일반 파일. 흐름마다 코드를 짜지 않고
// (운반 형태 × 받는 자리) 조합으로 푼다. 수준은 셋:
//   L1 보여주기 — 앞 단계 산출물을 지금 단계 옆에 띄운다(모든 형태, 항상)
//   L2 채워주기 — 형태가 맞으면 다음 작업의 설정 칸으로 끌어온다(사람이 누른다)
//   L3 변환     — 표 → 글 같은 것은 AI 버튼(src/lib/workAi.ts)
// ========================================

export type OutputKind = 'signal' | 'value' | 'people' | 'table' | 'spec_document' | 'file';

/** 사람이 직접 남길 수 있는 형태 — 나머지는 작업·제출에서 유도된다 */
export type ManualOutputKind = 'value' | 'people' | 'table';

export const OUTPUT_KIND_META: Record<OutputKind, { label: string; hint: string }> = {
  signal: { label: '완료 신호', hint: '끝났다는 사실만 다음 단계로 넘어갑니다.' },
  value: { label: '값', hint: '선정 업체·회의 일시처럼 한 줄로 남습니다.' },
  people: { label: '명단', hint: '다음 단계의 받는 사람·수합 대상으로 쓸 수 있습니다.' },
  table: { label: '표', hint: '여러 줄 자료 — 행을 골라 다음 단계로 넘길 수 있습니다.' },
  spec_document: { label: '스펙 문서', hint: '양식과 값으로 남아 문서가 곧 데이터가 됩니다.' },
  file: { label: '파일', hint: '파일 링크만 넘어갑니다(내용은 열어 봐야 압니다).' },
};

export const OUTPUT_KIND_ORDER: OutputKind[] = ['signal', 'value', 'people', 'table', 'spec_document', 'file'];

export function isManualOutputKind(kind: OutputKind): kind is ManualOutputKind {
  return kind === 'value' || kind === 'people' || kind === 'table';
}

// ── 선언 (task.meta.output) ─────────────────────────────────────────────────

/**
 * 할 일이 «무엇을 남기는가»의 선언. `task.meta.output` 에 담는다(스키마 변경 없음).
 * ⚠️ 새 meta 키라 `workRollover.TASK_META_ROLLOVER_POLICY` 에 `keep` 으로 적혀 있다 —
 *    작년 업무를 가져오면 «무엇을 남기는가»도 따라온다(값 자체는 따라오지 않는다).
 */
export interface TaskOutputDecl {
  kind: OutputKind;
  /** 무엇인지 한 마디 — "선정 업체", "승인된 신청 목록" */
  label?: string;
}

export function parseOutputDecl(meta: unknown): TaskOutputDecl | null {
  const raw = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).output : null;
  if (!raw || typeof raw !== 'object') return null;
  const kind = (raw as Record<string, unknown>).kind;
  if (typeof kind !== 'string' || !(OUTPUT_KIND_ORDER as string[]).includes(kind)) return null;
  const label = (raw as Record<string, unknown>).label;
  return {
    kind: kind as OutputKind,
    ...(typeof label === 'string' && label.trim() ? { label: label.trim().slice(0, 60) } : {}),
  };
}

// ── 단계 ────────────────────────────────────────────────────────────────────

export interface PipelineTaskLike {
  id: string;
  title: string;
  order_index: number;
  status: string;
  due_date?: string | null;
  description?: string | null;
  meta?: Record<string, unknown> | null;
  /** 'procedural' | 'one_time' — 없으면 절차형으로 본다(옛 행) */
  type?: string | null;
}

export interface PipelineStage<T extends PipelineTaskLike = PipelineTaskLike> {
  /** 0부터 — 화면의 ①②③ */
  index: number;
  order: number;
  tasks: T[];
  /** 단계 안 할 일이 전부 끝났나(취소 포함) */
  done: boolean;
}

const isTaskDone = (t: PipelineTaskLike) => t.status === 'completed' || t.status === 'cancelled';

/** 일회성 할 일인가 — 단계가 아니다(순서 칸이 «만든 순서»일 뿐이다) */
export const isOneTimeTask = (t: PipelineTaskLike) => t.type === 'one_time';

/**
 * 할 일 → 단계. **절차형 할 일만**, 같은 `order_index` = 같은 단계(동시에 하는 일).
 *
 * ⚠️ 일회성 할 일을 넣지 말 것 — 라이브 일회성 40건의 `order_index` 가 1~14 인데 이것은 만든 순서이지
 *    절차가 아니다. 넣으면 일회성 15개짜리 업무가 15단계 사슬로 그려지고, 순서 점검이 거짓 경보를 낸다
 *    (적대적 검증 2026-09-27). 일회성은 `oneTimeTasks` 로 따로 묶는다.
 * 단계 안 순서는 입력 순서를 지킨다(호출부가 정렬해 넘긴다).
 */
export function buildStages<T extends PipelineTaskLike>(tasks: T[]): PipelineStage<T>[] {
  const byOrder = new Map<number, T[]>();
  for (const t of tasks) {
    if (isOneTimeTask(t)) continue;
    const order = Number.isFinite(t.order_index) ? t.order_index : 0;
    byOrder.set(order, [...(byOrder.get(order) ?? []), t]);
  }
  return [...byOrder.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([order, list], index) => ({ index, order, tasks: list, done: list.every(isTaskDone) }));
}

export function stageIndexOfTask(stages: PipelineStage[], taskId: string): number {
  return stages.findIndex((s) => s.tasks.some((t) => t.id === taskId));
}

/** 순서 없는 할 일(일회성) — 단계 줄 끝에 따로 보인다 */
export function oneTimeTasks<T extends PipelineTaskLike>(tasks: T[]): T[] {
  return tasks.filter(isOneTimeTask);
}

/** 바로 앞 단계 — 앞 단계가 없으면 null(첫 단계 · 일회성 할 일) */
export function previousStageOf<T extends PipelineTaskLike>(stages: PipelineStage<T>[], taskId: string): PipelineStage<T> | null {
  const i = stageIndexOfTask(stages, taskId);
  return i > 0 ? stages[i - 1] : null;
}

/**
 * 처음 열 때 고를 할 일 — **아직 안 끝난 가장 앞 단계의 첫 할 일**. 다 끝났으면 마지막 할 일.
 * (업무를 연 사람이 가장 먼저 봐야 하는 곳이 «지금 할 차례»다)
 */
export function defaultTaskId(stages: PipelineStage[], unordered: PipelineTaskLike[] = []): string | null {
  const open = stages.find((s) => !s.done);
  if (open) return open.tasks.find((t) => !isTaskDone(t))?.id ?? open.tasks[0]?.id ?? null;
  const openOneTime = unordered.find((t) => !isTaskDone(t));
  if (openOneTime) return openOneTime.id;
  const last = stages[stages.length - 1];
  return last?.tasks[last.tasks.length - 1]?.id ?? unordered[unordered.length - 1]?.id ?? null;
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

/** 화면의 단계 번호 — ①②③ (20을 넘으면 «21.») */
export const stageNumber = (index: number) => CIRCLED[index] ?? `${index + 1}.`;

/** 단계의 상태 — 단계 줄의 색 */
export type StageState = 'done' | 'current' | 'upcoming';

export function stageStates(stages: PipelineStage[]): StageState[] {
  const firstOpen = stages.findIndex((s) => !s.done);
  return stages.map((s, i) => (s.done ? 'done' : i === firstOpen ? 'current' : 'upcoming'));
}

// ── 산출물 원천 ─────────────────────────────────────────────────────────────

export interface PipelineActionLike {
  id: string;
  task_id: string;
  action_type: string;
  title: string;
  config?: Record<string, unknown> | null;
}

export type OutputSource =
  | { type: 'manual' }
  | { type: 'collect'; actionId: string; title: string }
  | { type: 'message'; actionId: string; title: string }
  | { type: 'spec'; actionId: string; title: string }
  | { type: 'submission'; mode: 'file' | 'spec' | 'spreadsheet' };

/** 원천이 내놓는 형태 */
export function kindOfSource(source: OutputSource): OutputKind {
  switch (source.type) {
    case 'manual': return 'value';
    case 'collect': return 'table';
    case 'message': return 'value';
    case 'spec': return 'spec_document';
    case 'submission':
      return source.mode === 'spreadsheet' ? 'table' : source.mode === 'spec' ? 'spec_document' : 'file';
  }
}

export const OUTPUT_SOURCE_LABEL: Record<OutputSource['type'], string> = {
  manual: '직접 남긴 것',
  collect: '입력 받기',
  message: '보낸 메시지',
  spec: '스펙 문서',
  submission: '제출물',
};

/**
 * 이 할 일에서 산출물이 나올 수 있는 곳 — **자동 유도 원천** + 사람이 직접 남기는 자리.
 * 제출 받기는 작업 목록에 있지만 저장은 `task.meta.submission` 이다(CLAUDE.md «제출 업무»).
 */
export function outputSourcesForTask(task: PipelineTaskLike, actions: PipelineActionLike[]): OutputSource[] {
  const sources: OutputSource[] = [];
  for (const a of actions) {
    if (a.task_id !== task.id) continue;
    if (a.action_type === 'collect.input') sources.push({ type: 'collect', actionId: a.id, title: a.title });
    else if (a.action_type === 'message.send') sources.push({ type: 'message', actionId: a.id, title: a.title });
    else if (a.action_type === 'document.spec_fill') sources.push({ type: 'spec', actionId: a.id, title: a.title });
  }
  const submission = (task.meta?.submission ?? null) as { required?: boolean; mode?: string } | null;
  // 실물 제출(2026-10-01)은 산출물이 없다 — 남는 것은 «받았다»뿐이라 원천으로 세우지 않는다.
  // `file` 로 떨어지게 두면 영원히 빈 파일 목록이 «제출물»로 그려진다.
  if (submission?.required && submission.mode !== 'physical') {
    const mode = submission.mode === 'spec' || submission.mode === 'spreadsheet' ? submission.mode : 'file';
    sources.push({ type: 'submission', mode });
  }
  sources.push({ type: 'manual' });
  return sources;
}

/**
 * 이 할 일의 산출물 형태 — **선언이 이긴다**. 선언이 없으면 자동 원천의 형태, 그것도 없으면 신호.
 * (메시지는 «보냈다»가 일의 결과라 선언 없이는 값으로 치지 않는다 — 신호로 둔다)
 */
export function effectiveOutputKind(task: PipelineTaskLike, actions: PipelineActionLike[]): OutputKind {
  const decl = parseOutputDecl(task.meta);
  if (decl) return decl.kind;
  const auto = outputSourcesForTask(task, actions).filter((s) => s.type !== 'manual' && s.type !== 'message');
  return auto.length > 0 ? kindOfSource(auto[0]) : 'signal';
}

// ── 풀어낸 산출물 (서비스가 채운다) ───────────────────────────────────────

export interface OutputPerson {
  resourceId: string | null;
  name: string;
}

export interface OutputColumn {
  key: string;
  label: string;
}

export interface OutputRow {
  key: string;
  cells: Record<string, string>;
  /** 이 줄이 가리키는 사람 — 명단으로 넘길 수 있는 표(입력 받기)만 */
  people?: OutputPerson[];
}

export interface OutputTable {
  columns: OutputColumn[];
  rows: OutputRow[];
}

export type ResolvedOutputBody =
  | { kind: 'signal'; done: boolean }
  | { kind: 'value'; text: string }
  | { kind: 'people'; people: OutputPerson[] }
  | ({ kind: 'table' } & OutputTable)
  | { kind: 'spec_document'; title: string; fields: { key: string; value: string }[] }
  | { kind: 'file'; files: { name: string; url: string }[] };

export interface ResolvedOutput {
  taskId: string;
  /** 어디서 나왔나 — "입력 받기 · 정보화기기 구입 예산 사용 신청" */
  sourceLabel: string;
  sourceType: OutputSource['type'];
  /**
   * 원천의 **안정 키** — `collect:<작업id>` · `submission:spec` · `manual`. 이름이 바뀌어도 같다.
   * 행 고르기가 «같은 출처에서 다시 고르는가»를 이것으로 판정한다(다른 출처의 결정 값이 옮겨 붙지 않게).
   */
  sourceKey: string;
  /**
   * 비공개 수합·본인만 보는 제출처럼 **보는 사람마다 범위가 다른 원천**인가. 이런 표를 행 고르기로
   * 산출물에 옮기면 같은 업무 담당자 전원에게 열리므로, 저장할 때 «제한»으로 남긴다(매니저만 열람).
   */
  restricted?: boolean;
  body: ResolvedOutputBody;
  updatedAt: string | null;
  updatedByName?: string | null;
  /** 이 원천을 읽을 수 없었던 까닭(권한·오류) — 비었다와 못 봤다를 구분한다 */
  unavailable?: string;
}

/** 담을 것이 있는가 — 빈 표·빈 명단은 «없음»으로 그린다 */
export function outputHasContent(body: ResolvedOutputBody): boolean {
  switch (body.kind) {
    case 'signal': return body.done;
    case 'value': return body.text.trim().length > 0;
    case 'people': return body.people.length > 0;
    case 'table': return body.rows.length > 0;
    case 'spec_document': return body.fields.length > 0;
    case 'file': return body.files.length > 0;
  }
}

// ── 사람이 남기는 산출물의 저장 모양(task_output_value.payload) ──────────────

export type ManualOutputPayload =
  | { kind: 'value'; payload: { text: string } }
  | { kind: 'people'; payload: { people: OutputPerson[] } }
  | { kind: 'table'; payload: OutputTable };

export function manualPayloadToBody(kind: string, payload: unknown): ResolvedOutputBody | null {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  if (kind === 'value') return { kind: 'value', text: typeof p.text === 'string' ? p.text : '' };
  if (kind === 'people') {
    const people = Array.isArray(p.people) ? p.people : [];
    return {
      kind: 'people',
      people: people
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => ({ resourceId: typeof x.resourceId === 'string' ? x.resourceId : null, name: String(x.name ?? '') }))
        .filter((x) => x.name.trim()),
    };
  }
  if (kind === 'table') {
    const table = normalizeTable(p);
    return { kind: 'table', ...table };
  }
  return null;
}

/** 저장값을 믿지 않고 표 모양으로 고친다(열 키 중복·빈 행 제거) */
export function normalizeTable(raw: unknown): OutputTable {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const columns: OutputColumn[] = (Array.isArray(r.columns) ? r.columns : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ key: String(c.key ?? '').trim(), label: String(c.label ?? '').trim() }))
    .filter((c) => c.key && !seen.has(c.key) && (seen.add(c.key), true))
    .map((c) => ({ ...c, label: c.label || c.key }));
  const rowKeys = new Set<string>();
  const rows: OutputRow[] = (Array.isArray(r.rows) ? r.rows : [])
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row, i) => {
      const cellsRaw = row.cells && typeof row.cells === 'object' ? (row.cells as Record<string, unknown>) : {};
      const cells: Record<string, string> = {};
      for (const c of columns) {
        const v = cellsRaw[c.key];
        cells[c.key] = v == null ? '' : String(v);
      }
      let key = String(row.key ?? `r${i + 1}`);
      while (rowKeys.has(key)) key = `${key}_`;
      rowKeys.add(key);
      const people = Array.isArray(row.people)
        ? (row.people as unknown[])
            .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
            .map((x) => ({ resourceId: typeof x.resourceId === 'string' ? x.resourceId : null, name: String(x.name ?? '') }))
        : undefined;
      return { key, cells, ...(people && people.length ? { people } : {}) };
    });
  return { columns, rows };
}

// ── L2 채워주기: 형태 × 받는 자리 ───────────────────────────────────────────

/** 지금 할 일의 작업이 받을 수 있는 자리 */
export type FlowTarget =
  | 'message_audience' // 메시지 받는 사람 ← 명단
  | 'collect_audience' // 입력 받기 대상 ← 명단
  | 'message_body'     // 메시지 본문 ← 값·표·문서
  | 'spec_context'     // 스펙 문서의 맥락 ← 값·표·문서(러너의 맥락 목록에 자동으로 들어간다)
  | 'table_pick';      // 이 할 일의 표 ← 앞 단계 표에서 행 고르기

export const FLOW_TARGET_LABEL: Record<FlowTarget, string> = {
  message_audience: '메시지 받는 사람으로',
  collect_audience: '입력 받기 대상으로',
  message_body: '메시지 본문에 넣기',
  spec_context: '문서 작성 맥락으로',
  table_pick: '행을 골라 이 할 일의 표로',
};

/** 산출물에서 사람을 뽑는다 — 명단은 그대로, 표는 줄마다 붙은 사람의 합집합 */
export function outputPeople(body: ResolvedOutputBody): OutputPerson[] {
  if (body.kind === 'people') return dedupePeople(body.people);
  if (body.kind === 'table') return dedupePeople(body.rows.flatMap((r) => r.people ?? []));
  return [];
}

export function dedupePeople(people: OutputPerson[]): OutputPerson[] {
  const seen = new Set<string>();
  const out: OutputPerson[] = [];
  for (const p of people) {
    const key = p.resourceId ?? `name:${p.name}`;
    if (!p.name.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * 이 산출물을 지금 할 일의 어느 자리로 넘길 수 있나. `actionTypes` 는 지금 할 일에 연결된 작업 유형,
 * `ownKind` 는 지금 할 일이 남기는 형태(행 고르기는 «표를 남기는 할 일»에만 뜬다).
 *
 * ⚠️ 받는 사람으로 넘길 때 **resource 가 없는 이름은 빠진다**(대상 규칙은 id 로만 가리킨다) —
 *    화면이 몇 명이 빠지는지 말해야 한다(`peopleForAudience`).
 */
export function availableFlows(body: ResolvedOutputBody, actionTypes: string[], ownKind: OutputKind): FlowTarget[] {
  const targets: FlowTarget[] = [];
  const hasPeople = outputPeople(body).some((p) => p.resourceId);
  const hasText = body.kind === 'value' || body.kind === 'table' || body.kind === 'spec_document';
  if (hasPeople && actionTypes.includes('message.send')) targets.push('message_audience');
  if (hasPeople && actionTypes.includes('collect.input')) targets.push('collect_audience');
  if (hasText && outputHasContent(body) && actionTypes.includes('message.send')) targets.push('message_body');
  if (hasText && outputHasContent(body) && actionTypes.includes('document.spec_fill')) targets.push('spec_context');
  if (body.kind === 'table' && body.rows.length > 0 && ownKind === 'table') targets.push('table_pick');
  return targets;
}

/** 대상 규칙 `people` 조건으로 넘길 id 와, id 가 없어 빠지는 이름 */
export function peopleForAudience(people: OutputPerson[]): { ids: string[]; dropped: string[] } {
  const ids: string[] = [];
  const dropped: string[] = [];
  for (const p of dedupePeople(people)) {
    if (p.resourceId) ids.push(p.resourceId);
    else dropped.push(p.name);
  }
  return { ids, dropped };
}

/**
 * 대상 규칙에 사람을 더한다. 이미 `people` 조건이 있으면 그 조건에 합친다(조건이 두 개로
 * 갈라지면 요약 문장이 «직접 지정 · 직접 지정»이 된다). 다른 조건은 건드리지 않는다.
 */
export function mergePeopleIntoRule<R extends { include: Array<{ type: string; ids?: string[] }>; exclude: unknown[] }>(
  rule: R,
  ids: string[],
  mode: 'add' | 'replace',
): R {
  // 넣는 사람이 «빼기»의 직접 지정에 남아 있으면 넣어도 빠진다 — 화면은 «N명을 넣었습니다»라고 말하므로
  // 그 사람들을 빼기 목록에서 걷어 낸다(적대적 검증 2026-09-27). 다른 빼기 조건은 그대로 둔다.
  const adding = new Set(ids);
  const exclude = (rule.exclude as Array<{ type: string; ids?: string[] }>)
    .map((c) => (c.type === 'people' ? { ...c, ids: (c.ids ?? []).filter((id) => !adding.has(id)) } : c))
    .filter((c) => c.type !== 'people' || (c.ids ?? []).length > 0);
  if (mode === 'replace') return { ...rule, include: [{ type: 'people', ids: [...adding] }], exclude } as R;
  const include = [...rule.include];
  const i = include.findIndex((c) => c.type === 'people');
  if (i >= 0) include[i] = { ...include[i], ids: [...new Set([...(include[i].ids ?? []), ...ids])] };
  else include.push({ type: 'people', ids: [...adding] });
  return { ...rule, include, exclude } as R;
}

// ── 글로 옮기기(코드) — 메시지 본문·맥락·AI 입력 공용 ───────────────────────

/** 표를 사람이 읽는 줄 글로 — 행마다 "- 열: 값 · 열: 값". 너무 길면 자르고 그 사실을 적는다 */
export function tableToText(table: OutputTable, maxRows = 40): string {
  const cols = table.columns;
  // 칸 안의 줄바꿈은 공백으로 — 그대로 두면 «- 가짜 줄»이 생긴다. 빈 줄은 싣지 않는다.
  const rows = table.rows
    .map((row) => cols
      .map((c) => [c.label, (row.cells[c.key] ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()] as const)
      .filter(([, v]) => v)
      .map(([label, v]) => `${label}: ${v}`))
    .filter((parts) => parts.length > 0);
  const lines = rows.slice(0, maxRows).map((parts) => `- ${parts.join(' · ')}`);
  if (rows.length > maxRows) lines.push(`(외 ${rows.length - maxRows}줄)`);
  return lines.join('\n');
}

/** 산출물 하나를 글로 — 흐름의 «본문에 넣기»·«문서 맥락»이 같은 함수를 쓴다(두 곳이 다르게 쓰면 안 된다) */
export function outputToText(body: ResolvedOutputBody): string {
  switch (body.kind) {
    case 'signal': return body.done ? '완료' : '';
    case 'value': return body.text.trim();
    case 'people': return body.people.map((p) => p.name).join(', ');
    case 'table': return tableToText(body);
    case 'spec_document':
      return body.fields.filter((f) => f.value.trim()).map((f) => `- ${f.key}: ${f.value}`).join('\n');
    case 'file': return body.files.map((f) => `- ${f.name}`).join('\n');
  }
}

// ── 행 고르기 (④ 표 → 표) ────────────────────────────────────────────────────

/**
 * 앞 단계 표에서 고른 행으로 이 할 일의 표를 만든다 — **스냅샷**.
 * `extraColumns`(예: 결정)는 빈 칸으로 덧붙인다. 이미 이 할 일에 표가 있으면 같은 행 키의
 * 덧붙인 열 값을 살린다(행을 다시 골라도 적어 둔 결정이 사라지지 않게).
 *
 * ⚠️ `previous` 는 **같은 출처에서 고른 표일 때만** 넘길 것(`sameOutputSource`). 다른 출처의 표를 넘기면
 *    행 키가 겹치는 순간(`r1`·`r2`…) 그쪽의 «승인·보류»가 엉뚱한 줄에 옮겨 붙는다(적대적 검증 2026-09-27).
 */
export function pickRows(
  source: OutputTable,
  rowKeys: string[],
  extraColumns: OutputColumn[] = [],
  previous?: OutputTable | null,
): OutputTable {
  const keep = new Set(rowKeys);
  const baseKeys = new Set(source.columns.map((c) => c.key));
  const extras = extraColumns.filter((c) => !baseKeys.has(c.key));
  const prevByKey = new Map((previous?.rows ?? []).map((r) => [r.key, r]));
  return {
    columns: [...source.columns, ...extras],
    rows: source.rows
      .filter((r) => keep.has(r.key))
      .map((r) => {
        const prev = prevByKey.get(r.key);
        const cells = { ...r.cells };
        for (const c of extras) cells[c.key] = prev?.cells[c.key] ?? '';
        return { ...r, cells };
      }),
  };
}

// ── 표 편집 ─────────────────────────────────────────────────────────────────

export function nextColumnKey(table: OutputTable): string {
  let i = table.columns.length + 1;
  const taken = new Set(table.columns.map((c) => c.key));
  while (taken.has(`c${i}`)) i += 1;
  return `c${i}`;
}

/**
 * 새 줄 키 — **다시 쓰이지 않는다**. `r{개수+1}` 로 만들면 줄을 지웠다 새로 넣을 때 옛 키가 되살아나
 * 뒤 단계가 옛 줄에 적은 결정을 새 줄에 붙인다(적대적 검증 2026-09-27).
 */
export function nextRowKey(table: OutputTable): string {
  const taken = new Set(table.rows.map((r) => r.key));
  let key = '';
  do {
    key = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  } while (taken.has(key));
  return key;
}

/** 행 고르기에서 옛 표의 결정 값을 이어받아도 되는가 — 같은 할 일의 같은 원천일 때만 */
export function sameOutputSource(
  provenance: Record<string, unknown> | null | undefined,
  source: { taskId: string; sourceKey: string },
): boolean {
  return !!provenance && provenance.fromTaskId === source.taskId && provenance.sourceKey === source.sourceKey;
}

/** 더하면 뜻이 없는 열 — 식별자·연도·단가·연락처 */
const NON_ADDITIVE_LABEL = /(번호|학번|코드|연도|년도|학년|학기|반$|전화|연락|단가|순번|\bid\b|ID)/;

/** 엄격한 숫자 — `1,500,000` · `1500000` · `12.5` · 끝의 «원». `0x10`·`1e3`·`5대`·`약 250,000` 은 숫자가 아니다 */
const STRICT_NUMBER = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?원?$/;

export function parseStrictNumber(raw: string): number | null {
  const v = raw.trim();
  if (!STRICT_NUMBER.test(v)) return null;
  const n = Number(v.replace(/[,원]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * 숫자 열의 합계 — **계산은 코드가 한다**(AI 에 맡기면 숫자가 틀릴 자리가 생긴다).
 *
 * **비어 있지 않은 칸이 전부 엄격한 숫자일 때만** 합계를 낸다(`-` 는 빈칸으로 본다). 하나라도 «5대»·
 * «약 250,000원» 같은 칸이 섞이면 그 열은 합계를 내지 않는다 — 과반 규칙으로 두었더니 그런 칸을 조용히
 * 빼고 틀린 합계를 사실처럼 안내문에 넣었다(적대적 검증 2026-09-27). 학번·연도·단가 같은 열은 더하지 않는다.
 */
export function numericColumnTotals(table: OutputTable): { key: string; label: string; total: number; count: number }[] {
  const out: { key: string; label: string; total: number; count: number }[] = [];
  for (const c of table.columns) {
    if (NON_ADDITIVE_LABEL.test(c.label)) continue;
    let total = 0;
    let count = 0;
    let bad = false;
    for (const r of table.rows) {
      const raw = (r.cells[c.key] ?? '').trim();
      if (!raw || raw === '-') continue;
      const n = parseStrictNumber(raw);
      if (n === null) { bad = true; break; }
      total += n;
      count += 1;
    }
    if (!bad && count >= 2) out.push({ key: c.key, label: c.label, total, count });
  }
  return out;
}

/** 링크로 열어도 되는 주소 — http(s) 만(적대적 검증 2026-09-27: 제출 RPC 가 주소 형식을 검사하지 않는다) */
export function isSafeLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
