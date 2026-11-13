/**
 * 모의고사 마킹 정오 판정 — **단일 출처**.
 *
 * 리로스쿨 마킹표는 **객관식만 채점해서 준다**. 수학 주관식은 정오가 아예 오지 않는데,
 * 그 결손이 두 가지 모양으로 나타난다(2026-09 라이브 실측):
 *
 *   1·2학년 수학      answers 30개 / correct **21개**  -> 문항 22~30 은 배열이 아예 짧다(undefined)
 *   3학년 수학 선택   answers 30개 / correct **28개**  -> 문항 16~22 는 `null`, 문항 29~30 은 짧다
 *
 * 그래서 `correct[i] == null` 하나로는 절반만 잡힌다. 두 경우를 모두 결손으로 봐야 한다.
 * 다른 과목(국어·영어·탐구·한국사)은 answers 길이 == correct 길이에 null 0개라, 아래 fallback 은
 * 사실상 수학에서만 발동한다.
 *
 * **판정 우선순위**
 *   1순위 마킹 데이터의 `correct[i]` (리로스쿨이 채점해 준 값 — 있으면 무조건 이걸 쓴다)
 *   2순위 학생 답안 ↔ `mock_problems.answer` 대조
 *
 * **`answer_type` 을 보지 않는 이유**: 과거 적재분의 `answer_type` 이 부정확하다. 3학년 공통
 * 22번(답 '457')·기하 29번(답 '360') 같은 명백한 주관식이 `'객관식'` 으로 저장돼 있다
 * (2026-07 이후 적재분만 선택률로 정확히 판정됨). "정오가 없으면 정답과 대조한다"는 규칙은
 * 출제 형식을 몰라도 성립하므로 그 오염에 영향받지 않는다.
 */
import type { MockMarkingSubject } from '@/features/evalog/types/student';
import type { MockProblem } from '../types';

/**
 * 마킹표에서 **답을 내지 못한 주관식**을 나타내는 값.
 *
 * 오답으로 센다. 데이터가 그렇게 말한다 — 2026-09 실측에서 0의 비율이 문항 난이도를 따라
 * 단조 증가한다(1학년 수학 22번 3.6% -> 30번 17.3%, 3학년 확통 16번 4.1% -> 21번 15.7%).
 * 마킹 누락이라면 문항별로 고르거나 학생 단위로 몰렸을 텐데 그렇지 않다. 즉 "못 풀어서 비운 칸"이고,
 * 이걸 미채점으로 빼면 **가장 못 푼 킬러문항이 취약점 분석에서 통째로 사라진다**.
 * 미응시 학생은 이와 달리 answers 배열 자체가 비어 있어 여기까지 오지 않는다.
 *
 * 정답이 `0` 인 문항은 없다(라이브 주관식 113문항 전수 확인)므로 무응답 마커와 충돌하지 않는다.
 */
export const NO_RESPONSE_ANSWER = 0;

/** 정오를 어디서 얻었는지 — UI 가 유도된 값을 구분해 표시할 수 있게 남긴다. */
export type GradeSource =
  /** 마킹표가 채점해 준 값 */
  | 'marking'
  /** 정오가 없어 정답과 대조해 유도한 값 */
  | 'answerKey'
  /** 채점 불가(정답 미상 또는 응시 기록 없음) */
  | 'none';

export interface GradedMarkingItem {
  problemNumber: number;
  studentAnswer: number | null;
  isCorrect: boolean | null;
  source: GradeSource;
}

/**
 * 이 과목에서 훑어야 할 문항 수.
 *
 * `item_count` 를 그대로 쓰면 안 된다 — 타입 주석대로 "빈칸 제외" 개수라 실제 문항 수보다 작다
 * (라이브 125블록: 영어 44/45, 수학 29/30). 루프 상한으로 쓰면 마지막 문항이 조용히 잘린다.
 * 세 값의 최대치를 쓰면 잘림 없이 안전하다(미응시 학생은 셋 다 0이라 그대로 0).
 */
export function getMarkingItemCount(subject: MockMarkingSubject): number {
  return Math.max(
    subject.item_count ?? 0,
    subject.answers?.length ?? 0,
    subject.correct?.length ?? 0
  );
}

