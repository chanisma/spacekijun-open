// ========================================
// 학교 지필평가 분석 — 순수 모듈 (React·supabase 비의존)
//
// 입력은 셋이다:
//   1) 학생 한 명의 응시 결과 1행 (school_exam_result)
//   2) 그 과목의 문항 메타 (school_exam_question)
//   3) 학년(=그 과목 응시자 전체) 통계 (get_school_exam_subject_analysis RPC)
//
// **인덱스 규약이 이 모듈의 전부다**: `answers[i]`/`correct[i]`는 선택형 문항 `i+1`번이다.
// 서답형은 학생별 정오가 없어(NEIS 미제공) 배열에 들어가지 않으므로, 문항 메타를 찾을 때
// answerType='선택형'을 반드시 함께 걸어야 한다 — 선택형·서답형 문항번호가 각각 1부터
// 시작하기 때문에 번호만으로 찾으면 서답형 1번이 선택형 1번 자리에 들어온다.
// ========================================

import {
  bandFromDesignated,
  classifySchoolDifficulty,
  isDifficultyGap,
  DIFFICULTY_ORDER,
  DIFFICULTY_WEIGHT,
  type DifficultyBand,
} from './difficulty';
import type { SchoolExamDifficulty } from './schoolExamCsv';

// ── DB 행 모양 ──────────────────────────────────────────────

export interface SchoolExamQuestionRow {
  academic_year: number;
  semester: number;
  exam_round: number;
  exam_name: string;
  grade: number;
  subject_section: string;
  subject_name: string;
  answer_type: '선택형' | '서답형';
  problem_number: number;
  content_area: string | null;
  designated_difficulty: SchoolExamDifficulty | null;
  points: number | null;
  answer: string | null;
  has_multiple_answers: boolean;
  standard_code: string | null;
  standard_text: string | null;
  subject_max_score: number | null;
}

export interface SchoolExamResultRow {
  student_code: string;
  academic_year: number;
  semester: number;
  exam_round: number;
  exam_name: string;
  grade: number;
  subject_section: string;
  subject_name: string;
  selective_score: number | null;
  descriptive_score: number | null;
  total_score: number | null;
  answers: string[] | null;
  correct: boolean[] | null;
  meta: Record<string, unknown> | null;
}

/** get_school_exam_subject_analysis RPC 반환 형태 */
export interface SchoolExamCohort {
  cohort: { count: number; avg: number | null; max: number | null; min: number | null; stddev: number | null } | null;
  student: { total_score: number | null; rank: number; cohort_count: number; percentile: number | null } | null;
  items: Array<{ problem_number: number; correct_count: number; answered_count: number; correct_rate: number | null }>;
  areas: Array<{ content_area: string; correct_count: number; answered_count: number; wrong_rate: number | null }>;
  standards: Array<{ standard_code: string; standard_text: string | null; correct_count: number; answered_count: number; wrong_rate: number | null }>;
}

// ── 문항별 표 ───────────────────────────────────────────────

export interface SchoolExamItemRow {
  problemNumber: number;
  studentAnswer: string;
  correctAnswer: string | null;
  hasMultipleAnswers: boolean;
  isCorrect: boolean;
  points: number | null;
  contentArea: string | null;
  standardCode: string | null;
  standardText: string | null;
  designatedDifficulty: SchoolExamDifficulty | null;
  /** 학년(=그 과목 응시자) 정답률 0~100 */
  schoolCorrectRate: number | null;
  /** 정답률에서 구한 밴드 */
  actualBand: DifficultyBand;
  /** 교사 지정 난이도를 같은 축으로 옮긴 밴드 */
  designatedBand: DifficultyBand;
  /** 지정 난이도와 실제가 2단계 어긋났는가 */
  difficultyGap: boolean;
  /**
   * 반 학생 다수가 맞힌 문항을 나 혼자 틀렸는가(정답률 80% 이상인데 오답).
   * 실수·개념 구멍을 가려내는 데 취약 영역 집계보다 직접적이다.
   */
  missedEasy: boolean;
}

