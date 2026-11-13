// ========================================
// 대상 규칙(audience rule) — 클라이언트 단일 출처
// 해석은 서버 resolve_audience 가 한다(supabase/migrations/20260923160000_collect_input.sql).
// 여기는 타입·빈 규칙·한국어 요약·검증만 — 해석 로직을 베끼지 말 것.
// ⚠️ 에이전트(MCP `mcp_private.wk_audience`)도 이 모양으로 저장한다 — 조건 칸을 바꾸면 그 SQL 과
//    scripts/mcp-agent-test/web-contract.json 을 같이 고치고 contract.mts --db 로 확인할 것.
// ========================================

/**
 * 줄 단위. club·club_member(2026-11-11 동아리 관리) = 대상자가 지도하는 동아리마다 · 그 동아리 부원마다 —
 * unit_key = 'club|<club_year_id>' · 'club|<club_year_id>|<student_code>'. ⚠️ SQL 네 곳(collect_config_error ·
 * resolve_audience · collect_request CHECK · mcp_private.wk_request_config)과 짝
 */
export type AudienceAxis = 'person' | 'subject' | 'class' | 'club' | 'club_member';
export const AUDIENCE_AXES: readonly AudienceAxis[] = ['person', 'subject', 'class', 'club', 'club_member'];
export const isClubAxis = (axis: AudienceAxis): boolean => axis === 'club' || axis === 'club_member';

export type AudienceCriterion =
  | { type: 'people'; ids: string[] }
  | { type: 'all_faculty'; types: Array<'teacher' | 'staff'> }
  /** 교과(군)과 묶음은 같은 차원 — 둘 중 하나에 맞으면 통과(OR). 학년·과목과는 AND */
  | { type: 'teaching'; grades?: number[]; subjectGroups?: string[]; subjectClusters?: string[]; subjects?: string[] }
  | { type: 'homeroom'; grades?: number[] }
  | { type: 'grade_head'; grades?: number[] }
  | { type: 'department'; ids: string[] }
  /** 분장 자리는 이름으로 가리킨다 — 해마다 복사되는 자리의 id 는 학년도마다 다르다 */
  | { type: 'seat'; names: string[] }
  | { type: 'position'; kinds: Array<'head' | 'admin'> }
  | { type: 'tag'; ids: string[] }
  /** 동아리 담당 교사 — 이름으로 가리킨다(club_info 는 학년도마다 다시 적재). 빈 목록 = 전원 */
  | { type: 'club'; names: string[] }
  /**
   * 이 할 일의 담당자(2026-10-01) — **id 를 담지 않는다.** 서버가 풀 때마다 그 할 일의 지금 담당자로
   * 바꾼다(`expand_task_audience`). 업무 흐름 복사·연간 가져오기가 설정을 통째로 복제하므로 박아 둔 id 는
   * 다른 할 일의 사람을 가리키게 된다. 할 일 맥락이 있는 작업에서만 고를 수 있다(`TASK_SCOPED_CRITERIA`).
   */
  | { type: 'task_assignees' };

export type AudienceCriterionType = AudienceCriterion['type'];

export interface AudienceRule {
  include: AudienceCriterion[];
  exclude: AudienceCriterion[];
}

export const EMPTY_AUDIENCE_RULE: AudienceRule = { include: [], exclude: [] };

export const AUDIENCE_AXIS_LABEL: Record<AudienceAxis, string> = {
  person: '사람마다 한 줄',
  subject: '담당 과목마다 한 줄',
  class: '담당 학급마다 한 줄',
  club: '지도 동아리마다 한 줄',
  club_member: '지도 동아리 부원마다 한 줄',
};

export const AUDIENCE_CRITERION_LABEL: Record<AudienceCriterionType, string> = {
  teaching: '수업',
  homeroom: '담임',
  grade_head: '학년 부장',
  department: '부서',
  seat: '업무분장',
  position: '직위',
  tag: '태그',
  club: '동아리',
  all_faculty: '전체',
  people: '직접 지정',
  task_assignees: '이 할 일의 담당자',
};

/**
 * 할 일 맥락이 있어야 풀리는 조건 — 서버가 그 작업의 할 일로 펼치는 경로에서만 고르게 한다.
 * (메시지 보내기는 아직 할 일 맥락 없이 풀어서, 여기서 고르면 아무에게도 가지 않는다)
 */
export const TASK_SCOPED_CRITERIA: AudienceCriterionType[] = ['task_assignees'];

/** 조건 추가 메뉴의 순서 — 자주 쓰는 것부터 */
export const AUDIENCE_CRITERION_ORDER: AudienceCriterionType[] = [
  'task_assignees', 'teaching', 'homeroom', 'grade_head', 'club', 'department', 'seat', 'position', 'tag', 'all_faculty', 'people',
];

