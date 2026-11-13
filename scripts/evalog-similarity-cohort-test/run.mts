/**
 * 유사도 대조 범위(같은 학년) 회귀 — 순수 로직.
 *
 *   npx tsx scripts/evalog-similarity-cohort-test/run.mts
 *
 * ── 왜 이 테스트가 필요한가 ─────────────────────────────────────────────────
 * 이 기능의 결함은 **오류를 내지 않고 "일치 0건"으로 보인다**. 그리고 "일치 0건"은
 * "이 학생 기록은 깨끗하다"와 구분되지 않는다 — 교사는 잘못된 안심을 얻는다.
 * 실제로 종전 구현은 `student_no` 앞 4자리를 입학연도로 착각해 **후보 870명 중 6명**과만
 * 대조하고 있었고, 화면에는 아무 표시도 없었다.
 *
 * 아래 단언들은 그 착각을 다시 할 수 없게 못 박는다.
 */
import {
  SIMILARITY_PAGE_SIZE, filterSameGrade, isSameGrade, pageRanges, resolveStudentGrade,
  type GradeBearing,
} from '../../src/features/evalog/utils/similarityCohort';
import { findExactSentenceMatches } from '../../src/features/evalog/utils/similarity';

let pass = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass += 1; return; }
  failures.push(detail ? `${name} — ${detail}` : name);
};
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. 학년 판정 — 라이브 실측값을 그대로 옮긴 사례들
// ─────────────────────────────────────────────────────────────────────────────

eq('grade 가 있으면 그것', resolveStudentGrade({ grade: 2, studentNo: '20101' }), 2);
eq('grade 가 문자열로 와도 받는다', resolveStudentGrade({ grade: '3', studentNo: '30101' }), 3);

// 류하린(00-00790): grade 가 비었지만 student_no 는 살아 있다 — 학반번 첫 자리로 떨어진다
eq('grade 가 비면 student_no 첫 자리', resolveStudentGrade({ studentNo: '10620' }), 1);
eq('grade=null 도 같다', resolveStudentGrade({ grade: null, studentNo: '30927' }), 3);

// 한선우(00-00645): 학적 코드는 25학번이지만 실제 3학년인 전입생.
// **입학연도로 학년을 유도하면 2학년으로 잘못 묶인다** — 그래서 유도하지 않는다.
eq('전입생: grade 를 믿는다', resolveStudentGrade({ grade: 3, studentNo: '30108' }), 3);

eq('둘 다 없으면 null', resolveStudentGrade({}), null);
eq('빈 학번은 null', resolveStudentGrade({ studentNo: '' }), null);
eq('학년 범위를 벗어난 값은 거부', resolveStudentGrade({ grade: 4, studentNo: '' }), null);
eq('0학년 거부', resolveStudentGrade({ grade: 0, studentNo: '' }), null);
// 졸업생의 student_no 는 '3' 으로 시작한다(작년 학반번이 그대로 남는다). 학년 판정
// 자체는 3을 주지만, **후보 명단을 resource(status='active')에서 뽑으므로** 섞이지 않는다.
eq('졸업생 학번도 형식은 유효하다(명단 단계에서 걸러진다)',
  resolveStudentGrade({ studentNo: '30101' }), 3);
eq('5자리가 아니면 거부', resolveStudentGrade({ studentNo: '301' }), null);
eq('숫자 아닌 학번 거부', resolveStudentGrade({ studentNo: '3A101' }), null);
eq('null 학생', resolveStudentGrade(null), null);
eq('undefined 학생', resolveStudentGrade(undefined), null);

// ─────────────────────────────────────────────────────────────────────────────
// 2. 같은 학년 판정 — 모르면 대조하지 않는다(fail-closed)
// ─────────────────────────────────────────────────────────────────────────────

check('같은 학년', isSameGrade({ grade: 2 }, { studentNo: '20304' }));
check('다른 학년', !isSameGrade({ grade: 2 }, { grade: 3 }));
check('한쪽 판정 불가면 false', !isSameGrade({ grade: 2 }, {}));
check('양쪽 판정 불가면 false (둘 다 null 을 같다고 하지 않는다)', !isSameGrade({}, {}));

const roster: (GradeBearing & { name: string })[] = [
  { name: '1학년A', grade: 1, studentNo: '10101' },
  { name: '1학년B', studentNo: '10902' },          // grade 비었지만 학번으로 1학년
  { name: '2학년A', grade: 2, studentNo: '20101' },
  { name: '3학년A', grade: 3, studentNo: '30101' },
  { name: '전입 3학년', grade: 3, studentNo: '30108' },
  { name: '판정불가' },                            // grade·studentNo 둘 다 없음
];
eq('1학년만', filterSameGrade(roster, 1).map(s => s.name), ['1학년A', '1학년B']);
eq('3학년은 전입생 포함', filterSameGrade(roster, 3).map(s => s.name), ['3학년A', '전입 3학년']);
eq('학년이 null 이면 아무도 대조하지 않는다', filterSameGrade(roster, null), []);

