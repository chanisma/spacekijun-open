/**
 * 분석 탭 공통 유틸리티
 * - 등급 색상, 정규화, 공통 타입
 */

import { is5GradeSystem } from '@/features/evalog/utils/gradeAnalysisUtils';
// 성적표 ↔ 마킹의 과목명 표기 흔들림 흡수는 evalearn 의 단일 출처를 쓴다(여기서 다시 짜면 갈라진다)
import { findExamSubjectScore, isSameExamSubject, isValidExamGrade } from '@/features/evalearn/utils/mockResult';
import type { ReferenceGrade } from '@/features/evalearn/utils/referenceGrade';
// 과목 표시 순서(국어 → 수학 → 영어 → 과학탐구 → 사회탐구 → 한국사)도 evalearn 이 단일 출처다
import { sortSubjects } from '@/features/evalearn/utils/subjectOrder';
import type { AnalysisStudentData } from '../hooks/useAnalysisData';

// ─── 등급제 판별 ───

/** 데이터셋의 최대 등급 결정 (5등급제 학생만 있으면 5, 아니면 9) */
export function getMaxGrade(students: AnalysisStudentData[]): number {
  if (students.length === 0) return 9;
  const allAre5 = students.every(s => is5GradeSystem(s.grade));
  return allAre5 ? 5 : 9;
}

// ─── 등급 색상 ───

/** 등급 → 색상 클래스 (1-3=emerald, 4-6=amber, 7-9=rose) */
export function gradeColor(grade: number): string {
  if (grade <= 3) return 'text-emerald-600';
  if (grade <= 6) return 'text-amber-600';
  return 'text-rose-600';
}

export function gradeBgColor(grade: number): string {
  if (grade <= 3) return 'bg-emerald-50';
  if (grade <= 6) return 'bg-amber-50';
  return 'bg-rose-50';
}

export function gradeBorderColor(grade: number): string {
  if (grade <= 3) return 'border-emerald-200';
  if (grade <= 6) return 'border-amber-200';
  return 'border-rose-200';
}

/** 등급대별 색상 (차트용) */
export const GRADE_BAND_COLORS = {
  top: '#10b981',     // emerald-500 (1-3등급)
  mid: '#f59e0b',     // amber-500 (4-6등급)
  low: '#f43f5e',     // rose-500 (7-9등급)
} as const;

/** 차트 컬러 팔레트 */
export const CHART_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
] as const;

// ─── 정규화 ───

/** min-max 정규화 (0~100 스케일) */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

/** 등급을 100점 스케일로 변환 (1등급=100, 9등급=0) */
export function gradeToScore(grade: number, maxGrade = 9): number {
  return ((maxGrade - grade) / (maxGrade - 1)) * 100;
}

// ─── 공통 타입 ───

export interface Section6Record {
  grade: number;
  semester: number;
  subject: string;
  subject_group: string;
  category: string;  // 'regular' | 'career'
  rank: number | null;
  units: number;
  content?: string;
  /*
    생기부 원본에는 아래 값도 함께 있다(라이브 실측: `score`/`average` 87.3% · `stdDev` 62.6%).
    `stdDev` 는 25·26학번에 사실상 없다(2025 개정으로 미제공) — 그래서 전부 선택 필드다.
    이 값들이 있어야 화면이 "그 학기에 무슨 과목을 어떻게 했나"를 등급 너머로 말할 수 있다.
  */
  score?: number | null;
  average?: number | null;
  stdDev?: number | null;
  students?: number | null;
  achievement?: string | null;
}

export interface MockExamSubjectScore {
  raw_score: number | null;
  standard_score: number | null;
  percentile: number | null;
  grade: number | null;
}

export interface MockExamResult {
  academic_year: number;
  exam_grade: number;
  exam_month: number;
  subjects: {
    [subjectName: string]: MockExamSubjectScore;
  };
}

export interface AttendanceSubRecord {
  disease?: number | null;
  unapproved?: number | null;
  other?: number | null;
}

export interface AttendanceRecord {
  grade?: number;
  notes?: string;
  schoolDays?: number;
  absence?: AttendanceSubRecord;
  tardiness?: AttendanceSubRecord;
  earlyLeave?: AttendanceSubRecord;
  classSkip?: AttendanceSubRecord;
}

/** JSONB 배열 컬럼(attendance/volunteer 등)이 아직 데이터가 채워지지 않아 초기값 {}(객체)로
 *  남아있는 행(주로 갓 등록된 1학년) 방어용 — 실제 배열일 때만 그대로 반환한다. */
export function asRecordArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** 출결 레코드에서 총 결석일수 계산 */
export function calcTotalAbsent(records: AttendanceRecord[]): number {
  if (!Array.isArray(records)) return 0;
  return records.reduce((sum, a) => {
    const absence = a.absence;
    if (!absence) return sum;
    return sum + (absence.disease || 0) + (absence.unapproved || 0) + (absence.other || 0);
  }, 0);
}

export interface VolunteerRecord {
  year?: number;
  hours?: number;
  description?: string;
}

export interface ReadingRecord {
  title?: string;
  author?: string;
  date?: string;
}

// ─── 모의고사 시험 컨텍스트 ───

/** 평가원 주관 모의고사 월 — 재수생이 함께 응시해 모집단이 넓어진다.
 *  3·5월 학평=재학생만, 11월=실제 수능. (ml/train_grade_predictor.py PYEONGGAWON_MONTHS와 동일)
 *  **월만으로는 판정이 안 된다** — 아래 `isPyeonggawonExam` 을 쓸 것. */
export const PYEONGGAWON_MONTHS = new Set([6, 9]);

/**
 * 이 회차가 **평가원 모의평가**인가.
 *
 * 월만 보면 안 된다 — 평가원이 주관하는 것은 **고3의 6·9월**뿐이고, 1·2학년의 6·9월은
 * 교육청 학력평가다. 월만으로 판정하던 시절 1·2학년 성적표에도 '평가원' 배지가 붙어
 * "재수생이 함께 본 시험"이라는 잘못된 뜻을 전했다(2026-09-04 사용자 지적).
 */
export function isPyeonggawonExam(
  examGrade: number | null | undefined,
  examMonth: number | null | undefined
): boolean {
  return examGrade === 3 && examMonth != null && PYEONGGAWON_MONTHS.has(examMonth);
}

/** 모의고사 과목명 → 계열 키. 3학년 회차는 국어/수학이 선택과목명(화법과작문·미적분 등)으로
 *  기록되므로 계열로 병합해야 한다 (ml/train_grade_predictor.py MOCK_SUBJECT_MAP과 동일).
 *  한 회차에 같은 계열 과목이 2개 이상 공존하지 않는다는 전제. */
