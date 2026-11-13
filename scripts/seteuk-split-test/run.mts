/**
 * 세특 과목 분리 회귀 테스트
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/seteuk-split-test/run.mts
 *
 * 세특 원문은 한 셀에 여러 과목이 `과목명: 내용` 으로 이어 붙은 한 덩어리다.
 * `parseSeTeukSheet` 가 그 경계를 놓치면 **그 과목 세특이 앞 과목에 통째로 흡수**되고,
 * 조회 화면에서는 "그 과목 세특이 없는" 것으로 보인다(오류도 경고도 없다).
 *
 * 2026-08-31 라이브에서 10건/8명이 이 방식으로 흡수돼 있었다. 원인은 경계 정규식이
 * **과목명 앞이 마침표·개행·공백일 때만** 인정한 것이고, 실제 원문은 문장 부호 없이
 * 바로 이어지거나(`…배려도 보임인간과 철학:`) 이물질 문자가 끼어 있었다(`… ㄹ정보:`).
 * 여기서 그 형태들을 고정한다.
 */
import { parseSeTeukSheet } from '../../src/features/evalog/utils/excelParsers/seTeuk';
import type { StudentBasicInfo } from '../../src/features/evalog/types/excelTypes';

let passed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

/** 파일명은 Grade1_Class1 → 학생 ID 는 constructStudentId 규칙을 따른다. */
const FILE = 'Grade1_Class1_세부능력및특기사항.xlsx';
const prefix = new Date().getFullYear().toString().slice(2);
const STUDENT_ID = `${prefix}-10101`;

/** 그 학생이 수강한 과목 목록 (교과학습발달상황에서 유도되는 값) */
const subjects = new Map<string, { grade: number; category: string }>([
  ['공통국어1', { grade: 1, category: 'regular' }],
  ['공통수학1', { grade: 1, category: 'regular' }],
  ['한국사1', { grade: 1, category: 'regular' }],
  ['정보', { grade: 1, category: 'regular' }],
  ['체육1', { grade: 1, category: 'pe_arts' }],
  ['인간과 철학', { grade: 1, category: 'pe_arts' }],
]);

const run = (cellText: string) => {
  const sheet: any[] = [
    ['번 호', '성  명', '학 년', '세부능력 및 특기사항 '],
    ['1', '홍길동', '1', cellText],
  ];
  const studentsMap = new Map<string, StudentBasicInfo>([
    [
      STUDENT_ID,
      {
        id: STUDENT_ID,
        name: '홍길동',
        grade: 1,
        classNum: 1,
        academic_development: [...subjects.keys()].map((s) => ({ subject: s, grade: 1 })),
      } as never,
    ],
  ]);
  const studentSubjects = new Map([[STUDENT_ID, subjects]]);
  const acts = parseSeTeukSheet(sheet, FILE, studentsMap, studentSubjects) ?? [];
  return new Map(acts.map((a: any) => [a.subject_name, a.content as string]));
};

// ── 1. 정상 형태(마침표 뒤) — 기존 동작 보존 ────────────────────────────────
{
  const got = run('공통국어1: 국어 내용임. 공통수학1: 수학 내용임.');
  check('마침표 뒤 경계는 그대로 분리된다', got.size === 2, `${[...got.keys()]}`);
  check('국어 내용이 정확', got.get('공통국어1') === '국어 내용임.');
  check('수학 내용이 정확', got.get('공통수학1') === '수학 내용임.');
}

// ── 2. 이물질 문자 뒤 (라이브: `…생임. ㄹ정보:`) ────────────────────────────
{
  const got = run('한국사1: 역사 내용임. ㄹ정보: 정보 내용임.');
  check('이물질 문자(ㄹ) 뒤의 과목도 분리된다', got.has('정보'), `${[...got.keys()]}`);
  check('정보 내용이 앞 과목에 흡수되지 않는다', got.get('정보') === '정보 내용임.');
  check('앞 과목은 자기 내용만 갖는다', !(got.get('한국사1') ?? '').includes('정보 내용'));
}

// ── 3. 문장 부호 없이 한글에 바로 이어짐 (라이브: `…보임인간과 철학:`) ──────
{
  const got = run('체육1: 체육 내용이며 배려도 보임인간과 철학: 철학 내용임.');
  check('한글 바로 뒤의 과목도 분리된다', got.has('인간과 철학'), `${[...got.keys()]}`);
  check('철학 내용이 정확', got.get('인간과 철학') === '철학 내용임.');
  check('체육1이 철학을 흡수하지 않는다', !(got.get('체육1') ?? '').includes('철학 내용'));
}

// ── 4. 키보드 뭉갬 오타 뒤 (라이브: `ㄴㅇㄻㄴㅇㄹ체육1:`) ────────────────────
{
  const got = run('공통국어1: 국어 내용임.ㄴㅇㄻㄴㅇㄹ체육1: 체육 내용임.');
  check('오타 문자열 뒤의 과목도 분리된다', got.has('체육1'), `${[...got.keys()]}`);
  check('체육 내용이 정확', got.get('체육1') === '체육 내용임.');
}

// ── 5. 쉼표 뒤 (라이브: `,한국사1·한국사2:`) ────────────────────────────────
{
  const got = run('공통수학1: 수학 내용임,한국사1·한국사2: 역사 내용임.');
  check('쉼표 뒤 결합 과목도 분리된다', got.has('한국사1'), `${[...got.keys()]}`);
  check('결합 표기는 대표 과목으로 저장', got.get('한국사1') === '역사 내용임.');
  check('한국사2는 별도 레코드로 만들지 않는다', !got.has('한국사2'));
}

// ── 6. 1·2학기 결합 표기 (NEIS 정상 형태) ───────────────────────────────────
{
  const got = run('공통국어1·공통국어2: 통합 국어 내용임. 공통수학1: 수학 내용임.');
  check('결합 표기는 대표 과목 하나로', got.has('공통국어1') && !got.has('공통국어2'), `${[...got.keys()]}`);
  check('결합 내용이 온전', got.get('공통국어1') === '통합 국어 내용임.');
  check('뒤 과목도 정상 분리', got.get('공통수학1') === '수학 내용임.');
}

// ── 7. 과목명이 본문에 언급돼도 콜론이 없으면 경계가 아니다 ─────────────────
{
  const got = run('공통국어1: 정보 활용 능력이 뛰어나며 체육1 수업에도 성실함.');
  check('콜론 없는 과목명 언급은 경계가 아니다', got.size === 1, `${[...got.keys()]}`);
  check('본문이 잘리지 않는다', got.get('공통국어1')?.includes('체육1 수업에도 성실함.') === true);
}

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log(`\n통과 ${passed}건, 실패 ${failures.length}건`);
if (failures.length) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log('✓ 세특 과목 분리 회귀 테스트 전건 통과');
