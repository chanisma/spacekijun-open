/**
 * 모의고사 추이 차트용 순수 변환 로직 (DOM·recharts 비의존).
 *
 * evalog의 `MockExamGrades`와 같은 그림을 그리지만 과목 계열 매핑은 이 feature가 이미 가진
 * `MOCK_SUBJECT_FAMILY`(analysisUtils)를 재사용한다 — 3학년 회차는 국어/수학이 선택과목명
 * (미적분·언어와매체…)으로 기록되므로 계열로 묶지 않으면 같은 과목이 학년마다 다른 라인으로 쪼개진다.
 *
 * 회귀: npx tsx scripts/mock-exam-trend-test/run.mts
 */

import {
  MOCK_SUBJECT_FAMILY,
  normalizeMockSubjectName,
  type MockExamResult,
} from './analysisUtils';

export type MockTrendMetric = 'grade' | 'percentile' | 'standard_score';

/** 전과목 평균 라인의 시리즈 키 (등급 지표에서만 생성) */
export const ALL_SUBJECTS_SERIES = '전과목';

/** 그룹 라인이 어느 원본 과목에서 왔는지 툴팁에 보여주기 위한 메타 키 접두사 */
export const SOURCE_KEY_PREFIX = '__src_';

const FAMILY_LABEL: Record<'korean' | 'math' | 'english', string> = {
  korean: '국어',
  math: '수학',
  english: '영어',
};

/**
 * 성적이 아니라 "이 영역은 응시하지 않음" 표시로 들어온 키. 라이브 데이터에 8건 있고
 * grade 9 / percentile 0.47 같은 값을 달고 있어 라인으로 그리면 추이를 왜곡한다.
 */
const EXCLUDED_SERIES = new Set(['미응시']);

/**
 * 1·2학년 통합사회/통합과학의 표기 변형 → 대표명으로 통합 (표시 전용).
 *
 * 라이브 확인(2026-08): 한 회차에는 이 중 하나만 나타나고 개별 탐구 과목(생활과윤리 등)과는
 * 단 한 건도 공존하지 않는다 — 즉 영역 합산이 아니라 같은 과목의 업로드 양식별 다른 이름이다.
 * 통합하지 않으면 학년이 올라갈 때마다 라인이 새로 생겨 추이가 끊겨 보인다.
 */
const INTEGRATED_SUBJECT_ALIASES: Record<string, string> = {
  '공통사회': '통합사회', '사회탐구': '통합사회', '사회': '통합사회',
  '공통과학': '통합과학', '과학탐구': '통합과학', '과학': '통합과학',
};

/** 라인 정렬 시 앞에 고정할 주요 과목 (나머지는 처음 등장한 순서) */
const PREFERRED_ORDER = ['국어', '수학', '영어', '한국사'];

/**
 * 탐구 과목 끝의 아라비아 숫자를 로마숫자 표기로 맞춘다 ('생명과학1' → '생명과학Ⅰ').
 * 2학년 9월 회차만 아라비아 표기로 업로드돼 있어(라이브 69건) 정규화하지 않으면
 * 같은 과목이 두 라인으로 갈라지고 그 회차에서 선이 끊긴다.
 */
function normalizeRomanSuffix(name: string): string {
  return name.replace(/1$/, 'Ⅰ').replace(/2$/, 'Ⅱ');
}

/**
 * 과목명 → 차트 라인 이름. 국어·수학 계열은 대표명으로 통합하고,
 * 그 외는 표기 흔들림을 정규화한다('사회문화' → '사회·문화', '공통사회' → '통합사회').
 */
export function mockSeriesName(subject: string): string {
  const family = MOCK_SUBJECT_FAMILY[subject];
  if (family) return FAMILY_LABEL[family];
  const integrated = INTEGRATED_SUBJECT_ALIASES[subject];
  if (integrated) return integrated;
  return normalizeRomanSuffix(normalizeMockSubjectName(subject));
}

