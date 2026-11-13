/**
 * 집단 분석의 **시험 목록 정렬·정리** 규칙.
 *
 * 훅 안의 useMemo 에 두면 테스트할 수 없는데, 두 규칙 모두 어긋나도 오류가 아니라
 * "목록이 이상해 보인다"로만 나타나 조용히 되돌아가기 쉽다. 순수 함수로 뺀다.
 */

export interface CohortExamRow {
  academic_year: number;
  exam_month: number;
  exam_grade: number;
  /** 이 회차에 마킹이 있는 인원 */
  studentCount: number;
}

/**
 * 같은 (연,월)에서 최다 학년 대비 이 비율 미만이면 감춘다.
 *
 * 1/210 은 지우고, 학년이 실제로 갈리는 회차(유급·편입이 눈에 띄는 규모)는 남기는 선.
 */
export const MINORITY_GRADE_RATIO = 0.1;

/**
 * **최신이 맨 위**로 정렬하고, 같은 달에 학년이 갈릴 때 소수 쪽을 감춘다.
 *
 * 정렬 키에 `exam_grade` 가 빠지면 안 된다. 회차 키는 (연,월,학년)인데 같은 (연,월)에
 * 학년이 다른 행이 **실제로 생긴다** — 2026년 3학년 코호트에 2025년 3·6·9월이 각각
 * '2학년 208명'과 '1학년 1명' 두 줄로 존재한다(2025년에 2학년으로 전입한 학생 1명의
 * 마킹에 응시 학년이 1로 붙었다). tie 가 무승부로 남으면 순서가 학생 명단 순서에 따라
 * 매번 달라져, 화면에서는 학년 숫자가 2→1→2→1 로 튀며 정렬이 깨진 것처럼 보인다.
 *
 * 감추는 것은 **같은 달에 경쟁하는 줄이 있을 때뿐**이다. 다른 달과 겹치지 않는 소규모
 * 회차(예: 일부만 응시한 8월)는 그대로 남는다.
 */
export function orderCohortExams<T extends CohortExamRow>(exams: T[]): T[] {
  const sorted = [...exams].sort(
    (a, b) =>
      b.academic_year - a.academic_year ||
      b.exam_month - a.exam_month ||
      // 그 집단의 진짜 회차(응시 인원 많은 쪽)를 위로
      b.studentCount - a.studentCount ||
      // 인원까지 같으면 학년으로 완전히 결정적이게
      b.exam_grade - a.exam_grade
  );

  const maxByMonth = new Map<string, number>();
  for (const e of sorted) {
    const key = `${e.academic_year}-${e.exam_month}`;
    maxByMonth.set(key, Math.max(maxByMonth.get(key) ?? 0, e.studentCount));
  }

  return sorted.filter((e) => {
    const max = maxByMonth.get(`${e.academic_year}-${e.exam_month}`) ?? e.studentCount;
    return e.studentCount === max || e.studentCount >= max * MINORITY_GRADE_RATIO;
  });
}