/** 이름 조회용 사전 — 요약 문장에 id 대신 이름을 쓰기 위해 */
export interface AudienceNameBook {
  departments?: Map<string, string>;
  tags?: Map<string, string>;
  people?: Map<string, string>;
}

const gradeText = (grades?: number[]) =>
  grades && grades.length > 0 ? grades.slice().sort((a, b) => a - b).map((g) => `${g}학년`).join('·') : '';

const listText = (values: string[], max = 3) =>
  values.length <= max ? values.join('·') : `${values.slice(0, max).join('·')} 외 ${values.length - max}`;

export function criterionEmpty(c: AudienceCriterion): boolean {
  switch (c.type) {
    case 'people':
    case 'department':
    case 'tag':
      return c.ids.length === 0;
    case 'seat':
      return c.names.length === 0;
    case 'position':
      return c.kinds.length === 0;
    case 'all_faculty':
      return c.types.length === 0;
    default:
      return false; // 수업·담임·학년 부장·동아리는 필터가 없으면 "전체"라는 뜻이다
  }
}

/** 조건 하나의 한국어 요약 */
export function describeCriterion(c: AudienceCriterion, book: AudienceNameBook = {}): string {
  switch (c.type) {
    case 'teaching': {
      const grade = gradeText(c.grades);
      const what = [
        ...(c.subjectClusters ?? []).map((g) => g.replace('(역사/도덕 포함)', '')),
        ...(c.subjectGroups ?? []).map((g) => g.replace('(역사/도덕 포함)', '')),
        ...(c.subjects ?? []),
      ];
      const scope = [grade, what.length > 0 ? listText(what) : ''].filter(Boolean).join(' ');
      return scope ? `${scope} 수업 교사` : '수업하는 교사 전원';
    }
    case 'homeroom':
      return `${gradeText(c.grades) || '전 학년'} 담임`;
    case 'grade_head':
      return `${gradeText(c.grades) || '전 학년'} 부장`;
    case 'department': {
      const names = c.ids.map((id) => book.departments?.get(id) ?? '(부서)');
      return `${listText(names)} 부서원`;
    }
    case 'seat':
      return `분장 · ${listText(c.names)}`;
    case 'position':
      return c.kinds
        .map((k) => (k === 'admin' ? '교장·교감' : '부장 전원'))
        .join('·');
    case 'tag': {
      const names = c.ids.map((id) => book.tags?.get(id) ?? '(태그)');
      return `태그 · ${listText(names)}`;
    }
    case 'club':
      return c.names.length > 0 ? `동아리 · ${listText(c.names)} 담당` : '동아리 담당 교사 전원';
    case 'all_faculty':
      return c.types.includes('teacher') && c.types.includes('staff')
        ? '교직원 전원'
        : c.types.includes('staff') ? '직원 전원' : '교사 전원';
    case 'people': {
      const names = c.ids.map((id) => book.people?.get(id) ?? '?');
      return `직접 지정 · ${listText(names)}`;
    }
    case 'task_assignees':
      return '이 할 일의 담당자';
  }
}

/** 규칙 전체의 한 줄 요약 — 작업 카드·명단 머리에 쓴다 */
export function describeAudienceRule(rule: AudienceRule | null | undefined, book: AudienceNameBook = {}): string {
  if (!rule || rule.include.length === 0) return '대상 미지정';
  const inc = rule.include.map((c) => describeCriterion(c, book)).join(' + ');
  const exc = rule.exclude.map((c) => describeCriterion(c, book));
  return exc.length > 0 ? `${inc} (제외: ${exc.join(', ')})` : inc;
}

/**
 * 규칙 검증 — 보내기 전에 화면이 말할 문제. 서버도 대상이 0명이면 거부한다.
 * (과목·학급 축에서 담임·분장으로 들어온 사람은 그 사람의 수업으로 펼쳐지고, 수업이 없으면
 *  미리보기가 "수업 없음"으로 따로 알린다 — 여기서 막지 않는다.)
 */
export function validateAudienceRule(rule: AudienceRule): string | null {
  if (rule.include.length === 0) return '대상 조건을 하나 이상 추가하세요.';
  if ([...rule.include, ...rule.exclude].some(criterionEmpty)) {
    return '비어 있는 조건이 있습니다. 값을 고르거나 조건을 지우세요.';
  }
  return null;
}