export const MOCK_SUBJECT_FAMILY: Record<string, 'korean' | 'math' | 'english'> = {
  '국어': 'korean', '화법과작문': 'korean', '언어와매체': 'korean',
  '수학': 'math', '확률과통계': 'math', '미적분': 'math', '기하': 'math',
  '영어': 'english',
};

/** 탐구 과목명 표기 흔들림 정규화 — DB에 "사회·문화"(491건)와 "사회문화"(102건)가 공존
 *  (ml/train_grade_predictor.py MOCK_SUBJECT_NAME_ALIASES와 동일하게 유지할 것) */
export const MOCK_SUBJECT_NAME_ALIASES: Record<string, string> = { '사회문화': '사회·문화' };

export function normalizeMockSubjectName(name: string): string {
  return MOCK_SUBJECT_NAME_ALIASES[name] ?? name;
}

/** 모의고사 성적 표의 한 칸(과목 하나). 참고 등급 행은 표준점수·백분위를 만들 수 없어 비운다. */
export interface MockExamCell {
  grade?: number | null;
  raw_score?: number | null;
  standard_score?: number | null;
  percentile?: number | null;
}

export interface MockExamRow {
  academic_year: number;
  exam_grade: number;
  exam_month: number;
  subjects: Record<string, MockExamCell | undefined>;
  /** 공식 성적이 아니라 EBS 예상 등급컷으로 산정한 참고 등급 행인가 */
  isReference: boolean;
}

export interface MockExamTable {
  /** 표의 과목 열. 성적표 이름을 우선하고, 그 회차에만 있는 과목을 뒤에 덧붙인다. */
  columns: string[];
  rows: MockExamRow[];
  hasReference: boolean;
}

/**
 * 개별 학생 모달의 "실제 모의고사 성적" 표를 만든다 — 공식 성적 행 + (있으면) 참고 등급 행.
 *
 * ## 왜 함수로 빼는가
 * **성적표와 마킹은 같은 과목을 다르게 적는다** — `사회·문화` ↔ `사회문화`,
 * `생명과학1` ↔ `생명과학Ⅰ`. 두 출처를 한 표에 올리면서 이 대조를 빠뜨리면 오류가 나는 게
 * 아니라 ①탐구 칸이 조용히 비거나 ②같은 과목이 두 열로 갈라진다. 눈으로는 "그 학생이 안 봤나
 * 보다"로 읽혀서 끝까지 발견되지 않는다. 그래서 대조는 전부 `findExamSubjectScore`
 * (정확 일치 → 표기 정규화 → 통합과목 별칭)를 거치고, 그 규칙을 회귀로 고정한다.
 *
 * ## 공식이 정본
 * 참고 등급 회차의 공식 성적이 적재되면 참고 행을 **만들지 않는다**. 둘을 나란히 두면
 * 어느 쪽이 맞는지 화면이 말해 주지 못한다.
 */
export function buildMockExamTable(
  officialExams: readonly {
    academic_year: number; exam_grade: number; exam_month: number;
    subjects: Record<string, MockExamCell>;
  }[],
  /** 마킹 과목키 → 참고 등급. 없으면 공식 행만 나온다. */
  /*
    마킹 과목키 → 참고 등급. `percentile` 은 원점수를 EBS 등급컷 사이에서 보간한 **근사
    백분위**다(6월 공식값으로 잰 오차 MAE 0.94%p). 종전엔 이 값을 버리고 `null` 로 채워
    9월 행만 백분위가 비어 있었다 — 같은 표에서 다른 회차는 백분위가 나오는데 9월만
    빈칸이라 "안 봤나" 로 읽혔다(2026-09-05 사용자 지적).
  */
  reference: Map<string, { grade: number; rawScore: number; percentile?: number | null }> | null | undefined,
  /** 참고 등급이 어느 회차의 것인지. null 이면 참고 행을 만들지 않는다. */
  referenceExam: { academic_year: number; exam_grade: number; exam_month: number } | null | undefined
): MockExamTable {
  const rows: MockExamRow[] = officialExams
    .map(e => ({
      academic_year: e.academic_year, exam_grade: e.exam_grade, exam_month: e.exam_month,
      subjects: e.subjects as Record<string, MockExamCell | undefined>, isReference: false,
    }))
    .sort((a, b) =>
      (a.academic_year - b.academic_year) ||
      (a.exam_grade - b.exam_grade) ||
      (a.exam_month - b.exam_month));

  // 열 순서는 evalearn 의 단일 출처를 따른다(국어 → 수학 → 영어 → 과학탐구 → 사회탐구 → 한국사).
  // 정렬하지 않으면 성적표 JSON 에 담긴 순서가 그대로 나와 회차마다 열이 뒤바뀐다.
  const columns = sortSubjects(Array.from(new Set(rows.flatMap(r => Object.keys(r.subjects)))));

  const hasOfficialForRefExam = referenceExam != null && rows.some(
    r => r.academic_year === referenceExam.academic_year &&
         r.exam_grade === referenceExam.exam_grade &&
         r.exam_month === referenceExam.exam_month);

  if (!reference?.size || referenceExam == null || hasOfficialForRefExam) {
    return { columns, rows, hasReference: false };
  }

  const refRecord: Record<string, { grade: number; rawScore: number; percentile?: number | null }> = {};
  reference.forEach((v, k) => { refRecord[k] = v; });

  // 성적표에 한 번도 안 나온 과목만 열로 덧붙인다(표기만 다른 같은 과목이 두 열이 되지 않게).
  const columnLookup = Object.fromEntries(columns.map(c => [c, true]));
  let appended = false;
  for (const markingKey of Object.keys(refRecord)) {
    if (findExamSubjectScore(columnLookup, markingKey) === undefined) {
      columns.push(markingKey);
      appended = true;
    }
  }
  // 그 회차에만 있는 과목(탐구를 바꾼 학생)도 제자리에 끼워야 한다 — 뒤에 붙이면 순서가 깨진다
  if (appended) columns.splice(0, columns.length, ...sortSubjects(columns));

  const subjects: Record<string, MockExamCell | undefined> = {};
  for (const column of columns) {
    const ref = findExamSubjectScore(refRecord, column);
    if (!ref) continue;
    /* 표준점수는 참고 등급으로 만들 수 없어 null 그대로 — 없는 값을 지어내지 않는다 */
    subjects[column] = {
      grade: ref.grade, raw_score: ref.rawScore,
      standard_score: null, percentile: ref.percentile ?? null,
    };
  }
  if (Object.keys(subjects).length === 0) return { columns, rows, hasReference: false };

  rows.push({ ...referenceExam, subjects, isReference: true });
  rows.sort((a, b) =>
    (a.academic_year - b.academic_year) ||
    (a.exam_grade - b.exam_grade) ||
    (a.exam_month - b.exam_month));

  return { columns, rows, hasReference: true };
}

