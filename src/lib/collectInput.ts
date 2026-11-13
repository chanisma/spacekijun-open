// ========================================
// 할 일 작업 「입력 받기」(collect.input) — 판정·표 모델 단일 출처
//
// 한 줄 = 메타데이터 축(사람 / 담당 과목 / 담당 학급) × 직접 입력 구분(0개 이상)
// 한 칸 = 줄 × 구분 × 입력 항목
// 매니저 표·응답 화면·엑셀 내보내기가 모두 buildCollectTable 을 읽는다 — 기준을 복붙하지 말 것.
// 서버 짝: supabase/migrations/20260923160000_collect_input.sql
//   (셀 완료 = collect_cell_complete, 값 검증 = collect_clean_values 가 정본)
// ========================================

import {
  AUDIENCE_AXES,
  EMPTY_AUDIENCE_RULE,
  isClubAxis,
  parseAudienceRule,
  type AudienceAxis,
  type AudienceRule,
} from './audienceRule';

export type CollectFieldType = 'yesno' | 'select' | 'text' | 'number' | 'date';

export const COLLECT_FIELD_TYPE_LABEL: Record<CollectFieldType, string> = {
  yesno: '예/아니오',
  select: '고르기',
  text: '글',
  number: '숫자',
  date: '날짜',
};

export interface CollectField {
  key: string;
  label: string;
  type: CollectFieldType;
  options?: string[];
  required?: boolean;
}

export interface CollectDimension {
  key: string;
  label: string;
}

/** 공동 담당 단위의 응답 방식 — 교사마다 / 단위당 한 번(담당 중 누구든) */
export type CollectAnswerMode = 'each' | 'shared';
/** 공개 방식 — 개별 입력(내 것만) / 공개 표(서로 보며) */
export type CollectVisibility = 'private' | 'shared';

export interface CollectConfig {
  title: string;
  audience: AudienceRule;
  axis: AudienceAxis;
  answerMode: CollectAnswerMode;
  dimensions: CollectDimension[];
  fields: CollectField[];
  mode: CollectVisibility;
  dueDate: string | null;
  guide: string;
}

export const DEFAULT_COLLECT_CONFIG: CollectConfig = {
  title: '',
  audience: EMPTY_AUDIENCE_RULE,
  axis: 'person',
  answerMode: 'each',
  dimensions: [],
  fields: [{ key: 'f1', label: '완료 여부', type: 'yesno', required: true }],
  mode: 'private',
  dueDate: null,
  guide: '',
};

/**
 * 응답이 누구에게 보이나 (2026-10-06 이름 정리 — 종전 «개별 입력 / 공개 표»는 «교사마다 각자»와 겹쳐 읽혔다.
 * 이 선택은 «몇 번 답하나»가 아니라 «누가 보나»다). `respondent` = 응답자 화면의 한 줄 설명.
 */
export const COLLECT_MODE_LABEL: Record<CollectVisibility, { title: string; hint: string; respondent: string }> = {
  private: {
    title: '요청한 사람만 봄',
    hint: '응답자는 자기 줄만 봅니다. 정해진 사람에게서 꼭 받아야 하는 값에 씁니다.',
    respondent: '내 답은 요청한 분만 봅니다',
  },
  shared: {
    title: '대상자 모두가 표를 봄',
    hint: '대상자 모두가 표 전체를 보며 자기 줄을 채웁니다. 서로 보며 맞춰야 하는 값에 씁니다.',
    respondent: '대상자 모두가 이 표를 봅니다',
  },
};

export const COLLECT_ANSWER_MODE_LABEL: Record<CollectAnswerMode, { title: string; hint: string }> = {
  each: { title: '교사마다 각자', hint: '같은 과목을 여럿이 가르치면 각자 한 줄씩 답합니다.' },
  shared: { title: '과목당 한 번', hint: '같은 과목을 맡은 교사 중 누구든 한 번 채우면 됩니다. 누가 입력했는지 남습니다.' },
};