/**
 * 저장된 조건 하나 → 이 파일의 타입 모양 (2026-10-25).
 * 규칙은 웹만 쓰지 않는다 — 에이전트(MCP `mcp_private.wk_audience`)·업무 흐름 복사·연간 가져오기가 쓴 값도
 * 여기로 들어온다. 배열 칸이 빠진 조건(`{type:'all_faculty'}`)을 그대로 넘기면 요약·검증이
 * `c.types.includes` 에서 화면을 통째로 깨뜨렸다. 빠진 칸은 서버 resolve_audience 의 해석과 같은 값으로 채운다
 * (all_faculty 는 types 가 없으면 교사뿐).
 */
function normalizeCriterion(raw: Record<string, unknown>): AudienceCriterion {
  const type = raw.type as AudienceCriterionType;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null);
  const numbers = (v: unknown) =>
    Array.isArray(v) ? v.map(Number).filter((x) => Number.isInteger(x)) : null;
  switch (type) {
    case 'people':
    case 'department':
    case 'tag':
      return { type, ids: strings(raw.ids) ?? [] };
    case 'seat':
    case 'club':
      return { type, names: strings(raw.names) ?? [] };
    case 'position': {
      const kinds = (strings(raw.kinds) ?? []).filter((k): k is 'head' | 'admin' => k === 'head' || k === 'admin');
      return { type, kinds };
    }
    case 'all_faculty': {
      const types = (strings(raw.types) ?? []).filter((t): t is 'teacher' | 'staff' => t === 'teacher' || t === 'staff');
      return { type, types: types.length > 0 ? types : ['teacher'] };
    }
    case 'homeroom':
    case 'grade_head': {
      const grades = numbers(raw.grades);
      return grades ? { type, grades } : { type };
    }
    case 'teaching': {
      const out: Extract<AudienceCriterion, { type: 'teaching' }> = { type };
      const grades = numbers(raw.grades);
      if (grades) out.grades = grades;
      for (const key of ['subjectGroups', 'subjectClusters', 'subjects'] as const) {
        const list = strings(raw[key]);
        if (list) out[key] = list;
      }
      return out;
    }
    case 'task_assignees':
      return { type };
  }
}

/** 저장된 JSON → 규칙(모르는 조건은 버린다, 빠진 칸은 채운다) */
export function parseAudienceRule(value: unknown): AudienceRule {
  if (!value || typeof value !== 'object') return { ...EMPTY_AUDIENCE_RULE };
  const record = value as Record<string, unknown>;
  const list = (v: unknown): AudienceCriterion[] =>
    Array.isArray(v)
      ? v
          .filter((c) => c && typeof c === 'object' && AUDIENCE_CRITERION_ORDER.includes((c as { type: AudienceCriterionType }).type))
          .map((c) => normalizeCriterion(c as Record<string, unknown>))
      : [];
  return { include: list(record.include), exclude: list(record.exclude) };
}

/** 새 조건의 초기값 */
export function newCriterion(type: AudienceCriterionType): AudienceCriterion {
  switch (type) {
    case 'teaching':
      return { type, grades: [], subjectGroups: [], subjectClusters: [], subjects: [] };
    case 'homeroom':
    case 'grade_head':
      return { type, grades: [] };
    case 'department':
    case 'tag':
    case 'people':
      return { type, ids: [] };
    case 'seat':
    case 'club':
      return { type, names: [] };
    case 'position':
      return { type, kinds: ['head'] };
    case 'all_faculty':
      return { type, types: ['teacher'] };
    case 'task_assignees':
      return { type };
  }
}

/** 대상이 «이 할 일의 담당자»뿐인가 (2026-10-01 — 이 경우에도 자동으로 보내지 않는다. [요청 보내기]로만 나간다) */
export function isTaskAssigneesOnly(rule: AudienceRule): boolean {
  return rule.include.length === 1 && rule.include[0].type === 'task_assignees' && rule.exclude.length === 0;
}

/** resolve_audience 응답 한 행 */
export interface AudienceRow {
  resource_id: string | null;
  name: string;
  unit_key: string | null;
  unit_label: string;
  grade: number | null;
  subject: string | null;
  class_label: string | null;
  reasons: string[];
}

export interface AudienceResolution {
  academic_year: number;
  semester: number;
  ref_date: string;
  axis: AudienceAxis;
  rows: AudienceRow[];
}

/** 미리보기 요약 — 사람 수·줄 수·수업 없음·미연결 */
export function summarizeResolution(rows: AudienceRow[]) {
  const withUnit = rows.filter((r) => r.unit_key !== null);
  const people = new Set(withUnit.filter((r) => r.resource_id).map((r) => r.resource_id));
  return {
    lines: withUnit.length,
    people: people.size,
    units: new Set(withUnit.map((r) => r.unit_key)).size,
    noUnit: rows.filter((r) => r.unit_key === null && r.resource_id),
    unlinked: rows.filter((r) => !r.resource_id),
  };
}
