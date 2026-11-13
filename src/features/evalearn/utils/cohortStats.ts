/**
 * 집단(학년·학급) 원점수 통계 — **순수 함수만**. React 비의존.
 *
 * ## 설계에서 가장 중요한 것: 반은 24명이다
 * 3학년은 9개 반 × 24~25명이다. 원점수 표준편차가 20점 안팎이면
 *   반평균의 표준오차 ≈ 20/√24 ≈ 4.1점,  두 반 차이의 표준오차 ≈ 5.8점
 * 이라 **반평균이 12점쯤 벌어져야 의미**가 있고 5점 차이는 그냥 흔들림이다.
 * 그래서 이 모듈은 평균만 주지 않고 항상 `standardError` 를 함께 주며,
 * 두 집단 비교는 `compareGroups` 가 "차이 있음/판단 보류"를 명시적으로 돌려준다.
 * 순위표를 만들 수 있는 함수는 일부러 두지 않았다 — 순위는 차이가 없어도 항상 생긴다.
 *
 * ## 여섯 숫자 요약을 넘어서
 * 최솟값·Q1·중앙값·Q3·최댓값·평균만으로는 **봉우리 개수**(중위권 공동화)를 알 수 없다.
 * 우리는 원점수 배열을 갖고 있으므로 히스토그램을 직접 그린다(`histogram`).
 */

export interface Quantiles {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export interface CohortStats extends Quantiles {
  n: number;
  mean: number;
  /** 표본표준편차. n<2 면 null */
  sd: number | null;
  /** 평균의 표준오차 = sd/√n. 반별 비교에서 이걸 안 보면 노이즈를 차이로 읽는다 */
  standardError: number | null;
  iqr: number;
  /** Bowley 왜도 (Q1+Q3-2×중앙값)/(Q3-Q1). -1~+1, |값|>0.2 면 눈에 띄는 비대칭 */
  bowleySkew: number | null;
  /** 중앙값-Q1 (하위 절반의 퍼짐) */
  lowerSpread: number;
  /** Q3-중앙값 (상위 절반의 퍼짐) */
  upperSpread: number;
}

/** 선형보간 분위수(R type 7 = 엑셀 PERCENTILE 과 같은 방식). */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeCohortStats(values: number[]): CohortStats | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = clean.length;
  if (n === 0) return null;

  const mean = clean.reduce((a, b) => a + b, 0) / n;
  const sd =
    n < 2
      ? null
      : Math.sqrt(clean.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));

  const q1 = quantile(clean, 0.25);
  const median = quantile(clean, 0.5);
  const q3 = quantile(clean, 0.75);
  const iqr = q3 - q1;

  return {
    n,
    min: clean[0],
    q1,
    median,
    q3,
    max: clean[n - 1],
    mean: round1(mean),
    sd: sd == null ? null : round1(sd),
    standardError: sd == null ? null : round1(sd / Math.sqrt(n)),
    iqr: round1(iqr),
    // IQR=0 이면 중간 50%가 한 점에 몰린 것 — 왜도를 정의할 수 없다
    bowleySkew: iqr === 0 ? null : round2((q1 + q3 - 2 * median) / iqr),
    lowerSpread: round1(median - q1),
    upperSpread: round1(q3 - median),
  };
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

/**
 * 원점수 히스토그램. 여섯 숫자 요약으로는 못 보는 이봉분포를 여기서 본다.
 * `binSize` 기본 5점, 0~만점 구간을 고정으로 잡아 회차·집단 간 비교가 가능하게 한다.
 */
export function histogram(values: number[], maxScore: number, binSize = 5): HistogramBin[] {
  const bins: HistogramBin[] = [];
  for (let from = 0; from < maxScore; from += binSize) {
    bins.push({ from, to: Math.min(from + binSize, maxScore), count: 0 });
  }
  if (bins.length === 0) return bins;

  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const idx = Math.min(Math.floor(v / binSize), bins.length - 1);
    if (idx >= 0) bins[idx].count += 1;
  }
  return bins;
}

/**
 * 봉우리 개수(대략). 이웃 구간보다 높고 전체 최댓값의 25% 이상인 구간을 봉우리로 센다.
 * 2 이상이면 중위권 공동화 같은 이봉 구조를 의심할 신호다 — 확정이 아니라 신호다.
 */
export function countPeaks(bins: HistogramBin[]): number {
  if (bins.length < 3) return bins.length > 0 ? 1 : 0;
  const peak = Math.max(...bins.map((b) => b.count));
  if (peak === 0) return 0;
  const floor = peak * 0.25;
  let count = 0;
  for (let i = 0; i < bins.length; i++) {
    const c = bins[i].count;
    if (c < floor) continue;
    const left = i === 0 ? -1 : bins[i - 1].count;
    const right = i === bins.length - 1 ? -1 : bins[i + 1].count;
    if (c >= left && c > right) count += 1;
  }
  return Math.max(count, 1);
}

