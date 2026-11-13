// 일괄 업무 CSV 파서 회귀 — 담당자 다중 배정(2026-08-12)
// 실행: npx tsx scripts/duty-csv-test/run.mts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  formatAssigneeTitle, parseCsvRows, parseDutyCsv, splitAssigneeNames,
} from '../../src/lib/dutyCsv';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

const HEADER = '근무일자,시작 시간,종료 시간,근무자';

// ── RFC 4180 파싱 ──
ok(JSON.stringify(parseCsvRows('a,b\n1,2')) === JSON.stringify([['a', 'b'], ['1', '2']]),
  '기본 행/열 분리');
ok(JSON.stringify(parseCsvRows('a,b\r\n1,2\r\n')) === JSON.stringify([['a', 'b'], ['1', '2']]),
  'CRLF·끝 빈 줄 처리');
ok(JSON.stringify(parseCsvRows('a,b\n"홍길동,김철수",2')) === JSON.stringify([['a', 'b'], ['홍길동,김철수', '2']]),
  '따옴표 안 쉼표는 열 구분자가 아님');
ok(parseCsvRows('a\n"say ""hi"""')[1][0] === 'say "hi"', '이스케이프된 따옴표');
ok(parseCsvRows('a,b\n"두\n줄",2')[1][0] === '두\n줄', '따옴표 안 줄바꿈 보존');
ok(parseCsvRows('﻿근무일자,근무자')[0][0] === '근무일자', 'BOM 제거');

// ── 담당자 칸 분리 ──
ok(JSON.stringify(splitAssigneeNames('홍길동,김철수')) === JSON.stringify(['홍길동', '김철수']), '쉼표 구분');
ok(JSON.stringify(splitAssigneeNames('홍길동; 김철수 / 이영희')) === JSON.stringify(['홍길동', '김철수', '이영희']),
  '세미콜론·슬래시 구분');
ok(JSON.stringify(splitAssigneeNames('홍길동·김철수、이영희')) === JSON.stringify(['홍길동', '김철수', '이영희']),
  '가운뎃점·모점 구분');
ok(JSON.stringify(splitAssigneeNames('홍길동,,홍길동, 김철수')) === JSON.stringify(['홍길동', '김철수']),
  '빈 값·중복 제거');
ok(splitAssigneeNames('   ').length === 0, '공백만 → 빈 목록');

// ── 다중 담당자 파싱(따옴표) ──
{
  const { records, errors } = parseDutyCsv(`${HEADER}\n2026-09-23,18:00,19:00,"홍길동,김철수"`);
  ok(errors.length === 0, '따옴표 다중 담당자: 오류 없음');
  ok(JSON.stringify(records[0].담당자목록) === JSON.stringify(['홍길동', '김철수']), '따옴표 다중 담당자: 2명 파싱');
  ok(records[0].담당자 === '홍길동,김철수', '하류 전달용 문자열은 쉼표 결합');
  ok(records[0].근무일 === '2026-09-23' && records[0].시작시간 === '18:00' && records[0].종료시간 === '19:00',
    '따옴표가 있어도 나머지 열이 밀리지 않음');
}

// ── 다중 담당자 파싱(따옴표 없음 + 담당자가 마지막 열) ──
{
  const { records, errors } = parseDutyCsv(`${HEADER}\n2026-09-24,09:00,18:00,김철수,이영희,이지유`);
  ok(errors.length === 0, '따옴표 없는 마지막 열 다중 담당자: 오류 없음');
  ok(JSON.stringify(records[0].담당자목록) === JSON.stringify(['김철수', '이영희', '이지유']), '여분 쉼표를 담당자로 병합');
  ok(records[0].근무일 === '2026-09-24', '병합해도 날짜 열 유지');
}

