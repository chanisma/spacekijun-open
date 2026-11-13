/**
 * 문항 난이도 분류 유틸.
 *
 * mock_problems.correct_rate(TEXT, 예: "57.3" 또는 "57.3%")를 파싱해 상/중/하 3구간으로 binning한다.
 * cutoff와 가중치는 모듈 상단 상수로 노출되며 추후 튜닝 시 한 곳만 수정한다.
 */

export type DifficultyBand = '상' | '중' | '하' | '미분류';

export const HARD_CUTOFF = 40;   // ≤ 40% 정답률 → 상 (어려움)
export const EASY_CUTOFF = 70;   // ≥ 70% 정답률 → 하 (쉬움). 그 사이는 중.

export function classifyDifficulty(correctRate: string | null): DifficultyBand {
  if (correctRate == null) return '미분류';
  const cleaned = correctRate.replace(/[^0-9.]/g, '');
  if (cleaned === '') return '미분류';
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return '미분류';
  if (num <= HARD_CUTOFF) return '상';
  if (num >= EASY_CUTOFF) return '하';
  return '중';
}

export const DIFFICULTY_WEIGHT: Record<DifficultyBand, number> = {
  '상': 2.0,
  '중': 1.5,
  '하': 1.0,
  '미분류': 1.0,
};

export const DIFFICULTY_COLOR: Record<DifficultyBand, string> = {
  '상': '#dc2626',
  '중': '#f59e0b',
  '하': '#10b981',
  '미분류': '#94a3b8',
};

export const DIFFICULTY_ORDER: DifficultyBand[] = ['상', '중', '하', '미분류'];

// ── 학교 지필평가용 컷오프 ──────────────────────────────────
//
// 학교 시험은 모의고사보다 훨씬 쉽다. 라이브 2026-1 전 문항(선택형 1,461개, 응시 10명 이상)
// 실측 평균 정답률이 **66.9%**로, 위의 모의고사 컷(≤40% = 상)을 그대로 쓰면 '상'이 9%뿐이라
// 취약도 가중치가 사실상 작동하지 않는다. 그래서 학교 시험은 분포의 사분위에 맞춘 별도
// 컷을 쓴다(실측 하위 25% = 53.7%, 상위 25% = 81.6% → 55/80으로 반올림).
//
// 실측 밴드 분포: 상 27% / 중 44% / 하 28%.
export const SCHOOL_HARD_CUTOFF = 55;
export const SCHOOL_EASY_CUTOFF = 80;

/** 학교 지필평가 정답률(0~100) → 난이도 밴드. null이면 '미분류'. */
export function classifySchoolDifficulty(correctRate: number | null): DifficultyBand {
  if (correctRate == null || !Number.isFinite(correctRate)) return '미분류';
  if (correctRate <= SCHOOL_HARD_CUTOFF) return '상';
  if (correctRate >= SCHOOL_EASY_CUTOFF) return '하';
  return '중';
}

/** 교사가 NEIS에 지정한 난이도 → 같은 밴드 축으로 변환 */
export function bandFromDesignated(
  designated: '쉬움' | '보통' | '어려움' | null | undefined
): DifficultyBand {
  if (designated === '어려움') return '상';
  if (designated === '보통') return '중';
  if (designated === '쉬움') return '하';
  return '미분류';
}

const BAND_RANK: Record<DifficultyBand, number | null> = {
  '상': 0, '중': 1, '하': 2, '미분류': null,
};

/**
 * 교사 지정 난이도와 실제 정답률 밴드가 **2단계** 어긋났는가(쉬움↔상, 어려움↔하).
 *
 * 1단계 차이는 라이브 실측에서 전체 문항의 47%라 표시하면 노이즈가 된다 — 교사 지정
 * 난이도와 실제 정답률은 순서만 맞고 분포가 크게 겹치기 때문이다(쉬움 평균 72.6% /
 * 보통 67.1% / 어려움 59.0%). 2단계 어긋남은 8.6%뿐이라 "예상과 정말 달랐던 문항"으로
 * 읽을 만하다.
 */
export function isDifficultyGap(designated: DifficultyBand, actual: DifficultyBand): boolean {
  const a = BAND_RANK[designated];
  const b = BAND_RANK[actual];
  if (a == null || b == null) return false;
  return Math.abs(a - b) >= 2;
}
