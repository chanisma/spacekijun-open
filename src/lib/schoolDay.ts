// ========================================
// 그날은 어떤 날인가 — 수업일·시험·휴일·방학 판정 단일 출처 (2026-10-11)
//
// 시간표는 요일 패턴이라 공휴일·방학·시험일을 모른다. 시간표를 **다른 화면에서 읽는 곳**
// (대시보드 오늘 시간표·다마고찌 수업 정지·급식지도·자습 감독 배정)이 각자 휴일을 판정하면
// 서로 다른 답을 낸다 — 실제로 다마고찌는 제목 낱말(`방학`)로 거르다 «방학식» 날까지 쉬는
// 날로 봤고, 대시보드는 아무것도 보지 않아 한글날에도 수업을 띄웠다.
//
// 근거 = NEIS 학사일정(`meeting.kind='schedule'`)의 `meta.sbtr_dd_sc_nm`(수업공제일명):
//   `공휴일` · `휴업일`(방학·토요휴업일·개교기념일·수능일) · `해당없음`.
// 시험은 이 값이 `해당없음`이라 제목(`1차고사`·`2차고사`)으로 본다. 학년 구분은 NEIS 에
// 사실상 없어(사용자 확인 2026-10-11) 수학여행 같은 한 학년 행사는 «메모»로만 남긴다.
//
// ⚠ React·Supabase 를 모른다. 회귀 = `scripts/school-day-test/run.mts`.
// ========================================

export interface SchoolCalendarEntry {
  /** `YYYY-MM-DD` (한국 날짜) */
  date: string;
  title: string;
  /**
   * 수업공제일명(`sbtr_dd_sc_nm`) — NEIS 가 준다. 손으로 넣은 학사일정은 «수업 없는 날» 체크로
   * 같은 값(`휴업일`)을 얻는다(2026-10-11).
   */
  dayKind?: string | null;
  /** 수업이 없는 학년(`meta.no_class_grades`). 없거나 빈 배열 = 전 학년 */
  grades?: number[] | null;
}

/** NEIS 수업공제일명 중 수업이 없는 날 */
export const CLOSED_DAY_KINDS: ReadonlySet<string> = new Set(['휴업일', '공휴일']);

/** 매주 토요일에 붙는 휴업일 — «토요일»일 뿐 특별히 쉬는 날이 아니다(토요 자습은 열린다) */
export const SATURDAY_OFF_TITLE = '토요휴업일';

/** `1차고사`·`2차고사` … */
export const EXAM_TITLE_RE = /^\s*\d\s*차\s*고사\s*$/;

/**
 * 수업을 닫는 학사일정인가. `토요휴업일` 은 빼고 본다 — 주말은 요일로 따로 판정하고,
 * 이걸 닫힘으로 세면 토요 자습을 영원히 배정할 수 없다.
 */
export function isClosingEntry(entry: Pick<SchoolCalendarEntry, 'title' | 'dayKind'>): boolean {
  return Boolean(entry.dayKind && CLOSED_DAY_KINDS.has(entry.dayKind)) && entry.title.trim() !== SATURDAY_OFF_TITLE;
}

/** 이 닫힘 항목이 그 학년에 걸리는가. `grade` 가 null(학교 전체로 보는 화면)이면 전 학년 항목만 */
export function entryAppliesToGrade(entry: Pick<SchoolCalendarEntry, 'grades'>, grade: number | null | undefined): boolean {
  const grades = entry.grades ?? [];
  if (grades.length === 0) return true;
  return grade != null && grades.includes(grade);
}

/** `[2]` → `2학년`, `[1, 3]` → `1·3학년` */
export function gradesLabel(grades: number[]): string {
  return `${[...grades].sort((a, b) => a - b).join('·')}학년`;
}

/** 방학 이름(`여름방학`)인가 — `방학식`은 수업이 있는 날이다 */
function isVacationTitle(title: string): boolean {
  return /방학/.test(title) && !/방학식/.test(title);
}

export type SchoolDayKind =
  /** 평소 수업일 */
  | 'school'
  /** 정기고사가 있는 날 — 수업은 흐리게 */
  | 'exam'
  /** 토·일 */
  | 'weekend'
  /** 공휴일·휴업일(개교기념일·수능일 등) */
  | 'holiday'
  /** 방학(학사일정의 방학 또는 학기 기간 밖) */
  | 'vacation';

export interface SchoolDayInfo {
  date: string;
  /** 월=1 … 일=7 (`teacher_timetable.day_of_week` 와 같다) */
  dow: number;
  kind: SchoolDayKind;
  /** 수업이 없다(주말·휴일·방학) */
  isClosed: boolean;
  /** 화면에 쓸 한 줄 — 휴일 이름·시험 이름·`방학`. 평소 수업일은 null */
  label: string | null;
  /** 그날의 다른 학사일정 제목(행사·한 학년 시험 등) */
  notes: string[];
  /** 그날의 정기고사 이름(정규화 — `1차고사`) */
  exams: string[];
  /** 서로 다른 고사가 둘 이상 = 전 학년 시험 */
  allGradeExam: boolean;
  /**
   * 일부 학년만 수업이 없는 학년(학사일정의 «수업 없는 날 · 학년»). 교사 시간표처럼 수업마다 학년이
   * 다른 화면은 학교 전체로 판정한 뒤 `isClosedForGrade` 로 칸마다 본다.
   */
  closedGrades: number[];
  /** `closedGrades` 를 만든 일정 — `수학여행(2학년)` */
  partialLabel: string | null;
}

