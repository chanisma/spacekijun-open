/**
 * 집단 통계(cohortStats) 회귀 테스트.
 *
 *   npx tsx scripts/cohort-stats-test/run.mts
 *
 * 가장 중요한 고정: **24명짜리 반끼리의 평균 차이는 대부분 판단 보류여야 한다.**
 * `compareGroups` 가 작은 차이를 'higher/lower' 로 단정하면 담임 간 오해를 만든다.
 */
import {
  quantile,
  computeCohortStats,
  histogram,
  countPeaks,
  compareGroups,
  diagnose,
} from '../../src/features/evalearn/utils/cohortStats';

let passed = 0;
const failures: string[] = [];
function eq<T>(name: string, actual: T, expected: T) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
}
function ok(name: string, cond: boolean, detail = '') {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

// ── 분위수 ────────────────────────────────────────────────────
{
  const s = [1, 2, 3, 4, 5];
  eq('중앙값', quantile(s, 0.5), 3);
  eq('Q1', quantile(s, 0.25), 2);
  eq('Q3', quantile(s, 0.75), 4);
  eq('최솟값', quantile(s, 0), 1);
  eq('한 개짜리', quantile([7], 0.5), 7);
}

// ── 기본 통계 ─────────────────────────────────────────────────
{
  const st = computeCohortStats([10, 20, 30, 40, 50])!;
  eq('n', st.n, 5);
  eq('평균', st.mean, 30);
  eq('중앙값', st.median, 30);
  eq('IQR', st.iqr, 20);
  eq('대칭이면 왜도 0', st.bowleySkew, 0);
  ok('표준오차 존재', st.standardError !== null);
  eq('빈 배열', computeCohortStats([]), null);
  eq('한 명이면 sd 없음', computeCohortStats([50])!.sd, null);
}

// ── 왜도: 오른쪽 꼬리 ─────────────────────────────────────────
{
  // 대다수 낮고 소수 고득점 -> 평균 > 중앙값
  const st = computeCohortStats([10, 12, 14, 16, 18, 20, 22, 95])!;
  ok('평균 > 중앙값', st.mean > st.median, `mean ${st.mean} median ${st.median}`);
  const d = diagnose(st, 100);
  ok('평균-중앙값 경고 발생', d.some((x) => x.kind === 'skew' && x.severity === 'warn'));
}

// ── 히스토그램·봉우리 ─────────────────────────────────────────
{
  const bins = histogram([0, 4, 5, 9, 99, 100], 100, 5);
  eq('구간 개수', bins.length, 20);
  eq('0~5 구간', bins[0].count, 2);
  eq('5~10 구간', bins[1].count, 2);
  eq('만점은 마지막 구간에', bins[19].count, 2);
}
{
  // 이봉: 20점대와 80점대에 몰림
  const values = [...Array(10).fill(22), ...Array(10).fill(82)];
  ok('이봉 감지', countPeaks(histogram(values, 100, 5)) >= 2);
  // 단봉
  const single = [...Array(20).fill(52)];
  eq('단봉', countPeaks(histogram(single, 100, 5)), 1);
}

// ── ★ 24명 반 비교: 작은 차이는 판단 보류 ─────────────────────
{
  // 표준편차 20 안팎, 평균 5점 차 — 실무에서 "우리 반이 낮다"고 오해하는 크기
  const mk = (base: number) => Array.from({ length: 24 }, (_, i) => base + ((i % 9) - 4) * 7);
  const a = computeCohortStats(mk(60))!;
  const b = computeCohortStats(mk(55))!;
  const cmp = compareGroups(a, b);
  eq('평균 차이 5점', cmp.difference, 5);
  eq('5점 차이는 판단 보류', cmp.verdict, 'inconclusive');
  ok('표준오차 제공', cmp.standardError !== null);
}
{
  // 20점 차이는 같은 표본 크기에서도 실제 차이로 잡혀야 한다
  const mk = (base: number) => Array.from({ length: 24 }, (_, i) => base + ((i % 9) - 4) * 7);
  const cmp = compareGroups(computeCohortStats(mk(75))!, computeCohortStats(mk(55))!);
  eq('20점 차이는 higher', cmp.verdict, 'higher');
}
{
  const one = computeCohortStats([50])!;
  eq('표본 1명이면 판단 보류', compareGroups(one, one).verdict, 'inconclusive');
}

// ── 진단 문구 ────────────────────────────────────────────────
{
  // 변별 약함: 중위권이 좁게 뭉침
  const tight = computeCohortStats(Array.from({ length: 40 }, (_, i) => 50 + (i % 5)))!;
  ok('IQR 경고', diagnose(tight, 100).some((d) => d.kind === 'discrimination'));
}
{
  // 천장 효과
  const ceiling = computeCohortStats(Array.from({ length: 40 }, (_, i) => 92 + (i % 9)))!;
  ok('천장 효과 경고', diagnose(ceiling, 100).some((d) => d.kind === 'ceiling'));
}
{
  // 바닥 효과
  const floorSet = computeCohortStats(Array.from({ length: 40 }, (_, i) => i % 12))!;
  ok('바닥 효과 경고', diagnose(floorSet, 100).some((d) => d.kind === 'floor'));
}
{
  // 50점 만점 과목은 기준이 절반이어야 한다 — 100점 기준을 그대로 쓰면 전 과목이 '변별 약함'이 된다
  const half = computeCohortStats(Array.from({ length: 40 }, (_, i) => 10 + (i % 20)))!;
  const at100 = diagnose(half, 100).some((d) => d.kind === 'discrimination');
  const at50 = diagnose(half, 50).some((d) => d.kind === 'discrimination');
  ok('만점 척도 반영', at100 === true && at50 === false, `100점기준 ${at100} / 50점기준 ${at50}`);
}
{
  const small = computeCohortStats(Array.from({ length: 24 }, (_, i) => 40 + i))!;
  ok('작은 표본 안내', diagnose(small, 100).some((d) => d.kind === 'sample'));
  const big = computeCohortStats(Array.from({ length: 200 }, (_, i) => 40 + (i % 50)))!;
  ok('큰 표본엔 안내 없음', !diagnose(big, 100).some((d) => d.kind === 'sample'));
}

console.log(`\n통과 ${passed} / 실패 ${failures.length}`);
if (failures.length > 0) {
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('OK');
