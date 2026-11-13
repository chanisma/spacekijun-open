/**
 * 문항 분석(itemAnalysis) 회귀 테스트.
 *
 *   npx tsx scripts/item-analysis-test/run.mts
 *
 * 학교가 이미 쓰던 업로드 리포트(evalearn_grade_analysis)의 지표를 그대로 계산하므로,
 * 그 리포트의 해석 기준(KR-20 >=0.80 양호, rpb >=0.30 우수, 품질 A/B/C, 등급 4그룹)을 고정한다.
 */
import {
  groupFromGrade,
  assignGroupsByScore,
  computeItemStats,
  computeReliability,
  skewness,
  kurtosis,
  classifyItemDifficulty,
  classifyDiscrimination,
  type ItemResponse,
  isDiscriminationConclusive,
} from '../../src/features/evalearn/utils/itemAnalysis';

let passed = 0;
const failures: string[] = [];
function eq<T>(name: string, actual: T, expected: T) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
}
function near(name: string, actual: number | null, expected: number, tol = 0.02) {
  if (actual != null && Math.abs(actual - expected) <= tol) passed++;
  else failures.push(`${name} — expected ≈${expected}, got ${String(actual)}`);
}
function ok(name: string, cond: boolean, detail = '') {
  if (cond) passed++; else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

// ── 등급 -> 능력 그룹 (리포트 경계) ──────────────────────────
eq('1등급 = 상', groupFromGrade(1), '상');
eq('2등급 = 상', groupFromGrade(2), '상');
eq('3등급 = 중상', groupFromGrade(3), '중상');
eq('4등급 = 중상', groupFromGrade(4), '중상');
eq('5등급 = 중하', groupFromGrade(5), '중하');
eq('6등급 = 중하', groupFromGrade(6), '중하');
eq('7등급 = 하', groupFromGrade(7), '하');
eq('9등급 = 하', groupFromGrade(9), '하');
eq('등급 없으면 null', groupFromGrade(null), null);
// 미응시는 grade=0 으로 저장된다 — '상'으로 새면 변별도가 통째로 망가진다
eq('미응시 0은 그룹 없음', groupFromGrade(0), null);
eq('10등급 같은 값도 없음', groupFromGrade(10), null);

// ── 원점수 사분위 대체 ───────────────────────────────────────
{
  const scores = Array.from({ length: 8 }, (_, i) => ({ studentId: `s${i}`, totalScore: 100 - i * 10 }));
  const g = assignGroupsByScore(scores);
  eq('최고점 = 상', g.get('s0'), '상');
  eq('최저점 = 하', g.get('s7'), '하');
  eq('사분위 경계', g.get('s2'), '중상');
  eq('빈 입력', assignGroupsByScore([]).size, 0);
}

// ── 문항 통계: 완전 변별 문항 ────────────────────────────────
{
  // 상위 2명만 맞힌 문항 0, 전원이 맞힌 문항 1
  const responses: ItemResponse[] = [
    { studentId: 'a', correct: [true, true], totalScore: 100, group: '상' },
    { studentId: 'b', correct: [true, true], totalScore: 90, group: '상' },
    { studentId: 'c', correct: [false, true], totalScore: 50, group: '하' },
    { studentId: 'd', correct: [false, true], totalScore: 40, group: '하' },
  ];
  const items = computeItemStats(responses, 2);

  eq('문항1 정답률', items[0].correctRate, 50);
  eq('문항1 상 그룹 100%', items[0].byGroup['상'], 100);
  eq('문항1 하 그룹 0%', items[0].byGroup['하'], 0);
  eq('문항1 변별도 D=100', items[0].discrimination, 100);
  ok('문항1 rpb 높음', (items[0].rpb ?? 0) > 0.9, `rpb=${items[0].rpb}`);

  eq('문항2 정답률 100', items[1].correctRate, 100);
  eq('전원 정답이면 rpb 없음', items[1].rpb, null);
  eq('응답 없는 그룹은 null', items[0].byGroup['중상'], null);
}

// ── 역변별: 하위권이 더 잘 맞힌 문항 ─────────────────────────
{
  const responses: ItemResponse[] = [
    { studentId: 'a', correct: [false], totalScore: 100, group: '상' },
    { studentId: 'b', correct: [false], totalScore: 90, group: '상' },
    { studentId: 'c', correct: [true], totalScore: 50, group: '하' },
    { studentId: 'd', correct: [true], totalScore: 40, group: '하' },
  ];
  const items = computeItemStats(responses, 1);
  eq('역변별 D 음수', items[0].discrimination, -100);
  ok('역변별 rpb 음수', (items[0].rpb ?? 0) < 0, `rpb=${items[0].rpb}`);
  eq('역변별 분류', classifyDiscrimination(items[0].rpb), '역변별');
}

// ── 채점 불가(null)는 응답에서 제외 ─────────────────────────
{
  const responses: ItemResponse[] = [
    { studentId: 'a', correct: [true], totalScore: 10, group: '상' },
    { studentId: 'b', correct: [null], totalScore: 5, group: '하' },
  ];
  const items = computeItemStats(responses, 1);
  eq('미채점 제외 - 응답 수', items[0].answered, 1);
  eq('미채점 제외 - 정답률', items[0].correctRate, 100);
}

// ── KR-20 · 품질 등급 ───────────────────────────────────────
{
  // 일관된 시험: 능력 순서대로 맞힌다 -> 신뢰도 높음
  const mk = (id: string, n: number, total: number, group: '상' | '하'): ItemResponse => ({
    studentId: id,
    correct: Array.from({ length: 6 }, (_, i) => i < n),
    totalScore: total,
    group,
  });
  const responses = [mk('a', 6, 6, '상'), mk('b', 5, 5, '상'), mk('c', 2, 2, '하'), mk('d', 1, 1, '하')];
  const items = computeItemStats(responses, 6);
  const rel = computeReliability(responses, items);
  ok('KR-20 산출', rel.kr20 !== null);
  ok('일관된 시험은 신뢰도 높음', (rel.kr20 ?? 0) > 0.7, `kr20=${rel.kr20}`);
  eq('문항 수', rel.items, 6);
}
{
  // 총점 분산이 0이면 KR-20 정의 불가
  const same: ItemResponse[] = [
    { studentId: 'a', correct: [true, false], totalScore: 5, group: '상' },
    { studentId: 'b', correct: [true, false], totalScore: 5, group: '하' },
  ];
  eq('분산 0이면 KR-20 없음', computeReliability(same, computeItemStats(same, 2)).kr20, null);
}

// ── 왜도·첨도 ────────────────────────────────────────────────
{
  const symmetric = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  near('대칭이면 왜도 0', skewness(symmetric), 0);
  // 저득점 쏠림(오른쪽 꼬리) -> 왜도 +
  ok('저득점 쏠림 = 양의 왜도', (skewness([1, 1, 1, 2, 2, 3, 9]) ?? 0) > 0);
  // 고득점 쏠림 -> 왜도 -
  ok('고득점 쏠림 = 음의 왜도', (skewness([1, 7, 8, 8, 9, 9, 9]) ?? 0) < 0);
  eq('표본 부족하면 null', skewness([1, 2]), null);
  eq('첨도 표본 부족', kurtosis([1, 2, 3]), null);
  eq('분산 0이면 왜도 null', skewness([5, 5, 5, 5]), null);
}

// ── 난이도·변별 분류 (리포트 기준) ──────────────────────────
eq('85% 이상 = 쉬움', classifyItemDifficulty(85), '쉬움');
eq('84.9% = 보통', classifyItemDifficulty(84.9), '보통');
eq('30% = 보통', classifyItemDifficulty(30), '보통');
eq('29.9% = 어려움', classifyItemDifficulty(29.9), '어려움');
eq('rpb 0.3 = 고변별', classifyDiscrimination(0.3), '고변별');
eq('rpb 0.29 = 저변별', classifyDiscrimination(0.29), '저변별');
eq('rpb null = 미상', classifyDiscrimination(null), '미상');

// ── rpb 신뢰구간과 "단정 가능한가" (2026-09-05) ──────────────────────────
/*
  개별 문항의 rpb 는 학교 한 회차(126~190명)에서 재현성이 0.23~0.73 이다
  (`scripts/irt-probe` 반분 검증). 그래서 값 옆에 Fisher z 신뢰구간을 붙이고,
  구간이 경계를 걸치면 색으로 단정하지 않는다. 여기서 지키는 것은 그 판정 규칙이다.
*/
{
  const ci = (lo: number, hi: number): [number, number] => [lo, hi];
  eq('구간이 0.3 위에 통째로 있으면 단정 가능',
    isDiscriminationConclusive({ rpb: 0.45, rpbCI: ci(0.32, 0.56) }), true);
  eq('구간이 0.3 을 걸치면 단정 불가',
    isDiscriminationConclusive({ rpb: 0.35, rpbCI: ci(0.18, 0.50) }), false);
  eq('구간이 0.3 아래에 통째로 있으면 단정 가능(저변별 확정)',
    isDiscriminationConclusive({ rpb: 0.12, rpbCI: ci(0.02, 0.22) }), true);
  eq('구간이 0 을 걸치면 역변별인지조차 모른다',
    isDiscriminationConclusive({ rpb: -0.05, rpbCI: ci(-0.20, 0.11) }), false);
  eq('구간이 전부 음수면 역변별 확정',
    isDiscriminationConclusive({ rpb: -0.25, rpbCI: ci(-0.40, -0.08) }), true);
  eq('rpb 가 없으면 단정 불가', isDiscriminationConclusive({ rpb: null, rpbCI: null }), false);
  eq('구간이 없으면 단정 불가', isDiscriminationConclusive({ rpb: 0.5, rpbCI: null }), false);

  // 표본이 커지면 구간이 좁아진다 — 같은 지표라도 n 에 따라 판정이 갈려야 한다
  const stats = (n: number) => computeItemStats(
    Array.from({ length: n }, (_, i) => ({
      studentId: String(i),
      correct: [i % 3 === 0, i < n / 2],
      totalScore: i % 7,
      group: null,
    })), 2);
  const small = stats(30)[0];
  const large = stats(600)[0];
  const width = (x: { rpbCI: [number, number] | null }) => (x.rpbCI ? x.rpbCI[1] - x.rpbCI[0] : NaN);
  eq('표본이 크면 구간이 좁다', width(large) < width(small), true);
  eq('구간은 rpb 를 담는다',
    small.rpbCI != null && small.rpb != null
      && small.rpbCI[0] <= small.rpb && small.rpb <= small.rpbCI[1], true);
  eq('표본이 5명 미만이면 구간 없음', computeItemStats(
    [{ studentId: 'a', correct: [true], totalScore: 1, group: null },
     { studentId: 'b', correct: [false], totalScore: 0, group: null }], 1)[0].rpbCI, null);
}


console.log(`\n통과 ${passed} / 실패 ${failures.length}`);
if (failures.length > 0) {
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('OK');