// ─────────────────────────────────────────────────────────────────────────────
// 3. 페이징 — 상한을 넘기면 조용히 잘리므로 구간을 반드시 나눈다
// ─────────────────────────────────────────────────────────────────────────────

eq('페이지 크기', SIMILARITY_PAGE_SIZE, 1000);
eq('0행이면 요청 없음', pageRanges(0), []);
eq('음수·NaN 방어', [pageRanges(-5), pageRanges(Number.NaN)], [[], []]);
eq('1행', pageRanges(1), [[0, 0]]);
eq('정확히 한 페이지', pageRanges(1000), [[0, 999]]);
eq('한 페이지 + 1', pageRanges(1001), [[0, 999], [1000, 1000]]);
// 라이브 최악 사례: 3학년 세특 7,021행 · 창체 1,953행
eq('3학년 세특 7,021행 → 8구간', pageRanges(7021).length, 8);
eq('마지막 구간이 총량에 맞는다', pageRanges(7021).at(-1), [7000, 7020]);
eq('3학년 창체 1,953행 → 2구간', pageRanges(1953), [[0, 999], [1000, 1952]]);
check('구간이 빈틈 없이 이어진다', pageRanges(7021).every(([from, to], i, all) =>
  (i === 0 ? from === 0 : from === all[i - 1][1] + 1) && to >= from));
eq('구간 합이 총량', pageRanges(7021).reduce((n, [f, t]) => n + (t - f + 1), 0), 7021);
eq('작은 페이지 크기도 지원', pageRanges(5, 2), [[0, 1], [2, 3], [4, 4]]);

// ─────────────────────────────────────────────────────────────────────────────
// 4. 정확 문장 일치 — 후보 정규화를 루프 밖으로 뺀 뒤에도 결과가 같아야 한다
// ─────────────────────────────────────────────────────────────────────────────

const target = '학급 자치회에서 회의를 주도하였다. 환경 캠페인을 기획하고 실행하였다. 짧다.';

eq('공백이 접힌 후보도 일치로 잡는다',
  findExactSentenceMatches(target, [
    { id: 'A', text: '학급  자치회에서   회의를 주도하였다.' },   // 공백만 다름
    { id: 'B', text: '전혀 다른 내용입니다.' },
  ]).matches.map(m => m.matchedStudentIds),
  [['A']]);

const multi = findExactSentenceMatches(target, [
  { id: 'A', text: '학급 자치회에서 회의를 주도하였다. 다른 문장.' },
  { id: 'B', text: '앞말 학급 자치회에서 회의를 주도하였다.' },
  { id: 'C', text: '환경 캠페인을 기획하고 실행하였다.' },
]);
eq('문장별 빈도', multi.matches.map(m => m.frequency), [2, 1]);
check('일치 구간 offset 이 원문을 가리킨다',
  multi.matches.every(m => target.slice(m.startOffset, m.endOffset).includes(m.sentence.slice(0, 8))));
check('5자 미만 문장은 건너뛴다', !multi.matches.some(m => m.sentence.startsWith('짧다')));
check('score 는 0~100', multi.score >= 0 && multi.score <= 100);

eq('후보가 없으면 빈 결과', findExactSentenceMatches(target, []), { matches: [], score: 0 });
eq('대상 텍스트가 비면 빈 결과',
  findExactSentenceMatches('', [{ id: 'A', text: 'x' }]), { matches: [], score: 0 });
// 같은 학생의 여러 기록이 같은 문장을 가지면 **학생 수로 한 번만** 센다(Set)
eq('같은 학생 중복은 1명으로',
  findExactSentenceMatches(target, [
    { id: 'A', text: '학급 자치회에서 회의를 주도하였다.' },
    { id: 'A', text: '학급 자치회에서 회의를 주도하였다.' },
  ]).matches[0].frequency, 1);
// 후보 text 가 비어 있어도 죽지 않는다(정규화를 미리 하므로 null 접근 위험이 있었다)
eq('빈 후보 텍스트 방어',
  findExactSentenceMatches(target, [{ id: 'A', text: '' }]).matches.length, 0);

// 후보를 늘려도 결과가 같다 — 정규화 hoisting 이 의미를 바꾸지 않았는지 확인
const many = Array.from({ length: 300 }, (_, i) => ({
  id: `S${i}`,
  text: i % 50 === 0 ? '학급  자치회에서 회의를   주도하였다.' : `무관한 기록 ${i}.`,
}));
eq('300 후보 중 6명 일치', findExactSentenceMatches(target, many).matches[0].frequency, 6);

// ─────────────────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length}건 실패 (통과 ${pass}건)\n`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`✓ ${pass}건 모두 통과`);
