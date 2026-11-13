/**
 * 6·9월 모평 학생별 표 회귀 — `npx tsx scripts/pyeonggawon-table-test/run.mts`
 *
 * 여기서 틀리면 오류가 아니라 **조용히 빈칸**이거나 **엉뚱한 두 과목의 차이**가 변화량으로
 * 찍힌다. 특히 위험한 세 곳을 못 박는다:
 *   ① 6월 성적표 `사회·문화` ↔ 9월 마킹 `사회문화` — 원문으로 비교하면 짝이 끊긴다
 *   ② 탐구는 자리 순서가 아니라 **과목**으로 짝지어야 한다
 *   ③ 전체 평균은 두 달 모두 있는 영역만 — 아니면 "응시 과목 변화"가 성적 변화로 보인다
 */
import {
  buildStudentShiftRows, sortShiftRows, OVERALL_AREAS, SHIFT_SLOTS,
  type ShiftRowInput,
} from '../../src/features/student-dashboard/utils/pyeonggawonTable';
import type { ReferenceGrade } from '../../src/features/evalearn/utils/referenceGrade';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const ref = (grade: number): ReferenceGrade => ({ grade, rawScore: 0, maxScore: 100 } as ReferenceGrade);

/** 6월 성적표 한 회차 */
const june = (subjects: Record<string, number>) => ([{
  academic_year: 2026, exam_month: 6, exam_grade: 3,
  subjects: Object.fromEntries(Object.entries(subjects).map(([k, v]) => [k, { grade: v }])),
}] as unknown as ShiftRowInput['mock_result']);

const student = (id: string, name: string, cls: number, num: number, mock_result: ShiftRowInput['mock_result']): ShiftRowInput =>
  ({ id, name, class_num: cls, number: num, mock_result });

// ── ① 표기가 다른 과목이 이어지는가 ─────────────────────────────────────
{
  const rows = buildStudentShiftRows(
    [student('a', '학생A', 3, 1, june({ 화법과작문: 3, 확률과통계: 4, 영어: 2, '사회·문화': 5, 생활과윤리: 4, 한국사: 3 }))],
    [6], [9],
    new Map([['a', new Map([['사회문화', ref(3)], ['생활과윤리', ref(3)], ['화법과작문', ref(2)]])]]),
    true
  );
  const r = rows[0];
  const tamgu = [r.cells.tamgu1, r.cells.tamgu2];
  const sohwa = tamgu.find(c => c.subject === '사회·문화');
  check('① 사회·문화 ↔ 사회문화 가 이어진다', sohwa?.to === 3, JSON.stringify(sohwa));
  check('① 그 칸의 변화가 -2', sohwa?.delta === -2, String(sohwa?.delta));
  check('① 국어(화법과작문)도 이어진다', r.cells.korean.from === 3 && r.cells.korean.to === 2);
  check('① 9월에 없는 과목은 to 가 비고 delta 도 없다',
    r.cells.math.from === 4 && r.cells.math.to === null && r.cells.math.delta === null);
}

// ── ② 탐구는 과목으로 짝짓는다 ──────────────────────────────────────────
{
  // 6월에는 생활과윤리·사회·문화, 9월에는 사회·문화만 — 자리 순서로 짝지으면
  // 생활과윤리(자리1)와 사회·문화(자리1)를 빼는 사고가 난다
  const rows = buildStudentShiftRows(
    [student('a', 'A', 1, 1, june({ 생활과윤리: 2, '사회·문화': 6, 영어: 1 }))],
    [6], [9],
    new Map([['a', new Map([['사회문화', ref(4)]])]]),
    true
  );
  const cells = [rows[0].cells.tamgu1, rows[0].cells.tamgu2];
  const sohwa = cells.find(c => c.subject === '사회·문화');
  const saengyun = cells.find(c => c.subject === '생활과윤리');
  check('② 사회·문화끼리 짝지어진다', sohwa?.from === 6 && sohwa?.to === 4, JSON.stringify(sohwa));
  check('② 생활과윤리는 to 가 비어 있다', saengyun?.from === 2 && saengyun?.to === null);
  check('② 자리 순서를 섞은 변화(-2 대신 +2)가 생기지 않는다', saengyun?.delta === null);
}

// ── 탐구 자리는 과목명 순으로 고정된다(달마다 바뀌면 안 된다) ──────────
{
  const rows = buildStudentShiftRows(
    [student('a', 'A', 1, 1, june({ 지구과학Ⅰ: 1, 생명과학Ⅰ: 9 }))],
    [6], [9], new Map(), false
  );
  check('탐구1 이 과목명 순으로 고정', rows[0].cells.tamgu1.subject === '생명과학Ⅰ', String(rows[0].cells.tamgu1.subject));
  check('등급 순으로 정렬되지 않는다', rows[0].cells.tamgu1.from === 9);
}

// ── ③ 전체 평균 ─────────────────────────────────────────────────────────
{
  const rows = buildStudentShiftRows(
    [student('a', 'A', 1, 1, june({ 화법과작문: 2, 확률과통계: 4, 영어: 3, '사회·문화': 3, 생활과윤리: 5, 한국사: 1 }))],
    [6], [9],
    new Map([['a', new Map([
      ['화법과작문', ref(1)], ['확률과통계', ref(3)], ['영어', ref(2)],
      ['사회문화', ref(2)], ['생활과윤리', ref(4)], ['한국사', ref(1)],
    ])]]),
    true
  );
  const o = rows[0].overall;
  // 6월: 국2 수4 영3 탐(3,5 평균 4) -> (2+4+3+4)/4 = 3.25 -> 3.3
  check('③ 전체 6월 = 3.3 (탐구는 두 과목 평균으로 한 영역)', o.from === 3.3, String(o.from));
  // 9월: 국1 수3 영2 탐(2,4 평균 3) -> (1+3+2+3)/4 = 2.25 -> 2.3
  check('③ 전체 9월 = 2.3', o.to === 2.3, String(o.to));
  check('③ 변화 = -1', o.delta === -1, String(o.delta));
  check('③ 영역 4개', o.areas === 4);
  check('③ 한국사는 평균에 넣지 않는다', OVERALL_AREAS.flat().includes('history') === false);
}