export type MockCore = 'korean' | 'math' | 'english';
const MOCK_CORES: readonly MockCore[] = ['korean', 'math', 'english'];

/**
 * 과목명 묶음을 **계열(국·수·영) 등급**으로 접는다.
 *
 * 3학년 회차는 국어·수학이 선택과목명(화법과작문·확률과통계 …)으로 기록되므로 계열로 접지
 * 않으면 국어·수학이 통째로 사라진다. 미응시(0등급)는 `isValidExamGrade` 가 걸러낸다 —
 * 0 을 그대로 평균에 넣으면 안 본 과목이 1등급보다 좋은 값으로 들어간다.
 */
export function foldCoreGrades(
  entries: Iterable<[string, number | null | undefined]>
): Partial<Record<MockCore, number>> {
  const out: Partial<Record<MockCore, number>> = {};
  for (const [name, grade] of entries) {
    const family = MOCK_SUBJECT_FAMILY[name];
    // 한 계열에 두 과목이 잡히는 일은 없다는 전제라 먼저 온 값을 지킨다
    if (family && out[family] == null && isValidExamGrade(grade)) out[family] = grade;
  }
  return out;
}

/** `mock_result` 의 한 회차에서 계열 등급을 뽑는다. */
export function coreGradesFromExam(
  subjects: Record<string, { grade?: number | null } | null | undefined> | null | undefined
): Partial<Record<MockCore, number>> {
  return foldCoreGrades(Object.entries(subjects ?? {}).map(([k, v]) => [k, v?.grade]));
}

/** 참고 등급 Map(과목키 → 등급)에서 계열 등급을 뽑는다. */
export function coreGradesFromReference(
  reference: Map<string, { grade: number }> | null | undefined
): Partial<Record<MockCore, number>> {
  return foldCoreGrades([...(reference ?? new Map())].map(([k, v]) => [k, v.grade]));
}

/**
 * 참고 등급 Map 에서 **계열 백분위**를 뽑는다 (2026-09-05 사용자 요청).
 *
 * 등급 한 칸이 백분위 10~20 폭을 덮으므로, 흐름 스텝퍼에서 9월·수능 칸이 등급만 내면
 * 6월(백분위)과 견줄 해상도가 사라진다. **영어·한국사는 절대평가라 백분위가 없다** —
 * `percentile` 이 null 이므로 자연히 빠진다(없는 값을 지어내지 않는다).
 *
 * `foldCoreGrades` 를 재사용하지 **않는다** — 그쪽은 `isValidExamGrade`(1~9)로 거르는데
 * 백분위는 0~100 이라 그 필터에 걸리면 대부분이 버려진다.
 */
export function corePercentilesFromReference(
  reference: Map<string, { percentile: number | null }> | null | undefined
): Partial<Record<MockCore, number>> {
  const out: Partial<Record<MockCore, number>> = {};
  for (const [name, v] of reference ?? new Map()) {
    const family = MOCK_SUBJECT_FAMILY[name];
    const pct = v?.percentile;
    if (family && out[family] == null && typeof pct === 'number' && pct >= 0 && pct <= 100) {
      out[family] = pct;
    }
  }
  return out;
}

/**
 * 한 회차의 **공식 성적을 참고 등급 Map 모양으로 덮어 얹는다** (2026-09-30).
 *
 * `referenceGradeService` 는 공식 등급이 있는 과목을 **계산하지 않을 뿐 아니라 돌려주지도
 * 않는다**(공식이 정본이라 참고 등급을 만들 이유가 없다). 그래서 9월을 참고 등급 Map 으로만
 * 읽는 화면은 공식 성적이 적재되는 순간 **9월이 통째로 빈다** — 오류 없이 "기록 없음"이 되고
 * 수능 예상은 6월만으로 계산된다(2026-09-30 3학년 9월 공식 성적 적재 직후 실제로 그랬다).
 *
 * 공식 과목이 이기고, 공식에 없는 과목만 참고 등급이 남는다. 과목 키는 공식 성적표 표기를
 * 쓴다(`사회·문화`) — 하류(`coreGradesFromReference`·`suneungForecast`)는 이미 두 표기를
 * 정규화해 읽는다. 백분위 0 은 결측 규약이라 null 로 옮긴다.
 */
export function withOfficialGrades(
  reference: Map<string, ReferenceGrade> | null | undefined,
  official: Record<string, {
    grade?: number | null; raw_score?: number | null; percentile?: number | null;
  } | null | undefined> | null | undefined,
): { grades: Map<string, ReferenceGrade>; officialCount: number } {
  const grades = new Map<string, ReferenceGrade>();
  let officialCount = 0;
  const officialKeys: string[] = [];
  for (const [name, v] of Object.entries(official ?? {})) {
    if (!isValidExamGrade(v?.grade)) continue;
    const family = MOCK_SUBJECT_FAMILY[name];
    const isAbsolute = family === 'english' || name === '한국사';
    grades.set(name, {
      grade: v!.grade!,
      rawScore: typeof v?.raw_score === 'number' ? v.raw_score : 0,
      maxScore: family ? 100 : 50,
      source: 'official',
      isAbsolute,
      vsNationalMean: null,
      percentile: !isAbsolute && typeof v?.percentile === 'number' && v.percentile > 0 && v.percentile <= 100
        ? v.percentile : null,
    });
    officialKeys.push(name);
    officialCount++;
  }
  reference?.forEach((ref, name) => {
    if (officialKeys.some((k) => isSameExamSubject(k, name))) return;
    grades.set(name, ref);
  });
  return { grades, officialCount };
}

/**
 * 수능 추정 가중치 — **9월 0.6 / 6월 0.4** (2026-09-04 사용자 결정).
 *
 * 두 평가원 회차만 쓴다. 3·5·7월 학평은 재학생만 응시해 모집단이 다르고, 실측에서도 9월을
 * 맞히는 힘이 6월보다 약했다(상관 국 .75~.81 vs .82).
 *
 * ⚠️ **이 가중치는 검증된 적이 없다.** 졸업생에게 3학년 9월·수능 기록이 0건이라 (실측 확인)
 * 어떤 배합이 수능을 잘 맞히는지 확인할 방법이 지금은 없다. 참고로 6월→9월에서는 **최신 회차
 * 단독 이월이 회차 혼합보다 정확했다**(국어 MAE 0.832 vs 0.860, 영어 0.906 vs 0.947) —
 * 즉 혼합이 유리하다는 증거는 없고, 회차 난이도 편차를 평균이 눌러 준다는 기대에 근거한 선택이다.
 * 수능 성적이 들어오면 **가장 먼저 재보아야 할 값**이다.
 */
