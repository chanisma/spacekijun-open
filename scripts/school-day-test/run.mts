// 그날은 어떤 날인가(수업일·시험·휴일·방학) 회귀 — 2026-10-11 신설.
//
// 이 판정은 틀려도 오류가 나지 않는다. 대시보드에 한글날 수업이 뜨거나, 다마고찌가 방학식 날
// 수업 정지를 안 하거나, 자습 감독이 공휴일에 배정될 뿐이다. 사례는 2026학년도 실제 NEIS 값.
//
// 실행: npx tsx scripts/school-day-test/run.mts
import { readFileSync } from 'node:fs';
import {
  classifySchoolDay,
  classifySchoolDays,
  expandScheduleRows,
  isClosingEntry,
  kstDateKey,
  schoolDayMessage,
  isClosedForGrade,
  gradeOfSectionName,
  noClassMetaPatch,
  readNoClassSetting,
  type SchoolCalendarEntry,
} from '../../src/lib/schoolDay';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const e = (date: string, title: string, dayKind: string | null = '해당없음'): SchoolCalendarEntry => ({ date, title, dayKind });

console.log('기본 판정');
check('평일·학사일정 없음 = 수업일', classifySchoolDay('2026-10-14', []).kind === 'school');
check('한글날(공휴일) = 휴일', classifySchoolDay('2026-10-09', [e('2026-10-09', '한글날', '공휴일')]).kind === 'holiday');
check('휴일 이름이 label', classifySchoolDay('2026-10-09', [e('2026-10-09', '한글날', '공휴일')]).label === '한글날');
check('개교기념일(휴업일) = 휴일', classifySchoolDay('2026-04-24', [e('2026-04-24', '개교기념일', '휴업일')]).kind === 'holiday');
check('수능일(휴업일) = 휴일', classifySchoolDay('2026-11-19', [e('2026-11-19', '대학수학능력시험일', '휴업일')]).isClosed);
check('여름방학(휴업일) = 방학', classifySchoolDay('2026-07-27', [e('2026-07-27', '여름방학', '휴업일')]).kind === 'vacation');
check('토·일 = 주말', classifySchoolDay('2026-10-17', []).kind === 'weekend' && classifySchoolDay('2026-10-18', []).kind === 'weekend');

console.log('조용히 틀리던 자리');
const closing = classifySchoolDay('2026-07-22', [e('2026-07-22', '방학식')]);
check('방학식(해당없음) = 수업일 — 다마고찌 옛 정규식은 쉬는 날로 봤다', closing.kind === 'school', closing.kind);
check('방학식은 메모로 남는다', closing.notes.includes('방학식'));
check('토요휴업일은 닫힘이 아니다(토요 자습이 열린다)', !isClosingEntry(e('2026-10-17', '토요휴업일', '휴업일')));
const sat = classifySchoolDay('2026-10-17', [e('2026-10-17', '토요휴업일', '휴업일')]);
check('토요휴업일 토요일 = 주말(휴일 아님)', sat.kind === 'weekend' && sat.notes.length === 0, sat.kind);
check('토요일 공휴일은 휴일', classifySchoolDay('2026-10-03', [e('2026-10-03', '개천절', '공휴일')]).kind === 'holiday');
check('손으로 넣은 학사일정(dayKind 없음)은 수업일 + 메모', (() => {
  const d = classifySchoolDay('2026-03-18', [e('2026-03-18', '민방위', null)]);
  return d.kind === 'school' && d.notes[0] === '민방위';
})());

console.log('시험');
const oneExam = classifySchoolDay('2026-08-19', [e('2026-08-19', '1차고사')]);
check('고사 하나 = 시험(수업 흐리게)', oneExam.kind === 'exam' && !oneExam.isClosed && !oneExam.allGradeExam);
const allExam = classifySchoolDay('2026-10-07', [e('2026-10-07', '1차고사'), e('2026-10-07', '2 차고사')]);
check('서로 다른 고사 둘 = 전 학년 시험', allExam.allGradeExam && allExam.label === '1차고사·2차고사', String(allExam.label));
check('수학여행은 시험이 아니라 메모', (() => {
  const d = classifySchoolDay('2026-10-14', [e('2026-10-14', '수학여행')]);
  return d.kind === 'school' && d.notes.includes('수학여행');
})());

console.log('학기 기간');
const term = { start: '2026-08-10', end: '2026-12-24' };
check('학기 밖 평일 = 방학', classifySchoolDay('2026-12-28', [], term).kind === 'vacation');
check('학기 안 평일 = 수업일', classifySchoolDay('2026-10-14', [], term).kind === 'school');
check('학기 밖이어도 공휴일 이름이 우선', classifySchoolDay('2026-12-25', [e('2026-12-25', '성탄절', '공휴일')], term).label === '성탄절');