/** 학생 답안과 정답 키가 같은가. 둘 다 정수 표기라 숫자로 맞춰 비교한다('07' vs '7' 방어). */
function answerMatchesKey(studentAnswer: number, answerKey: string): boolean {
  const key = answerKey.trim();
  if (String(studentAnswer) === key) return true;
  const keyNum = Number(key);
  return Number.isFinite(keyNum) && keyNum === studentAnswer;
}

/**
 * 정답 키로 채점해도 되는 값인가.
 *
 * `mock_problems.answer` 에는 소스 오염이 섞여 있다 — 통합사회 10행은 정답 자리에 단원명
 * ('환경과 행복ㅡ삶의 목적으로서의 행복')이 들어가 있다. 그런 값으로 대조하면 전부 오답이 되므로
 * **숫자로 읽히는 정답만** 채점에 쓰고 나머지는 미채점으로 남긴다. (통합사회는 마킹표에 정오가
 * 다 들어와 fallback 이 애초에 발동하지 않지만, 방어는 여기 한 곳에 둔다.)
 */
function isUsableAnswerKey(answerKey: string | null | undefined): answerKey is string {
  if (answerKey == null) return false;
  const key = answerKey.trim();
  return key !== '' && /^[0-9]+$/.test(key);
}

/**
 * 문항 하나의 정오. 마킹표 값이 있으면 그대로, 없으면 정답과 대조한다.
 *
 * @param marked   `correct[i]` — 배열이 짧아 `undefined` 로 들어오는 경우가 정상 경로다
 * @param studentAnswer `answers[i]`
 * @param problem  같은 문항번호의 `mock_problems` 행(없을 수 있다)
 */
export function resolveItemCorrectness(
  marked: boolean | null | undefined,
  studentAnswer: number | null | undefined,
  problem: Pick<MockProblem, 'answer'> | null | undefined
): { isCorrect: boolean | null; source: GradeSource } {
  if (marked === true || marked === false) {
    return { isCorrect: marked, source: 'marking' };
  }
  if (studentAnswer == null || !isUsableAnswerKey(problem?.answer)) {
    return { isCorrect: null, source: 'none' };
  }
  if (studentAnswer === NO_RESPONSE_ANSWER) {
    return { isCorrect: false, source: 'answerKey' };
  }
  return {
    isCorrect: answerMatchesKey(studentAnswer, problem.answer),
    source: 'answerKey',
  };
}

/**
 * 한 과목의 마킹 전체를 문항 단위로 채점한다.
 * `problemsByNumber` 는 `fetchMockProblems` 결과를 문항번호로 색인한 Map.
 */
export function gradeMarkingSubject(
  subject: MockMarkingSubject,
  problemsByNumber: Map<number, MockProblem>
): GradedMarkingItem[] {
  const count = getMarkingItemCount(subject);
  const items: GradedMarkingItem[] = [];

  for (let i = 0; i < count; i++) {
    const problemNumber = i + 1;
    const studentAnswer = subject.answers?.[i] ?? null;
    const { isCorrect, source } = resolveItemCorrectness(
      subject.correct?.[i],
      studentAnswer,
      problemsByNumber.get(problemNumber)
    );
    items.push({ problemNumber, studentAnswer, isCorrect, source });
  }

  return items;
}

/**
 * 과목 요약. 분모는 **채점된 문항 수**다 — 미채점 문항을 분모에 넣으면 정답률이 구조적으로
 * 낮게 나온다(fallback 이전 1·2학년 수학이 정확히 이 상태였다: 21문항만 채점하고 30으로 나눴다).
 */
export function summarizeGradedItems(items: GradedMarkingItem[]): {
  total: number;
  graded: number;
  correctCount: number;
  rate: string;
  derivedCount: number;
} {
  const graded = items.filter((it) => it.isCorrect !== null);
  const correctCount = graded.filter((it) => it.isCorrect === true).length;
  return {
    total: items.length,
    graded: graded.length,
    correctCount,
    rate: graded.length > 0 ? ((correctCount / graded.length) * 100).toFixed(1) : '0.0',
    derivedCount: items.filter((it) => it.source === 'answerKey').length,
  };
}