// ── 담당자가 마지막 열이 아니면 병합하지 않고 오류 ──
{
  const { records, errors } = parseDutyCsv('담당자,근무일자,시작 시간,종료 시간\n홍길동,김철수,2026-09-24,09:00,18:00');
  ok(records.length === 0 && errors.length === 1, '담당자가 중간 열: 조용히 병합하지 않고 오류');
  ok(errors[0].includes('큰따옴표'), '오류 메시지가 해결 방법(따옴표/세미콜론)을 안내');
}
{
  // 같은 배치라도 따옴표를 쓰면 중간 열에서도 정상 동작
  const { records, errors } = parseDutyCsv('담당자,근무일자,시작 시간,종료 시간\n"홍길동,김철수",2026-09-24,09:00,18:00');
  ok(errors.length === 0 && JSON.stringify(records[0].담당자목록) === JSON.stringify(['홍길동', '김철수']),
    '중간 열도 따옴표면 다중 담당자 정상');
}

// ── 단일 담당자 회귀(기존 동작 유지) ──
{
  const { records, errors } = parseDutyCsv(`${HEADER}\n2026-09-23,18:00,19:00,홍길동\n2026-09-25,09:00,10:00,이영희`);
  ok(errors.length === 0 && records.length === 2, '단일 담당자 2행');
  ok(records[0].담당자 === '홍길동' && records[1].담당자 === '이영희', '단일 담당자 값 유지');
  ok(records[0].근무내용 === '업무', '내용 열 없으면 기본값');
}

// ── 선택 열(근무내용·비고) ──
{
  const { records } = parseDutyCsv(
    '근무일자,시작 시간,종료 시간,근무내용,비고,근무자\n2026-09-23,18:00,19:00,야간 감독,대체,"홍길동,김철수"'
  );
  ok(records[0].근무내용 === '야간 감독' && records[0].비고 === '대체', '내용·비고 열 반영');
  ok(JSON.stringify(records[0].담당자목록) === JSON.stringify(['홍길동', '김철수']), '선택 열이 있어도 담당자 다중');
}

// ── 검증 ──
{
  const bad = parseDutyCsv(`${HEADER}\n2026-09-23,19:00,07:00,홍길동`);
  ok(bad.records.length === 0 && bad.errors.some(e => e.includes('하루를 넘어서는')), '자정 넘김 거부');
}
{
  const bad = parseDutyCsv(`${HEADER}\n2026-02-31,09:00,10:00,홍길동`);
  ok(bad.errors.some(e => e.includes('근무일')), '실재하지 않는 날짜 거부');
}
{
  const bad = parseDutyCsv(`${HEADER}\n2026-09-23,25:00,26:00,홍길동`);
  ok(bad.errors.some(e => e.includes('시작시간')), '시각 범위 초과 거부');
}
{
  const bad = parseDutyCsv(`${HEADER}\n2026-09-23,09:00,10:00,`);
  ok(bad.errors.some(e => e.includes('담당자')), '담당자 빈 칸 거부');
}
{
  const bad = parseDutyCsv('근무일자,시작 시간\n2026-09-23,09:00');
  ok(bad.errors.some(e => e.includes('찾을 수 없습니다')), '필수 열 누락 안내');
}
{
  const bad = parseDutyCsv(`${HEADER}\n2026-09-23,18:00,19:00,홍길동\n2026-02-31,09:00,10:00,김철수`);
  ok(bad.records.length === 0, '한 행이라도 오류면 전체 취소(부분 생성 방지)');
}

// ── 배포되는 샘플 양식이 실제로 파서를 통과하는지(둘이 어긋나면 사용자가 첫 시도부터 막힌다) ──
{
  const samplePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/dutyform.csv');
  const { records, errors } = parseDutyCsv(readFileSync(samplePath, 'utf8'));
  ok(errors.length === 0, `샘플 양식(dutyform.csv) 오류 없음${errors.length ? `: ${errors[0]}` : ''}`);
  ok(records.length === 3, '샘플 양식 3행');
  ok(records.some(r => r.담당자목록.length > 1), '샘플 양식이 다중 담당자 예시를 포함');
}

// ── 제목 표기 ──
ok(formatAssigneeTitle(['홍길동']) === '홍길동', '제목: 1명');
ok(formatAssigneeTitle(['홍길동', '김철수']) === '홍길동, 김철수', '제목: 3명 이하 나열');
ok(formatAssigneeTitle(['A', 'B', 'C', 'D']) === 'A 외 3명', '제목: 4명 이상 요약');

console.log(`\n✅ duty CSV 파서 ${pass}건 통과`);
