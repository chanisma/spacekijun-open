/**
 * 백분위 기반 등급 정규화 유틸리티
 * - 5등급제 / 9등급제 간 비교 가능한 정규화
 * - Python 학습 스크립트와 동일한 로직
 */

// 상위 누적 비율 범위 (%)
export const GRADE_9_RANGES: Record<number, [number, number]> = {
  1: [0, 4], 2: [4, 11], 3: [11, 23], 4: [23, 40], 5: [40, 60],
  6: [60, 77], 7: [77, 89], 8: [89, 96], 9: [96, 100],
};

export const GRADE_5_RANGES: Record<number, [number, number]> = {
  1: [0, 10], 2: [10, 34], 3: [34, 66], 4: [66, 90], 5: [90, 100],
};

// 각 등급의 중앙 백분위
export const GRADE_9_MIDPOINTS: Record<number, number> = Object.fromEntries(
  Object.entries(GRADE_9_RANGES).map(([g, [lo, hi]]) => [Number(g), (lo + hi) / 2])
);

export const GRADE_5_MIDPOINTS: Record<number, number> = Object.fromEntries(
  Object.entries(GRADE_5_RANGES).map(([g, [lo, hi]]) => [Number(g), (lo + hi) / 2])
);

/** 등급 → 상위 누적 백분위 중앙값 (보간 지원) */
export function gradeToPercentile(grade: number, system: 5 | 9 = 9): number {
  const midpoints = system === 9 ? GRADE_9_MIDPOINTS : GRADE_5_MIDPOINTS;
  const maxGrade = system === 9 ? 9 : 5;

  grade = Math.max(1, Math.min(grade, maxGrade));

  if (grade === Math.floor(grade)) {
    return midpoints[grade];
  }

  const lower = Math.floor(grade);
  const upper = Math.min(lower + 1, maxGrade);
  const loMid = midpoints[lower];
  const hiMid = midpoints[upper];
  const frac = grade - lower;
  return loMid + frac * (hiMid - loMid);
}

/** 등급 → 정규화값 (0~1, 1=최상위) */
export function normalizeGrade(grade: number, system: 5 | 9 = 9): number {
  return 1 - gradeToPercentile(grade, system) / 100;
}

/** 정규화값 → 근사 등급 (소수점 포함) */
export function normalizedToGrade(normalized: number, system: 5 | 9 = 9): number {
  const percentile = (1 - normalized) * 100;
  const midpoints = system === 9 ? GRADE_9_MIDPOINTS : GRADE_5_MIDPOINTS;
  const items = Object.entries(midpoints)
    .map(([g, m]) => [Number(g), m] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  if (percentile <= items[0][1]) return 1;
  if (percentile >= items[items.length - 1][1]) return items[items.length - 1][0];

  for (let i = 0; i < items.length - 1; i++) {
    const [g1, m1] = items[i];
    const [g2, m2] = items[i + 1];
    if (m1 <= percentile && percentile <= m2) {
      const frac = (percentile - m1) / (m2 - m1);
      return g1 + frac * (g2 - g1);
    }
  }

  return items[items.length - 1][0];
}

/** 교과군 한글 라벨 */
export const SUBJECT_GROUP_LABELS: Record<string, string> = {
  korean: '국어',
  math: '수학',
  english: '영어',
  social: '사회',
  science: '과학',
  overall: '전체',
};

/**
 * 교과군 표시 순서 — **국어 · 수학 · 영어 · 과학 · 사회** (2026-09-05 사용자 지시).
 *
 * 모의고사 쪽 단일 출처(`evalearn/utils/subjectOrder.ts`)가 국어→수학→영어→과학탐구→
 * 사회탐구를 쓰므로 내신도 같은 순서로 맞춘다 — 한 화면에서 두 영역을 오갈 때 열 순서가
 * 바뀌면 같은 자리를 다른 교과로 읽게 된다.
 *
 * 목록·표를 새로 만들 때 이 배열로 정렬할 것. 없는 키는 뒤로 보낸다.
 */
export const SUBJECT_GROUP_ORDER = ['korean', 'math', 'english', 'science', 'social'] as const;

/** 교과군 정렬 키. 알 수 없는 교과군은 맨 뒤(`overall` 은 합계라 따로 다룬다). */
export function subjectGroupRank(group: string | null | undefined): number {
  const i = (SUBJECT_GROUP_ORDER as readonly string[]).indexOf(group ?? '');
  return i === -1 ? SUBJECT_GROUP_ORDER.length : i;
}
