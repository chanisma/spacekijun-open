// 담임 반 학생 생일 → 스케줄 가상 일정 회귀 — 2026-10-11 신설.
//
// 이 부류는 오류를 내지 않고 틀린다:
//  ① 2월 29일생이 평년에 달력에서 조용히 빠진다
//  ② 12월 말 ~ 1월 초 화면에서 다음 해 생일이 안 보인다
//  ③ 생일 칸이 일정 상세 창·[일정 이동]으로 새면 `meeting` 에 없는 id 를 고치려 든다
//
// 실행: npx tsx scripts/homeroom-birthday-test/run.mts
import { readFileSync } from 'node:fs';
import {
  birthdayEventTitle,
  birthdayKeyInYear,
  buildBirthdayEvents,
  isBirthdayEvent,
  type BirthdayStudent,
} from '../../src/lib/homeroomBirthdays';
import { getEventTypeColor } from '../../src/lib/scheduleUtils';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

const student = (name: string, birthday: string, number = 1, classNum = 3): BirthdayStudent => ({
  resourceId: `r-${name}`, name, grade: 2, classNum, number, birthday,
});

console.log('생일 날짜');
check('평범한 날', birthdayKeyInYear('2009-10-11', 2026) === '2026-10-11');
check('2/29 → 평년 2/28', birthdayKeyInYear('2008-02-29', 2027) === '2027-02-28');
check('2/29 → 윤년 그대로', birthdayKeyInYear('2008-02-29', 2028) === '2028-02-29');
check('형식이 틀리면 null', birthdayKeyInYear('2009.10.11', 2026) === null);
check('빈 값이면 null', birthdayKeyInYear('', 2026) === null);
check('13월이면 null', birthdayKeyInYear('2009-13-01', 2026) === null);

console.log('범위·묶음');
const students = [
  student('박하늘', '2009-10-11', 12),
  student('정시우', '2009-10-11', 3),
  student('이서연', '2009-10-20', 5),
  student('최윤', '2009-11-02', 7),
];
const oct = buildBirthdayEvents(students, new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59, 59));
check('10월 범위 = 2개 날짜', oct.length === 2, `got ${oct.length}`);
check('같은 날 두 명은 한 칸', oct[0].meta.birthday_students.length === 2);
check('번호순 정렬 → 정시우 먼저', oct[0].meta.birthday_students[0].name === '정시우');
check('제목 = 외 N명', oct[0].title === '🎂 정시우 외 1명', oct[0].title);
check('한 명 제목', birthdayEventTitle([{ name: '이서연' }]) === '🎂 이서연');
check('몇 번째 생일', oct[0].meta.birthday_students[0].turning === 17);
check('하루 종일(KST) 일정', oct[0].starts_at === '2026-10-11T00:00:00+09:00' && oct[0].ends_at === '2026-10-11T23:59:59+09:00');
check('id 가 meeting 과 안 섞임', oct.every((e) => e.id.startsWith('birthday:')));

const yearEnd = buildBirthdayEvents(
  [student('새해', '2009-01-03'), student('연말', '2009-12-30')],
  new Date(2026, 11, 25),
  new Date(2027, 0, 7, 23, 59, 59),
);
check('해를 넘는 범위 = 두 해 모두', yearEnd.map((e) => e.meta.birthday_date).join(',') === '2026-12-30,2027-01-03');

const leap = buildBirthdayEvents([student('윤일', '2008-02-29')], new Date(2027, 1, 1), new Date(2027, 1, 28, 23, 59, 59));
check('2/29생이 평년 2월에 나온다', leap.length === 1 && leap[0].meta.birthday_date === '2027-02-28');

check('형식이 틀린 생일은 건너뜀', buildBirthdayEvents([student('오류', 'abc')], new Date(2026, 0, 1), new Date(2026, 11, 31)).length === 0);

console.log('구분·색');
check('생일 일정 판정', isBirthdayEvent(oct[0]));
check('일반 일정은 아님', !isBirthdayEvent({ meta: { sbtr_dd_sc_nm: '공휴일' } }));
check('meta 없음은 아님', !isBirthdayEvent({ meta: null }) && !isBirthdayEvent(null));
check('분홍 색', getEventTypeColor('homeroom', 'light', oct[0].meta).includes('pink'));

console.log('배선(정적)');
const calendar = readFileSync(new URL('../../src/components/schedule/ScheduleCalendar.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/pages/Schedule.tsx', import.meta.url), 'utf8');
check('클릭은 생일 창으로 먼저 분기', /if \(isBirthdayEvent\(event\)\)/.test(calendar));
check('[일정 이동] 메뉴 두 곳 모두 생일 제외', (calendar.match(/!isBirthdayEvent\(event\) && \(/g) ?? []).length === 2);
check('이동 처리기도 생일 거부', /school_life_event_id \|\| isBirthdayEvent\(event\)\) return false/.test(page));
check('생일 창을 렌더', page.includes('<HomeroomBirthdayDialog'));
check('구글 캘린더 내보내기에서 생일 제외(학생 개인정보)', page.includes('events.filter((event) => !isBirthdayEvent(event)).map'));

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과');
process.exit(fails ? 1 : 0);