export const SUNEUNG_WEIGHT_SEPTEMBER = 0.6;
export const SUNEUNG_WEIGHT_JUNE = 0.4;

/** 이 과목 추정이 무엇에 근거했는가. 한쪽 회차만 있으면 그쪽 단독이 된다. */
export type SuneungBasis = 'blend' | 'september' | 'june';

export interface SuneungSubjectEstimate {
  grade: number;
  basis: SuneungBasis;
}

export interface SuneungEstimate {
  subjects: Partial<Record<MockCore, SuneungSubjectEstimate>>;
  /** 국·수·영 평균 (있는 것만). 학습 스크립트의 mock 계열 정의와 같다. */
  overall: number | null;
  /** 과목마다 근거가 다르면 'mixed' */
  basis: SuneungBasis | 'mixed';
}

/**
 * 수능(11월) 예상 등급. **학습된 모델이 아니라 규칙**이다 — 위 가중치 주석 참고.
 *
 * 척도는 등급으로 통일한다. 9월은 공식 백분위가 없고 EBS 참고 등급뿐이라, 백분위로 맞추려면
 * 추정 위에 추정을 얹어야 한다.
 */
export function estimateSuneungGrades(
  september: Partial<Record<MockCore, number>> | null | undefined,
  june: Partial<Record<MockCore, number>> | null | undefined
): SuneungEstimate | null {
  const subjects: Partial<Record<MockCore, SuneungSubjectEstimate>> = {};

  for (const core of MOCK_CORES) {
    const s = september?.[core];
    const j = june?.[core];
    if (s != null && j != null) {
      subjects[core] = {
        grade: SUNEUNG_WEIGHT_SEPTEMBER * s + SUNEUNG_WEIGHT_JUNE * j,
        basis: 'blend',
      };
    } else if (s != null) {
      subjects[core] = { grade: s, basis: 'september' };
    } else if (j != null) {
      subjects[core] = { grade: j, basis: 'june' };
    }
  }

  const values = MOCK_CORES.map((c) => subjects[c]?.grade).filter((v): v is number => v != null);
  if (values.length === 0) return null;

  const bases = new Set(MOCK_CORES.map((c) => subjects[c]?.basis).filter(Boolean) as SuneungBasis[]);
  return {
    subjects,
    overall: values.reduce((a, b) => a + b, 0) / values.length,
    basis: bases.size === 1 ? [...bases][0] : 'mixed',
  };
}

/** 학기별 추이 차트가 먹는 한 칸. 값이 없는 계열은 null 이어야 라인이 그 지점에서 끊긴다. */
export interface MockTrendPoint {
  mock: number | null;
  mock_korean: number | null;
  mock_math: number | null;
  mock_english: number | null;
}

/**
 * 참고 등급 묶음(과목키 → 등급)을 학기별 추이 차트의 **한 칸**으로 접는다.
 *
 * 이 변환이 조용히 틀리기 가장 쉬운 자리다 — 3학년 마킹의 국어·수학은 선택과목명으로 오는데
 * (화법과작문·언어와매체 / 확률과통계·미적분·기하), 계열로 접지 못하면 차트가 **오류 없이
 * 빈 칸**을 그린다. recharts 는 dataKey 가 안 맞아도 예외를 던지지 않고 마크를 0개 그릴 뿐이다.
 *
 * 탐구·한국사는 담지 않는다 — 차트의 `mock` 계열이 국·수·영 평균으로 정의돼 있어
 * (ml/train_grade_predictor.py 의 MOCK_SUBJECT_KEYS 와 동일) 탐구를 섞으면 다른 학기 칸과
 * 기준이 어긋난다. 셋 다 없으면 그릴 것이 없으므로 null 을 돌려준다.
 */
export function buildMockTrendPoint(
  gradesBySubject: Map<string, { grade: number }> | null | undefined
): MockTrendPoint | null {
  if (!gradesBySubject?.size) return null;
  return mockTrendPointFromCores(coreGradesFromReference(gradesBySubject));
}

/** 계열 등급 묶음 → 차트 한 칸. 셋 다 없으면 그릴 것이 없으므로 null. */
export function mockTrendPointFromCores(
  core: Partial<Record<MockCore, number>>
): MockTrendPoint | null {
  const values = MOCK_CORES.map((k) => core[k]).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return {
    mock: values.reduce((a, b) => a + b, 0) / values.length,
    mock_korean: core.korean ?? null,
    mock_math: core.math ?? null,
    mock_english: core.english ?? null,
  };
}

// ─── 학기 관련 ───

/** 학기 문자열 정렬 순서 */
const SEMESTER_ORDER: Record<string, number> = {
  '1-1': 0, '1-2': 1,
  '2-1': 2, '2-2': 3,
  '3-1': 4, '3-2': 5,
};

export function semesterSortKey(semester: string): number {
  return SEMESTER_ORDER[semester] ?? 99;
}

export function sortSemesters(semesters: string[]): string[] {
  return [...semesters].sort((a, b) => semesterSortKey(a) - semesterSortKey(b));
}

/** 학기 라벨 변환 */
export function semesterLabel(semester: string): string {
  const parts = semester.split('-');
  if (parts.length === 2) return `${parts[0]}학년 ${parts[1]}학기`;
  return semester;
}

// ─── 통계 유틸 ───

/** 평균 계산 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 중앙값 계산 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 표준편차 계산 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const squareDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/** 피어슨 상관계수 */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  const avgX = average(xs.slice(0, n));
  const avgY = average(ys.slice(0, n));

  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - avgX;
    const dy = ys[i] - avgY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  return denom === 0 ? 0 : sumXY / denom;
}

/** 코호트 모의고사 차트의 재료 한 학생 분. 예측 스냅샷의 학생 객체가 그대로 들어온다. */
export interface MockChartStudent {
  predictions: { mock_prediction?: { grade?: number | null; subjects?: Record<string, { grade: number }> | null } | null }[];
  current_grades: Record<string, { mock?: number | null; mock_subjects?: Record<string, number> | null }>;
}

