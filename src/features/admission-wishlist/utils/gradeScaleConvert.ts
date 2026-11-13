// 내신 등급 척도 환산 (5등급제 ⇄ 9등급제)
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────────
// 2022 개정 교육과정으로 2025학년도 입학생부터 내신이 5등급제(상위 10/34/66/90%)로
// 바뀌었다. 반면 대학 수시 지원 데이터(adiga 합격자 분위 컷)는 9등급제(4/11/23/40/
// 60/77/89/96%) 기준으로 축적돼 있다. 두 척도의 "2등급"은 전혀 다른 위치이므로
// 숫자를 직접 비교할 수 없다. 이 모듈이 5등급 내신 평균을 9등급 척도로 환산한다.
//
// ── 왜 단순 백분위 대응으로는 안 되는가 ────────────────────────────────────
// "등급 → 누적백분위 → 반대 척도 등급"은 **한 과목의 등급**에는 맞지만 **여러 과목의
// 평균 등급**에는 틀린다. 평균 2.0 인 학생은 2등급 구간(10~34%) 어딘가가 아니라
// 여러 등급이 섞인 결과이고, 등급↔백분위 관계가 비선형이라 "평균의 변환"과
// "변환의 평균"이 다르기 때문이다(Jensen 부등식).
// 구 구현은 등급 g 를 그 등급 구간의 **누적 상한**(2등급→34%)에 대응시켜 학생을
// 항상 구간 바닥으로 취급했고, 그 결과 전 구간에서 실제보다 **평균 +0.34등급 나쁘게**
// 환산했다(실측 편향, 아래 검증 참조).
//
// ── 채택한 모형: 잠재특성 + 이산우도 사후평균 ──────────────────────────────
// 학생의 잠재 학력 z ~ N(0,1), 과목 성적 s = ρ·z + √(1−ρ²)·ε (ε~N(0,1)).
// 등급 경계는 공식 누적비율에서 t_k = Φ⁻¹(1 − cum_k).
//   · 과목별 등급 확률   P(g=k | z)
//   · n과목 등급합 분포  = 위 분포의 n중 합성곱(DP)
//   · 관측 내신평균을 등급합으로 보고 **베이즈 사후평균** E[g9 | 관측 g5, n] 을 계산
// 사후평균을 쓰는 이유: "E[g5|z] = 관측값"을 z에 대해 푸는 점역산은 관측값이 달성
// 가능 범위의 경계(전 과목 1등급 = 정확히 1.000)에 닿으면 z→∞ 로 발산해 9등급도
// 1.000 으로 붕괴한다. 이산우도는 P(전 과목 1등급|z) = p₁(z)ⁿ 로 유계라 붕괴하지 않는다.
//
// ── 실측 검증 (scripts/naesin-scale-test) ──────────────────────────────────
// 정답지 = 2025 입학 코호트(현 2학년) 1학년 성적 193명. 생기부 원점수로 석차백분율을
// 재구성(중간석차 규칙)한 뒤 9등급 경계를 적용한 **반사실 내신**. 이 정답지가 실제
// 9등급 코호트의 1학년 내신 분포와 일치함을 확인했다:
//   2023 입학 mean 4.966 / sd 1.749 / p50 5.043
//   2024 입학 mean 4.953 / sd 1.720 / p50 4.905
//   2025 역산 mean 5.013 / sd 1.752 / p50 5.104   ← 코호트 간 변동 범위 안
// 모형 비교 (RMSE / 편향):
//   구 구현(백분위 경계보간)  0.380 / +0.336   ← 60.6% 의 학생이 0.3등급 넘게 틀림
//   이 모형(이산우도 사후평균) 0.167 / −0.008   ←  8.3%
// 외부 검증: 경기진학지도협의회 5등급제 배치분석(전국 규모) 발표치
//   "5등급 평균 1.583 = 누적 9.06% → 9등급 환산 2.45" 를 본 모형은 1.544 / 2.472 로 재현.
//   즉 우리 학교 데이터에 과적합된 상수가 아니라 척도 구조 자체에서 나오는 관계다.
//
// ── 한계 ───────────────────────────────────────────────────────────────────
// 5등급제는 상위 10%를 한 등급으로 묶으므로 그 안의 세부 순위 정보가 **원리적으로**
// 소실된다. 같은 5등급 내신이라도 실제 9등급 내신은 흩어지며, 잔차 SD ≈ 0.17등급
// (95% 구간 ±0.34등급)이 환원 불가능한 하한이다. 점추정만 믿지 말 것.
// 원점수가 있으면 환산이 아니라 재계산이 가능하다(정확). 이 모듈은 그 경로가 없을
// 때의 최선 추정이다.

/** 5등급제 누적 컷오프 (교육부 석차등급 산출 비율) */
const CUM5 = [0.10, 0.34, 0.66, 0.90, 1.0] as const;
/** 9등급제 누적 컷오프 */
const CUM9 = [0.04, 0.11, 0.23, 0.40, 0.60, 0.77, 0.89, 0.96, 1.0] as const;

/**
 * 과목 성적과 잠재 학력의 상관 ρ.
 * 2025 입학 코호트 193명으로 적합: 0.935 (부트스트랩 95% CI [0.900, 0.950],
 * 절반분할 0.940/0.920). RMSE 는 ρ 0.90~0.96 에서 0.169~0.177 로 평평해
 * 값의 정밀도에 민감하지 않다.
 */
const RHO = 0.935;

/** 같은 5등급 내신이라도 실제 9등급 내신이 흩어지는 정도 (환원 불가 불확실성) */
export const NAESIN_CONVERT_RESIDUAL_SD = 0.167;