export type ComparisonVerdict = 'higher' | 'lower' | 'inconclusive';

export interface GroupComparison {
  difference: number;
  /** 두 평균 차이의 표준오차 */
  standardError: number | null;
  verdict: ComparisonVerdict;
}

/**
 * 두 집단 평균 비교. **차이가 표준오차의 2배를 넘을 때만** 차이가 있다고 말한다.
 * 그 아래는 `inconclusive` — "비슷하다"가 아니라 "이 표본으로는 판단할 수 없다"는 뜻이다.
 * 24명짜리 반끼리는 대부분 여기에 해당한다.
 */
export function compareGroups(a: CohortStats, b: CohortStats): GroupComparison {
  const difference = round1(a.mean - b.mean);
  if (a.sd == null || b.sd == null || a.n < 2 || b.n < 2) {
    return { difference, standardError: null, verdict: 'inconclusive' };
  }
  const se = Math.sqrt(a.sd ** 2 / a.n + b.sd ** 2 / b.n);
  const verdict: ComparisonVerdict =
    Math.abs(difference) > 2 * se ? (difference > 0 ? 'higher' : 'lower') : 'inconclusive';
  return { difference, standardError: round1(se), verdict };
}

export interface Diagnostic {
  kind: 'skew' | 'discrimination' | 'ceiling' | 'floor' | 'bimodal' | 'sample';
  severity: 'info' | 'warn';
  message: string;
}

/**
 * 자동 진단 문구. 숫자만 보여주면 읽는 사람마다 다르게 해석하므로 기준을 코드에 못 박는다.
 * 기준은 `docs/features/evalearn-cohort-analysis-plan.md` §3 과 같다.
 */
export function diagnose(stats: CohortStats, maxScore: number, bins?: HistogramBin[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const scale = maxScore / 100; // 50점 만점 과목은 기준도 절반

  const meanMedianGap = stats.mean - stats.median;
  if (Math.abs(meanMedianGap) >= 5 * scale) {
    out.push({
      kind: 'skew',
      severity: 'warn',
      message:
        meanMedianGap > 0
          ? `평균(${stats.mean})이 중앙값(${stats.median})보다 ${round1(meanMedianGap)}점 높습니다. 소수 고득점자가 평균을 끌어올린 형태로, 대다수는 평균보다 낮습니다. 안내할 때 중앙값을 함께 제시하세요.`
          : `중앙값(${stats.median})이 평균(${stats.mean})보다 ${round1(-meanMedianGap)}점 높습니다. 소수의 낮은 점수가 평균을 끌어내린 형태로, 학습 포기 학생군이 있는지 확인해 볼 지점입니다.`,
    });
  }

  if (stats.bowleySkew != null && Math.abs(stats.bowleySkew) > 0.2) {
    out.push({
      kind: 'skew',
      severity: 'info',
      message: `Bowley 왜도 ${stats.bowleySkew} — 분포가 ${stats.bowleySkew > 0 ? '아래쪽' : '위쪽'}으로 치우쳐 있습니다.`,
    });
  }

  if (stats.iqr < 15 * scale) {
    out.push({
      kind: 'discrimination',
      severity: 'warn',
      message: `IQR ${stats.iqr}점 — 중위권이 좁게 뭉쳐 있어 석차가 한두 문제로 뒤집힙니다. 변별 문항이 부족했을 수 있습니다.`,
    });
  }

  if (stats.upperSpread < stats.lowerSpread / 2) {
    out.push({
      kind: 'discrimination',
      severity: 'warn',
      message: `상위 절반의 퍼짐(${stats.upperSpread})이 하위 절반(${stats.lowerSpread})의 절반도 안 됩니다. 상위권 변별에 실패한 형태입니다.`,
    });
  }

  if (stats.q3 >= maxScore * 0.95) {
    out.push({ kind: 'ceiling', severity: 'warn', message: `Q3가 ${stats.q3}점으로 만점에 근접합니다(천장 효과).` });
  }
  if (stats.q1 <= maxScore * 0.15) {
    out.push({ kind: 'floor', severity: 'warn', message: `Q1이 ${stats.q1}점으로 바닥입니다. 하위권이 문제를 거의 손대지 못했습니다.` });
  }

  if (bins && countPeaks(bins) >= 2) {
    out.push({
      kind: 'bimodal',
      severity: 'info',
      message: '봉우리가 둘 이상입니다. 중위권이 비고 상·하위로 갈린 구조일 수 있습니다.',
    });
  }

  if (stats.n < 30) {
    out.push({
      kind: 'sample',
      severity: 'info',
      message: `응시 ${stats.n}명 — 표본이 작아 평균 차이가 우연일 수 있습니다${
        stats.standardError != null ? ` (평균의 표준오차 ±${stats.standardError}점)` : ''
      }. 다른 집단과 비교할 때는 오차 범위를 함께 보세요.`,
    });
  }

  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
