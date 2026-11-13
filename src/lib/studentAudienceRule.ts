// ========================================
// 학생 대상 규칙(조건으로 학생 고르기) — 클라이언트 단일 출처
// 해석은 서버 resolve_student_audience 가 한다(supabase/migrations/20261001120000_student_audience.sql).
// 여기는 타입·빈 조건·한국어 요약·검증·학년 분해만 — 해석 로직을 베끼지 말 것.
// 설계 = docs/plans/2026-10-01-student-audience-selection.md
//
// 교사 쪽 규칙(src/lib/audienceRule.ts)과 모양은 같지만 한 단계 더 깊다:
//   include/exclude 의 항목 하나 = 묶음, 묶음 안의 조건은 AND, 묶음끼리는 OR.
// ========================================

export type StudentCriterion =
  | { type: 'all_students' }
  /** 현재 학년(·반). 반만 주면 모든 학년의 그 반 */
  | { type: 'current_class'; grades?: number[]; classes?: number[] }
  /** N학년 때 그 반(resource.meta.snumN). 현재 학년과 함께 쓰려면 같은 묶음에 current_class */
  | { type: 'past_class'; grade: number; classes: number[] }
  /** 올해 활동 중인 동아리 부원 */
  | { type: 'club'; names: string[] }
  /** 이번 학기 그 과목을 듣는 학생 */
  | { type: 'course'; subjects: string[]; teacher_ids?: string[] }
  /** 끝난 학기 — 그 학생이 N학년(·M학기)이었을 때 들은 과목(생기부 성적 기록). 이번 학기는 course */
  | { type: 'past_course'; grade: number; semester?: number; subjects: string[] }
  /** 그 선생님 수업을 듣는 학생(이번 학기 시간표). 과목을 주면 그 과목만 */
  | { type: 'teacher_students'; teacher_ids: string[]; subjects?: string[] }
  /** 그 요일·교시(·과목)에 수업이 있는 학생. day 1=월 */
  | { type: 'slot'; days?: number[]; periods?: number[]; subjects?: string[] }
  /** 내가 가르치는 학생 */
  | { type: 'my_students'; subjects?: string[] }
  /** 내가 담임인 반 학생(태그 'N학년 M반') */
  | { type: 'my_homeroom' }
  | { type: 'people'; ids: string[] };

export type StudentCriterionType = StudentCriterion['type'];

export interface StudentRuleGroup {
  all: StudentCriterion[];
}

export interface StudentAudienceRule {
  include: StudentRuleGroup[];
  exclude: StudentRuleGroup[];
}

export const EMPTY_STUDENT_RULE: StudentAudienceRule = { include: [], exclude: [] };

export const STUDENT_CRITERION_LABEL: Record<StudentCriterionType, string> = {
  current_class: '현재 학년·반',
  past_class: '예전 학년 때 반',
  club: '동아리',
  course: '수강 과목(이번 학기)',
  past_course: '들었던 과목(지난 학기)',
  teacher_students: '선생님 수업',
  slot: '요일·교시',
  my_students: '내 수업 학생',
  my_homeroom: '내 반 학생',
  all_students: '재학생 전원',
  people: '직접 지정',
};

/** 조건 추가 메뉴의 순서 — 자주 쓰는 것부터. people 은 선택기 목록이 맡으므로 메뉴에 없다 */
export const STUDENT_CRITERION_MENU: StudentCriterionType[] = [
  'current_class', 'past_class', 'club', 'course', 'past_course', 'teacher_students', 'slot', 'my_students', 'my_homeroom', 'all_students',
];

export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export function newStudentCriterion(type: StudentCriterionType): StudentCriterion {
  switch (type) {
    case 'current_class':
      return { type, grades: [], classes: [] };
    case 'past_class':
      return { type, grade: 1, classes: [] };
    case 'club':
      return { type, names: [] };
    case 'course':
      return { type, subjects: [] };
    case 'past_course':
      return { type, grade: 1, subjects: [] };
    case 'teacher_students':
      return { type, teacher_ids: [] };
    case 'slot':
      return { type, days: [], periods: [] };
    case 'my_students':
      return { type, subjects: [] };
    case 'my_homeroom':
    case 'all_students':
      return { type };
    case 'people':
      return { type, ids: [] };
  }
}