/** 과목 수를 모를 때 기본값 (1개 학년 정량 과목 수 ≈ 13). 작을수록 상위권에 보수적. */
const DEFAULT_SUBJECT_COUNT = 13;

// ── 정규분포 ───────────────────────────────────────────────────────────────
function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 (|오차| < 1.5e-7)
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return sign * y;
}
const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** 표준정규 분위수 (Acklam 근사) */
function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const PLOW = 0.02425;
  if (p < PLOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - PLOW) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
         (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// 등급 경계 (성적 척도 상의 임계값, 높을수록 우수)
const THRESH5 = CUM5.slice(0, -1).map((c) => probit(1 - c));
const THRESH9 = CUM9.slice(0, -1).map((c) => probit(1 - c));
const SD_EPS = Math.sqrt(1 - RHO * RHO);

/** z 조건부 과목 등급 확률 P(g=k|z), index 0 = 1등급 */
function gradeProbs(z: number, thresholds: number[]): number[] {
  const out: number[] = [];
  let prevCum = 0;
  for (let k = 0; k <= thresholds.length; k++) {
    const cum = k === thresholds.length ? 1 : 1 - normalCdf((thresholds[k] - RHO * z) / SD_EPS);
    out.push(Math.max(cum - prevCum, 0));
    prevCum = cum;
  }
  return out;
}

/** z 조건부 기대 등급 E[g|z] */
function expectedGrade(z: number, thresholds: number[]): number {
  let sum = 1;
  for (const t of thresholds) sum += normalCdf((t - RHO * z) / SD_EPS);
  return sum;
}

/** z 조건부 n과목 등급합 분포 (index = 합 − n) */
function sumDistribution(z: number, thresholds: number[], n: number): number[] {
  const p = gradeProbs(z, thresholds);
  let dist = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(dist.length + p.length - 1).fill(0);
    for (let a = 0; a < dist.length; a++) {
      const w = dist[a];
      if (w === 0) continue;
      for (let k = 0; k < p.length; k++) next[a + k] += w * p[k];
    }
    dist = next;
  }
  return dist;
}

// 사후분포 적분 격자 (z ∈ [−5, 5], 간격 0.02 — 더 촘촘히 해도 결과 변화 < 0.001)
const Z_GRID: number[] = [];
for (let z = -5; z <= 5.0001; z += 0.02) Z_GRID.push(Math.round(z * 1000) / 1000);

const cache = new Map<string, number>();

/**
 * 5등급제 내신 평균 → 9등급제 척도 환산 (베이즈 사후평균).
 *
 * @param grade5       5등급제 내신 평균 (1.0~5.0, 낮을수록 우수)
 * @param subjectCount 평균에 반영된 과목 수. 극단값(전 과목 1등급 등)에서만 의미가
 *                     크고 중간 구간에서는 ±0.02 수준이라 몰라도 무방하다.
 */
export function grade5ToGrade9(grade5: number, subjectCount?: number | null): number {
  if (!Number.isFinite(grade5)) return NaN;
  const g = Math.min(Math.max(grade5, 1), 5);
  const n = Math.max(1, Math.round(subjectCount && subjectCount > 0 ? subjectCount : DEFAULT_SUBJECT_COUNT));

  const key = `${g.toFixed(4)}|${n}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  // 관측 평균을 등급합 격자에 사상 (인접 두 정수합에 선형 배분)
  const target = g * n;
  const loSum = Math.floor(target);
  const hiSum = Math.ceil(target);
  const frac = hiSum === loSum ? 0 : target - loSum;

  let weightSum = 0;
  let acc = 0;
  for (const z of Z_GRID) {
    const dist = sumDistribution(z, THRESH5, n);
    const iLo = loSum - n;
    const iHi = hiSum - n;
    const pLo = iLo >= 0 && iLo < dist.length ? dist[iLo] : 0;
    const pHi = iHi >= 0 && iHi < dist.length ? dist[iHi] : 0;
    const like = pLo * (1 - frac) + pHi * frac;
    if (like <= 0) continue;
    const w = Math.exp(-(z * z) / 2) * like; // 사전 φ(z) × 우도
    weightSum += w;
    acc += w * expectedGrade(z, THRESH9);
  }

  // 우도가 전 격자에서 0으로 소멸하는 극단(수치적 언더플로) → 점역산으로 폴백
  const result = weightSum > 0 ? acc / weightSum : pointInvert(g);
  cache.set(key, result);
  return result;
}

/** 폴백: E[g5|z] = grade5 를 z에 대해 이분탐색한 뒤 E[g9|z] (경계에서 포화하므로 보조용) */
function pointInvert(grade5: number): number {
  let lo = -6;
  let hi = 6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (expectedGrade(mid, THRESH5) > grade5) lo = mid;
    else hi = mid;
  }
  return expectedGrade((lo + hi) / 2, THRESH9);
}

/**
 * 학생 내신 등급을 9등급 척도로 정규화.
 * 9등급제 학생(3학년)은 그대로, 5등급제 학생(1·2학년)만 환산한다.
 */
export function toGrade9(
  studentGrade: number,
  isFiveTier: boolean,
  subjectCount?: number | null
): number {
  if (!isFiveTier) return studentGrade;
  return grade5ToGrade9(studentGrade, subjectCount);
}

/** 환산값의 95% 불확실 구간 (5등급제가 버린 정보 때문에 원리적으로 남는 폭) */
export function grade9Interval(
  converted: number
): { low: number; high: number } {
  const half = 1.96 * NAESIN_CONVERT_RESIDUAL_SD;
  return { low: converted - half, high: converted + half };
}
