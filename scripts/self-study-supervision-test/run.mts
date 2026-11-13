// 자습 감독 배정 회귀 — 2026-10-11 신설.
//
// 공정성은 틀려도 오류가 나지 않는다 — 한 선생님에게 월요일만 몰리거나, 공휴일에 감독이 잡히거나,
// 토요휴업일 때문에 토요 자습이 영영 안 잡힐 뿐이다. 열람실 자료는 2026-10-11 운영 seaton 값.
//
// 실행: npx tsx scripts/self-study-supervision-test/run.mts
import { readFileSync } from 'node:fs';
import { classifySchoolDays, toDateKey, type SchoolCalendarEntry } from '../../src/lib/schoolDay';
import {
  cellIssues,
  gradeSlotConfig,
  isGradeHeadTag,
  listSupervisionCells,
  loadsWithPlan,
  manageableGrades,
  planSupervision,
  supervisionTitle,
  tieRank,
  academicYearOf,
  describeRule,
  findCsatDate,
  schoolMorningConfig,
  seniorExclusionRules,
  unavailabilityReason,
  SCHOOL_GRADE,
  type StudyRoomRow,
  type UnavailabilityRule,
} from '../../src/lib/selfStudySupervision';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

const P2 = [{ start_time: '18:40', end_time: '20:10' }, { start_time: '20:20', end_time: '21:40' }];
const ROOMS: StudyRoomRow[] = [
  { name: '1학년 열람실', grades: [1], operating_days: [1, 2, 3, 4, 5], operating_periods: P2 },
  { name: '2학년 열람실', grades: [2], operating_days: [1, 2, 3, 4, 5], operating_periods: P2 },
  { name: '3층 열람실 1', grades: [3], operating_days: [1, 2, 3, 4, 5], operating_periods: P2 },
  { name: '3층 열람실 2', grades: [3], operating_days: [1, 2, 3, 4, 5], operating_periods: P2 },
  { name: '[아침] 열람실 1 (3학년)', grades: [3], operating_days: [1, 2, 3, 4, 5], operating_periods: [] },
  { name: '[아침] 열람실 3 (1, 2학년)', grades: [1, 2], operating_days: [1, 2, 3, 4, 5], operating_periods: [] },
  { name: '[토] 3학년', grades: [3], operating_days: [6], operating_periods: [{ start_time: '09:00', end_time: '12:30' }, { start_time: '13:30', end_time: '17:00' }] },
];

console.log('열람실 → 시간대');
const g1 = gradeSlotConfig(ROOMS, 1);
const g3 = gradeSlotConfig(ROOMS, 3);
check('1학년 = 아침·저녁, 토요일 없음', g1.available.morning && g1.available.evening && !g1.available.saturday);
check('3학년 = 아침·저녁·토요일', g3.available.morning && g3.available.evening && g3.available.saturday);
check('저녁 시간 = 교시 처음~끝', g1.times.evening.start === '18:40' && g1.times.evening.end === '21:40');
check('토요일 시간 = 09:00~17:00', g3.times.saturday.start === '09:00' && g3.times.saturday.end === '17:00');
check('아침은 교시가 없어 기본값', g1.times.morning.start === '07:40');
check('3학년 저녁 열람실 2개(아침·토 제외)', g3.rooms.evening.length === 2, g3.rooms.evening.join(','));

console.log('누가 배정하나');
check('담임 태그 → 그 학년', manageableGrades(['2학년 3반'], false).join() === '2');
check('학년부장 태그(띄어쓰기) → 그 학년', manageableGrades(['3학년 부장', '부장'], false).join() === '3');
check('일반 부장 태그는 아님', manageableGrades(['부장', '정보화부'], false).length === 0);
check('관리자 = 전 학년', manageableGrades([], true).join() === '1,2,3');
check('학년부장 판정', isGradeHeadTag('2학년부장', 2) && !isGradeHeadTag('2학년부장', 1));
check('학년도 = 3월 시작', academicYearOf(2027, 2) === 2026 && academicYearOf(2026, 3) === 2026);