const nonEmpty = <T,>(values?: T[]) => (values && values.length > 0 ? values : undefined);
const sortNum = (values: number[]) => values.slice().sort((a, b) => a - b);
const listText = (values: string[], max = 3) =>
  values.length <= max ? values.join('·') : `${values.slice(0, max).join('·')} 외 ${values.length - max}`;

/** 비어 있어 서버가 거부할 조건 — 화면이 먼저 말한다 */
export function studentCriterionEmpty(c: StudentCriterion): boolean {
  switch (c.type) {
    case 'current_class':
      return !nonEmpty(c.grades) && !nonEmpty(c.classes);
    case 'past_class':
      return !(c.grade >= 1 && c.grade <= 3) || c.classes.length === 0;
    case 'club':
      return c.names.length === 0;
    case 'course':
      return c.subjects.length === 0;
    case 'past_course':
      return !(c.grade >= 1 && c.grade <= 3) || c.subjects.length === 0;
    case 'teacher_students':
      return c.teacher_ids.length === 0;
    case 'slot':
      return !nonEmpty(c.days) && !nonEmpty(c.periods);
    case 'people':
      return c.ids.length === 0;
    default:
      return false;
  }
}

/** 요약 문장에 id 대신 이름을 쓰기 위한 사전 — 선생님 id → 이름 */
export interface StudentNameBook {
  teachers?: Map<string, string>;
}

/** 조건 하나의 한국어 요약 */
export function describeStudentCriterion(c: StudentCriterion, book: StudentNameBook = {}): string {
  switch (c.type) {
    case 'all_students':
      return '재학생 전원';
    case 'current_class': {
      const grades = nonEmpty(c.grades) ? sortNum(c.grades!).map((g) => `${g}학년`).join('·') : '';
      const classes = nonEmpty(c.classes) ? sortNum(c.classes!).map((n) => `${n}반`).join('·') : '';
      if (!grades && !classes) return '현재 학년·반 (미지정)';
      return `현재 ${[grades || '전 학년', classes].filter(Boolean).join(' ')}`;
    }
    case 'past_class': {
      const classes = c.classes.length > 0 ? sortNum(c.classes).map((n) => `${n}반`).join('·') : '(반 미지정)';
      return `${c.grade}학년 때 ${classes}`;
    }
    case 'club':
      return c.names.length > 0 ? `동아리 · ${listText(c.names)}` : '동아리 (미지정)';
    case 'course':
      return c.subjects.length > 0 ? `수강 · ${listText(c.subjects)}` : '수강 과목 (미지정)';
    case 'past_course': {
      const when = `${c.grade}학년${c.semester ? ` ${c.semester}학기` : ''}`;
      return c.subjects.length > 0 ? `${when}에 ${listText(c.subjects)} 수강` : `${when}에 들은 과목 (미지정)`;
    }
    case 'teacher_students': {
      const names = c.teacher_ids.map((id) => book.teachers?.get(id) ?? '(선생님)');
      if (names.length === 0) return '선생님 수업 (미지정)';
      const subjects = nonEmpty(c.subjects) ? ` ${listText(c.subjects!)}` : '';
      return `${listText(names)} 선생님${subjects} 수업`;
    }
    case 'slot': {
      const days = nonEmpty(c.days) ? sortNum(c.days!).map((d) => DAY_LABELS[d - 1] ?? `${d}`).join('·') : '';
      const periods = nonEmpty(c.periods) ? `${sortNum(c.periods!).join('·')}교시` : '';
      const subjects = nonEmpty(c.subjects) ? ` · ${listText(c.subjects!)}` : '';
      const when = [days, periods].filter(Boolean).join(' ');
      return when ? `${when}${subjects} 수업` : '요일·교시 (미지정)';
    }
    case 'my_students':
      return nonEmpty(c.subjects) ? `내 수업 · ${listText(c.subjects!)}` : '내 수업 학생';
    case 'my_homeroom':
      return '내 반 학생';
    case 'people':
      return `직접 지정 ${c.ids.length}명`;
  }
}

export function describeStudentGroup(group: StudentRuleGroup, book: StudentNameBook = {}): string {
  return group.all.map((c) => describeStudentCriterion(c, book)).join(' 중 ');
}