console.log('학사일정 행 펼치기');
const rows = [
  { starts_at: '2026-09-24T00:00:00.000Z', ends_at: '2026-09-26T09:00:00.000Z', meta: { title: '추석', sbtr_dd_sc_nm: '공휴일' } },
  { starts_at: '2026-10-09T00:00:00.000Z', ends_at: '2026-10-09T09:00:00.000Z', meta: { title: '한글날', sbtr_dd_sc_nm: '공휴일' } },
  { starts_at: '2026-10-10T15:00:00.000Z', ends_at: '2026-10-11T15:00:00.000Z', meta: { title: '자정 끝' } },
  { starts_at: '2026-10-12T00:00:00.000Z', ends_at: '2026-10-12T09:00:00.000Z', meta: {} },
];
const expanded = expandScheduleRows(rows);
check('추석 3일이 날마다 한 개', expanded.filter((x) => x.title === '추석').map((x) => x.date).join(',') === '2026-09-24,2026-09-25,2026-09-26');
check('KST 날짜(UTC 자정 = KST 09시)', kstDateKey(Date.parse('2026-10-09T00:00:00.000Z')) === '2026-10-09');
check('다음 날 00:00 정각에 끝나면 그날은 빠진다', expanded.filter((x) => x.title === '자정 끝').map((x) => x.date).join(',') === '2026-10-11');
check('제목 없는 행은 버림', !expanded.some((x) => x.title === ''));
check('수업공제일명이 실린다', expanded.find((x) => x.title === '한글날')?.dayKind === '공휴일');

console.log('여러 날 + 문구');
const week = classifySchoolDays(['2026-10-08', '2026-10-09', '2026-10-10'], expanded);
check('한 주 판정', week.get('2026-10-08')?.kind === 'school' && week.get('2026-10-09')?.kind === 'holiday' && week.get('2026-10-10')?.kind === 'weekend');
check('휴일 문구', schoolDayMessage({ kind: 'holiday', label: '한글날' }) === '한글날 · 수업 없음');
check('수업일은 문구 없음', schoolDayMessage({ kind: 'school', label: null }) === null);

console.log('학년별 «수업 없는 날» (손으로 넣은 학사일정)');
const g2: SchoolCalendarEntry = { date: '2026-10-14', title: '2학년 재량휴업', dayKind: '휴업일', grades: [2] };
check('학교 전체로 보면 수업일(전 학년이 쉬는 날이 아니다)', classifySchoolDay('2026-10-14', [g2]).kind === 'school');
check('그래도 쉬는 학년은 남긴다', classifySchoolDay('2026-10-14', [g2]).closedGrades.join() === '2');
check('2학년으로 보면 휴일', classifySchoolDay('2026-10-14', [g2], null, 2).kind === 'holiday');
check('1학년으로 보면 수업일 + 메모', (() => {
  const d = classifySchoolDay('2026-10-14', [g2], null, 1);
  return d.kind === 'school' && d.notes.some((n) => n.includes('2학년 수업 없음'));
})());
check('수업마다 판정(교사 시간표)', isClosedForGrade(classifySchoolDay('2026-10-14', [g2]), 2) && !isClosedForGrade(classifySchoolDay('2026-10-14', [g2]), 3));
check('학년을 모르면 일부 학년 휴업은 막지 않는다', !isClosedForGrade(classifySchoolDay('2026-10-14', [g2]), null));
check('반 이름에서 학년', gradeOfSectionName('인공지능 기초 1-1') === 1 && gradeOfSectionName('수학 3-10') === 3 && gradeOfSectionName('동아리') === null);
check('교사용 문구', schoolDayMessage(classifySchoolDay('2026-10-14', [g2]), true) === '2학년 재량휴업(2학년) · 그 학년 수업 없음');
check('학생용(학교 전체) 문구는 조용하다', schoolDayMessage(classifySchoolDay('2026-10-14', [g2])) === null);
check('학년 메타가 행에서 실린다', expandScheduleRows([
  { starts_at: '2026-10-14T00:00:00.000Z', ends_at: '2026-10-14T09:00:00.000Z', meta: { title: 'x', sbtr_dd_sc_nm: '휴업일', no_class_grades: [2, 2, 9] } },
])[0].grades?.join() === '2');