/** 응답 방식 라벨을 줄 단위에 맞춰 — 학급 축에서 «과목당 한 번»이라 쓰던 것(2026-10-06) */
export function collectAnswerModeLabel(mode: CollectAnswerMode, axis: AudienceAxis): { title: string; hint: string } {
  const unit = axis === 'class' ? '학급' : axis === 'club' ? '동아리' : axis === 'club_member' ? '부원' : '과목';
  const verb = axis === 'class' ? '들어가면' : isClubAxis(axis) ? '지도하면' : '가르치면';
  return mode === 'each'
    ? { title: '교사마다 각자', hint: `같은 ${unit}에 여럿이 ${verb} 각자 한 줄씩 답합니다.` }
    : { title: `${unit}당 한 번`, hint: `같은 ${unit}을 맡은 교사 중 누구든 한 번 채우면 됩니다. 누가 입력했는지 남습니다.` };
}

/**
 * 줄의 진행 표시 (2026-10-06) — 구분이 여럿인 줄에서 일부만 채운 사람이 «미완료»로 아무것도 안 한 사람과
 * 똑같이 보였다. 일부면 «n/m»(진행 중 = 파랑).
 */
export function collectRowProgress(row: Pick<CollectRow, 'complete' | 'cells'>): { label: string; tone: 'done' | 'partial' | 'todo' } {
  if (row.complete) return { label: '완료', tone: 'done' };
  const done = row.cells.filter((cell) => cell.complete).length;
  if (done > 0 && row.cells.length > 1) return { label: `${done}/${row.cells.length}`, tone: 'partial' };
  return { label: '미완료', tone: 'todo' };
}

/** 미완료 사람을 «일부 입력 / 미입력»으로 가른다 — 다시 알림 대상은 둘 다 */
export function pendingBreakdown(table: CollectTable): { partial: string[]; untouched: string[] } {
  const partial = new Set<string>();
  const untouched = new Set<string>();
  for (const row of table.rows) {
    if (row.removed || row.unlinked || row.complete) continue;
    const started = row.cells.some((cell) => cell.complete);
    row.people.forEach((p) => p.resourceId && (started ? partial : untouched).add(p.name));
  }
  for (const name of partial) untouched.delete(name);
  const sort = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  return { partial: sort(partial), untouched: sort(untouched) };
}

function isFieldType(v: unknown): v is CollectFieldType {
  return v === 'yesno' || v === 'select' || v === 'text' || v === 'number' || v === 'date';
}

/**
 * task_action.config → 입력 받기 설정 (config.collect 가 없으면 기본값).
 * ⚠️ 에이전트(MCP `mcp_private.wk_request_config`)도 이 모양으로 쓴다 — 칸을 바꾸면 그 SQL 도 고치고 contract.mts --db
 */
export function parseCollectConfig(actionConfig: unknown): CollectConfig {
  const raw = (actionConfig && typeof actionConfig === 'object'
    ? (actionConfig as Record<string, unknown>).collect
    : null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COLLECT_CONFIG };
  const fields = Array.isArray(raw.fields)
    ? (raw.fields as Record<string, unknown>[])
        .filter((f) => f && typeof f.key === 'string' && typeof f.label === 'string' && isFieldType(f.type))
        .map((f) => ({
          key: f.key as string,
          label: f.label as string,
          type: f.type as CollectFieldType,
          options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : undefined,
          required: Boolean(f.required),
        }))
    : DEFAULT_COLLECT_CONFIG.fields;
  const dimensions = Array.isArray(raw.dimensions)
    ? (raw.dimensions as Record<string, unknown>[])
        .filter((d) => d && typeof d.key === 'string' && typeof d.label === 'string')
        .map((d) => ({ key: d.key as string, label: d.label as string }))
    : [];
  const axis: AudienceAxis = AUDIENCE_AXES.includes(raw.axis as AudienceAxis) ? (raw.axis as AudienceAxis) : 'person';
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    audience: parseAudienceRule(raw.audience),
    axis,
    answerMode: raw.answerMode === 'shared' ? 'shared' : 'each',
    dimensions,
    fields,
    mode: raw.mode === 'shared' ? 'shared' : 'private',
    dueDate: typeof raw.dueDate === 'string' && raw.dueDate ? raw.dueDate : null,
    guide: typeof raw.guide === 'string' ? raw.guide : '',
  };
}

