/**
 * 수능 추정(3-2 모의고사 예측) + 평가원 판정 회귀 테스트.
 *
 *   npx tsx scripts/suneung-estimate-test/run.mts
 *
 * 고정하려는 것 세 가지:
 *  1. **가중치가 조용히 바뀌지 않는다.** 9월 0.6 / 6월 0.4 는 사용자 결정이고 검증된 적 없는
 *     규칙이라(졸업생 수능 기록 0건) 코드가 유일한 근거다. 숫자가 흔들리면 여기서 잡힌다.
 *  2. **한쪽 회차만 있을 때 단독으로 떨어진다.** 6월 미응시 10명·9월 기록 없는 45명이 실재해서,
 *     둘 다 요구하면 그 학생들의 수능 칸이 통째로 빈다.
 *  3. **평가원은 고3의 6·9월뿐이다.** 월만 보면 1·2학년 학평에 '평가원' 배지가 붙어
 *     "재수생이 함께 본 시험"이라는 잘못된 뜻을 전한다.
 */
import {
  estimateSuneungGrades,
  coreGradesFromExam,
  coreGradesFromReference,
  isPyeonggawonExam,
  SUNEUNG_WEIGHT_SEPTEMBER,
  SUNEUNG_WEIGHT_JUNE,
} from '../../src/features/student-dashboard/utils/analysisUtils';

let passed = 0;
const failures: string[] = [];
function eq<T>(name: string, actual: T, expected: T) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
}
function close(name: string, actual: number | undefined, expected: number) {
  if (actual != null && Math.abs(actual - expected) < 1e-9) passed++;
  else failures.push(`${name} — expected ${expected}, got ${String(actual)}`);
}
function deepEq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) passed++;
  else failures.push(`${name}\n      expected ${b}\n      got      ${a}`);
}

// ── 가중치 ────────────────────────────────────────────────────────────────
eq('9월 가중치 0.6', SUNEUNG_WEIGHT_SEPTEMBER, 0.6);
eq('6월 가중치 0.4', SUNEUNG_WEIGHT_JUNE, 0.4);
eq('가중치 합 1', SUNEUNG_WEIGHT_SEPTEMBER + SUNEUNG_WEIGHT_JUNE, 1);

// ── 혼합 ──────────────────────────────────────────────────────────────────
{
  const e = estimateSuneungGrades({ korean: 2, math: 4, english: 3 }, { korean: 3, math: 3, english: 1 })!;
  close('국어 = .6×2 + .4×3', e.subjects.korean?.grade, 2.4);
  close('수학 = .6×4 + .4×3', e.subjects.math?.grade, 3.6);
  close('영어 = .6×3 + .4×1', e.subjects.english?.grade, 2.2);
  close('전체 = 세 과목 평균', e.overall!, (2.4 + 3.6 + 2.2) / 3);
  eq('근거 = 혼합', e.basis, 'blend');
  eq('9월 비중이 더 크다', e.subjects.korean!.grade < 2.5, true);
}

// ── 한쪽만 있을 때 ────────────────────────────────────────────────────────
{
  // 9월 기록 없음(라이브 45명) — 6월 단독으로 떨어져야 수능 칸이 살아남는다
  const e = estimateSuneungGrades(null, { korean: 3, math: 5 })!;
  close('6월 단독 - 국어', e.subjects.korean?.grade, 3);
  eq('근거 = 6월', e.basis, 'june');
  eq('영어는 값이 없으면 만들지 않는다', e.subjects.english, undefined);
}
{
  // 6월 미응시(라이브 10명)
  const e = estimateSuneungGrades({ korean: 2, math: 2, english: 2 }, null)!;
  close('9월 단독', e.subjects.korean?.grade, 2);
  eq('근거 = 9월', e.basis, 'september');
}
{
  // 과목마다 근거가 다를 수 있다(6월엔 봤는데 9월엔 탐구를 바꾼 경우 등)
  const e = estimateSuneungGrades({ korean: 2 }, { korean: 4, math: 5 })!;
  eq('국어는 혼합', e.subjects.korean?.basis, 'blend');
  eq('수학은 6월 단독', e.subjects.math?.basis, 'june');
  eq('전체 근거 = mixed', e.basis, 'mixed');
}
{
  eq('둘 다 없으면 추정 없음', estimateSuneungGrades(null, null), null);
  eq('빈 객체도 추정 없음', estimateSuneungGrades({}, {}), null);
}

// ── 계열 접기 ─────────────────────────────────────────────────────────────
{
  // 3학년은 국어·수학이 선택과목명으로 온다
  deepEq('성적표 → 계열',
    coreGradesFromExam({ 화법과작문: { grade: 2 }, 확률과통계: { grade: 3 }, 영어: { grade: 1 }, '사회·문화': { grade: 4 } }),
    { korean: 2, math: 3, english: 1 });
  deepEq('참고 등급 Map → 계열',
    coreGradesFromReference(new Map([['언어와매체', { grade: 3 }], ['미적분', { grade: 2 }], ['생명과학Ⅰ', { grade: 5 }]])),
    { korean: 3, math: 2 });
}
{
  // 미응시는 등급 0 으로 온다 — 그대로 쓰면 안 본 과목이 1등급보다 좋은 값이 된다
  deepEq('미응시(0)는 버린다', coreGradesFromExam({ 화법과작문: { grade: 0 }, 영어: { grade: 2 } }), { english: 2 });
  deepEq('null 등급도 버린다', coreGradesFromExam({ 미적분: { grade: null }, 영어: { grade: 3 } }), { english: 3 });
  deepEq('빈 입력', coreGradesFromExam(null), {});
}
{
  // 미응시가 섞이면 추정도 그 과목만 빠져야 한다
  const e = estimateSuneungGrades(coreGradesFromExam({ 화법과작문: { grade: 2 }, 확률과통계: { grade: 0 } }),
                                  coreGradesFromExam({ 화법과작문: { grade: 4 }, 확률과통계: { grade: 3 } }))!;
  close('9월 미응시 과목은 6월 단독', e.subjects.math?.grade, 3);
  eq('그 과목 근거 = 6월', e.subjects.math?.basis, 'june');
}

// ── 평가원 판정 ───────────────────────────────────────────────────────────
{
  eq('고3 6월 = 평가원', isPyeonggawonExam(3, 6), true);
  eq('고3 9월 = 평가원', isPyeonggawonExam(3, 9), true);
  eq('고3 3월 = 학평', isPyeonggawonExam(3, 3), false);
  eq('고3 5월 = 학평', isPyeonggawonExam(3, 5), false);
  eq('고3 11월(수능)은 평가원 배지 대상 아님', isPyeonggawonExam(3, 11), false);
  eq('1학년 6월 = 학평', isPyeonggawonExam(1, 6), false);
  eq('1학년 9월 = 학평', isPyeonggawonExam(1, 9), false);
  eq('2학년 6월 = 학평', isPyeonggawonExam(2, 6), false);
  eq('2학년 9월 = 학평', isPyeonggawonExam(2, 9), false);
  eq('학년 없음', isPyeonggawonExam(null, 6), false);
  eq('월 없음', isPyeonggawonExam(3, null), false);
}

console.log(`\n수능 추정 · 평가원 판정 — ${passed}건 통과${failures.length ? `, ${failures.length}건 실패` : ''}`);
if (failures.length) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
