/**
 * 결강시 보강 계획서 HWPX 채우기 회귀 테스트.
 *   npx tsx scripts/toolbox-test/run-lesson-exchange.mts
 *
 * 템플릿 section0.xml을 읽어 fillLessonSection0를 적용하고 구조 불변식·값 주입을 검증한다.
 * (한글이 거부하는 "손상" 조건 = rowCnt≠실제 tr 수, 태그 불균형 등을 사전 차단)
 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { fillLessonSection0, type LessonFillInput } from '../../src/components/toolbox/hwpx/lessonExchangeFormFill.ts';

const TEMPLATE = 'src/components/toolbox/hwpx/lesson-exchange-template.hwpx';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} ${detail}`); }
}

const input: LessonFillInput = {
  teacherName: '홍길동',
  subject: '인공지능 기초',
  reasons: [0, 4],  // 공가, 연가
  rows: [
    { grade: '2-3', absenceDate: '3/15', absenceDay: '월', absencePeriod: '3',
      absenceSubject: '정보', swapType: '교체', makeupSubject: '정보',
      makeupTeacher: '김보강', makeupDate: '3/16', makeupDay: '화',
      makeupPeriod: '5', makeupLocation: '컴퓨터실' },
    { grade: '1-1', absenceDate: '3/20', absenceDay: '금', absencePeriod: '2',
      absenceSubject: '수학', swapType: '대체', makeupSubject: '수학',
      makeupTeacher: '이대체', makeupDate: '3/21', makeupDay: '토',
      makeupPeriod: '1', makeupLocation: '1-1교실' },
  ],
};

const buf = readFileSync(TEMPLATE);
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file('Contents/section0.xml')!.async('string');

console.log('== fillLessonSection0 ==');
const out = fillLessonSection0(xml, input);

// 1. 구조 불변식: tr/tc/tbl 개수 보존, rowCnt 보존
const countTag = (s: string, tag: string) => (s.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
check('tr 개수 보존 (17)', countTag(xml, 'hp:tr') === 17 && countTag(out, 'hp:tr') === 17,
  `before=${countTag(xml, 'hp:tr')} after=${countTag(out, 'hp:tr')}`);
check('tc 개수 보존', countTag(xml, 'hp:tc') === countTag(out, 'hp:tc'),
  `before=${countTag(xml, 'hp:tc')} after=${countTag(out, 'hp:tc')}`);
check('tbl 개수 보존 (3)', countTag(out, 'hp:tbl') === 3);
check('메인표 rowCnt=12 유지', /rowCnt="12" colCnt="14"/.test(out));
check('<hp:run> 열림/닫힘 균형', countTag(out, 'hp:run') === (out.match(/<\/hp:run>/g) || []).length + (out.match(/<hp:run charPrIDRef="\d+"\/>/g) || []).length,
  '');

// 2. 교사/과목 주입
check('교사 성명 주입', out.includes('교사    홍길동    (인)'));
check('과목 주입', out.includes('과목    인공지능 기초'));

// 3. 결강 사유 ○ — 결강사유표(colCnt=10) ○행의 정확한 칸 검증
function reasonMark(xmlStr: string, reasonIdx: number): boolean {
  const colAddr = reasonIdx + 1;
  const tblStart = xmlStr.search(/<hp:tbl\b[^>]*colCnt="10"/);
  const tblEnd = xmlStr.indexOf('</hp:tbl>', tblStart);
  const tbl = xmlStr.slice(tblStart, tblEnd);
  const cells = tbl.match(/<hp:tc\b[\s\S]*?<\/hp:tc>/g) || [];
  for (const c of cells) {
    const a = new RegExp(`colAddr="${colAddr}" rowAddr="2"`).exec(c);
    if (a) return /<hp:t>○<\/hp:t>/.test(c);
  }
  return false;
}
check('○: 공가(idx0) 표시됨', reasonMark(out, 0));
check('○: 연가(idx4) 표시됨', reasonMark(out, 4));
check('○: 조퇴(idx1) 미표시', !reasonMark(out, 1));
check('○: 병가(idx6) 미표시', !reasonMark(out, 6));

// 4. 메인표 데이터 칸 — 좌표로 값 확인
function mainCell(xmlStr: string, col: number, row: number): string | null {
  const tblStart = xmlStr.search(/<hp:tbl\b[^>]*colCnt="14"/);
  const tblEnd = xmlStr.indexOf('</hp:tbl>', tblStart);
  const tbl = xmlStr.slice(tblStart, tblEnd);
  const cells = tbl.match(/<hp:tc\b[\s\S]*?<\/hp:tc>/g) || [];
  for (const c of cells) {
    if (new RegExp(`colAddr="${col}" rowAddr="${row}"`).test(c)) {
      const t = /<hp:t>([^<]*)<\/hp:t>/.exec(c);
      return t ? t[1] : '';
    }
  }
  return null;
}
// row0 데이터 = rowAddr 2
check('순 칸(col0,row2) = 1 유지', mainCell(out, 0, 2) === '1');
check('결강 날짜(col1,row2) = 3/15', mainCell(out, 1, 2) === '3/15');
check('결강 요일(col2,row2) = 월', mainCell(out, 2, 2) === '월');
check('결강 학급(col3,row2) = 2-3', mainCell(out, 3, 2) === '2-3');
check('결강 교시(col4,row2) = 3', mainCell(out, 4, 2) === '3');
check('결강 과목(col5,row2) = 정보', mainCell(out, 5, 2) === '정보');
check('구분(col6,row2) = 교체', mainCell(out, 6, 2) === '교체');
check('보강 과목(col7,row2) = 정보', mainCell(out, 7, 2) === '정보');
check('보강 교사(col8,row2) = 김보강', mainCell(out, 8, 2) === '김보강');
check('보강 날짜(col10,row2) = 3/16', mainCell(out, 10, 2) === '3/16');
check('보강 장소(col13,row2) = 컴퓨터실', mainCell(out, 13, 2) === '컴퓨터실');

// row1 데이터 = rowAddr 3, 대체이므로 보강 과목/날짜/요일/교시/장소 공백, 교사만 기재
check('구분(col6,row3) = 대체', mainCell(out, 6, 3) === '대체');
check('대체: 보강 과목(col7,row3) 공백', !mainCell(out, 7, 3));
check('대체: 보강 교사(col8,row3) = 이대체', mainCell(out, 8, 3) === '이대체');
check('대체: 보강 날짜(col10,row3) 공백', !mainCell(out, 10, 3));
check('대체: 보강 장소(col13,row3) 공백', !mainCell(out, 13, 3));

// row2(rowAddr 4) 이후는 입력 없음 → 빈칸 유지
check('빈 행(col1,row4) 공백 유지', !mainCell(out, 1, 4));

// 5. 재압축 후 재로딩 (zip 무결성)
zip.file('Contents/section0.xml', out);
const reblob = await zip.generateAsync({ type: 'nodebuffer' });
const reloaded = await JSZip.loadAsync(reblob);
check('재압축 후 section0.xml 재로딩 가능', !!reloaded.file('Contents/section0.xml'));

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail === 0 ? 0 : 1);