export interface MockCohortChart {
  /** 무엇으로 그렸는가 — 화면 제목이 이 값을 그대로 말해야 한다 */
  basis: 'prediction' | 'actual';
  /** 차트에 실제로 들어간 학생 수 (전체 인원과 다를 수 있다) */
  count: number;
  /** 예측을 가진 학생 수 */
  predictionCount: number;
  /** 계열별 평균 등급 (korean/math/english/overall). 표본이 없으면 avg=null */
  averages: Record<string, { avg: number | null; count: number }>;
  /** 1~9등급 히스토그램 */
  distribution: Record<number, number>;
}

const MOCK_CHART_CORES = ['korean', 'math', 'english'] as const;

/** 그 학생의 가장 최근 **실측** 모의고사. 전체와 과목별을 같은 학기에서 가져온다. */
function latestActualMock(s: MockChartStudent): { overall: number | null; subjects: Record<string, number> } {
  const sems = Object.keys(s.current_grades).sort();
  for (let i = sems.length - 1; i >= 0; i--) {
    const cg = s.current_grades[sems[i]];
    if (cg?.mock != null) return { overall: cg.mock, subjects: cg.mock_subjects ?? {} };
  }
  return { overall: null, subjects: {} };
}

/**
 * 학년 단위 모의고사 차트(교과군 평균 · 등급 분포)의 재료를 만든다.
 *
 * ## 예측이 소수면 실측으로 그린다 (2026-09-05, 실제 버그)
 * 3학년은 3-1 내신이 산출되는 순간 예측 대상 학기가 사라져, 예측을 가진 학생이
 * **3-1 성적이 없는 11명뿐**이 된다(라이브 217명 중). 그 11명은 무작위가 아니라 "아직 성적이
 * 없는 학생"이라 하위권에 쏠려 있다 — 예측 보유자만 세면 상단 타일은 "217명"이라 쓰고 차트는
 * **편향된 11명**(평균 6.1등급)을 그린다. 비어 보이지도 않아서 잘못된 분포를 사실로 읽게 된다.
 * 그래서 예측 보유가 **과반이 아니면** 최근 실측 모의고사로 바꿔 그린다(217명 전원, 4.54등급).
 *
 * 척도는 어느 쪽이든 9등급제라 섞이지 않는다(모의고사는 학년과 무관하게 9등급제).
 * 무엇을 그렸는지는 `basis`·`count` 로 돌려주고 화면이 제목·분모에 밝힌다.
 */
export function buildMockCohortChart(students: readonly MockChartStudent[]): MockCohortChart {
  const predictionCount = students.filter((s) => s.predictions.length > 0).length;
  const basis: 'prediction' | 'actual' =
    predictionCount * 2 >= students.length ? 'prediction' : 'actual';

  const keys = [...MOCK_CHART_CORES, 'overall'];
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const k of keys) acc[k] = { sum: 0, count: 0 };
  const distribution: Record<number, number> = {};
  for (let g = 1; g <= 9; g++) distribution[g] = 0;

  for (const s of students) {
    let overall: number | null;
    let subjects: Record<string, number | null>;
    if (basis === 'prediction') {
      const mp = s.predictions[0]?.mock_prediction;
      overall = mp?.grade ?? null;
      subjects = Object.fromEntries(MOCK_CHART_CORES.map((k) => [k, mp?.subjects?.[k]?.grade ?? null]));
    } else {
      const a = latestActualMock(s);
      overall = a.overall;
      subjects = Object.fromEntries(MOCK_CHART_CORES.map((k) => [k, a.subjects[k] ?? null]));
    }

    if (overall != null) {
      acc.overall.sum += overall;
      acc.overall.count++;
      /*
        ## 버킷은 **반올림이 아니라 내림**이다 (2026-09-05 사용자 지적)

        `Math.round` 면 국·수·영 평균 1.67 인 학생이 **2등급 칸**에 들어간다. 그런데
        사람이 "1등급대"라고 말할 때 뜻하는 것은 **1점대(1.00~1.99)** 다 — 실제로
        라이브 3학년은 최소값이 1.67 이라 1점대가 5명 있는데도 차트에 1등급대가
        **0명**으로 그려졌다("분명히 있는데 없다고 나온다").

        내림이면 칸의 뜻이 라벨과 정확히 같아진다: N등급대 = [N.00, N+1.00).
        9등급대만 [9.00, 9.00] 이지만 등급 상한이 9라 원래 그 값 하나뿐이다.
      */
      distribution[Math.max(1, Math.min(Math.floor(overall), 9))]++;
    }
    for (const k of MOCK_CHART_CORES) {
      const v = subjects[k];
      if (v != null) {
        acc[k].sum += v;
        acc[k].count++;
      }
    }
  }

  const averages: Record<string, { avg: number | null; count: number }> = {};
  for (const k of keys) {
    averages[k] = {
      avg: acc[k].count > 0 ? parseFloat((acc[k].sum / acc[k].count).toFixed(2)) : null,
      count: acc[k].count,
    };
  }

  return { basis, count: acc.overall.count, predictionCount, averages, distribution };
}

/**
 * `subject_group` -> 모델의 교과군 키.
 * **`ml/train_grade_predictor.py` 의 SUBJECT_GROUP_MAP 과 같아야 한다** — 여기서 갈라지면
 * 화면이 보여주는 "실측"과 모델이 학습한 "실측"이 다른 값이 된다(한국사가 사회로 묶이는 것 포함).
 */
const NAESIN_GROUP_MAP: Record<string, string> = {
  '국어': 'korean',
  '수학': 'math',
  '영어': 'english',
  '사회(역사/도덕포함)': 'social',
  '과학': 'science',
  '한국사': 'social',
};

/**
 * 생기부 원본에서 **한 학기의 교과군별 실측 등급**을 낸다(이수단위 가중평균).
 *
 * ## 왜 스냅샷이 아니라 원본에서 뽑는가
 * 예측 스냅샷의 `current_grades` 는 **그 스냅샷을 만든 시점의** 실측이다. 7월 예측을 골라
 * 사후 검증을 하려면 그때는 없던 3-1 성적이 필요한데, 그 스냅샷 안에는 당연히 없다.
 * 그래서 실측은 늘 DB 원본(`academic_development`)에서 읽어야 예측과 대조할 수 있다.
 *
 * 규칙은 파이프라인과 같다 — `category='regular'` + `rank` 있는 행만, 이수단위 가중.
 * 진로선택(career)은 석차등급이 없어 자연히 빠진다.
 */