console.log('칸 만들기 (2026년 10월)');
const cal: SchoolCalendarEntry[] = [
  { date: '2026-10-03', title: '개천절', dayKind: '공휴일' },
  { date: '2026-10-07', title: '1차고사', dayKind: '해당없음' },
  { date: '2026-10-07', title: '2차고사', dayKind: '해당없음' },
  { date: '2026-10-09', title: '한글날', dayKind: '공휴일' },
  { date: '2026-10-10', title: '토요휴업일', dayKind: '휴업일' },
  { date: '2026-10-17', title: '토요휴업일', dayKind: '휴업일' },
];
const dates = Array.from({ length: 31 }, (_, i) => toDateKey(new Date(2026, 9, i + 1)));
const days = classifySchoolDays(dates, cal);
const all = { morning: true, evening: true, saturday: true };
const cells3 = listSupervisionCells({ days, config: g3, enabled: all, morningMode: 'separate', from: '2026-10-01' });
const has = (date: string, slot: string) => cells3.some((c) => c.date === date && c.slot === slot);
check('한글날(공휴일)은 칸 없음', !has('2026-10-09', 'evening'));
check('시험일은 배정 + 메모', has('2026-10-07', 'evening') && cells3.find((c) => c.date === '2026-10-07')!.notes.includes('1차고사'));
check('토요휴업일 토요일 = 토요 자습 칸', has('2026-10-10', 'saturday') && has('2026-10-17', 'saturday'));
check('공휴일 토요일(개천절)은 토요 칸 없음', !has('2026-10-03', 'saturday'));
check('일요일은 칸 없음', !cells3.some((c) => c.dow === 7));
check('평일엔 아침·저녁 두 칸(따로 모드)', has('2026-10-12', 'morning') && has('2026-10-12', 'evening'));
const together = listSupervisionCells({ days, config: g3, enabled: all, morningMode: 'with_evening', from: '2026-10-01' });
check('함께 모드 = 아침 칸 없음', !together.some((c) => c.slot === 'morning'));
const cells1 = listSupervisionCells({ days, config: g1, enabled: all, morningMode: 'separate', from: '2026-10-01' });
check('1학년은 토요 칸 없음', !cells1.some((c) => c.slot === 'saturday'));
check('오늘 이전은 만들지 않는다', listSupervisionCells({ days, config: g1, enabled: all, morningMode: 'separate', from: '2026-10-20' }).every((c) => c.date >= '2026-10-20'));
const offMorning = listSupervisionCells({ days, config: g1, enabled: { ...all, morning: false }, morningMode: 'separate', from: '2026-10-01' });
check('아침을 끄면 아침 칸 없음', !offMorning.some((c) => c.slot === 'morning'));

console.log('공정 배정');
const pool = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'];
const plan = planSupervision({ cells: cells3, pool, history: [], absent: new Set(), seed: '2026-10|3' });
check('모든 칸이 찼다', plan.every((c) => c.assignee));
const loads = loadsWithPlan(pool, [], plan);
const spread = (slot: 'morning' | 'evening' | 'saturday') => {
  const counts = pool.map((n) => loads.get(n)!.bySlot[slot]);
  return Math.max(...counts) - Math.min(...counts);
};
check('저녁 횟수 차이 ≤ 1', spread('evening') <= 1, String(spread('evening')));
check('아침 횟수 차이 ≤ 1', spread('morning') <= 1, String(spread('morning')));
check('같은 날 두 칸 맡은 사람 없음', !plan.some((c, i) => plan.some((d, j) => i !== j && c.date === d.date && c.assignee === d.assignee)));
const maxDow = Math.max(...pool.map((n) => Math.max(...loads.get(n)!.byDow.slice(1, 6))));
check('한 사람이 같은 요일을 3번 넘게 맡지 않는다(요일 분산)', maxDow <= 3, String(maxDow));

// 누적 반영 — 9월에 저녁을 많이 한 사람은 10월에 덜
const history = [
  ...Array.from({ length: 5 }, (_, i) => ({ date: `2026-09-${String(i + 7).padStart(2, '0')}`, slot: 'evening' as const, names: ['가'] })),
];
const plan2 = planSupervision({ cells: cells1.filter((c) => c.slot === 'evening'), pool, history, absent: new Set(), seed: '2026-10|1' });
const ga = plan2.filter((c) => c.assignee === '가').length;
const others = Math.min(...pool.filter((n) => n !== '가').map((n) => plan2.filter((c) => c.assignee === n).length));
check('학년도 누적이 많은 사람은 이번 달 덜 맡는다', ga < others, `가=${ga}, 최소=${others}`);

// 출장 피하기
const firstEvening = cells1.find((c) => c.slot === 'evening')!;
const absent = new Set(pool.map((n) => `${firstEvening.date}|${n}`).filter((k) => !k.endsWith('|차')));
const plan3 = planSupervision({ cells: [firstEvening], pool, history: [], absent, seed: 'x' });
check('출장·연수 있는 사람은 피한다', plan3[0].assignee === '차', String(plan3[0].assignee));
const plan4 = planSupervision({ cells: [firstEvening], pool: ['가'], history: [], absent: new Set([`${firstEvening.date}|가`]), seed: 'x' });
check('모두 출장이면 빈칸으로 둔다(조용히 채우지 않음)', plan4[0].assignee === null);
check('빈칸 표시', cellIssues(plan4, 0, new Set()).includes('empty'));

