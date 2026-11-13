/**
 * Grade Bands — 등급 분포 막대의 구간 정의 (2026-08-25)
 *
 * 등급 분포는 학생의 **소수점 평균 등급**(예: 2.43)을 막대 하나에 담아야 하는데,
 * "어디서 자르느냐"에 두 가지 관습이 있다.
 *
 *  - `level`   (기존): 소수점을 **버린다**. 2등급 막대 = [2.0, 3.0)
 *  - `rounded` (신규): **반올림**한다.    2등급 막대 = [1.5, 2.5)
 *
 * 둘 다 정당하고 서로를 대체하지 않는다 — `level`은 "2등급대"라는 성적표 표기와
 * 맞고, `rounded`는 "1.9와 2.1은 사실상 같은 학생"이라는 상담 감각과 맞는다.
 * 그래서 한쪽을 고르지 않고 화면에서 토글한다.
 *
 * **막대 개수는 두 모드가 같다**(= maxGradeLevel). 그래서 색상표·범례·클릭 모달 등
 * 기존 구조가 그대로 재사용된다.
 *
 * 회귀: `npx tsx scripts/course-estimated-grade-test/run.mts`
 */

export type GradeBandMode = 'level' | 'rounded';

export interface GradeBand {
  /** 0-based 막대 인덱스 */
  index: number;
  /** 대표 등급 (1..maxGradeLevel) — 색상 키이자 막대 아래 짧은 라벨 */
  grade: number;
  /** 구간 하한 (이상) */
  min: number;
  /** 구간 상한 (미만 — 단 마지막 밴드는 이하) */
  max: number;
  /** 막대 아래 짧은 라벨 (자리가 좁다 — 9등급제면 막대 폭이 30px대) */
  label: string;
  /** 범례·툴팁·모달용 범위 라벨 ('1~1.5' 등) */
  rangeLabel: string;
}

/** 1 → '1', 1.5 → '1.5' (불필요한 .0 제거) */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 등급값이 속할 막대 인덱스(0-based).
 *
 * **분포 집계와 막대 클릭 필터가 반드시 이 함수 하나를 공유해야 한다.** 예전에는
 * 집계가 `Math.floor(g) - 1`, 클릭 필터가 `Math.floor(g) === grade || (grade === 9 && g >= 9)`로
 * 따로 적혀 있어(9등급제 전용 특례가 클릭 쪽에만 있었다) 한쪽만 고치면 막대 높이와
 * 모달 인원이 어긋난다.
 */
export function gradeBandIndex(
  grade: number,
  mode: GradeBandMode,
  maxGradeLevel: number
): number {
  // Math.round는 half-up이라 1.5 → 2. 이것이 곧 '1.5~2.5' 밴드의 하한 포함 규칙이다.
  const raw = mode === 'rounded' ? Math.round(grade) : Math.floor(grade);
  return Math.min(Math.max(raw, 1), maxGradeLevel) - 1;
}

/**
 * 모드·등급 체계(5/9등급)에 맞는 밴드 목록.
 */
export function getGradeBands(mode: GradeBandMode, maxGradeLevel: number): GradeBand[] {
  return Array.from({ length: maxGradeLevel }, (_, index) => {
    const grade = index + 1;
    const isFirst = grade === 1;
    const isLast = grade === maxGradeLevel;

    if (mode === 'level') {
      return {
        index,
        grade,
        min: grade,
        // 마지막 막대는 그 위 등급이 없으므로 등급 체계 상한까지 받는다
        max: isLast ? maxGradeLevel : grade + 1,
        label: String(grade),
        rangeLabel: String(grade),
      };
    }

    // rounded: [g-0.5, g+0.5) — 단 양 끝은 등급 체계 범위(1..max)로 잘린다
    const min = isFirst ? 1 : grade - 0.5;
    const max = isLast ? maxGradeLevel : grade + 0.5;
    return {
      index,
      grade,
      min,
      max,
      label: String(grade),
      rangeLabel: `${fmt(min)}~${fmt(max)}`,
    };
  });
}

/** 토글 UI 표기 (라벨 + 설명 툴팁) */
export const GRADE_BAND_MODE_META: Record<GradeBandMode, { label: string; hint: string }> = {
  level: {
    label: '정수 등급',
    hint: '소수점을 버려 나눕니다 — 2등급 막대 = 2.0~2.9',
  },
  rounded: {
    label: '반올림 등급',
    hint: '반올림해 나눕니다 — 1등급 막대 = 1.0~1.5, 2등급 막대 = 1.5~2.5',
  },
};

export const GRADE_BAND_MODES: GradeBandMode[] = ['level', 'rounded'];