export function semesterNaesinFromRecords(
  records: readonly Section6Record[] | null | undefined,
  grade: number | string,
  semester: number | string
): Record<string, number | null> {
  const acc: Record<string, { sum: number; units: number }> = {};
  let allSum = 0;
  let allUnits = 0;

  for (const r of records ?? []) {
    if (r?.category !== 'regular' || r.rank == null) continue;
    if (String(r.grade) !== String(grade) || String(r.semester) !== String(semester)) continue;
    const key = NAESIN_GROUP_MAP[r.subject_group];
    if (!key) continue;
    const units = r.units || 1;
    acc[key] ??= { sum: 0, units: 0 };
    acc[key].sum += r.rank * units;
    acc[key].units += units;
    allSum += r.rank * units;
    allUnits += units;
  }

  const out: Record<string, number | null> = {};
  for (const k of ['korean', 'math', 'english', 'social', 'science']) {
    out[k] = acc[k]?.units ? parseFloat((acc[k].sum / acc[k].units).toFixed(2)) : null;
  }
  out.overall = allUnits > 0 ? parseFloat((allSum / allUnits).toFixed(2)) : null;
  return out;
}

/*
  ## 과목별 내신 백분위 — 파이프라인과 **같은 규칙**을 화면에서 다시 계산한다 (2026-09-05)

  실측 내신 표는 교과군 평균 옆에만 백분위를 냈다. 그런데 상담에서 실제로 나오는 질문은
  "어느 **과목**이 평균을 끌어내렸나"이고, 등급만으로는 답이 안 된다 — 5등급제 3등급은
  상위 32~68% 를 한 숫자로 뭉개므로 같은 3등급 두 과목의 우열이 사라진다.

  **스냅샷에는 과목 단위 백분위가 없다**(`current_percentile` 은 교과군 단위). 산출물을
  다시 만들어 넣을 수도 있지만, 그러면 이미 만들어 둔 과거 스냅샷들에는 영원히 없다.
  대신 화면이 가진 코호트 원점수로 **같은 식**을 다시 적용한다.

  규칙은 `ml/train_grade_predictor.py` 의 `annotate_naesin_percentile` 과 **한 글자도 다르면
  안 된다** — 다르면 같은 학생의 백분위가 예측 화면과 실측 표에서 어긋난다.
    · 묶음 = (입학연도 2자리, 학년, 학기, 과목)
    · `category='regular'` ∧ 원점수 있음 ∧ **석차등급 있음**
    · **공표 과목평균이 그 묶음의 최빈값과 같을 것**(전입생의 전 학교 성적 제외)
    · 동점은 **중간순위**: 상위 % = (더 높은 수 + 동점/2) / n × 100
    · 묶음이 `NAESIN_PCT_MIN_GROUP` 명 미만이면 내지 않는다(소수 수강 과목은 백분위가
      한 명 차이로 20%p 씩 튄다 — 없는 편이 낫다)

  ## ⚠️ 뒤의 두 조건이 없으면 등급과 백분위가 **다른 과목 집합**을 잰다 (2026-09-05 실제 사고)

  ① **`category='regular'` 만으로는 석차등급 산출 과목을 가를 수 없다.** `과학탐구실험` 은
     regular 로 저장돼 있지만 석차등급이 없다(라이브 894행 전부). 게다가 216명 중 183명이
     만점이라 **만점을 받아도 상위 42.4%** 다 — 이런 과목의 백분위는 원리적으로 무의미하다.
     실제 사고: 00-00239 의 1-2 과학이 통합과학 99점(상위 0.93% · 1등급)인데 이수단위 가중
     평균이 과학탐구실험 42.4% 에 끌려 **상위 11.3%** 로 표시됐다(등급 1 · 백분위 11%).
     영향 실측 — 1-1 866칸 중 390칸 · 1-2 642칸 중 394칸이 1%p 이상 틀어졌고 최대 20.8%p.

  ② **전입생은 전 학교 성적을 들고 온다.** 과목평균은 그 과목 전체 수강자 기준이라 같은
     묶음 안에서 하나여야 하는데, 그 행만 자기 학교 평균이 적혀 있다(실측 8명 49행) —
     즉 다른 모집단의 원점수다. 뺐더니 공표 석차등급 재현에서 **±1등급 밖이 사라졌다**
     (99.8~99.9% → 전부 100.0%).

  ⚠️ 여기서 나오는 값은 **그 과목을 들은 집단 안의 위치**다. 교과군 표의 `pct_adj`(수강
  집단 보정 후 전교 위치)와는 뜻이 다르므로 같은 칸에 나란히 두지 말 것.
*/
export const NAESIN_PCT_MIN_GROUP = 30;

export interface SubjectPercentileEntry {
  pct: number;
  /** 그 묶음의 인원 — 표본이 작을수록 백분위 해상도가 거칠다는 것을 화면이 말해야 한다 */
  n: number;
}

/** 키 = `학년-학기-과목명` */
export type SubjectPercentileMap = Record<string, SubjectPercentileEntry>;

export function buildSubjectPercentiles(
  cohort: readonly { id: string; academic_development?: readonly Section6Record[] | null }[],
  studentId: string
): SubjectPercentileMap {
  const cohortOf = (id: string) => String(id ?? '').slice(0, 2);
  type Row = { score: number; average: number | null; owner: boolean; key: string };
  const groups = new Map<string, Row[]>();

  for (const st of cohort) {
    const mine = st.id === studentId;
    for (const r of st.academic_development ?? []) {
      // 석차등급이 없는 과목(과학탐구실험 등)은 등급 경로도 쓰지 않는다 — 위 ① 참고
      if (r?.category !== 'regular' || r.score == null || r.rank == null) continue;
      const key = `${cohortOf(st.id)}|${r.grade}|${r.semester}|${r.subject}`;
      const bucket = groups.get(key);
      const entry: Row = {
        score: Number(r.score),
        average: r.average == null ? null : Number(r.average),
        owner: mine,
        key: `${r.grade}-${r.semester}-${r.subject}`,
      };
      if (bucket) bucket.push(entry); else groups.set(key, [entry]);
    }
  }

  const out: SubjectPercentileMap = {};
  for (const raw of groups.values()) {
    /* 전 학교 성적 제외 — 위 ② 참고. 평균이 없는 행은 판정할 수 없어 그대로 둔다. */
    const known = raw.map(r => r.average).filter((v): v is number => v != null);
    let rows = raw;
    if (known.length >= 10) {
      const tally = new Map<number, number>();
      for (const v of known) tally.set(v, (tally.get(v) ?? 0) + 1);
      let common = known[0];
      let best = 0;
      for (const [v, c] of tally) if (c > best) { best = c; common = v; }
      rows = raw.filter(r => r.average == null || r.average === common);
    }
    if (rows.length < NAESIN_PCT_MIN_GROUP) continue;
    const owned = rows.filter(r => r.owner);
    if (owned.length === 0) continue;   // 내 과목이 아닌 묶음은 셀 필요가 없다
    const scores = rows.map(r => r.score);
    const n = scores.length;
    for (const r of owned) {
      let higher = 0;
      let tied = 0;
      for (const s of scores) {
        if (s > r.score) higher += 1;
        else if (s === r.score) tied += 1;
      }
      out[r.key] = { pct: ((higher + tied / 2) / n) * 100, n };
    }
  }
  return out;
}