check('같은 seed = 같은 초안', JSON.stringify(planSupervision({ cells: cells3, pool, history: [], absent: new Set(), seed: 's' })) === JSON.stringify(planSupervision({ cells: cells3, pool, history: [], absent: new Set(), seed: 's' })));
check('seed 가 다르면 동점 순서가 바뀐다', tieRank('a', '가') !== tieRank('b', '가'));

console.log('제목');
check('이름은 맨 끝 « · 이름»(교체 RPC 가 이 자리만 바꾼다)', supervisionTitle(2, 'evening', '정시우') === '자습감독 · 2학년 저녁 · 정시우');
check('함께 모드 제목', supervisionTitle(1, 'evening', '이서연', true) === '자습감독 · 1학년 아침·저녁 · 이서연');

console.log('전 학년 아침 (2026-10-12)');
const ROOMS_SHARED: StudyRoomRow[] = [...ROOMS, { name: '[아침] 열람실 2 (1, 2, 3학년)', grades: [1, 2, 3], operating_days: [1, 2, 3, 4, 5], operating_periods: [] }];
const school = schoolMorningConfig(ROOMS_SHARED);
check('통합 = 아침만', school.available.morning && !school.available.evening && !school.available.saturday);
check('통합 = 학년 가리지 않고 아침 방 전부', school.rooms.morning.length === 3, school.rooms.morning.join(','));
const schoolCells = listSupervisionCells({ days, config: school, enabled: { morning: true, evening: false, saturday: false }, morningMode: 'separate', from: '2026-10-01' });
check('통합 아침 = 평일 아침 칸만', schoolCells.length > 0 && schoolCells.every((c) => c.slot === 'morning' && c.dow <= 5));
const schoolMode = listSupervisionCells({ days, config: g3, enabled: all, morningMode: 'school', from: '2026-10-01' });
check('학년 화면 «통합» 모드 = 아침 칸 없음(저녁·토요일은 그대로)', !schoolMode.some((c) => c.slot === 'morning') && schoolMode.some((c) => c.slot === 'evening') && schoolMode.some((c) => c.slot === 'saturday'));
check('통합 제목', supervisionTitle(SCHOOL_GRADE, 'morning', '정시우') === '자습감독 · 전 학년 아침 · 정시우');
check('수능일 = 대학수학능력시험', findCsatDate([{ date: '2026-09-22', title: '수능 50일 응원(4교시 강당)' }, { date: '2026-11-19', title: '대학수학능력시험' }]) === '2026-11-19');
check('«수능 응원»은 수능일이 아님', findCsatDate([{ date: '2026-09-22', title: '수능 50일 응원' }]) === null);
const seniorPool = ['가', '나', '다', '라', '마', '바'];
const seniors = ['가', '나', '다'];
const novDays = classifySchoolDays(Array.from({ length: 12 }, (_, i) => toDateKey(new Date(2026, 10, 16 + i))), [{ date: '2026-11-19', title: '대학수학능력시험', dayKind: '휴업일' }]);
const novCells = listSupervisionCells({ days: novDays, config: school, enabled: { morning: true, evening: false, saturday: false }, morningMode: 'separate', from: '2026-11-01' });
const novPlan = planSupervision({ cells: novCells, pool: seniorPool, history: [], absent: new Set(), unavailable: seniorExclusionRules(seniors, '2026-11-19'), seed: 'n' });
check('수능일(휴업일)엔 칸 없음', !novCells.some((c) => c.date === '2026-11-19'));
check('수능 전엔 3학년 선생님도 맡는다', novPlan.filter((c) => c.date < '2026-11-19').some((c) => seniors.includes(c.assignee ?? '')));
check('수능 이후엔 3학년 선생님이 빠진다', novPlan.filter((c) => c.date > '2026-11-19').every((c) => c.assignee && !seniors.includes(c.assignee)));

