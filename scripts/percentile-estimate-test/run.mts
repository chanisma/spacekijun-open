/**
 * 원점수 → 백분위 근사 회귀.
 *
 *   npx tsx scripts/percentile-estimate-test/run.mts
 *
 * ## 왜 백분위인가
 * 등급은 9칸뿐이라 한 칸이 백분위 10~20 폭을 덮는다 — 3등급 맨 위와 맨 아래가 같은 값이 된다.
 * 수능까지 남은 성적을 다루기엔 해상도가 모자라서, EBS 가 등급컷마다 함께 발표하는 백분위를
 * 앵커로 삼아 원점수를 백분위로 옮긴다.
 *
 * ## 근사의 실측 오차 (2026-09-05)
 * 6월 회차는 공식 원점수와 백분위가 **둘 다** 있어 같은 방법을 적용해 대조할 수 있다.
 * 그 과목의 실제 컷을 앵커로 썼을 때 695건 기준 **MAE 0.94백분위 · 95분위 2.3 · 최대 11**.
 * 즉 보간 자체는 거의 문제가 없다.
 *
 * ⚠️ 다만 9월은 **EBS 추정 컷** 위에 얹은 근사라 컷 자체의 오차가 더해진다. 그 크기는
 * 공식 성적이 나오기 전까지 잴 수 없다 — 화면은 반드시 '추정'으로 표시할 것.
 */
import {
  estimatePercentile,
  gradeFromPercentile,
  type GradeCut,
} from '../../src/features/evalearn/utils/referenceGrade';

let passed = 0;
const failures: string[] = [];
function eq<T>(name: string, actual: T, expected: T) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
}
function near(name: string, actual: number | null, expected: number, tol = 0.05) {
  if (actual != null && Math.abs(actual - expected) <= tol) passed++;
  else failures.push(`${name} — expected ~${expected}, got ${String(actual)}`);
}

/** 2026-09 3학년 화법과작문 실제 컷·백분위 */
const HWJ = {
  maxScore: 100,
  cuts: { '1': 90, '2': 84, '3': 76, '4': 66, '5': 54, '6': 43, '7': 28, '8': 19 },
  cutPercentiles: { max: 98, '1': 96, '2': 89, '3': 77, '4': 61, '5': 40, '6': 23, '7': 11, '8': 4 },
};

// ── 앵커 위에서는 정확히 그 값 ─────────────────────────────────────────────
{
  near('만점 = 최고 백분위', estimatePercentile(100, HWJ), 98);
  near('1등급컷', estimatePercentile(90, HWJ), 96);
  near('3등급컷', estimatePercentile(76, HWJ), 77);
  near('5등급컷', estimatePercentile(54, HWJ), 40);
  near('8등급컷', estimatePercentile(19, HWJ), 4);
  near('0점 = 0', estimatePercentile(0, HWJ), 0);
}

// ── 앵커 사이는 선형보간 ───────────────────────────────────────────────────
{
  // 76(77) ~ 84(89) 사이 한가운데 80 -> 83
  near('구간 중앙 보간', estimatePercentile(80, HWJ), 83);
  // 66(61) ~ 76(77) 사이 71 -> 69
  near('구간 보간 2', estimatePercentile(71, HWJ), 69);
  eq('단조 증가', estimatePercentile(70, HWJ)! < estimatePercentile(71, HWJ)!, true);
}

// ── 범위 밖은 잘라낸다 ────────────────────────────────────────────────────
{
  near('만점 초과는 만점 취급', estimatePercentile(120, HWJ), 98);
  near('음수는 0 취급', estimatePercentile(-10, HWJ), 0);
}

// ── 백분위 앵커가 없으면 계산하지 않는다 ──────────────────────────────────
{
  // 영어·한국사는 절대평가라 백분위가 없다 — 없는 값을 지어내면 안 된다
  eq('cutPercentiles 없음 -> null',
    estimatePercentile(90, { maxScore: 100, cuts: HWJ.cuts, cutPercentiles: null }), null);
  eq('cut 자체가 없음 -> null', estimatePercentile(90, null), null);
  eq('앵커가 하나뿐이면 null',
    estimatePercentile(50, { maxScore: 100, cuts: {}, cutPercentiles: { max: 99 } }), null);
  eq('원점수가 숫자가 아니면 null', estimatePercentile(NaN, HWJ), null);
}

// ── 1등급컷 = 만점인 과목 (실재: 세계지리·동아시아사·물리학Ⅰ) ──────────────
{
  const SEGYE = {
    maxScore: 50,
    cuts: { '1': 50, '2': 47, '3': 41, '4': 33, '5': 23, '6': 16, '7': 11, '8': 7 },
    cutPercentiles: { max: 97, '1': 97, '2': 90, '3': 77, '4': 60, '5': 40, '6': 23, '7': 11, '8': 4 },
  };
  near('원점수가 겹쳐도 터지지 않는다', estimatePercentile(50, SEGYE), 97);
  near('그 아래는 정상 보간', estimatePercentile(47, SEGYE), 90);
  eq('겹친 앵커에서 단조성 유지', estimatePercentile(48, SEGYE)! >= 90, true);
}

// ── 백분위 -> 등급 ────────────────────────────────────────────────────────
{
  eq('96 -> 1등급', gradeFromPercentile(96), 1);
  eq('95.9 -> 2등급', gradeFromPercentile(95.9), 2);
  eq('89 -> 2등급', gradeFromPercentile(89), 2);
  eq('77 -> 3등급', gradeFromPercentile(77), 3);
  eq('60 -> 4등급', gradeFromPercentile(60), 4);
  eq('40 -> 5등급', gradeFromPercentile(40), 5);
  eq('23 -> 6등급', gradeFromPercentile(23), 6);
  eq('11 -> 7등급', gradeFromPercentile(11), 7);
  eq('4 -> 8등급', gradeFromPercentile(4), 8);
  eq('3.9 -> 9등급', gradeFromPercentile(3.9), 9);
  eq('0 -> 9등급', gradeFromPercentile(0), 9);
  eq('숫자가 아니면 null', gradeFromPercentile(NaN), null);
}

// ── 왕복: 등급컷 지점의 백분위는 그 등급으로 되돌아온다 ────────────────────
{
  for (let g = 1; g <= 8; g++) {
    const raw = HWJ.cuts[String(g) as keyof typeof HWJ.cuts];
    const pct = estimatePercentile(raw, HWJ)!;
    eq(`${g}등급컷 원점수 -> 백분위 -> ${g}등급`, gradeFromPercentile(pct), g);
  }
}

console.log(`\n원점수 → 백분위 근사 — ${passed}건 통과${failures.length ? `, ${failures.length}건 실패` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