/** 규칙 전체의 한 줄 요약 — 선택 칩 라벨에 쓴다 */
export function describeStudentRule(rule: StudentAudienceRule, book: StudentNameBook = {}): string {
  if (rule.include.length === 0) return '조건 없음';
  const inc = rule.include.map((g) => describeStudentGroup(g, book)).join(' 또는 ');
  const exc = rule.exclude.map((g) => describeStudentGroup(g, book));
  return exc.length > 0 ? `${inc} (제외: ${exc.join(', ')})` : inc;
}

export function validateStudentRule(rule: StudentAudienceRule): string | null {
  if (rule.include.length === 0) return '조건을 하나 이상 추가하세요.';
  const groups = [...rule.include, ...rule.exclude];
  if (groups.some((g) => g.all.length === 0)) return '비어 있는 묶음이 있습니다.';
  if (groups.some((g) => g.all.some(studentCriterionEmpty))) {
    return '값이 비어 있는 조건이 있습니다. 값을 고르거나 조건을 지우세요.';
  }
  return null;
}

// ── 서버 응답 ────────────────────────────────────────────────────────────────

export interface StudentAudienceRow {
  resource_id: string;
  name: string;
  student_code: string | null;
  grade: number | null;
  class: number | null;
  number: number | null;
  reasons: string[];
}

export interface StudentCriterionResult {
  type: StudentCriterionType;
  count: number;
  /** past_class — 그 학년을 지났는데 기록(snumN)이 없는 학생 수(전입생 등) */
  no_record?: number;
  /** club·course·slot·my_students — 이번 학기 어휘에 없는 이름 */
  unknown?: string[];
}

export interface StudentGroupResult {
  side: 'include' | 'exclude';
  index: number;
  count: number;
  criteria: StudentCriterionResult[];
}

export interface StudentAudienceResolution {
  academic_year: number;
  semester: number;
  rows: StudentAudienceRow[];
  groups: StudentGroupResult[];
  included: number;
  excluded: number;
}

export interface StudentAudienceVocab {
  academic_year: number;
  semester: number;
  classes: Array<{ grade: number; class: number; count: number }>;
  subjects: Array<{ subject: string; grades: number[]; count: number }>;
  clubs: Array<{ name: string; category: string | null; count: number }>;
  my_homeroom: Array<{ grade: number; class: number }>;
  my_subjects: string[];
  max_period: number;
  /** 이번 학기 수업이 있는 선생님(「ㅇㅇㅇ 선생님 수업」) */
  teachers: Array<{ id: string; name: string; subjects: string[] }>;
  /** 끝난 학기 과목(생기부 성적 기록) — terms = ['1-1','2-1', …] 그 과목이 있었던 학년-학기 */
  past_subjects: Array<{ subject: string; terms: string[]; count: number }>;
}

/** 선생님 id → 이름 사전(요약 문장용) */
export function studentNameBook(vocab: StudentAudienceVocab | undefined): StudentNameBook {
  return { teachers: new Map((vocab?.teachers ?? []).map((t) => [t.id, t.name])) };
}

/** 결과를 현재 학년별로 나눈다 — 「2학년 때 3반」 46명 = 현재 2학년 21 + 3학년 25 를 보여 주기 위해 */
export function gradeBreakdown(rows: StudentAudienceRow[]): Array<{ grade: number; count: number }> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.grade == null) continue;
    counts.set(row.grade, (counts.get(row.grade) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([grade, count]) => ({ grade, count }));
}

/**
 * 결과를 한 학년으로 좁힌다 = **포함 묶음 전부**에 `현재 N학년` 조건을 더한다.
 * 문장에 「현재 3학년 중」을 직접 쓴 것과 같은 규칙이 나와야 한다(저장·재해석해도 같은 결과).
 * 이미 현재 학년 조건이 있는 묶음은 학년만 바꾼다(조건이 두 개면 AND 가 0명을 만든다).
 */