console.log('못 하는 날 (2026-10-12)');
const wedEvening: UnavailabilityRule = { name: '가', weekday: 3, date: null, from: null, until: null, slots: ['evening'], note: '대학원 수업' };
const oneDay: UnavailabilityRule = { name: '나', weekday: null, date: '2026-10-13', from: null, until: null, slots: ['morning', 'evening'], note: null };
const wedCell = { date: '2026-10-14', dow: 3, slot: 'evening' as const };
check('매주 수요일 저녁 → 수요일 저녁은 못 함(사유)', unavailabilityReason([wedEvening], '가', wedCell) === '대학원 수업');
check('수요일 아침은 됨', unavailabilityReason([wedEvening], '가', { ...wedCell, slot: 'morning' }) === null);
check('목요일 저녁은 됨', unavailabilityReason([wedEvening], '가', { date: '2026-10-15', dow: 4, slot: 'evening' }) === null);
check('«함께» 모드 저녁 칸은 아침 사정도 막는다', unavailabilityReason([{ ...wedEvening, slots: ['morning'] }], '가', { ...wedCell, withMorning: true }) !== null);
check('기간이 끝나면 풀린다', unavailabilityReason([{ ...wedEvening, until: '2026-10-07' }], '가', wedCell) === null);
check('특정 날짜는 그날만', unavailabilityReason([oneDay], '나', { date: '2026-10-13', dow: 2, slot: 'morning' }) !== null && unavailabilityReason([oneDay], '나', { date: '2026-10-20', dow: 2, slot: 'morning' }) === null);
check('규칙 설명', describeRule(wedEvening) === '매주 수요일 저녁' && describeRule(oneDay) === '10/13 아침·저녁');
const octEvenings = cells3.filter((c) => c.slot === 'evening');
const planU = planSupervision({ cells: octEvenings, pool, history: [], absent: new Set(), unavailable: [wedEvening], seed: 'u' });
check('자동 배정은 매주 수요일 저녁에 그 사람을 넣지 않는다', !planU.some((c) => c.dow === 3 && c.assignee === '가'));
check('다른 요일엔 그 사람도 맡는다', planU.some((c) => c.dow !== 3 && c.assignee === '가'));
const forced = [{ ...octEvenings.find((c) => c.dow === 3)!, assignee: '가' }];
check('손으로 넣으면 «못 하는 날» 확인 표시', cellIssues(forced, 0, new Set(), [wedEvening]).includes('unavailable'));
const onlyOne = planSupervision({ cells: [octEvenings.find((c) => c.dow === 3)!], pool: ['가'], history: [], absent: new Set(), unavailable: [wedEvening], seed: 'u' });
check('그 사람밖에 없으면 빈칸(조용히 채우지 않음)', onlyOne[0].assignee === null);

console.log('배선(정적)');
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const mig = read('supabase/migrations/20261011100000_self_study_supervision.sql');
check('이력은 RPC(duty RLS 우회) — 화면이 meeting 을 직접 세지 않는다', read('src/features/self-study-supervision/useSupervisionSources.ts').includes("rpc('get_self_study_supervision_history'"));
check('모든 RPC 가 anon·PUBLIC 회수', (mig.match(/from public, anon;/g) ?? []).length === 5);
check('로그인 필수 가드', (mig.match(/if auth\.uid\(\) is null then/g) ?? []).length === 5);
check('알림 insert 에 RETURNING 없음', !/insert into notification_events[\s\S]{0,600}?returning/i.test(mig));
check('priority 는 CHECK 허용값(low·medium·high)', !mig.includes("'normal'"));
check('수락 시 담당자 재확인', mig.includes('더 이상 이 감독의 담당자가 아닙니다'));
check('표 쓰기는 RPC 전용', mig.includes('revoke insert, update, delete on public.supervision_swap_request'));
check('createEvent 가 meta.supervision 을 싣는다', read('src/hooks/useSchedule.ts').includes('supervision: eventData.supervision'));
check('알림 → 교체 탭', read('src/components/notifications/notificationNavigation.ts').includes("'/schedule?supervision=swap'"));
check('학생·직원에게는 메뉴 없음', read('src/pages/Schedule.tsx').includes("!isStudent && effectiveRole !== 'staff'"));

const mig2 = read('supabase/migrations/20261012130000_supervision_unavailability_school_morning.sql');
check('못 하는 날 = 요일·날짜 중 하나만', mig2.includes('check ((weekday is null) <> (on_date is null))'));
check('못 하는 날 쓰기 = 본인 또는 교사·관리자', (mig2.match(/current_actor_resource_ids\(\)\)\s*or coalesce\(public\.is_teacher_or_admin/g) ?? []).length === 4);
check('anon 회수', mig2.includes('revoke all on public.supervision_unavailability from anon'));
check('교체 신청 grade 0(전 학년) 허용', mig2.includes('check (grade between 0 and 3)'));
check('전 학년 교체 알림 = 세 학년부장', mig2.includes("case when v_req.grade = 0 then '[1-3]'"));
check('배정 화면이 못 하는 날을 배정에 넘긴다', read('src/features/self-study-supervision/SupervisionPlanTab.tsx').includes('unavailable: rules'));
check('못 하는 날 삭제는 행 수 확인(RLS 0행 삭제)', read('src/features/self-study-supervision/useSupervisionSources.ts').includes("delete().eq('id', id).select('id')"));

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과');
process.exit(fails ? 1 : 0);
