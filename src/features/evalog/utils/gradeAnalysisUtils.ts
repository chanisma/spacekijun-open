/**
 * 성적 분석 유틸리티 함수
 * - 이동평균, 선형회귀, 성장률, 추세 분류
 * - 내신-모의고사 과목 매칭
 * - Z점수, 가중평균, 등급 향상 ROI
 */

// ─── 추이 분석 & 예측 ───

/** 이동평균 계산 (window 크기만큼의 평균) */
export function calcMovingAverage(data: number[], window: number): (number | null)[] {
  if (window <= 0 || data.length === 0) return data.map(() => null);
  return data.map((_, i) => {
    if (i < window - 1) return null;
    const slice = data.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** 선형회귀 → 기울기, 절편, 다음 값 예측 */
export function calcLinearRegression(points: number[]): {
  slope: number;
  intercept: number;
  predict: (x: number) => number;
  r2: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] ?? 0, predict: () => points[0] ?? 0, r2: 0 };

  const xs = points.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = points.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * points[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const meanY = sumY / n;
  const ssRes = points.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const ssTot = points.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return {
    slope,
    intercept,
    predict: (x: number) => slope * x + intercept,
    r2,
  };
}

/** 성장률 계산 (이전 → 현재) */
export function calcGrowthRate(prev: number, curr: number): number {
  if (prev === 0) return 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** 추세 분류: 상승 / 유지 / 하락 */
export type TrendType = 'up' | 'stable' | 'down';

export function classifyTrend(values: number[], threshold = 0.3): TrendType {
  if (values.length < 2) return 'stable';
  const { slope } = calcLinearRegression(values);
  if (slope < -threshold) return 'up';   // 등급 숫자 감소 = 성적 상승
  if (slope > threshold) return 'down';   // 등급 숫자 증가 = 성적 하락
  return 'stable';
}

/** 연속 상승/하락 횟수 계산 (등급 기준: 숫자 감소 = 상승) */
export function calcConsecutiveTrend(values: number[]): { direction: TrendType; count: number } {
  if (values.length < 2) return { direction: 'stable', count: 0 };

  let count = 0;
  let direction: TrendType = 'stable';

  for (let i = values.length - 1; i > 0; i--) {
    const diff = values[i] - values[i - 1];
    if (diff < 0) {
      // 등급 숫자 감소 = 상승
      if (direction === 'stable' || direction === 'up') {
        direction = 'up';
        count++;
      } else break;
    } else if (diff > 0) {
      if (direction === 'stable' || direction === 'down') {
        direction = 'down';
        count++;
      } else break;
    } else {
      break;
    }
  }

  return { direction, count };
}

// ─── 모의고사 과목명 동의어 매핑 ───

/**
 * 동의어 그룹: 같은 과목이지만 다른 이름으로 저장될 수 있는 과목들
 * - mock_result, mock_marking 간 과목 비교 시 사용
 * - 각 그룹의 첫 번째 항목이 대표명(canonical name)
 */
export const MOCK_SUBJECT_ALIASES: string[][] = [
  ['사회탐구', '통합사회', '공통사회'],
  ['과학탐구', '통합과학', '공통과학'],
  ['사회·문화', '사회문화'],
];

// 역방향 매핑: 모든 변형 → 대표명
const _aliasToCanonical = new Map<string, string>();
for (const group of MOCK_SUBJECT_ALIASES) {
  const canonical = group[0];
  for (const alias of group) {
    _aliasToCanonical.set(alias, canonical);
  }
}

/** 과목명을 대표명으로 정규화 (동의어가 없으면 원본 반환) */
export function canonicalMockSubject(subject: string): string {
  return _aliasToCanonical.get(subject) ?? subject;
}

/** 두 과목명이 동의어인지 확인 */
export function isSameMockSubject(a: string, b: string): boolean {
  if (a === b) return true;
  return canonicalMockSubject(a) === canonicalMockSubject(b);
}

/**
 * mock_result의 과목명으로 mock_marking에서 대응하는 과목명 찾기
 * (또는 그 반대)
 */
export function findMatchingSubject(
  targetSubject: string,
  availableSubjects: string[]
): string | null {
  // 1. 정확히 일치
  if (availableSubjects.includes(targetSubject)) return targetSubject;
  // 2. 동의어 매칭
  const canonical = canonicalMockSubject(targetSubject);
  for (const s of availableSubjects) {
    if (canonicalMockSubject(s) === canonical) return s;
  }
  return null;
}

// ─── 내신-모의고사 과목 매칭 ───

/** 내신 subject_group → 모의고사 과목 카테고리 매핑 */
const SUBJECT_GROUP_MAPPING: Record<string, string[]> = {
  '국어': ['국어'],
  '수학': ['수학'],
  '영어': ['영어'],
  '한국사': ['한국사'],
  '사회': ['사회탐구'],
  '과학': ['과학탐구'],
};

/** 모의고사 과목명 → 카테고리 매핑 (역방향, 동의어 포함) */
const MOCK_SUBJECT_CATEGORY: Record<string, string> = {
  '국어': '국어',
  '수학': '수학',
  '영어': '영어',
  '한국사': '한국사',
  '사회탐구': '사회',
  '통합사회': '사회',
  '공통사회': '사회',
  '과학탐구': '과학',
  '통합과학': '과학',
  '공통과학': '과학',
};

/** 내신 subject_group과 모의고사 과목명 매칭 여부 */
export function matchSubjectGroups(subjectGroup: string, mockSubject: string): boolean {
  const mappedMockSubjects = SUBJECT_GROUP_MAPPING[subjectGroup];
  if (mappedMockSubjects) {
    // 동의어도 포함하여 매칭
    if (mappedMockSubjects.includes(mockSubject)) return true;
    const canonical = canonicalMockSubject(mockSubject);
    if (mappedMockSubjects.some(m => canonicalMockSubject(m) === canonical)) return true;
  }
  // 사회/과학 하위 과목 매핑
  if (subjectGroup.includes('사회') || subjectGroup === '역사') {
    return canonicalMockSubject(mockSubject) === '사회탐구';
  }
  if (subjectGroup.includes('과학')) {
    return canonicalMockSubject(mockSubject) === '과학탐구';
  }
  return false;
}

/** 모의고사 과목을 내신 카테고리로 변환 (동의어 지원) */
export function mockSubjectToCategory(mockSubject: string): string | null {
  return MOCK_SUBJECT_CATEGORY[mockSubject] ?? null;
}

/** 내신 카테고리에 매칭되는 주요 과목 목록 */
export const MATCHABLE_CATEGORIES = ['국어', '수학', '영어', '한국사', '사회', '과학'] as const;

// ─── 통계 분석 ───

/** Z점수 계산 */
export function calcZScore(score: number, avg: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (score - avg) / stdDev;
}

/** 가중 평균 등급 (이수단위 가중) */
export function calcWeightedAverage(
  records: { rank: number | null; units: number }[]
): number {
  const valid = records.filter(r => r.rank !== null && r.rank !== undefined);
  if (valid.length === 0) return 0;
  const totalWeighted = valid.reduce((sum, r) => sum + r.rank! * r.units, 0);
  const totalUnits = valid.reduce((sum, r) => sum + r.units, 0);
  return totalUnits > 0 ? totalWeighted / totalUnits : 0;
}

/** 등급컷 추정 (해당 등급에 도달하기 위한 점수 변화) */
export function estimateGradeCut(currentRank: number, targetRank: number): number {
  // 간이 추정: 등급 간 약 11.1% 구간 (9등급제 기준 약 100/9)
  return currentRank - targetRank;
}

/** 등급 향상 ROI 계산 */
export interface GradeImpactROI {
  subject: string;
  subjectGroup: string;
  currentRank: number;
  units: number;
  targetRank: number;
  currentWeightedContribution: number;
  improvedWeightedContribution: number;
  improvement: number; // 가중평균 개선 효과
}

export function calcGradeImpactROI(
  records: { subject: string; subjectGroup: string; rank: number | null; units: number; category: string }[],
): GradeImpactROI[] {
  const validRecords = records.filter(r =>
    r.rank !== null && r.rank !== undefined && r.rank > 1 && r.category === 'regular'
  );
  if (validRecords.length === 0) return [];

  const totalUnits = validRecords.reduce((sum, r) => sum + r.units, 0);
  const currentWeightedAvg = calcWeightedAverage(
    validRecords.map(r => ({ rank: r.rank, units: r.units }))
  );

  return validRecords
    .map(record => {
      const targetRank = record.rank! - 1;
      if (targetRank < 1) return null;

      const currentContribution = record.rank! * record.units;
      const improvedContribution = targetRank * record.units;

      // 이 과목만 1등급 향상했을 때의 전체 가중평균 변화
      const newWeightedSum = validRecords.reduce((sum, r) => {
        if (r.subject === record.subject && r.units === record.units) {
          return sum + targetRank * r.units;
        }
        return sum + r.rank! * r.units;
      }, 0);
      const newWeightedAvg = totalUnits > 0 ? newWeightedSum / totalUnits : 0;
      const improvement = currentWeightedAvg - newWeightedAvg;

      return {
        subject: record.subject,
        subjectGroup: record.subjectGroup,
        currentRank: record.rank!,
        units: record.units,
        targetRank,
        currentWeightedContribution: currentContribution,
        improvedWeightedContribution: improvedContribution,
        improvement: parseFloat(improvement.toFixed(4)),
      };
    })
    .filter((r): r is GradeImpactROI => r !== null)
    .sort((a, b) => b.improvement - a.improvement);
}

// ─── 5등급제 관련 ───

const CURRENT_YEAR = 2026;

/** 입학연도 기반 5등급제 여부 판단 (2025년 이후 입학생) */
export function is5GradeSystem(studentGrade?: number): boolean {
  if (!studentGrade || studentGrade < 1 || studentGrade > 3) return false;
  const enrollmentYear = CURRENT_YEAR - (studentGrade - 1);
  return enrollmentYear >= 2025;
}

/**
 * 5등급 → 9등급 환산 기준점: A(1)→2, B(2)→4, C(3)→5, D(4)→7, E(5)→8
 * 성취평가제(절대평가)와 상대평가의 차이로 근사치임. convert5To9Grade의 보간과
 * 5등급제·9등급제를 함께 표시하는 차트(내신-모의고사 산점도 등)의 대응선이 공유한다.
 */
export const GRADE_5_TO_9_MAP: [number, number][] = [[1, 2], [2, 4], [3, 5], [4, 7], [5, 8]];

/** 5등급 → 9등급 환산 (선형 보간) */
export function convert5To9Grade(grade5: number): number {
  const map = GRADE_5_TO_9_MAP;

  if (grade5 <= 1) return map[0][1];
  if (grade5 >= 5) return map[map.length - 1][1];

  for (let i = 0; i < map.length - 1; i++) {
    if (grade5 <= map[i + 1][0]) {
      const t = (grade5 - map[i][0]) / (map[i + 1][0] - map[i][0]);
      return parseFloat((map[i][1] + t * (map[i + 1][1] - map[i][1])).toFixed(2));
    }
  }
  return grade5;
}

/** 최대 등급 (5등급제: 5, 9등급제: 9) */
export function maxGrade(use5Grade: boolean): number {
  return use5Grade ? 5 : 9;
}

// ─── 괴리 분석 유형 분류 ───

export type GapType = 'A' | 'B' | 'C' | 'D';

/**
 * 내신-모의고사 괴리 유형 분류
 * academicGrade와 mockGrade는 동일한 9등급 스케일이어야 함
 * (5등급제 학생은 convert5To9Grade로 환산 후 전달)
 */
export function classifyGapType(
  academicGrade: number,
  mockGrade: number,
  threshold = 1.5
): GapType {
  const isAcademicGood = academicGrade <= 3;
  const isMockGood = mockGrade <= 3;

  if (isAcademicGood && isMockGood) return 'A'; // 양호 (둘 다 상위)
  if (isAcademicGood && !isMockGood) return 'B'; // 내신형 (내신만 좋음)
  if (!isAcademicGood && isMockGood) return 'C'; // 수능형 (모의만 좋음)
  return 'D'; // 위험 (둘 다 하위)
}

export const GAP_TYPE_INFO: Record<GapType, { label: string; color: string; bgColor: string; description: string; recommendation: string }> = {
  A: {
    label: '양호',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    description: '내신과 모의고사 모두 상위권',
    recommendation: '수시/정시 모두 유리. 현 수준 유지에 집중.',
  },
  B: {
    label: '내신형',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    description: '내신은 상위, 모의고사는 하위',
    recommendation: '수시 전형이 유리. 모의고사 실력 보완 필요.',
  },
  C: {
    label: '수능형',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    description: '모의고사는 상위, 내신은 하위',
    recommendation: '정시 전형이 유리. 내신 관리 보완 필요.',
  },
  D: {
    label: '보강 필요',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    description: '내신과 모의고사 모두 하위권',
    recommendation: '기초 학력 보강이 우선. 과목별 집중 전략 필요.',
  },
};

// ─── 전략 추천 ───

export type StrategyType = 'priority' | 'reinforce' | 'maintain';

export function classifyStrategy(
  zScore: number,
  roi: number,
): StrategyType {
  if (zScore < -0.5 && roi > 0.01) return 'priority';   // Z점수 낮고 ROI 높음 → 최우선 집중
  if (zScore < -0.5) return 'reinforce';                  // Z점수 낮음 → 기초 보강
  return 'maintain';                                       // Z점수 양호 → 현 수준 유지
}

export const STRATEGY_INFO: Record<StrategyType, { label: string; color: string; bgColor: string; icon: string }> = {
  priority: { label: '최우선 집중', color: 'text-red-700', bgColor: 'bg-red-50', icon: '!!!' },
  reinforce: { label: '기초 보강', color: 'text-amber-700', bgColor: 'bg-amber-50', icon: '!' },
  maintain: { label: '현 수준 유지', color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: '-' },
};