/**
 * 석차등급 누적 컷(상위 %) — **`ml/future_subjects.py` 의 `CUTS` 와 같은 값이어야 한다.**
 * 어긋나면 파이프라인이 낸 등급과 화면이 계산한 등급이 조용히 갈린다.
 */
const GRADE_CUTS: Record<number, number[]> = {
  9: [4, 11, 23, 40, 60, 77, 89, 96],
  5: [10, 34, 66, 90],
};

/**
 * 상위 % → **소수점 석차등급**. 등급컷 안의 위치를 보간한다.
 *
 * 계산의 정본이 백분위인데 화면이 정수 등급만 보여 주면 그 해상도를 마지막에 버리게 된다
 * (5등급제 3등급 = 상위 34~68% 를 한 숫자로 뭉갠다). 그래서 정수 등급 옆에 이 값을 함께 적는다.
 *
 * 파이프라인이 `grade_exact` 를 담아 주면 그것을 쓰고, **옛 스냅샷**이나 화면이 직접 평균 낸
 * 백분위에는 이 함수를 쓴다 — 두 경로가 같은 컷을 봐야 값이 어긋나지 않는다.
 *
 * 상위 0% → 1.00, 정확히 1등급컷 → 2.00. 마지막 등급은 100% 를 상한으로 본다.
 */
export function gradeFromTopPctExact(topPct: number, system: number): number {
  const cuts = GRADE_CUTS[system] ?? GRADE_CUTS[9];
  const top = Math.min(Math.max(topPct, 0), 100);
  let lo = 0;
  for (let i = 0; i < cuts.length; i += 1) {
    if (top <= cuts[i]) {
      const span = cuts[i] - lo;
      return i + 1 + fracInBand(top - lo, span);
    }
    lo = cuts[i];
  }
  return cuts.length + 1 + fracInBand(top - lo, 100 - lo);
}

/**
 * 구간 안 위치를 [0, 0.99] 로 낸다.
 *
 * **0.99 상한이 필요하다** — 컷은 `상위% <= cut` 이면 그 등급이므로 정확히 컷에 선 학생은
 * 여전히 그 등급인데, 보간을 그대로 두면 소수값이 정확히 다음 정수가 되어 `1등급 · 2.00`
 * 처럼 두 표시가 서로를 부정한다. 상한을 두면 **소수부의 정수 부분이 항상 제도 등급과 같다**.
 * 잃는 것은 2자리 표시에서 0.01 뿐이다.
 */
function fracInBand(offset: number, span: number): number {
  if (span <= 0) return 0;
  return Math.min(offset / span, 0.99);
}

/** 상위 % → 제도 등급(정수). `ml/future_subjects.py` 의 `grade_from_top_pct` 와 같은 규칙. */
export function gradeFromTopPct(topPct: number, system: number): number {
  const cuts = GRADE_CUTS[system] ?? GRADE_CUTS[9];
  for (let i = 0; i < cuts.length; i += 1) {
    if (topPct <= cuts[i]) return i + 1;
  }
  return cuts.length + 1;
}

/** 내신 × 모의 산점의 격자 폭(%p). 위 `buildCompetitivenessScatter` 주석에 근거를 적었다. */
export const COMPETITIVENESS_BIN = 10;

/** 내신 × 모의 산점의 한 점. `n` 은 그 칸에 겹친 학생 수(원 크기). */
export interface CompetitivenessPoint {
  /** 모의고사 백분위 평균(국·수·영, 클수록 우수) */
  mockPct: number;
  /** 내신 위치를 **백분위로 뒤집은 값**(클수록 우수) — 상위 %가 아니다 */
  naesinPct: number;
  n: number;
  names: string[];
}

/** 상관계수(피어슨). 점이 2개 미만이거나 한쪽이 상수면 null. */
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * 내신 백분위 × 모의 백분위 산점 — **이 집단이 어떤 집단인지 한 장으로** (2026-09-05 사용자 요청).
 *
 * 종전 자리에는 교과군별 평균등급 막대가 있었는데, 막대 다섯 개의 높이는 이미 표가 숫자로
 * 말하는 것이라 새로 알려 주는 것이 없었다. 두 축을 함께 놓으면 **한 축으로는 볼 수 없는
 * 것**이 보인다 — 대각선에서 벗어난 학생이 곧 "내신에 비해 모의가 강한/약한" 학생이고,
 * 구름이 어느 사분면에 뭉쳐 있는지가 그 집단의 성격이다.
 *
 * ## 두 축을 모두 **클수록 우수**로 맞춘다
 * 모의 백분위는 원래 그렇지만 내신은 `pct_adj`(상위 %)라 작을수록 우수다. 그대로 그리면
 * 축의 방향이 서로 반대라 좌상향·우하향이 무엇을 뜻하는지 매번 다시 생각해야 하고,
 * "대각선 위/아래"라는 가장 쓸모 있는 읽기가 성립하지 않는다. `100 − 상위%` 로 뒤집는다.
 *
 * ## 격자 폭 = 10%p — 재보고 정했다 (2026-09-05 사용자 지시)
 * "완전히 같은 기록"만 묶으면 원이 거의 다 1명짜리라 크기가 정보를 담지 못하고, 너무 넓으면
 * 등급 두 칸을 뭉개 뜻이 사라진다. 라이브 3개 학년에서 재니 — 5%p 는 원의 **46~53% 가
 * 1명짜리**(사용자가 "지나치게 촘촘"이라 한 상태), 20%p 는 원이 16~20개로 줄어 분포가
 * 사라졌다. **10%p 에서 1명짜리 20~29% · 칸당 중앙 3~4명 · 최대 10~16명**으로 크기 차이가
 * 읽힌다.
 *
 * ## 원 크기 = 그 칸에 겹친 학생 수
 * 630명을 그대로 찍으면 점이 서로 덮여 밀집한 곳이 오히려 옅어 보인다. `bin`(기본 5%p)
 * 격자로 묶어 **겹친 수를 크기로** 옮긴다 — 뭉친 곳이 실제로 크게 보인다.
 *
 * @param rows 학생별 (이름, 모의 백분위, 내신 상위%)
 */