export function buildItemRows(
  result: SchoolExamResultRow,
  questions: SchoolExamQuestionRow[],
  cohort: SchoolExamCohort | null
): SchoolExamItemRow[] {
  const answers = result.answers ?? [];
  const correct = result.correct ?? [];

  const byNumber = new Map<number, SchoolExamQuestionRow>();
  for (const q of questions) {
    if (q.answer_type !== '선택형') continue; // 문항번호가 구분별로 1부터라 반드시 걸러야 한다
    byNumber.set(q.problem_number, q);
  }
  const rateByNumber = new Map<number, number | null>();
  for (const item of cohort?.items ?? []) {
    rateByNumber.set(item.problem_number, item.correct_rate);
  }

  const rows: SchoolExamItemRow[] = [];
  for (let i = 0; i < answers.length; i++) {
    const problemNumber = i + 1;
    const q = byNumber.get(problemNumber);
    const rate = rateByNumber.get(problemNumber) ?? null;
    const actualBand = classifySchoolDifficulty(rate);
    const designatedBand = bandFromDesignated(q?.designated_difficulty ?? null);
    const isCorrect = correct[i] === true;

    rows.push({
      problemNumber,
      studentAnswer: answers[i] ?? '',
      correctAnswer: q?.answer ?? null,
      hasMultipleAnswers: q?.has_multiple_answers ?? false,
      isCorrect,
      points: q?.points ?? null,
      contentArea: q?.content_area ?? null,
      standardCode: q?.standard_code ?? null,
      standardText: q?.standard_text ?? null,
      designatedDifficulty: q?.designated_difficulty ?? null,
      schoolCorrectRate: rate,
      actualBand,
      designatedBand,
      difficultyGap: isDifficultyGap(designatedBand, actualBand),
      missedEasy: !isCorrect && rate != null && rate >= 80,
    });
  }
  return rows;
}

// ── 영역·성취기준 집계 ──────────────────────────────────────

export interface SchoolExamGroupStat {
  key: string;
  label: string;
  /** 성취기준 집계에서만 채워진다 */
  description: string | null;
  wrongCount: number;
  totalCount: number;
  /** 내 오답률 0~100 */
  wrongRate: number;
  /** 학년 평균 오답률 0~100. 코호트 데이터가 없으면 null. */
  cohortWrongRate: number | null;
  /** 내 오답률 − 학년 오답률. 양수면 이 영역이 남들보다 약하다. */
  gap: number | null;
  /** 난이도 가중 취약도 — 어려운 문항 오답에 더 큰 값을 준다 */
  score: number;
  byDifficulty: Record<DifficultyBand, { wrong: number; total: number }>;
}

function emptyByDifficulty(): SchoolExamGroupStat['byDifficulty'] {
  return {
    '상': { wrong: 0, total: 0 },
    '중': { wrong: 0, total: 0 },
    '하': { wrong: 0, total: 0 },
    '미분류': { wrong: 0, total: 0 },
  };
}

function aggregate(
  rows: SchoolExamItemRow[],
  keyOf: (row: SchoolExamItemRow) => string | null,
  labelOf: (row: SchoolExamItemRow) => string,
  descriptionOf: (row: SchoolExamItemRow) => string | null,
  cohortWrongRates: Map<string, number | null>
): SchoolExamGroupStat[] {
  const map = new Map<string, SchoolExamGroupStat>();

  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    let stat = map.get(key);
    if (!stat) {
      stat = {
        key,
        label: labelOf(row),
        description: descriptionOf(row),
        wrongCount: 0,
        totalCount: 0,
        wrongRate: 0,
        cohortWrongRate: cohortWrongRates.get(key) ?? null,
        gap: null,
        score: 0,
        byDifficulty: emptyByDifficulty(),
      };
      map.set(key, stat);
    }
    stat.totalCount += 1;
    stat.byDifficulty[row.actualBand].total += 1;
    if (!row.isCorrect) {
      stat.wrongCount += 1;
      stat.byDifficulty[row.actualBand].wrong += 1;
      stat.score += DIFFICULTY_WEIGHT[row.actualBand];
    }
  }

  const stats = Array.from(map.values());
  for (const stat of stats) {
    stat.wrongRate = stat.totalCount > 0 ? Math.round((stat.wrongCount / stat.totalCount) * 100) : 0;
    stat.gap = stat.cohortWrongRate == null
      ? null
      : Math.round((stat.wrongRate - stat.cohortWrongRate) * 10) / 10;
    stat.score = Math.round(stat.score * 100) / 100;
  }

  // 학년 대비 격차가 큰 순 → 취약도 점수 순. 격차를 모르면 점수만 본다.
  stats.sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity) || b.score - a.score);
  return stats;
}

