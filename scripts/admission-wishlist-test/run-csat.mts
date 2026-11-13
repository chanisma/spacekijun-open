/**
 * 수능최저(csat) 파서·판정 검증 하니스.
 * 실행: npx tsx scripts/admission-wishlist-test/run-csat.mts
 *
 * docs/handoff/csat-structure-audit_2026-06-25.md 가 지목한 실패/오판 케이스를
 * 실제 문자열 그대로 넣어 보강된 파서(parseCsatRule)와 판정(judgeCsat/evalMode)을 검증한다.
 *  1) "중" 생략 "N개 합 K" 4건 → 파싱 성공
 *  2) "평균"·"각 N" → mode 정확 판정 (합으로 오판하지 않음)
 *  3) judgeCsat 모드별(합/평균/각) verdict 정확성
 */
import {
  parseCsatRule,
  judgeCsat,
  judgeCsatForDepartment,
  mockByArea,
  type MockSubject,
} from '../../src/features/admission-wishlist/utils/csat';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  ${detail}`);
  }
}

// 학생 모의(3학년, 탐구 2과목): 국2 · 수3 · 영2 · 탐[생활과윤리2, 윤리와사상4] · 한5
//  → 탐구: 상위1과목=2, 2과목평균=(2+4)/2=3
const MOCK: MockSubject[] = [
  { subject: '독서', grade: 2 },        // 국
  { subject: '미적분', grade: 3 },       // 수
  { subject: '영어', grade: 2 },         // 영
  { subject: '생활과윤리', grade: 2 },   // 탐(사탐)
  { subject: '윤리와사상', grade: 4 },   // 탐(사탐)
  { subject: '한국사', grade: 5 },       // 한
];

console.log('── 1) "중" 생략 "N개 합 K" 파싱 (audit 4건) ──');
const omitCases: Array<[string, number, number]> = [
  ['국,수,영,탐 4개 합 6, 한 3', 4, 6],
  ['국,수,영,탐(1) 4개 합 14', 4, 14],
  ['국,수,영,과(절사) 4개 합 5, 한 4', 4, 5],
  ['국,수,영,탐 2개 합 6, 한 4', 2, 6],
];
for (const [text, count, threshold] of omitCases) {
  const r = parseCsatRule(text);
  check(
    `parse "${text}"`,
    !!r && r.count === count && r.threshold === threshold && r.mode === 'sum',
    r ? `got count=${r.count} threshold=${r.threshold} mode=${r.mode} areas=${[...(r.areas)].join('')}` : 'null',
  );
}
// 과(절사) 케이스는 영역에 탐이 들어가야 4개를 채울 수 있다
{
  const r = parseCsatRule('국,수,영,과(절사) 4개 합 5, 한 4');
  check('  └ 과→탐 매핑으로 areas size=4', !!r && r.areas.size === 4, r ? `size=${r.areas.size}` : 'null');
}

console.log('\n── 2) mode 판정 (평균/각, 오판 방지) ──');
{
  const avg = parseCsatRule('국,수,영,탐 중 2개 평균 5');
  check('"2개 평균 5" → mode=avg', !!avg && avg.mode === 'avg' && avg.threshold === 5, avg ? `mode=${avg.mode}` : 'null');
  const each = parseCsatRule('국,수,영,탐 중 3개 각 3');
  check('"3개 각 3" → mode=each', !!each && each.mode === 'each' && each.threshold === 3, each ? `mode=${each.mode}` : 'null');
  const sum = parseCsatRule('국,수,영,탐 중 2개 합 6');
  check('"2개 합 6" → mode=sum', !!sum && sum.mode === 'sum', sum ? `mode=${sum.mode}` : 'null');
}

console.log('\n── 3) judgeCsat 모드별 verdict (mock: 국2 수3 영2 탐[2,4]→평균3 한5) ──');
function judge(text: string) {
  return judgeCsat(parseCsatRule(text), MOCK);
}
{
  // 합: best2 = 국2+영2 = 4 ≤ 6 → 충족, value=4
  const j = judge('국,수,영,탐 중 2개 합 6');
  check('합 "2개 합 6" → meet, value=4', !!j && j.verdict === 'meet' && j.value === 4, j ? `${j.verdict} value=${j.value}` : 'null');

  // 합: best4 = 국2+영2+수3+탐(평균3) = 10 > 6 → 미충족 (탐구=1영역 평균3)
  const j2 = judge('국,수,영,탐 4개 합 6');
  check('합 "4개 합 6" → fail, value=10', !!j2 && j2.verdict === 'fail' && j2.value === 10, j2 ? `${j2.verdict} value=${j2.value}` : 'null');

  // 평균: best2 = (2+2)/2 = 2 ≤ 5 → 충족, value=2
  const j3 = judge('국,수,영,탐 중 2개 평균 5');
  check('평균 "2개 평균 5" → meet, value=2', !!j3 && j3.verdict === 'meet' && j3.value === 2, j3 ? `${j3.verdict} value=${j3.value}` : 'null');

  // 평균 오판 검증: 만약 합으로 처리하면 (2+2=4 ≤ 5) 도 meet이지만 값이 다름.
  // 평균 경계: best2 합=4, 평균=2. "2개 평균 1" 이면 평균2 > 1 → 미충족
  const j4 = judge('국,수,영,탐 중 2개 평균 1');
  check('평균 "2개 평균 1" → fail (합으로 오판 시 4>1도 fail이나 value=평균2)', !!j4 && j4.verdict === 'fail' && j4.value === 2, j4 ? `${j4.verdict} value=${j4.value}` : 'null');

  // 각: best3 = [2,2,3] → 최댓값 3 ≤ 3 → 충족, value=3
  const j5 = judge('국,수,영,탐 중 3개 각 3');
  check('각 "3개 각 3" → meet, value=3', !!j5 && j5.verdict === 'meet' && j5.value === 3, j5 ? `${j5.verdict} value=${j5.value}` : 'null');

  // 각: best3 최댓값 3 > 2 → 미충족. (합으로 오판 시 2+2+3=7 ≤ ? 기준과 비교가 완전히 달라짐)
  const j6 = judge('국,수,영,탐 중 3개 각 2');
  check('각 "3개 각 2" → fail, value=3', !!j6 && j6.verdict === 'fail' && j6.value === 3, j6 ? `${j6.verdict} value=${j6.value}` : 'null');
}

console.log('\n── 4) 무회귀: 학과 분기·단일 기준 (judgeCsatForDepartment) ──');
{
  // 단일 기준
  const single = judgeCsatForDepartment('국,수,영,탐 중 2개 합 6', '간호학과', MOCK);
  check('단일 기준 kind=single, meet', !!single && single.kind === 'single' && single.judge?.verdict === 'meet', single ? `kind=${single.kind}` : 'null');

  // 학과 분기 매칭
  const branch = '국,수,영,탐 중 2개 합 6 의예: 국,수,영,탐 중 3개 각 1';
  const med = judgeCsatForDepartment(branch, '의예과', MOCK);
  check('분기 "의예과" → matched + 각 mode', !!med && med.kind === 'matched' && med.judge?.mode === 'each', med ? `kind=${med.kind} mode=${med.judge?.mode}` : 'null');
  // 의예 기준 "3개 각 1": best3 최댓값 3 > 1 → 미충족
  check('  └ 의예 "3개 각 1" → fail', !!med && med.judge?.verdict === 'fail', med ? `${med.judge?.verdict}` : 'null');
  // 디폴트(분기 없는 학과)
  const other = judgeCsatForDepartment(branch, '컴퓨터공학과', MOCK);
  check('분기 비매칭 학과 → default 적용', !!other && other.kind === 'default' && other.judge?.verdict === 'meet', other ? `kind=${other.kind}` : 'null');
}

console.log('\n── 5) 탐구 2과목 처리 (탐(1) vs 탐(2)평균, 이중계산 방지, 표시) ──');
{
  // 탐(1)=상위1과목(2등급) vs 탐=2과목평균(3등급) — 같은 학생, 다른 값
  const t1 = judge('수,탐(1) 중 2개 합 9'); // 수3 + 탐(상위1=2) = 5
  check('탐(1) "수,탐(1) 2개 합 9" → meet, value=5(상위1과목)', !!t1 && t1.verdict === 'meet' && t1.value === 5, t1 ? `${t1.verdict} value=${t1.value}` : 'null');
  const t2 = judge('수,탐 중 2개 합 9'); // 수3 + 탐(평균=3) = 6
  check('탐(2) "수,탐 2개 합 9" → meet, value=6(2과목평균)', !!t2 && t2.verdict === 'meet' && t2.value === 6, t2 ? `${t2.verdict} value=${t2.value}` : 'null');

  // 이중계산 방지: 탐구만 대상으로 "2개"를 요구하면 탐구는 1영역이라 채울 수 없음 → 판정불가
  const dbl = judge('탐 중 2개 합 3');
  check('이중계산 방지 "탐 중 2개" → unknown(탐구는 1영역)', !!dbl && dbl.verdict === 'unknown', dbl ? `${dbl.verdict}` : 'null');

  // 절사: 탐구 평균 2.5 → 절사 2 (vs 미명시 시 2.5)
  const MOCK2: MockSubject[] = [
    { subject: '미적분', grade: 3 },     // 수
    { subject: '생활과윤리', grade: 2 }, // 탐
    { subject: '윤리와사상', grade: 3 }, // 탐 → 평균 2.5
  ];
  const cut = judgeCsat(parseCsatRule('수,탐(절사) 중 1개 2'), MOCK2); // 탐=floor(2.5)=2 → best1=2 ≤2
  check('절사 "탐(절사)" 평균2.5→2 → meet', !!cut && cut.verdict === 'meet' && cut.value === 2, cut ? `${cut.verdict} value=${cut.value}` : 'null');
  const dec = judgeCsat(parseCsatRule('수,탐 중 1개 2'), MOCK2); // 탐=2.5(소수유지) → best1=2.5 >2
  check('미명시 "탐" 평균2.5 유지 → fail(2.5)', !!dec && dec.verdict === 'fail' && dec.value === 2.5, dec ? `${dec.verdict} value=${dec.value}` : 'null');

  // 표시: mockByArea 가 탐구 2과목을 모두 반환 (이전엔 1개로 접힘)
  const areas = mockByArea(MOCK);
  const tamRows = areas.filter((a) => a.area === '탐');
  check('표시 mockByArea 탐구 2과목 모두 반환', tamRows.length === 2, `탐 rows=${tamRows.length} (${tamRows.map((r) => `${r.subject}:${r.grade}`).join(', ')})`);
  // 그 외 영역은 영역당 1개
  check('표시 국/수/영/한은 영역당 1개', areas.filter((a) => a.area === '국').length === 1 && areas.filter((a) => a.area === '한').length === 1);
}

console.log('\n── 6) 1·2학년 통합/공통 탐구 매핑 ──');
{
  // 1·2학년 모의: 통합사회 + 통합과학 (탐구 2과목 모델에 그대로 올라탐)
  const MOCK_12: MockSubject[] = [
    { subject: '국어', grade: 3 },
    { subject: '수학', grade: 3 },
    { subject: '영어', grade: 3 },
    { subject: '한국사', grade: 4 },
    { subject: '통합사회', grade: 2 },
    { subject: '통합과학', grade: 4 },
  ];
  const tam12 = mockByArea(MOCK_12).filter((a) => a.area === '탐');
  check('통합사회+통합과학 → 탐 2과목', tam12.length === 2, `탐=${tam12.map((t) => t.subject).join(',')}`);
  // 판정: 탐 평균=(2+4)/2=3, pool 국3 수3 영3 탐3 → best2 합=6 ≤6 meet
  const j12 = judgeCsat(parseCsatRule('국,수,영,탐 중 2개 합 6'), MOCK_12);
  check('1·2학년 "2개 합 6" → meet, value=6', !!j12 && j12.verdict === 'meet' && j12.value === 6, j12 ? `${j12.verdict} value=${j12.value}` : 'null');

  // 표기 변형(공통/영역 일반 라벨)도 모두 탐 매핑
  const variants: MockSubject[] = [
    { subject: '공통사회', grade: 2 }, { subject: '공통과학', grade: 3 },
    { subject: '사회탐구', grade: 1 }, { subject: '과학탐구', grade: 2 },
  ];
  const tamV = mockByArea(variants).filter((a) => a.area === '탐');
  check('공통사회/공통과학/사회탐구/과학탐구 모두 탐', tamV.length === 4, `탐 rows=${tamV.length}`);

  // '미응시'는 영역 매핑 안 됨(무시) — grade 있어도 드롭
  const withSkip: MockSubject[] = [{ subject: '국어', grade: 2 }, { subject: '미응시', grade: 9 }];
  const skipAreas = mockByArea(withSkip);
  check("'미응시'는 무시(국어만 남음)", skipAreas.length === 1 && skipAreas[0].area === '국', `areas=${skipAreas.map((a) => a.area).join(',')}`);
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