export function buildCompetitivenessScatter(
  rows: { name: string; mockPct: number; naesinTopPct: number }[],
  bin = COMPETITIVENESS_BIN
): { points: CompetitivenessPoint[]; count: number; correlation: number | null; maxN: number } {
  const cells = new Map<string, CompetitivenessPoint>();
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.mockPct) || !Number.isFinite(r.naesinTopPct)) continue;
    const x = Math.min(Math.max(r.mockPct, 0), 100);
    const y = 100 - Math.min(Math.max(r.naesinTopPct, 0), 100);
    xs.push(x); ys.push(y);
    /* 격자 중심에 찍는다 — 경계에 찍으면 축 끝에서 원이 잘린다 */
    const cx = Math.min(Math.floor(x / bin) * bin + bin / 2, 100 - bin / 2);
    const cy = Math.min(Math.floor(y / bin) * bin + bin / 2, 100 - bin / 2);
    const key = `${cx}|${cy}`;
    const got = cells.get(key);
    if (got) { got.n += 1; got.names.push(r.name); }
    else cells.set(key, { mockPct: cx, naesinPct: cy, n: 1, names: [r.name] });
  }
  const points = [...cells.values()].sort((a, b) => a.n - b.n);   // 큰 원이 위에 오도록
  return {
    points,
    count: xs.length,
    correlation: pearson(xs, ys),
    maxN: points.reduce((m, p) => Math.max(m, p.n), 0),
  };
}

/**
 * 내신 × 모의 산점의 **모의 축 재료** — 코호트 전체가 **같은 회차**를 쓰게 고른다.
 *
 * ## 왜 회차를 고정하는가 (2026-09-05 사용자 지적으로 발견)
 * 종전에는 학생마다 "자기 최근 회차"를 썼는데, 3학년 실측에서 그 회차가 **7종**으로 갈렸다
 * (2025-03 ~ 2026-07, 1년 전 회차를 쓰는 학생 11명). 회차가 다르면 난이도·응시 집단이 달라
 * 백분위를 같은 축에 놓을 수 없다 — 그림은 그려지는데 비교가 성립하지 않는다.
 *
 * ## `percentile === 0` 은 결측이다
 * 실측 확인: 2026-07 회차의 한 학생은 `화법과작문`이 `grade 5 · raw 48` 인데 `percentile 0`
 * (표준점수도 null)이었다. 그 회차 성적 처리가 덜 된 것이지 최하위가 아니다. 그대로 평균에
 * 넣으면 **내신 상위 9% 학생이 모의 최하위로 찍힌다**(사용자가 발견한 바로 그 점).
 * 미응시를 0 으로 적는 이 저장소 규약(`grade = 0`)과 같은 부류다.
 *
 * ## 축은 **국어·수학**이다
 * 영어·한국사는 절대평가라 `mock_result` 에 백분위가 아예 없다(실측: 영어 `percentile` 이
 * 전 회차 null). "국·수·영 평균"이라 적으면 화면이 거짓말을 한다.
 *
 * @returns 고른 회차와 학생별 평균 백분위. 쓸 만한 회차가 없으면 `round: null`.
 */
export function buildCohortMockPercentile(
  students: { id: string; mock_result?: MockExamResult[] | null }[],
  minShare = 0.9
): { round: { year: number; month: number } | null; byId: Map<string, number> } {
  /** 회차 -> 학생 -> 계열별 백분위 */
  const perRound = new Map<string, Map<string, Partial<Record<MockCore, number>>>>();
  for (const st of students) {
    for (const exam of st.mock_result ?? []) {
      if (!exam?.subjects || exam.academic_year == null || exam.exam_month == null) continue;
      const key = `${exam.academic_year}-${exam.exam_month}`;
      let byStu = perRound.get(key);
      if (!byStu) { byStu = new Map(); perRound.set(key, byStu); }
      let fam = byStu.get(st.id);
      if (!fam) { fam = {}; byStu.set(st.id, fam); }
      for (const [name, v] of Object.entries(exam.subjects)) {
        /* 영어는 백분위가 없으므로 국어·수학만 잡힌다 */
        const f = MOCK_SUBJECT_FAMILY[name];
        const p = v?.percentile;
        if (f && f !== 'english' && fam[f] == null
            && typeof p === 'number' && p > 0 && p <= 100) fam[f] = p;
      }
    }
  }

  const rounds = [...perRound.entries()].map(([key, byStu]) => {
    const [year, month] = key.split('-').map(Number);
    let n = 0;
    for (const fam of byStu.values()) if (Object.keys(fam).length > 0) n += 1;
    return { year, month, n, byStu };
  });
  if (rounds.length === 0) return { round: null, byId: new Map() };

  /*
    ## 회차 고르기 — **최신 학년도 안에서** 가장 최근이면서 인원이 충분한 회차

    ① 최신 회차만 잡으면 아직 성적이 덜 들어온 회차에 걸린다(3학년 2026-07 은 백분위
       보유 161명, 같은 해 2026-06 은 190명).
    ② 그렇다고 전 기간에서 인원 최대치를 기준 삼으면 **1년 전 회차로 되돌아간다** —
       3학년의 역대 최대는 2025-09 의 209명이라 90% 문턱이 188 로 올라가 2026 회차가
       전부 탈락했다(실제로 그렇게 골라졌다). 학년도가 다르면 그때는 다른 학년이었으므로
       "이 집단의 지금"을 그리는 이 그림의 재료가 될 수 없다.

    그래서 **최신 학년도로 먼저 좁힌 뒤** 그 안에서 최대치의 `minShare` 이상인 가장 최근
    회차를 고른다. 실측 결과 세 학년 모두 2026-06 으로 모인다.
  */
  const latestYear = Math.max(...rounds.map(r => r.year));
  const inYear = rounds.filter(r => r.year === latestYear);
  const best = Math.max(...inYear.map(r => r.n));
  const picked = inYear
    .sort((a, b) => b.month - a.month)
    .find(r => r.n >= best * minShare);
  if (!picked) return { round: null, byId: new Map() };

  const byId = new Map<string, number>();
  for (const [id, fam] of picked.byStu) {
    const vals = Object.values(fam).filter((v): v is number => typeof v === 'number');
    if (vals.length > 0) byId.set(id, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return { round: { year: picked.year, month: picked.month }, byId };
}