/** 저장용 JSON (서버 update_collect_config 가 받는 모양) */
export function serializeCollectConfig(config: CollectConfig): Record<string, unknown> {
  return {
    title: config.title.trim(),
    audience: config.audience,
    axis: config.axis,
    answerMode: config.axis === 'person' ? 'each' : config.answerMode,
    dimensions: config.dimensions.map((d) => ({ key: d.key, label: d.label.trim() })),
    fields: config.fields.map((f) => ({
      key: f.key,
      label: f.label.trim(),
      type: f.type,
      ...(f.type === 'select' ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
      required: Boolean(f.required),
    })),
    mode: config.mode,
    dueDate: config.dueDate,
    guide: config.guide.trim(),
  };
}

/** 화면 검증 — 서버 collect_config_error 와 같은 규칙(서버가 정본) */
export function validateCollectConfig(config: CollectConfig): string | null {
  if (config.fields.length === 0) return '입력 항목을 하나 이상 만드세요.';
  const keys = new Set<string>();
  for (const f of config.fields) {
    if (!f.label.trim()) return '이름이 빈 입력 항목이 있습니다.';
    if (keys.has(f.key)) return '입력 항목 키가 겹칩니다.';
    keys.add(f.key);
    if (f.type === 'select' && (f.options ?? []).filter((o) => o.trim()).length === 0) {
      return `"${f.label}"에 보기를 하나 이상 적으세요.`;
    }
  }
  const dimLabels = config.dimensions.map((d) => d.label.trim());
  if (dimLabels.some((l) => !l)) return '이름이 빈 구분이 있습니다.';
  if (new Set(dimLabels).size !== dimLabels.length) return '구분 이름이 겹칩니다.';
  return null;
}

/** 새 키 — 이미 쓰는 키와 겹치지 않게 */
export function nextKey(prefix: string, taken: string[]): string {
  let i = taken.length + 1;
  while (taken.includes(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

/** 줄로 붙여 넣은 구분 목록("1차 정기시험\n2차 정기시험") */
export function dimensionsFromLines(text: string, existing: CollectDimension[] = []): CollectDimension[] {
  const labels = [...new Set(text.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean))];
  const out: CollectDimension[] = [];
  for (const label of labels) {
    const kept = existing.find((d) => d.label === label);
    out.push(kept ?? { key: nextKey('d', [...existing, ...out].map((d) => d.key)), label });
  }
  return out;
}

// ── 셀 판정 (서버 collect_cell_complete 와 같은 규칙) ─────────────────────────

export type CollectValues = Record<string, string>;

export function isCellComplete(values: CollectValues | null | undefined, fields: CollectField[]): boolean {
  const v = values ?? {};
  const required = fields.filter((f) => f.required);
  if (required.length > 0) return required.every((f) => (v[f.key] ?? '').trim() !== '');
  return Object.values(v).some((x) => (x ?? '').trim() !== '');
}

export function formatCollectValue(field: CollectField, value: string | undefined | null): string {
  if (!value) return '';
  if (field.type === 'yesno') return value === 'yes' ? '예' : value === 'no' ? '아니오' : value;
  return value;
}

// ── 서버 get_collect_board 응답 ──────────────────────────────────────────────

export interface CollectBoardTarget {
  id: string;
  unit_key: string;
  unit_label: string;
  resource_id: string | null;
  name: string;
  reasons: string[];
  removed: boolean;
}

export interface CollectBoardResponse {
  unit_key: string;
  dimension_key: string;
  owner_key: string;
  responder_resource_id: string;
  responder_name: string | null;
  values: CollectValues;
  updated_at: string;
}

export interface CollectRequestState {
  action_id: string;
  task_id: string | null;
  status: 'open' | 'closed';
  academic_year: number;
  semester: number;
  axis: AudienceAxis;
  answer_mode: CollectAnswerMode;
  visibility: CollectVisibility;
  started_at: string;
  closed_at: string | null;
  closed_reason: string | null;
}

export interface CollectBoard {
  action: {
    id: string;
    title: string;
    task_id: string | null;
    created_by: string;
    archived_at: string | null;
    task_title: string | null;
    task_status: string | null;
    work_title: string | null;
  };
  config: unknown;
  request: CollectRequestState | null;
  viewer: { can_manage: boolean; is_target: boolean; resource_ids: string[] };
  targets: CollectBoardTarget[];
  responses: CollectBoardResponse[];
}

// ── 표 모델 ──────────────────────────────────────────────────────────────────

export interface CollectCell {
  dimensionKey: string;
  values: CollectValues;
  complete: boolean;
  responderName: string | null;
  updatedAt: string | null;
}

export interface CollectRow {
  /** 줄 키 — each: unit|사람, shared: unit */
  key: string;
  unitKey: string;
  /** 단위 이름(사람 축이면 빈 문자열) */
  unitLabel: string;
  /** 이 줄을 채울 사람들(each 면 1명, shared 면 공동 담당 전원) */
  people: { resourceId: string | null; name: string; reasons: string[] }[];
  /** 이 줄의 응답 owner_key — each: 응답자 id, shared: '' */
  ownerKey: string;
  removed: boolean;
  /** 미연결(resource 없음) — 응답할 수 없다 */
  unlinked: boolean;
  cells: CollectCell[];
  complete: boolean;
  /** 이 줄을 내가 채울 수 있는가 */
  mine: boolean;
}

export interface CollectTable {
  config: CollectConfig;
  /** 구분이 없으면 [{ key: '', label: '' }] 한 개 */
  dimensions: CollectDimension[];
  rows: CollectRow[];
  /** 명단에서 빠진 뒤에도 남은 응답(다시 계산으로 제외된 대상) */
  orphanResponses: CollectBoardResponse[];
  progress: { rows: number; completeRows: number; cells: number; completeCells: number };
}

export function effectiveDimensions(config: CollectConfig): CollectDimension[] {
  return config.dimensions.length > 0 ? config.dimensions : [{ key: '', label: '' }];
}

/**
 * 서버 응답 → 표. 설정은 **요청의 잠긴 값**(축·응답 방식)을 우선한다 — 보낸 뒤 설정 초안이
 * 달라져도 표는 보낸 대로 그려야 한다.
 */
export function buildCollectTable(board: CollectBoard): CollectTable {
  const config = parseCollectConfig({ collect: board.config });
  const answerMode = board.request?.answer_mode ?? config.answerMode;
  const dims = effectiveDimensions(config);
  const me = new Set(board.viewer.resource_ids);

  const responseMap = new Map<string, CollectBoardResponse>();
  for (const r of board.responses) {
    responseMap.set(`${r.unit_key}\u0000${r.dimension_key}\u0000${r.owner_key}`, r);
  }

  const rows: CollectRow[] = [];
  if (answerMode === 'shared') {
    const byUnit = new Map<string, CollectBoardTarget[]>();
    for (const t of board.targets) byUnit.set(t.unit_key, [...(byUnit.get(t.unit_key) ?? []), t]);
    for (const [unitKey, targets] of byUnit) {
      const active = targets.filter((t) => !t.removed);
      rows.push(makeRow({
        key: unitKey,
        unitKey,
        unitLabel: targets[0].unit_label,
        people: (active.length > 0 ? active : targets).map((t) => ({ resourceId: t.resource_id, name: t.name, reasons: t.reasons })),
        ownerKey: '',
        removed: active.length === 0,
        unlinked: active.length > 0 && active.every((t) => !t.resource_id),
        mine: active.some((t) => t.resource_id && me.has(t.resource_id)),
      }));
    }
  } else {
    for (const t of board.targets) {
      rows.push(makeRow({
        key: `${t.unit_key}\u0000${t.resource_id ?? `name:${t.name}`}`,
        unitKey: t.unit_key,
        unitLabel: t.unit_label,
        people: [{ resourceId: t.resource_id, name: t.name, reasons: t.reasons }],
        ownerKey: t.resource_id ?? '',
        removed: t.removed,
        unlinked: !t.resource_id,
        mine: Boolean(t.resource_id && me.has(t.resource_id)) && !t.removed,
      }));
    }
  }

  function makeRow(base: Omit<CollectRow, 'cells' | 'complete'>): CollectRow {
    const cells = dims.map((d) => {
      const r = responseMap.get(`${base.unitKey}\u0000${d.key}\u0000${base.ownerKey}`);
      return {
        dimensionKey: d.key,
        values: r?.values ?? {},
        complete: isCellComplete(r?.values, config.fields),
        responderName: r?.responder_name ?? null,
        updatedAt: r?.updated_at ?? null,
      };
    });
    return { ...base, cells, complete: cells.every((c) => c.complete) };
  }

  rows.sort((a, b) =>
    Number(a.removed) - Number(b.removed)
    || a.unitLabel.localeCompare(b.unitLabel, 'ko', { numeric: true })
    || (a.people[0]?.name ?? '').localeCompare(b.people[0]?.name ?? '', 'ko'));

  const rowKeys = new Set(rows.map((r) => `${r.unitKey}\u0000${r.ownerKey}`));
  const orphanResponses = board.responses.filter((r) => !rowKeys.has(`${r.unit_key}\u0000${r.owner_key}`));

  const counted = rows.filter((r) => !r.removed && !r.unlinked);
  const cells = counted.flatMap((r) => r.cells);
  return {
    config: { ...config, answerMode },
    dimensions: dims,
    rows,
    orphanResponses,
    progress: {
      rows: counted.length,
      completeRows: counted.filter((r) => r.complete).length,
      cells: cells.length,
      completeCells: cells.filter((c) => c.complete).length,
    },
  };
}

/** 엑셀·TSV 내보내기용 행렬 — 첫 줄이 머리 */
export function collectTableToSheet(table: CollectTable): string[][] {
  const { config, dimensions } = table;
  const hasUnit = config.axis !== 'person';
  const hasDims = dimensions.some((d) => d.key !== '');
  const header = [
    ...(hasUnit ? ['단위'] : []),
    '대상',
    ...(hasDims ? ['구분'] : []),
    ...config.fields.map((f) => f.label),
    '완료',
    ...(config.answerMode === 'shared' ? ['입력자'] : []),
  ];
  const body: string[][] = [];
  for (const row of table.rows) {
    if (row.removed) continue;
    row.cells.forEach((cell, i) => {
      body.push([
        ...(hasUnit ? [row.unitLabel] : []),
        row.people.map((p) => p.name).join(', '),
        ...(hasDims ? [dimensions[i].label] : []),
        ...config.fields.map((f) => formatCollectValue(f, cell.values[f.key])),
        cell.complete ? '완료' : '미완료',
        ...(config.answerMode === 'shared' ? [cell.responderName ?? ''] : []),
      ]);
    });
  }
  return [header, ...body];
}

/** 미응답 사람(재알림·표시용) */
export function pendingPeople(table: CollectTable): string[] {
  const names = new Set<string>();
  for (const row of table.rows) {
    if (row.removed || row.unlinked || row.complete) continue;
    row.people.forEach((p) => p.resourceId && names.add(p.name));
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 서버 my_collect_requests 한 항목 */
/**
 * 요청 종류(2026-10-01) — 내 할 일 「요청」에 입력·제출이 함께 온다(D3).
 * 서버 collect_request.kind 와 같은 값. 옛 응답(종류 없음)은 입력으로 읽는다.
 */
export type RequestKind = 'input' | 'file' | 'document' | 'physical';

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  input: '입력',
  file: '파일 제출',
  document: '양식 문서 제출',
  physical: '실물 제출',
};

export function requestKindOf(r: Pick<MyCollectRequest, 'kind'>): RequestKind {
  return r.kind ?? 'input';
}

/** 줄 끝 진척 칩 — 입력은 칸 수, 제출은 냈는지 */
export function requestProgressLabel(r: Pick<MyCollectRequest, 'kind' | 'done' | 'total'>): string {
  const kind = requestKindOf(r);
  if (kind === 'input') return r.total > 0 && r.done >= r.total ? '완료' : `${r.done}/${r.total}칸`;
  const done = r.total > 0 && r.done >= r.total;
  if (kind === 'physical') return done ? '받음' : '받기 전';
  return done ? '냄' : '안 냄';
}

/**
 * 할 일별로 «내가 아직 내지 않은 제출 요청»(2026-10-01) — 담당자의 완료 버튼 자리를 [제출하기]로 바꾸는 판정.
 * 서버 가드(assignee_has_pending_submission)와 같은 조건: 제출 종류 · 열린 요청(my_collect_requests 가 이미 거른다) · 안 낸 것.
 * 마감 가까운 순으로 담는다 — 버튼은 첫 요청을 연다.
 */
export function pendingSubmitRequestsByTask(requests: MyCollectRequest[]): Map<string, MyCollectRequest[]> {
  const map = new Map<string, MyCollectRequest[]>();
  for (const r of pendingCollectRequests(requests)) {
    if (requestKindOf(r) === 'input' || !r.task_id) continue;
    const list = map.get(r.task_id) ?? [];
    list.push(r);
    map.set(r.task_id, list);
  }
  return map;
}

/**
 * 내 할 일 화면에서 요청을 «어디에» 보일지 (2026-10-05 — 감사 문서 §4-1).
 *
 * 같은 제출 의무가 「요청」 구획 · 할 일 행(「파일 제출 남음」+[제출하기]) · 계획표에 2~3번 나왔다.
 * 규칙: **제출 요청이고 그 할 일이 지금 목록에 행으로 있으면 행이 맡는다** — 구획·계획표에서는 뺀다
 * (계획표에는 그 할 일이 이미 있다). 입력 요청과, 행이 없는 제출 요청(담당자가 아닌데 대상인 것 ·
 * '담당자 아님' 표시한 할 일)은 구획이 맡는다.
 *
 * @param rowTaskIds [제출하기]를 그리는 행의 할 일 id — 화면이 정한다(끝난·시작 전·담당자 아님 행은 넣지 않는다)
 * @returns rows = 행에 붙일 남은 제출 요청 · section = 구획의 남은 요청(마감일 순) · sectionDone = 구획의 다 낸 요청
 */
export function placeInboxRequests(
  requests: readonly MyCollectRequest[],
  rowTaskIds: ReadonlySet<string>,
): { rows: Map<string, MyCollectRequest[]>; section: MyCollectRequest[]; sectionDone: MyCollectRequest[] } {
  const rows = new Map<string, MyCollectRequest[]>();
  const sectionDone: MyCollectRequest[] = [];
  const open: MyCollectRequest[] = [];
  for (const r of requests) {
    const pending = r.total > 0 && r.done < r.total;
    const onRow = requestKindOf(r) !== 'input' && !!r.task_id && rowTaskIds.has(r.task_id);
    if (onRow) {
      if (pending) rows.set(r.task_id!, [...(rows.get(r.task_id!) ?? []), r]);
      continue; // 다 낸 것은 행의 완료 표시가 말한다
    }
    if (pending) open.push(r);
    else if (r.total > 0) sectionDone.push(r);
  }
  for (const list of rows.values()) list.splice(0, list.length, ...pendingCollectRequests(list));
  return { rows, section: pendingCollectRequests(open), sectionDone };
}

/** 누르면 하는 일 — 단추·aria 문구 */
export function requestVerb(r: Pick<MyCollectRequest, 'kind'>): string {
  const kind = requestKindOf(r);
  return kind === 'input' ? '입력하기' : kind === 'physical' ? '제출 안내 보기' : '제출하기';
}

export interface MyCollectRequest {
  action_id: string;
  /** 요청 종류 — 없으면 입력(서버 kind 가 생기기 전 응답 호환) */
  kind?: RequestKind;
  task_id: string | null;
  task_title: string | null;
  work_title: string | null;
  action_title: string;
  guide: string | null;
  due_date: string | null;
  visibility: CollectVisibility;
  answer_mode: CollectAnswerMode;
  total: number;
  done: number;
  started_at: string;
}

/**
 * 입력 요청 마감 → 'YYYY-MM-DD'(모르면 null).
 * ⚠️ 서버 `my_collect_requests` 의 `due_date` 는 두 모양이다 — 작업 설정의 `dueDate`('2026-03-31')가
 * 없으면 **할 일 마감(timestamptz)의 `::text`**('2026-09-30 00:00:00+00')가 온다. 그대로 `slice(5)` 해서
 * 그리면 «09/30 00:00:00+00 까지»가 되고, 계획표의 날짜 칸과 비교하면 **영원히 어느 날에도 안 들어간다**
 * (오류는 없다). 할 일 쪽과 같은 규칙(앞 10자리 — `taskDeadlines.normalizeDeadlines`)으로 맞춘다.
 */
export function collectDueDay(due: string | null | undefined): string | null {
  const day = (due ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** 입력 요청 마감의 짧은 표기 'MM/DD'(모르면 '') */
export function collectDueLabel(due: string | null | undefined): string {
  const day = collectDueDay(due);
  return day ? day.slice(5).replace('-', '/') : '';
}

/**
 * 아직 채울 칸이 남은 입력 요청 — 마감 가까운 순(마감 없음은 뒤), 같으면 먼저 온 것부터.
 * 홈 대시보드 「나의 업무」 카드가 쓴다(2026-09-27). 서버 `my_collect_requests` 가 이미
 * «열린 요청 ∧ 할 일이 끝나지 않음»만 주므로 여기서는 «다 채웠나»만 가른다.
 * ⚠️ `total === 0`(칸이 없는 요청)은 남은 일이 아니다 — «0/0»을 할 일로 띄우지 않는다.
 */
export function pendingCollectRequests(requests: readonly MyCollectRequest[]): MyCollectRequest[] {
  return requests
    .filter((r) => r.total > 0 && r.done < r.total)
    .sort((a, b) => {
      const ad = collectDueDay(a.due_date);
      const bd = collectDueDay(b.due_date);
      if (ad !== bd) {
        if (!ad) return 1;
        if (!bd) return -1;
        return ad.localeCompare(bd);
      }
      return a.started_at.localeCompare(b.started_at);
    });
}

/** 작업 카드 한 줄 요약(관리 보기) */
export function collectSummary(config: CollectConfig, audienceText: string): string {
  const parts = [audienceText];
  if (config.axis !== 'person') {
    parts.push({ subject: '과목마다', class: '학급마다', club: '동아리마다', club_member: '동아리 부원마다' }[config.axis]);
  }
  if (config.dimensions.length > 0) parts.push(config.dimensions.map((d) => d.label).join('·'));
  parts.push(`항목 ${config.fields.length}개`);
  return parts.join(' · ');
}