export interface TermPeriod {
  /** `YYYY-MM-DD` */
  start: string;
  end: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 로컬 날짜 → `YYYY-MM-DD` */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` → 월=1 … 일=7 */
export function isoDow(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

/** 시각(ms) → 한국 날짜 키. 브라우저 시간대와 무관 */
export function kstDateKey(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * `meeting` 학사일정 행 → 날짜별 항목. 여러 날짜에 걸친 행(추석 3일)은 날마다 한 개로 편다.
 * 제목이 없는 행은 버린다.
 */
export function expandScheduleRows(
  rows: { starts_at: string; ends_at: string; meta?: unknown }[],
): SchoolCalendarEntry[] {
  const out: SchoolCalendarEntry[] = [];
  for (const row of rows) {
    const meta = (row.meta && typeof row.meta === 'object' ? row.meta : {}) as { title?: unknown; sbtr_dd_sc_nm?: unknown; no_class_grades?: unknown };
    const title = typeof meta.title === 'string' ? meta.title.trim() : '';
    if (!title) continue;
    const dayKind = typeof meta.sbtr_dd_sc_nm === 'string' ? meta.sbtr_dd_sc_nm : null;
    const grades = parseNoClassGrades(meta.no_class_grades);
    const startKey = kstDateKey(Date.parse(row.starts_at));
    const endMs = Date.parse(row.ends_at);
    // 끝이 다음 날 00:00 정각이면 그 날은 포함하지 않는다
    const endKey = kstDateKey(Number.isFinite(endMs) ? endMs - 1 : Date.parse(row.starts_at));
    let cursor = startKey;
    for (let guard = 0; cursor <= endKey && guard < 400; guard++) {
      out.push({ date: cursor, title, dayKind, ...(grades.length > 0 ? { grades } : {}) });
      const [y, m, d] = cursor.split('-').map(Number);
      cursor = toDateKey(new Date(y, m - 1, d + 1));
    }
  }
  return out;
}

/** 날짜별로 묶기 */
export function indexCalendar(entries: SchoolCalendarEntry[]): Map<string, SchoolCalendarEntry[]> {
  const map = new Map<string, SchoolCalendarEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.date) ?? [];
    list.push(entry);
    map.set(entry.date, list);
  }
  return map;
}

/**
 * 한 날짜 판정. 우선순위 = 휴일·방학(학사일정) > 학기 밖 > 주말 > 시험 > 수업일.
 * `term` 이 없으면 학기 밖 판정을 하지 않는다(학사력 기간 미설정).
 */
export function classifySchoolDay(
  date: string,
  entriesOfDay: SchoolCalendarEntry[],
  term?: TermPeriod | null,
  /** 보는 사람의 학년 — 학생 화면·학년별 자습 감독. 학교 전체로 보면 생략(전 학년 항목만 닫는다) */
  grade?: number | null,
): SchoolDayInfo {
  const dow = isoDow(date);
  const closingAll = entriesOfDay.filter(isClosingEntry);
  const closing = closingAll.filter((e) => entryAppliesToGrade(e, grade));
  // 일부 학년만 닫는 항목 — 이 학년에 안 걸려도 화면이 «2학년 수업 없음»을 말할 수 있게 남긴다
  const partial = closingAll.filter((e) => (e.grades ?? []).length > 0);
  const closedGrades = [...new Set(partial.flatMap((e) => e.grades ?? []))].sort((a, b) => a - b);
  const partialLabel = partial.length > 0
    ? partial.map((e) => `${e.title.trim()}(${gradesLabel(e.grades ?? [])})`).join(' · ')
    : null;
  const others = entriesOfDay.filter((e) => !isClosingEntry(e) && e.title.trim() !== SATURDAY_OFF_TITLE);
  const exams = [...new Set(others.filter((e) => EXAM_TITLE_RE.test(e.title)).map((e) => e.title.replace(/\s+/g, '')))].sort();
  const notes = [...new Set([
    ...others.filter((e) => !EXAM_TITLE_RE.test(e.title)).map((e) => e.title.trim()),
    // 내 학년에 걸리지 않는 일부 학년 휴업은 메모로
    ...partial.filter((e) => !closing.includes(e)).map((e) => `${e.title.trim()}(${gradesLabel(e.grades ?? [])} 수업 없음)`),
  ])];
  const base = { date, dow, notes, exams, allGradeExam: exams.length >= 2, closedGrades, partialLabel };

  if (closing.length > 0) {
    const vacation = closing.find((e) => isVacationTitle(e.title));
    const first = vacation ?? closing[0];
    return { ...base, kind: vacation ? 'vacation' : 'holiday', isClosed: true, label: first.title.trim() };
  }
  if (term && (date < term.start || date > term.end)) {
    return { ...base, kind: 'vacation', isClosed: true, label: '방학' };
  }
  if (dow >= 6) {
    return { ...base, kind: 'weekend', isClosed: true, label: null };
  }
  if (exams.length > 0) {
    return { ...base, kind: 'exam', isClosed: false, label: exams.join('·') };
  }
  return { ...base, kind: 'school', isClosed: false, label: null };
}

/** 여러 날짜를 한 번에 */
export function classifySchoolDays(
  dates: string[],
  entries: SchoolCalendarEntry[],
  term?: TermPeriod | null,
  grade?: number | null,
): Map<string, SchoolDayInfo> {
  const index = indexCalendar(entries);
  return new Map(dates.map((date) => [date, classifySchoolDay(date, index.get(date) ?? [], term, grade)]));
}

/** 그 학년의 수업이 없는가 — 학교 전체로 판정한 결과에서 수업마다(교사 시간표) 볼 때 */
export function isClosedForGrade(
  info: Pick<SchoolDayInfo, 'isClosed' | 'closedGrades'> | null | undefined,
  grade: number | null | undefined,
): boolean {
  if (!info) return false;
  if (info.isClosed) return true;
  return grade != null && info.closedGrades.includes(grade);
}

/** 수업 이름 끝의 `2-3` 에서 학년 — `teacherSectionName()` 형식(`인공지능 기초 1-1`) */
export function gradeOfSectionName(name: string | null | undefined): number | null {
  const m = /(\d)\s*-\s*\d+\s*$/.exec(name ?? '');
  return m ? Number(m[1]) : null;
}

// ─────────────────────────────── «수업 없는 날» 설정 (학사일정 만들기·수정) ───────────────────────────────

export interface NoClassSetting {
  enabled: boolean;
  /** 빈 배열 = 전 학년 */
  grades: number[];
}

/** `meta.no_class_grades` — 1~3 정수만, 정렬·중복 제거. 셋 다면 전 학년(빈 배열)으로 접는다 */
export function parseNoClassGrades(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const grades = [...new Set(value.map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 3))].sort((a, b) => a - b);
  return grades.length >= 3 ? [] : grades;
}

/** 저장된 학사일정 → 체크 상태 */
export function readNoClassSetting(meta: unknown): NoClassSetting {
  const m = (meta && typeof meta === 'object' ? meta : {}) as { sbtr_dd_sc_nm?: unknown; no_class_grades?: unknown };
  const enabled = typeof m.sbtr_dd_sc_nm === 'string' && CLOSED_DAY_KINDS.has(m.sbtr_dd_sc_nm);
  return { enabled, grades: enabled ? parseNoClassGrades(m.no_class_grades) : [] };
}

/**
 * 체크 상태 → meta 에 덮어쓸 두 키. NEIS 와 같은 값을 쓰므로 판정 코드는 출처를 가리지 않는다.
 *  · 켬 = 이미 `공휴일`이면 그대로(NEIS 공휴일을 고쳐도 공휴일로 남게), 아니면 `휴업일`
 *  · 끔 = NEIS 일정이면 `해당없음`(NEIS 의 «수업일» 값), 손으로 넣은 일정이면 null
 */
export function noClassMetaPatch(
  setting: NoClassSetting,
  current: { sbtr_dd_sc_nm?: unknown; source?: unknown } | null | undefined,
): { sbtr_dd_sc_nm: string | null; no_class_grades: number[] | null } {
  if (!setting.enabled) {
    return { sbtr_dd_sc_nm: current?.source === 'NEIS' ? '해당없음' : null, no_class_grades: null };
  }
  const grades = parseNoClassGrades(setting.grades);
  const currentKind = typeof current?.sbtr_dd_sc_nm === 'string' && CLOSED_DAY_KINDS.has(current.sbtr_dd_sc_nm)
    ? current.sbtr_dd_sc_nm
    : '휴업일';
  return { sbtr_dd_sc_nm: currentKind, no_class_grades: grades.length > 0 ? grades : null };
}

/** 화면 문구 — `오늘은 한글날이라 수업이 없습니다` 같은 한 줄 */
export function schoolDayMessage(
  info: Pick<SchoolDayInfo, 'kind' | 'label'> & Partial<Pick<SchoolDayInfo, 'partialLabel'>>,
  /** 일부 학년 휴업도 말할 것인가 — 여러 학년을 가르치는 교사 화면 */
  showPartial = false,
): string | null {
  if (showPartial && info.partialLabel && (info.kind === 'school' || info.kind === 'exam')) {
    return `${info.partialLabel} · 그 학년 수업 없음`;
  }
  switch (info.kind) {
    case 'holiday': return `${info.label ?? '휴일'} · 수업 없음`;
    case 'vacation': return `${info.label ?? '방학'} · 수업 없음`;
    case 'weekend': return '주말 · 수업 없음';
    case 'exam': return `${info.label ?? '시험'} 기간 · 평소 시간표와 다를 수 있습니다`;
    default: return null;
  }
}