export function buildAreaStats(
  rows: SchoolExamItemRow[],
  cohort: SchoolExamCohort | null
): SchoolExamGroupStat[] {
  const cohortRates = new Map<string, number | null>();
  for (const area of cohort?.areas ?? []) cohortRates.set(area.content_area, area.wrong_rate);
  return aggregate(
    rows,
    (r) => r.contentArea,
    (r) => r.contentArea ?? '기타',
    () => null,
    cohortRates
  );
}

export function buildStandardStats(
  rows: SchoolExamItemRow[],
  cohort: SchoolExamCohort | null
): SchoolExamGroupStat[] {
  const cohortRates = new Map<string, number | null>();
  for (const std of cohort?.standards ?? []) cohortRates.set(std.standard_code, std.wrong_rate);
  return aggregate(
    rows,
    (r) => r.standardCode,
    (r) => r.standardCode ?? '기타',
    (r) => r.standardText,
    cohortRates
  );
}

// ── 과목 요약 ───────────────────────────────────────────────

export interface SchoolExamSummary {
  selectiveScore: number | null;
  descriptiveScore: number | null;
  totalScore: number | null;
  maxScore: number | null;
  cohortCount: number;
  cohortAvg: number | null;
  /** 상위 몇 % (1 = 최상위). 응시자가 적으면 거칠어지므로 cohortCount와 함께 보여줄 것. */
  percentile: number | null;
  rank: number | null;
  /** 총점 − 학년 평균 */
  diffFromAvg: number | null;
  correctCount: number;
  itemCount: number;
  /** 정답률 80% 이상인데 틀린 문항 수 */
  missedEasyCount: number;
  /** NEIS 채점이 아직 안 끝나 우리가 정답 대조로 채운 결과인가 */
  derivedScoring: boolean;
}

export function buildSummary(
  result: SchoolExamResultRow,
  questions: SchoolExamQuestionRow[],
  cohort: SchoolExamCohort | null,
  rows: SchoolExamItemRow[]
): SchoolExamSummary {
  const totalScore = result.total_score;
  const cohortAvg = cohort?.cohort?.avg ?? null;
  return {
    selectiveScore: result.selective_score,
    descriptiveScore: result.descriptive_score,
    totalScore,
    maxScore: questions.find((q) => q.subject_max_score != null)?.subject_max_score ?? null,
    cohortCount: cohort?.cohort?.count ?? 0,
    cohortAvg,
    percentile: cohort?.student?.percentile ?? null,
    rank: cohort?.student?.rank ?? null,
    diffFromAvg:
      totalScore != null && cohortAvg != null
        ? Math.round((totalScore - cohortAvg) * 10) / 10
        : null,
    correctCount: rows.filter((r) => r.isCorrect).length,
    itemCount: rows.length,
    missedEasyCount: rows.filter((r) => r.missedEasy).length,
    derivedScoring: (result.meta as { scoring?: string } | null)?.scoring === 'derived',
  };
}

/** 난이도 밴드별 내 정오 — 요약 카드의 작은 막대용 */
export function buildDifficultyBreakdown(
  rows: SchoolExamItemRow[]
): Array<{ band: DifficultyBand; wrong: number; total: number; wrongRate: number }> {
  return DIFFICULTY_ORDER.map((band) => {
    const inBand = rows.filter((r) => r.actualBand === band);
    const wrong = inBand.filter((r) => !r.isCorrect).length;
    return {
      band,
      wrong,
      total: inBand.length,
      wrongRate: inBand.length > 0 ? Math.round((wrong / inBand.length) * 100) : 0,
    };
  }).filter((entry) => entry.total > 0);
}
