// 내 성적 대비 적합도 (FitVerdict) 계산
//
// adiga 합격자 분위 컷(grade50=중위, grade70=하위 30% 선, 둘 다 9등급 척도)과
// 학생의 내신 평균 등급을 비교하는 **분위(Quantile) 기반 3-컷 판정**이다.
// 단, 1·2학년은 5등급제·3학년(2024 입학)은 9등급제라 등급 숫자를 직접 비교하면
// 안 되므로(같은 "2등급"이 척도마다 위치가 다름), 5등급제 학생은 9등급 척도로
// 환산한 뒤 컷(9등급)과 **등급을 직접 비교**한다.
// 환산 모형·검증은 `./gradeScaleConvert` 참조 (구 백분위 경계보간은 전 구간에서
// 평균 +0.34등급 불리하게 환산하는 편향이 있어 교체됨).
//
// 판정 기준 (등급은 낮을수록 우수):
//   - 25% 컷보다 우수 → 안정(safe)
//   - 50% 컷보다 우수 → 적정(fit)
//   - 70% 컷보다 우수 → 소신(reach)
//   - 70% 컷 미달     → 위험(danger)
// 25% 컷은 직접 데이터가 없어 50%·70% 컷에서 **대칭 외삽**(50→70 간격을 median 위로
// 한 칸 미러링): g25 = g50 − (g70 − g50) = 2·g50 − g70.
//
// (이전 구현은 grade70 단독 + ±0.3 밴드였는데, median/상위 정보를 못 써서 '안정'을
//  변별하지 못했다. grade50 이 없는 옛 데이터는 아래에서 이 밴드 로직으로 폴백한다.)

import type { FitVerdict } from '../types';

export { toGrade9, NAESIN_CONVERT_RESIDUAL_SD, grade9Interval } from './gradeScaleConvert';
import { toGrade9 } from './gradeScaleConvert';

export interface FitInput {
  /** 학생 내신 평균 등급 (그 학생의 척도 기준값) */
  studentGrade: number | null | undefined;
  /** 학생이 5등급제인지 (1·2학년) — false면 9등급제(3학년) */
  studentIsFiveTier: boolean;
  /** 내신 평균에 반영된 과목 수 (5등급제 환산 정밀도 향상용, 없으면 기본값 사용) */
  studentSubjectCount?: number | null;
  /** adiga grade70 컷 (하위 30% 선, 9등급 척도) */
  cutGrade70: number | null | undefined;
  /** adiga grade50 컷 (중위, 9등급 척도) — 있으면 분위 3-컷 판정, 없으면 70%컷 단독 폴백 */
  cutGrade50?: number | null | undefined;
}

/**
 * 25% 컷 대칭 외삽 — 50→70 분위 간격을 median 위로 한 칸 미러링.
 *  g25 = g50 − (g70 − g50) = 2·g50 − g70. (등급은 낮을수록 우수)
 *  정상 데이터(g70 ≥ g50)면 g25 ≤ g50 이 보장된다.
 */
export function extrapolateGrade25(cutGrade50: number, cutGrade70: number): number {
  return 2 * cutGrade50 - cutGrade70;
}

/**
 * 적합도 판정 — 9등급 척도 등급 직접 비교 (분위 3-컷).
 *  학생등급 g9(9등급 환산)를 25%/50%/70% 컷과 비교한다 (낮을수록 우수):
 *   - g9 ≤ 25%컷 : 25% 컷보다 우수 → 안정(safe)
 *   - g9 ≤ 50%컷 : 50% 컷보다 우수 → 적정(fit)
 *   - g9 ≤ 70%컷 : 70% 컷보다 우수 → 소신(reach)
 *   - g9 > 70%컷 : 70% 컷 미달 → 위험(danger)
 *  50%컷이 없거나 컷이 단조롭지 않으면(g70 ≤ g50) grade70 단독 ±0.3 밴드로 폴백.
 *  입력 부족 → 판정불가(unknown).
 */
export function computeFit({ studentGrade, studentIsFiveTier, studentSubjectCount, cutGrade70, cutGrade50 }: FitInput): FitVerdict {
  if (studentGrade == null || cutGrade70 == null || !Number.isFinite(cutGrade70) || !Number.isFinite(studentGrade)) {
    return 'unknown';
  }
  const g9 = toGrade9(studentGrade, studentIsFiveTier, studentSubjectCount);
  if (!Number.isFinite(g9)) return 'unknown';

  // 50% 컷이 있고 컷이 정상 단조(g70 > g50)면 분위 3-컷 판정
  if (cutGrade50 != null && Number.isFinite(cutGrade50) && cutGrade70 > cutGrade50) {
    const g25 = extrapolateGrade25(cutGrade50, cutGrade70);
    if (g9 <= g25) return 'safe';        // 25% 컷보다 우수 → 안정
    if (g9 <= cutGrade50) return 'fit';  // 50% 컷보다 우수 → 적정
    if (g9 <= cutGrade70) return 'reach'; // 70% 컷보다 우수 → 소신
    return 'danger';                      // 70% 컷 미달 → 위험
  }

  // 폴백: 50%컷 없음/컷 비정상 → grade70 단독 ±0.3 밴드 (기존 로직)
  const diff = g9 - cutGrade70; // 양수 = 컷보다 미달
  if (diff <= -0.3) return 'safe';
  if (diff <= 0.3) return 'fit';
  if (diff <= 1.0) return 'reach';
  return 'danger';
}
