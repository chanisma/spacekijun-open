/**
 * Estimated Grade Core — 예상등급 계산의 순수 로직 단일 출처
 *
 * 이 모듈이 생긴 이유: 순위 비교자가 `StudentEstimatedGradeTab`과 `EstimatedGradeTab`에
 * 통째로 복붙돼 있었고, 그 복붙본에 있던 결함이 두 화면에서 똑같이 재현됐다
 * (2026-08-25 — 전과목 1등급 학생의 한문 예상등급이 3등급으로 나온 사건).
 * React에 의존하지 않으므로 Node 회귀 스크립트가 그대로 import 한다.
 *
 * 회귀: `npx tsx scripts/course-estimated-grade-test/run.mts`
 */

import { isRankedCategory } from './subjectUtils';

/**
 * 한 학생을 과목 내에서 줄 세울 때 쓰는 두 값.
 * - categoryGrade: 그 과목이 속한 교과군의 평균 등급 (없으면 0)
 * - overallGrade: 전과목 가중 평균 등급 (없으면 0)
 */
export interface RankingGrades {
  categoryGrade: number;
  overallGrade: number;
}

/**
 * 순위 산정에 실제로 쓰는 등급 — 교과군 등급이 있으면 그것, 없으면 전체 평균.
 *
 * **폴백이지 분리가 아니다.** 예전 비교자는 "교과군 등급 보유자를 무조건 앞"에 두어
 * (미보유자는 전부 뒤로) 성적과 무관한 순위를 만들었다. 예: 1학년의 '기타' 교과군은
 * 등급이 나오는 과목이 '정보' 하나뿐이라 이수자 97명만 등급을 갖는데, 그 탓에
 * 전과목 1등급(1.00) 학생이 정보 미이수라는 이유만으로 전체평균 4.75인 학생보다
 * 뒤에 놓였다.
 *
 * 0은 "등급 미상"이며 비교에서 맨 뒤로 보낸다(0을 최우수로 읽으면 안 된다).
 */
export function effectiveRankingGrade({ categoryGrade, overallGrade }: RankingGrades): number {
  return categoryGrade > 0 ? categoryGrade : overallGrade;
}

/**
 * 과목 내 순위 정렬 비교자 (등급은 낮을수록 우수 → 오름차순).
 * 1차 = 유효 등급(교과군 우선·없으면 전체평균), 동점이면 2차 = 전체 평균.
 */
export function compareByRankingGrade(a: RankingGrades, b: RankingGrades): number {
  const effA = effectiveRankingGrade(a);
  const effB = effectiveRankingGrade(b);

  // 등급이 아예 없는 학생은 뒤로 (0 = 미상)
  if (!effA && !effB) return 0;
  if (!effA) return 1;
  if (!effB) return -1;

  if (effA !== effB) return effA - effB;

  // 동점이면 전체 평균으로 2차 비교
  if (!a.overallGrade && !b.overallGrade) return 0;
  if (!a.overallGrade) return 1;
  if (!b.overallGrade) return -1;
  return a.overallGrade - b.overallGrade;
}

/**
 * 순위 → 예상등급. 컷오프는 누적 비율이며 인원수로 반올림해 적용한다.
 * 예) 18명·4% → Math.round(18 * 0.04) = 1명까지 1등급.
 */
export function estimatedGradeFromRank(
  rank: number,
  total: number,
  cutoffs: Record<number, number>
): number {
  if (total === 0) return 0;
  for (const [grade, cutoff] of Object.entries(cutoffs)) {
    if (rank <= Math.round(total * cutoff)) return parseInt(grade, 10);
  }
  return Object.keys(cutoffs).length;
}

/**
 * 예상등급을 매기지 않는 사유.
 * - noRank: 석차등급이 산출되지 않는 교과(교양) — 순위 자체가 의미 없다
 * - minStudents: 수강 인원이 적어 등급 컷오프가 무의미
 */
export type ExcludeReason = 'noRank' | 'minStudents';

/**
 * 미적용 사유 판정. **순서가 의미를 가진다** — 등급 미산출 교과를 먼저 본다.
 * 교양은 인원이 많아도 등급이 없으므로 '인원 미달'로 표시하면 사실과 다르다.
 */
export function getEstimateExcludeReason(
  category: string,
  total: number,
  minStudentsForEstimate: number
): ExcludeReason | null {
  if (!isRankedCategory(category)) return 'noRank';
  if (total < minStudentsForEstimate) return 'minStudents';
  return null;
}
