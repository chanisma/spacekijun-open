/**
 * 집단 분석 시험 목록 정렬 회귀 — `npx tsx scripts/cohort-exams-test/run.mts`
 *
 * 두 규칙 모두 **깨져도 오류가 나지 않는다**:
 *  · tie 를 안 끊으면 순서가 학생 명단 순서에 따라 매번 달라진다(실행마다 다른 화면).
 *  · 소수 학년을 안 걸러내면 1명짜리 회차가 목록에 남아 1명 통계를 낸다.
 * 그래서 라이브에서 실제로 관측된 형태(2026년 3학년 코호트)를 그대로 못 박는다.
 */
import { orderCohortExams, type CohortExamRow } from '../../src/features/evalearn/utils/cohortExams';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
const row = (y: number, m: number, g: number, n: number): CohortExamRow =>
  ({ academic_year: y, exam_month: m, exam_grade: g, studentCount: n });

const key = (e: CohortExamRow) => `${e.academic_year}-${e.exam_month}-${e.exam_grade}`;

// ── 라이브 형태: 2026년 3학년 코호트(217명) ──────────────────────────────
const live: CohortExamRow[] = [
  row(2026, 9, 3, 172), row(2026, 8, 3, 156), row(2026, 7, 3, 172),
  row(2026, 6, 3, 193), row(2026, 5, 3, 180), row(2026, 3, 3, 193),
  row(2025, 9, 2, 208), row(2025, 9, 1, 1),
  row(2025, 6, 2, 206), row(2025, 6, 1, 1),
  row(2025, 3, 2, 210), row(2025, 3, 1, 1),
  row(2024, 9, 1, 209), row(2024, 6, 1, 211), row(2024, 3, 1, 212),
];

const out = orderCohortExams(live);

check('전입생 1명짜리 중복 학년 3줄이 사라진다', out.length === 12, `${out.length}줄`);
check('1학년 1명 회차가 남아 있지 않다', !out.some((e) => e.studentCount === 1));
check('맨 위가 가장 최근 회차', key(out[0]) === '2026-9-3', key(out[0]));
check('맨 아래가 가장 오래된 회차', key(out[out.length - 1]) === '2024-3-1', key(out[out.length - 1]));
check(
  '연·월 내림차순이 전 구간에서 유지된다',
  out.every((e, i) => i === 0 || (
    out[i - 1].academic_year > e.academic_year ||
    (out[i - 1].academic_year === e.academic_year && out[i - 1].exam_month >= e.exam_month)
  ))
);
check('2025년은 2학년 회차만 남는다', out.filter((e) => e.academic_year === 2025).every((e) => e.exam_grade === 2));
check('8월(일부 응시 156명)은 그대로 남는다', out.some((e) => key(e) === '2026-8-3'));

// ── 입력 순서가 결과를 바꾸지 않는다(결정성) ─────────────────────────────
const shuffled = [...live].reverse();
check(
  '입력 순서가 달라도 같은 결과',
  JSON.stringify(orderCohortExams(shuffled)) === JSON.stringify(out)
);
const tied = [row(2025, 3, 1, 50), row(2025, 3, 2, 50)];
check('인원까지 같으면 높은 학년이 위', orderCohortExams(tied)[0].exam_grade === 2);
check('인원이 같으면 둘 다 남는다', orderCohortExams(tied).length === 2);

// ── 10% 경계 ────────────────────────────────────────────────────────────
check('정확히 10%면 남는다', orderCohortExams([row(2025, 3, 2, 200), row(2025, 3, 1, 20)]).length === 2);
check('10% 미만이면 감춘다', orderCohortExams([row(2025, 3, 2, 200), row(2025, 3, 1, 19)]).length === 1);
check(
  '학년이 실제로 갈리는 회차는 둘 다 남는다',
  orderCohortExams([row(2025, 3, 2, 120), row(2025, 3, 1, 90)]).length === 2
);

// ── 같은 달에 경쟁이 없으면 아무리 적어도 남는다 ─────────────────────────
check(
  '단독 회차는 1명이어도 남는다',
  orderCohortExams([row(2026, 9, 3, 200), row(2026, 4, 3, 1)]).length === 2
);

// ── 원본을 건드리지 않는다 ───────────────────────────────────────────────
const before = JSON.stringify(live);
orderCohortExams(live);
check('입력 배열을 변형하지 않는다', JSON.stringify(live) === before);
check('빈 목록도 안전', orderCohortExams([]).length === 0);

console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
