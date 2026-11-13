/**
 * Grade Scale Utility — 5등급제 vs 9등급제 판별
 *
 * 2022 개정 교육과정(2025학년도 입학)부터 고교 내신은 전 학년 5등급제로 전환됨.
 * 즉 admission_year >= 2025 인 학생은 1·2·3학년 모두 5등급제, 그 이전 입학자는 전 학년 9등급제.
 *
 * 코호트 역산 — currentAcademicYear는 course-analyze 컨텍스트의 "수강(delivery) 연도"이고
 * (= 신청연도 + 1), currentGrade는 "신청 시점의 학년"(round.target_grade)이다. 신청은 수강
 * 1년 전에 이뤄지므로 신청연도 = currentAcademicYear - 1, 그 시점 학년 = currentGrade. 따라서:
 *   admission_year = (신청연도) - (currentGrade - 1)
 *                  = (currentAcademicYear - 1) - (currentGrade - 1)
 *                  = currentAcademicYear - currentGrade
 * 예) academic_year=2026, grade=2 (신청 학년도 2025의 2학년) → 2024 입학 → 9등급제.
 *     academic_year=2027, grade=2 (신청 학년도 2026의 2학년) → 2025 입학 → 5등급제.
 *
 * (주의: 과거엔 currentAcademicYear를 "그 학년인 해"로 오인해 -(currentGrade-1)만 빼서
 *  입학연도를 +1 과대평가 → 2025학년도 2학년을 5등급으로 오판하는 버그가 있었다.)
 *
 * currentAcademicYear가 null이면 (JSON-only 모드 등) currentGrade로만 판단하는
 * 레거시 폴백: 1학년은 5등급, 그 외는 9등급.
 */

// 5등급제 컷오프 (누적 비율)
export const GRADE_CUTOFFS_5 = {
  1: 0.10,
  2: 0.34,
  3: 0.66,
  4: 0.90,
  5: 1.00,
} as const;

// 9등급제 컷오프 (누적 비율)
export const GRADE_CUTOFFS_9 = {
  1: 0.04,
  2: 0.11,
  3: 0.23,
  4: 0.40,
  5: 0.60,
  6: 0.77,
  7: 0.89,
  8: 0.96,
  9: 1.00,
} as const;

// 5등급제 전환 기준 입학연도 (2022 개정 교육과정 시행)
const FIVE_TIER_FROM_ADMISSION_YEAR = 2025;

export interface GradeScaleInput {
  currentGrade: number;
  currentAcademicYear: number | null;
}

/**
 * 해당 (학년, 학년도) 조합이 5등급제인지 판정.
 */
export function isFiveTierScale({ currentGrade, currentAcademicYear }: GradeScaleInput): boolean {
  if (currentAcademicYear == null) {
    return currentGrade === 1;
  }
  const admissionYear = currentAcademicYear - currentGrade;
  return admissionYear >= FIVE_TIER_FROM_ADMISSION_YEAR;
}

/**
 * 해당 컨텍스트에서 사용해야 할 등급 컷오프 반환.
 */
export function getGradeCutoffs(
  input: GradeScaleInput
): Record<number, number> {
  return isFiveTierScale(input) ? GRADE_CUTOFFS_5 : GRADE_CUTOFFS_9;
}

/**
 * 예상등급 적용 최소 수강생 수 (5등급제 5명, 9등급제 13명).
 */
export function getMinStudentsForEstimate(input: GradeScaleInput): number {
  return isFiveTierScale(input) ? 5 : 13;
}

/**
 * 등급 분포 표시용 최대 등급 (5등급제 5, 9등급제 9).
 */
export function getMaxGradeLevel(input: GradeScaleInput): number {
  return isFiveTierScale(input) ? 5 : 9;
}