/** 학년도 → 학년 → 월 순으로 회차를 시간순 정렬한다 (원본 배열 불변) */
export function sortMockExams(exams: MockExamResult[]): MockExamResult[] {
  return [...exams].sort((a, b) => {
    if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
    if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
    return a.exam_month - b.exam_month;
  });
}

/** X축 라벨: "3-6월" (학년-월). 학년이 함께 있어 연도가 달라도 겹치지 않는다. */
export function mockExamLabel(exam: MockExamResult): string {
  return `${exam.exam_grade}-${exam.exam_month}월`;
}

/**
 * 회차 전체에서 그릴 라인 목록. 계열 통합 후 중복을 제거하고 주요 과목을 앞으로 보낸다.
 * 합산성 과목(사회탐구 등)은 제외 — 개별 탐구 과목 라인과 이중으로 그려진다.
 */
export function collectMockSeries(exams: MockExamResult[]): string[] {
  const seen: string[] = [];
  for (const exam of exams) {
    for (const subject of Object.keys(exam.subjects ?? {})) {
      if (EXCLUDED_SERIES.has(subject)) continue;
      const name = mockSeriesName(subject);
      if (EXCLUDED_SERIES.has(name)) continue;
      if (!seen.includes(name)) seen.push(name);
    }
  }
  const preferred = PREFERRED_ORDER.filter(s => seen.includes(s));
  return [...preferred, ...seen.filter(s => !preferred.includes(s))];
}

/** 한 회차에서 특정 라인에 해당하는 값을 하나 고른다 (계열 내 과목은 회차당 1개라는 전제) */
function pickSeriesValue(
  exam: MockExamResult,
  series: string,
  metric: MockTrendMetric,
): { value: number | null; sourceSubject: string | null } {
  for (const [subject, score] of Object.entries(exam.subjects ?? {})) {
    if (EXCLUDED_SERIES.has(subject)) continue;
    if (mockSeriesName(subject) !== series) continue;
    const value = score?.[metric];
    if (value === null || value === undefined) continue;
    return { value, sourceSubject: subject !== series ? subject : null };
  }
  return { value: null, sourceSubject: null };
}

export interface MockTrendRow {
  label: string;
  /** 시리즈 값 + `__src_<시리즈>` 메타(원본 과목명) */
  [key: string]: string | number | null;
}

/**
 * recharts용 행 데이터. 각 행 = 회차 하나.
 *
 * 등급 지표일 때만 `전과목` 평균 라인을 함께 넣는다 — 백분위·표준점수는 과목마다 척도/모집단이
 * 달라 단순 평균이 오해를 부른다. 평균은 **계열 통합 후 값**으로 내므로 같은 과목이 선택과목명으로
 * 중복 기재돼도 두 번 세지 않는다.
 */
export function buildMockTrendData(
  exams: MockExamResult[],
  metric: MockTrendMetric,
  series: string[],
): MockTrendRow[] {
  return exams.map(exam => {
    const row: MockTrendRow = { label: mockExamLabel(exam) };
    const values: number[] = [];

    for (const name of series) {
      const { value, sourceSubject } = pickSeriesValue(exam, name, metric);
      row[name] = value;
      if (sourceSubject) row[`${SOURCE_KEY_PREFIX}${name}`] = sourceSubject;
      if (value !== null) values.push(value);
    }

    if (metric === 'grade') {
      row[ALL_SUBJECTS_SERIES] = values.length > 0
        ? parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
        : null;
    }
    return row;
  });
}

/** 그 지표에 실제 값이 하나라도 있는지 — 값이 없는 지표는 토글에서 감춘다 */
export function hasMetricData(exams: MockExamResult[], metric: MockTrendMetric): boolean {
  return exams.some(exam =>
    Object.values(exam.subjects ?? {}).some(score => {
      const v = score?.[metric];
      return v !== null && v !== undefined;
    }),
  );
}