console.log('«수업 없는 날» 저장값');
check('체크 + 전 학년 = 휴업일, 학년 없음', JSON.stringify(noClassMetaPatch({ enabled: true, grades: [] }, { source: 'custom' })) === '{"sbtr_dd_sc_nm":"휴업일","no_class_grades":null}');
check('체크 + 2학년', JSON.stringify(noClassMetaPatch({ enabled: true, grades: [2] }, null)) === '{"sbtr_dd_sc_nm":"휴업일","no_class_grades":[2]}');
check('셋 다 고르면 전 학년으로 접는다', noClassMetaPatch({ enabled: true, grades: [3, 1, 2] }, null).no_class_grades === null);
check('NEIS 공휴일을 고쳐도 공휴일로 남는다', noClassMetaPatch({ enabled: true, grades: [] }, { sbtr_dd_sc_nm: '공휴일', source: 'NEIS' }).sbtr_dd_sc_nm === '공휴일');
check('해제 — 손으로 넣은 일정 = null', noClassMetaPatch({ enabled: false, grades: [2] }, { sbtr_dd_sc_nm: '휴업일', source: 'custom' }).sbtr_dd_sc_nm === null);
check('해제 — NEIS 일정 = 해당없음', noClassMetaPatch({ enabled: false, grades: [] }, { sbtr_dd_sc_nm: '휴업일', source: 'NEIS' }).sbtr_dd_sc_nm === '해당없음');
check('저장값 → 체크 상태', JSON.stringify(readNoClassSetting({ sbtr_dd_sc_nm: '휴업일', no_class_grades: [1] })) === '{"enabled":true,"grades":[1]}');
check('해당없음 → 체크 안 됨', !readNoClassSetting({ sbtr_dd_sc_nm: '해당없음' }).enabled && !readNoClassSetting(null).enabled);
check('왕복: 저장 → 읽기 → 같은 상태', (() => {
  const s = { enabled: true, grades: [1, 3] };
  return JSON.stringify(readNoClassSetting(noClassMetaPatch(s, null))) === JSON.stringify(s);
})());

console.log('배선(정적) — 판정을 화면에 베껴 쓰지 않았는가');
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const pet = read('src/features/tamagotchi/hooks/usePetSchedule.ts');
check('다마고찌가 제목 정규식을 버렸다', !/const HOLIDAY = /.test(pet) && pet.includes('useSchoolCalendar('));
check('급식지도가 같은 상수를 쓴다', read('src/lib/mealDuty.ts').includes("from './schoolDay'") && !/const CLOSED_DAY_KINDS = /.test(read('src/lib/mealDuty.ts')));
check('학생 대시보드 카드', read('src/components/dashboard/cards/StudentTodayTimetableCard.tsx').includes('useSchoolDay('));
check('교사 대시보드 카드', read('src/features/teacher-dashboard/components/TeacherTodayScheduleCard.tsx').includes('useSchoolDay('));
check('시간표 화면은 학기 기간을 적용하지 않는다', /useSchoolCalendar\([^)]*applyTerm: false/.test(read('src/components/timetable/TimetableGrid.tsx')));
check('시간표 칸은 학년별로 흐린다', read('src/components/timetable/TimetableGrid.tsx').includes('isClosedForGrade(dayInfoOf(day), cellGrade)'));
check('학생 시간표가 학년을 넘긴다', read('src/components/timetable/StudentTimetableView.tsx').includes('viewerGrade={studentGrade'));
check('학생 대시보드가 학년을 넘긴다', read('src/components/dashboard/cards/StudentTodayTimetableCard.tsx').includes('useSchoolDay(now, studentGrade)'));
check('교사 대시보드는 수업마다 거른다', read('src/features/teacher-dashboard/components/TeacherTodayScheduleCard.tsx').includes('isClosedForGrade(schoolDay, gradeOfSectionName('));
check('자습 감독은 그 학년으로 판정', /useSchoolCalendar\([^)]*grade \}\)/.test(read('src/features/self-study-supervision/SupervisionPlanTab.tsx')));
check('급식지도는 일부 학년 휴업으로 쉬지 않는다', read('src/features/meal-duty/useMealDutySources.ts').includes('dayKind: partial ? null'));
check('일정 만들기 창에 «수업 없는 날»(학사일정만)', /eventType === 'schedule' && \(\s*<NoClassDayField/.test(read('src/components/schedule/ScheduleCreateDialog.tsx')));
check('일정 수정 창에 «수업 없는 날» + 기존 meta 기준 저장', read('src/components/schedule/ScheduleEditDialog.tsx').includes('noClassMetaPatch(noClass, existingMeta)'));
check('createEvent 가 같은 저장 규칙을 쓴다', read('src/hooks/useSchedule.ts').includes('noClassMetaPatch(eventData.no_class'));

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과');
process.exit(fails ? 1 : 0);
