// 운영 시간표(기간 한정 임시 시간표) 회귀 — 2026-10-26 신설.
//
// 엑셀 파서가 틀려도 오류는 나지 않는다 — 칸이 조용히 빠지거나 다른 반·교사로 들어가 그 기간
// 교사 시간표·대체 교사 판정이 어긋날 뿐이다. 사례는 «3학년 수능까지 시간표.xlsx» 의 실제 칸 모양.
// 날짜 판정(기간·대상 학년)은 SQL teacher_timetable_effective() 가 단일 출처 — supabase/tests/timetable_override.sql.
//
// 실행: npx tsx scripts/timetable-override-test/run.mts
import {
  activityTypeOf,
  effectiveSlotLabel,
  findTeacherClashes,
  nextDateForWeekday,
  parseClassHeader,
  parseLessonCell,
  parseOverrideGrid,
} from '../../src/lib/timetableOverride';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

console.log('반 머리글');
check('«1(3학년 1반)»', JSON.stringify(parseClassHeader('1(3학년 1반)')) === '{"grade":3,"classLabel":"1"}');
check('«3학년 10반»', parseClassHeader('3학년 10반')?.classLabel === '10');
check('«2-3»', parseClassHeader('2-3')?.grade === 2);
check('«강의실(원적반)» 은 머리글 아님', parseClassHeader('강의실(원적반)') === null);

console.log('칸');
check('«통합수학Ⅱ(임로아)»', JSON.stringify(parseLessonCell('통합수학Ⅱ(임로아)')) === '{"subject":"통합수학Ⅱ","teacher":"임로아"}');
check('«진로활동/(정채원)» — 줄바꿈 자리의 / 를 버린다', parseLessonCell('진로활동/(정채원)')?.subject === '진로활동');
check('«심화 영어 독해Ⅰ(박예준)» 과목 공백 유지', parseLessonCell('심화 영어 독해Ⅰ(박예준)')?.subject === '심화 영어 독해Ⅰ');
check('이름만 = 과목 없음', JSON.stringify(parseLessonCell('최은호')) === '{"subject":null,"teacher":"최은호"}');
check('긴 글은 이름이 아님', parseLessonCell('수능 모의평가 감독') === null);
check('빈 칸', parseLessonCell('  ') === null);

console.log('창체 구분');
check('동아리활동 = club', activityTypeOf('동아리활동') === 'club');
check('진로활동 = career', activityTypeOf('진로활동') === 'career');
check('자율활동 = autonomy', activityTypeOf('자율활동') === 'autonomy');
check('과목 = subject', activityTypeOf('실용 국어') === 'subject');
check('과목 없음 = null', activityTypeOf(null) === null);

console.log('격자 파싱 (실제 엑셀 모양)');
const grid = parseOverrideGrid([
  {
    name: '월',
    rows: [
      ['강의실(원적반)', null, '1(3학년 1반)', '2(3학년 2반)', '9(3학년 9반)'],
      [null, '1교시\n(09:00)', '통합수학Ⅱ(임로아)', '통합수학Ⅰ(임도윤)', '체육 탐구\n(황지아)'],
      [null, '4교시\n(12:50)', '최은호', '임도윤', null],
      [null, '5교시\n(13:50)', '지구과학Ⅱ(조하준)', '??', '송세아'],
    ],
  },
  { name: '금요일', rows: [[null, null, '3학년 1반'], [null, '7교시', '진로활동/(정채원)']] },
  { name: '메모', rows: [['아무거나']] },
]);
check('칸 수 = 8', grid.slots.length === 8, String(grid.slots.length));
const s1 = grid.slots.find((s) => s.day_of_week === 1 && s.period === 1 && s.class_label === '9');
check('월 1교시 3-9 = 체육 탐구(황지아)', s1?.subject_name === '체육 탐구' && s1.teacher_name === '황지아' && s1.grade === 3, JSON.stringify(s1));
const bare = grid.slots.find((s) => s.day_of_week === 1 && s.period === 4 && s.class_label === '1');
check('월 4교시 3-1 = 최은호, 과목 없음', bare?.teacher_name === '최은호' && bare.subject_name === null && bare.activity_type === null);
const fri = grid.slots.find((s) => s.day_of_week === 5);
check('«금요일» 시트 = 금, 7교시 진로활동 career', fri?.period === 7 && fri.activity_type === 'career');
check('읽지 못한 칸 «??» 을 경고', grid.warnings.some((w) => w.includes('??')));
check('요일이 아닌 시트를 경고하고 건너뜀', grid.warnings.some((w) => w.includes('메모')));

console.log('겹침');
check('같은 교사 같은 시간 두 칸', findTeacherClashes([
  { teacher_name: '류하준', day_of_week: 1, period: 3 },
  { teacher_name: '류하준', day_of_week: 1, period: 3 },
  { teacher_name: '류하준', day_of_week: 2, period: 3 },
]).join() === '류하준 월 3교시');
check('겹침 없음', findTeacherClashes(grid.slots).length === 0);

console.log('표시 이름 — 정규 섹션명 규칙과 같다');
check('과목 있음 = «과목 학년-반»', effectiveSlotLabel({ subject_name: '실용 국어', grade: 3, class_label: '1' }) === '실용 국어 3-1');
check('과목 없음 = «학년-반»', effectiveSlotLabel({ subject_name: null, grade: 3, class_label: '9' }) === '3-9');
check('공백 과목 = 과목 없음', effectiveSlotLabel({ subject_name: '  ', grade: 3, class_label: '9' }) === '3-9');

console.log('요일 → 다가오는 날짜');
const mon = new Date('2026-10-26T09:00:00'); // 월
check('월요일에 월 = 오늘', nextDateForWeekday(1, mon).getDate() === 26);
check('월요일에 금 = 10-30', nextDateForWeekday(5, mon).getDate() === 30);
const sun = new Date('2026-11-01T09:00:00'); // 일
check('일요일에 월 = 다음 날', nextDateForWeekday(1, sun).getDate() === 2);

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 모두 통과');
process.exit(fails ? 1 : 0);