export function narrowRuleToGrade(rule: StudentAudienceRule, grade: number): StudentAudienceRule {
  return {
    ...rule,
    include: rule.include.map((group) => {
      const existing = group.all.findIndex((c) => c.type === 'current_class');
      if (existing >= 0) {
        const current = group.all[existing] as Extract<StudentCriterion, { type: 'current_class' }>;
        const next = [...group.all];
        next[existing] = { ...current, grades: [grade] };
        return { all: next };
      }
      return { all: [{ type: 'current_class', grades: [grade] }, ...group.all] };
    }),
  };
}

/** 조건별 결과를 사람이 읽을 경고 문장으로 — 0명의 원인·기록 없음·모르는 이름 */
export function resolutionWarnings(resolution: StudentAudienceResolution): string[] {
  const warnings: string[] = [];
  for (const group of resolution.groups) {
    for (const c of group.criteria) {
      if (c.unknown && c.unknown.length > 0) {
        warnings.push(`이번 학기에 없는 이름: ${c.unknown.join(', ')}`);
      }
      if (c.no_record && c.no_record > 0) {
        warnings.push(`예전 반 기록이 없는 학생 ${c.no_record}명은 빠졌습니다(전입생 등).`);
      }
    }
    if (group.side === 'include' && group.count === 0 && group.criteria.length > 1
        && group.criteria.every((c) => c.count > 0)) {
      warnings.push('조건 하나하나에는 학생이 있지만 모두 만족하는 학생은 없습니다.');
    }
  }
  return [...new Set(warnings)];
}

// ── 3단계: 저장된 조건 ───────────────────────────────────────────────────────

/** 최근·즐겨찾기 한 줄(본인 것만 — student_audience_saved_rule) */
export interface SavedStudentRule {
  id: string;
  rule: StudentAudienceRule;
  /** 저장 당시의 규칙 요약 */
  label: string;
  title: string | null;
  /** 문장으로 만들었으면 그 문장 */
  sentence: string | null;
  pinned: boolean;
  use_count: number;
  last_used_at: string;
}

const KNOWN_TYPES = new Set<StudentCriterionType>([...STUDENT_CRITERION_MENU, 'people']);

/**
 * DB 에 저장된 규칙 → 규칙. 모양이 어긋나거나 **모르는 조건이 하나라도 있으면 null**(그 행을 버린다).
 * 조건 하나만 빼고 쓰면 더 넓은 명단이 조용히 나가므로, 부분 복구는 하지 않는다.
 */
export function parseStoredStudentRule(value: unknown): StudentAudienceRule | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const groups = (v: unknown): StudentRuleGroup[] | null => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) return null;
    const out: StudentRuleGroup[] = [];
    for (const g of v) {
      const all = g && typeof g === 'object' ? (g as { all?: unknown }).all : undefined;
      if (!Array.isArray(all) || all.length === 0) return null;
      if (!all.every((c) => c && typeof c === 'object' && KNOWN_TYPES.has((c as { type: StudentCriterionType }).type))) return null;
      out.push({ all: all as StudentCriterion[] });
    }
    return out;
  };
  const include = groups(record.include);
  const exclude = groups(record.exclude);
  if (!include || !exclude || include.length === 0) return null;
  const rule = { include, exclude };
  return validateStudentRule(rule) === null ? rule : null;
}

/**
 * 규칙의 정준형 — 순서가 달라도 같은 뜻이면 같은 문자열.
 * 최근·즐겨찾기의 **중복 판정 열쇠**(`student_audience_saved_rule.rule_key`)이자 측정 비교 기준이다.
 * ⚠ 바꾸면 이미 저장된 열쇠와 어긋나 같은 조건이 두 줄로 쌓인다(오류는 없다) — 바꿀 일이 생기면 열쇠를 다시 계산할 것.
 * 교직원 규칙(`facultyAudienceRule.ts`)도 모양이 같아 이 함수를 함께 쓴다(열쇠 계산을 두 벌로 두지 않는다).
 */
export function canonicalRule(rule: { include: Array<{ all: object[] }>; exclude: Array<{ all: object[] }> }): string {
  const crit = (c: object) => {
    const sorted = Object.fromEntries(
      Object.entries(c)
        .filter(([, v]) => !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    return JSON.stringify(sorted);
  };
  const group = (g: { all: object[] }) => g.all.map(crit).sort().join('&');
  return JSON.stringify({
    include: rule.include.map(group).sort(),
    exclude: rule.exclude.map(group).sort(),
  });
}
