/**
 * 참고 등급(referenceGrade) 회귀 테스트.
 *
 *   npx tsx scripts/reference-grade-test/run.mts
 *
 * 고정하려는 것 두 가지:
 *  1. **배점이 덜 적재된 회차에서는 등급을 내지 않는다.** 리로스쿨 CSV 에 배점이 없어 일부 회차는
 *     전부 2점이라 국어 45문항이 90점 만점이 된다. 그 상태로 계산하면 1등급컷 90 을 아무도 못
 *     넘어 전원이 낮은 등급으로 찍힌다 — 틀린 등급보다 빈칸이 낫다.
 *  2. 컷은 "그 등급을 받는 **최소** 원점수"다. 경계값(컷과 정확히 같은 점수)이 그 등급이어야 한다.
 */
import {
  computeRawScore,
  gradeFromCuts,
  computeReferenceGrade,
  type GradeCut,
} from '../../src/features/evalearn/utils/referenceGrade';
import type { GradedMarkingItem } from '../../src/features/evalearn/utils/mockGrading';

let passed = 0;
const failures: string[] = [];
function eq<T>(name: string, actual: T, expected: T) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
}

const item = (n: number, isCorrect: boolean | null): GradedMarkingItem =>
  ({ problemNumber: n, studentAnswer: 1, isCorrect, source: isCorrect === null ? 'none' : 'marking' });

const problems = (points: number[]) =>
  new Map(points.map((p, i) => [i + 1, { point: p }]));

/** 2026-09 3학년 화법과작문 실제 컷 */
const HWJ: GradeCut = {
  subject: '화법과작문', source: 'EBS', maxScore: 100, isAbsolute: false,
  cuts: { '1': 90, '2': 84, '3': 76, '4': 66, '5': 54, '6': 43, '7': 28, '8': 19 },
  nationalMean: 53.57, nationalSd: 19.43,
};

// ── 원점수 ────────────────────────────────────────────────────
{
  const items = [item(1, true), item(2, false), item(3, true)];
  const r = computeRawScore(items, problems([2, 3, 4]));
  eq('원점수 = 맞은 문항 배점 합', r.rawScore, 6);
  eq('총 배점', r.totalPoints, 9);
  eq('미채점 0', r.ungraded, 0);
}
{
  // 문항 메타가 없으면 배점을 모르니 총점에도 넣지 않는다
  const r = computeRawScore([item(1, true), item(9, true)], problems([3]));
  eq('메타 없는 문항 제외 - 원점수', r.rawScore, 3);
  eq('메타 없는 문항 제외 - 총점', r.totalPoints, 3);
}
{
  const r = computeRawScore([item(1, true), item(2, null)], problems([2, 2]));
  eq('미채점 카운트', r.ungraded, 1);
  eq('미채점은 오답처럼 점수 없음', r.rawScore, 2);
}

// ── 컷 -> 등급 (경계값) ───────────────────────────────────────
eq('90점 = 1등급(컷과 동일)', gradeFromCuts(90, HWJ.cuts), 1);
eq('89점 = 2등급', gradeFromCuts(89, HWJ.cuts), 2);
eq('84점 = 2등급(컷과 동일)', gradeFromCuts(84, HWJ.cuts), 2);
eq('83점 = 3등급', gradeFromCuts(83, HWJ.cuts), 3);
eq('19점 = 8등급(컷과 동일)', gradeFromCuts(19, HWJ.cuts), 8);
eq('18점 = 9등급', gradeFromCuts(18, HWJ.cuts), 9);
eq('0점 = 9등급', gradeFromCuts(0, HWJ.cuts), 9);
eq('만점 = 1등급', gradeFromCuts(100, HWJ.cuts), 1);

// ── 참고 등급 ────────────────────────────────────────────────
{
  const raw = { rawScore: 85, totalPoints: 100, ungraded: 0 };
  const ref = computeReferenceGrade(raw, HWJ)!;
  eq('참고 등급', ref.grade, 2);
  eq('원점수 전달', ref.rawScore, 85);
  eq('출처', ref.source, 'EBS');
  eq('전국 평균 대비', ref.vsNationalMean, 31.4);
}
{
  // ★ 배점 미적재: 45문항 전부 2점 -> 총점 90 ≠ 만점 100 -> 계산 거부
  const raw = { rawScore: 62, totalPoints: 90, ungraded: 0 };
  eq('배점 미적재면 등급 없음', computeReferenceGrade(raw, HWJ), null);
}
{
  eq('컷이 없으면 등급 없음', computeReferenceGrade({ rawScore: 80, totalPoints: 100, ungraded: 0 }, null), null);
}
{
  // 절대평가(영어) — 추정이 아니라 고정 구간
  const ENG: GradeCut = {
    subject: '영어', source: 'EBS', maxScore: 100, isAbsolute: true,
    cuts: { '1': 90, '2': 80, '3': 70, '4': 60, '5': 50, '6': 40, '7': 30, '8': 20 },
    nationalMean: null, nationalSd: null,
  };
  const ref = computeReferenceGrade({ rawScore: 80, totalPoints: 100, ungraded: 0 }, ENG)!;
  eq('영어 80점 = 2등급', ref.grade, 2);
  eq('절대평가 표시', ref.isAbsolute, true);
  eq('전국 평균 없으면 null', ref.vsNationalMean, null);
}
{
  // 한국사 50점 만점
  const HIS: GradeCut = {
    subject: '한국사', source: 'EBS', maxScore: 50, isAbsolute: true,
    cuts: { '1': 40, '2': 35, '3': 30, '4': 25, '5': 20, '6': 15, '7': 10, '8': 5 },
    nationalMean: null, nationalSd: null,
  };
  eq('한국사 40점 = 1등급', computeReferenceGrade({ rawScore: 40, totalPoints: 50, ungraded: 0 }, HIS)!.grade, 1);
  eq('한국사 만점 다르면 거부', computeReferenceGrade({ rawScore: 40, totalPoints: 40, ungraded: 0 }, HIS), null);
}

console.log(`\n통과 ${passed} / 실패 ${failures.length}`);
if (failures.length > 0) {
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('OK');