// 한쪽에만 있는 영역은 평균에서 빠진다
{
  const rows = buildStudentShiftRows(
    [student('a', 'A', 1, 1, june({ 화법과작문: 2, 확률과통계: 8, 영어: 3 }))],
    [6], [9],
    new Map([['a', new Map([['화법과작문', ref(2)], ['영어', ref(3)]])]]),  // 수학 없음
    true
  );
  const o = rows[0].overall;
  check('한쪽만 있는 수학은 평균에서 빠진다', o.areas === 2, String(o.areas));
  check('빠진 덕에 변화가 0 (수학 8이 섞이지 않는다)', o.from === 2.5 && o.to === 2.5 && o.delta === 0,
    `${o.from}/${o.to}/${o.delta}`);
}

// ── 공식 성적이 참고 등급을 이긴다 ──────────────────────────────────────
{
  const withSept = [
    ...(june({ 영어: 5 }) as unknown as { academic_year: number; exam_month: number; exam_grade: number; subjects: Record<string, { grade: number }> }[]),
    { academic_year: 2026, exam_month: 9, exam_grade: 3, subjects: { 영어: { grade: 2 } } },
  ] as unknown as ShiftRowInput['mock_result'];
  const rows = buildStudentShiftRows(
    [student('a', 'A', 1, 1, withSept)],
    [6], [9],
    new Map([['a', new Map([['영어', ref(7)]])]]),
    true
  );
  check('공식 9월 등급이 참고 등급을 이긴다', rows[0].cells.english.to === 2, String(rows[0].cells.english.to));
}

// ── 미응시(0등급)는 값으로 세지 않는다 ──────────────────────────────────
{
  const rows = buildStudentShiftRows(
    [student('a', 'A', 1, 1, june({ 영어: 0, 화법과작문: 3 }))],
    [6], [9], new Map(), false
  );
  check('등급 0은 빈칸', rows[0].cells.english.from === null);
  check('전체 평균에도 0이 섞이지 않는다', rows[0].overall.from === null || rows[0].overall.from === 3);
}

// ── 데이터가 없는 학생도 행으로 남는다 ──────────────────────────────────
{
  const rows = buildStudentShiftRows([student('z', '무기록', 5, 20, null)], [6], [9], new Map(), false);
  check('기록 없는 학생도 행이 있다', rows.length === 1 && rows[0].name === '무기록');
  check('모든 칸이 비어 있다', SHIFT_SLOTS.every(({ slot }) => rows[0].cells[slot].from === null));
}

// ── 정렬 ────────────────────────────────────────────────────────────────
{
  const rows = buildStudentShiftRows(
    [
      student('a', 'A', 1, 2, june({ 화법과작문: 5, 확률과통계: 5, 영어: 5, '사회·문화': 5, 생활과윤리: 5 })),
      student('b', 'B', 1, 1, june({ 화법과작문: 1, 확률과통계: 1, 영어: 1, '사회·문화': 1, 생활과윤리: 1 })),
      student('c', '무기록', 2, 1, null),
    ],
    [6], [9],
    new Map([
      ['a', new Map([['화법과작문', ref(3)], ['확률과통계', ref(3)], ['영어', ref(3)], ['사회문화', ref(3)], ['생활과윤리', ref(3)]])],
      ['b', new Map([['화법과작문', ref(3)], ['확률과통계', ref(3)], ['영어', ref(3)], ['사회문화', ref(3)], ['생활과윤리', ref(3)]])],
    ]),
    true
  );
  const byStudent = sortShiftRows(rows, 'student', 'asc').map(r => r.name);
  check('학번순 정렬', JSON.stringify(byStudent) === JSON.stringify(['B', 'A', '무기록']), byStudent.join(','));

  const byOverall = sortShiftRows(rows, 'overall', 'asc').map(r => r.name);
  check('전체 등급 오름차순 = 잘한 순, 무기록은 맨 아래',
    byOverall[2] === '무기록', byOverall.join(','));

  // A는 5 -> 3 (-2 향상), B는 1 -> 3 (+2 하락)
  const byDeltaDesc = sortShiftRows(rows, 'overallDelta', 'desc').map(r => r.name);
  check('변화 내림차순이면 하락(B)이 위', byDeltaDesc[0] === 'B', byDeltaDesc.join(','));
  check('변화 정렬에서도 무기록은 맨 아래', byDeltaDesc[2] === '무기록', byDeltaDesc.join(','));

  const byDeltaAsc = sortShiftRows(rows, 'overallDelta', 'asc').map(r => r.name);
  check('변화 오름차순이면 향상(A)이 위', byDeltaAsc[0] === 'A', byDeltaAsc.join(','));

  const before = JSON.stringify(rows.map(r => r.id));
  sortShiftRows(rows, 'overall', 'desc');
  check('정렬이 원본을 변형하지 않는다', JSON.stringify(rows.map(r => r.id)) === before);
}

console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
