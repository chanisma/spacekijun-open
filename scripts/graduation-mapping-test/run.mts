/**
 * 졸업 매핑 CSV 생성·검증 회귀 (2026-09-04)
 *
 * 왜 이 테스트가 필요한가: 이 CSV 는 익명화된 학생의 실명을 되찾을 **유일한 사본**이고
 * (RPC 안 매핑 테이블은 ON COMMIT DROP, 영구 테이블 없음), 검증이 통과해야만 비가역
 * 익명화가 실행된다. 두 방향 모두 치명적이다 —
 *   · 느슨하면: 엉뚱한 파일로 통과 → 복구 키 없이 실명 소멸
 *   · 빡빡하면: 정상 파일이 거부 → 졸업 처리를 영영 못 함
 *
 *   npx tsx scripts/graduation-mapping-test/run.mts
 */
import {
  buildGraduationMappingCsv,
  verifyGraduationMappingCsv,
  GRADUATION_CSV_HEADER,
  type GraduationMappingEntry,
} from '../../src/lib/graduationMapping.ts';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const entries: GraduationMappingEntry[] = [
  { resourceId: 'r-1', studentCode: '00-00001', realName: '김민서', anonymousName: '2023입학001', sequence: 1 },
  { resourceId: 'r-2', studentCode: '00-00002', realName: '이서준', anonymousName: '2023입학002', sequence: 2 },
  { resourceId: 'r-3', studentCode: '00-00003', realName: '박, 하늘', anonymousName: '2023입학003', sequence: 3 },
  { resourceId: 'r-4', studentCode: '23-10104', realName: '최"윤"아', anonymousName: '2023입학004', sequence: 4 },
];

console.log('\n[생성]');
const csv = buildGraduationMappingCsv(2023, entries);
check('헤더가 규약 순서와 같다', csv.split('\r\n')[0] === GRADUATION_CSV_HEADER.map((h) => `"${h}"`).join(','));
check('행 수 = 헤더 1 + 학생 4', csv.split('\r\n').length === 5);
check('콤마가 든 실명이 따옴표 안에 있다', csv.includes('"박, 하늘"'));
check('따옴표는 두 번으로 이스케이프', csv.includes('"최""윤""아"'));

console.log('\n[정상 통과]');
{
  const r = verifyGraduationMappingCsv(csv, entries);
  check('방금 만든 CSV 는 통과', r.ok, r.reason);
  check('건수를 정확히 센다', r.parsedCount === 4);
}
{
  // 실제 다운로드 파일에는 BOM 이 붙는다 — 이걸 못 읽으면 정상 파일이 전부 거부된다
  const r = verifyGraduationMappingCsv('﻿' + csv, entries);
  check('BOM 이 붙어도 통과', r.ok, r.reason);
}
{
  const r = verifyGraduationMappingCsv(csv + '\r\n', entries);
  check('끝에 빈 줄이 있어도 통과', r.ok, r.reason);
}
{
  // 엑셀로 열었다 저장하면 LF 로 바뀔 수 있다
  const r = verifyGraduationMappingCsv(csv.replace(/\r\n/g, '\n'), entries);
  check('LF 개행이어도 통과', r.ok, r.reason);
}
{
  const shuffled = [entries[2], entries[0], entries[3], entries[1]];
  const r = verifyGraduationMappingCsv(csv, shuffled);
  check('행 순서가 달라도 통과(집합 비교)', r.ok, r.reason);
}

console.log('\n[거부 — 느슨하면 실명이 사라진다]');
{
  const r = verifyGraduationMappingCsv(buildGraduationMappingCsv(2023, entries.slice(0, 3)), entries);
  check('한 명이 빠진 파일은 거부', !r.ok);
  check('  사유가 개수 불일치를 말한다', !r.ok && /3건/.test(r.reason ?? ''), r.reason);
}
{
  const extra = [...entries, {
    resourceId: 'r-9', studentCode: '23-10199', realName: '홍길동', anonymousName: '2023입학009', sequence: 9,
  }];
  const r = verifyGraduationMappingCsv(buildGraduationMappingCsv(2023, extra), entries);
  check('한 명이 더 든 파일도 거부(상위집합)', !r.ok);
}
{
  const other = entries.map((e) => ({ ...e, resourceId: e.resourceId + '-x' }));
  const r = verifyGraduationMappingCsv(buildGraduationMappingCsv(2022, other), entries);
  check('다른 연도의 예전 CSV 는 거부', !r.ok);
}
{
  // 순번이 밀리면 별칭이 바뀐다 → 그 CSV 로는 실제 저장될 이름을 되찾을 수 없다
  const shifted = entries.map((e) => ({ ...e, anonymousName: `2023입학${String(e.sequence + 1).padStart(3, '0')}` }));
  const r = verifyGraduationMappingCsv(buildGraduationMappingCsv(2023, shifted), entries);
  check('익명명이 다르면 거부', !r.ok);
  check('  사유가 익명명 불일치를 말한다', !r.ok && /익명명/.test(r.reason ?? ''), r.reason);
}
{
  const r = verifyGraduationMappingCsv('', entries);
  check('빈 파일은 거부', !r.ok);
}
{
  const r = verifyGraduationMappingCsv('학번,이름\r\n00-00001,김민서', entries);
  check('다른 형식의 CSV 는 거부', !r.ok);
  check('  사유가 형식 문제를 말한다', !r.ok && /형식/.test(r.reason ?? ''), r.reason);
}
{
  // 대상이 0명이면 빈 본문 CSV 가 나오는데, 이때도 헤더 검사는 통과해야 한다
  const emptyCsv = buildGraduationMappingCsv(2023, []);
  const r = verifyGraduationMappingCsv(emptyCsv, []);
  check('대상 0명이면 빈 CSV 도 일관되게 통과', r.ok, r.reason);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('[graduation-mapping] ALL PASS');
