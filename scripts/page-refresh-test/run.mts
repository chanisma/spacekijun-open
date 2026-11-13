// [새로고침] 회귀 — 2026-10-11 신설.
//
// 종전 버튼은 ①화면의 일부 쿼리만 다시 부르고 ②회전 표시가 첫 로드(isLoading)에만 돌아
// «눌러도 아무 일 없는» 것처럼 보였다. 둘 다 오류를 내지 않는다.
//
// 실행: npx tsx scripts/page-refresh-test/run.mts
import { readFileSync } from 'node:fs';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

console.log('react-query 전제(usePageRefresh 가 기대는 동작)');
{
  const client = new QueryClient();
  let calls = 0;
  const observer = new QueryObserver(client, { queryKey: ['teacher-memo', 'r1'], queryFn: async () => ++calls, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  await new Promise((r) => setTimeout(r, 20));
  check('처음 한 번 부른다', calls === 1, String(calls));
  await client.refetchQueries({ queryKey: ['teacher-memo'], type: 'active' }, { throwOnError: true });
  check('staleTime 이 무한이어도 접두어로 다시 부른다', calls === 2, String(calls));
  let unrelated = 0;
  client.setQueryData(['other'], 1);
  client.getQueryCache().find({ queryKey: ['other'] });
  await client.refetchQueries({ queryKey: ['timetable-data'], type: 'active' });
  check('다른 접두어는 건드리지 않는다', calls === 2 && unrelated === 0);
  unsubscribe();
  await client.refetchQueries({ queryKey: ['teacher-memo'], type: 'active' });
  check('화면에 없는(비활성) 쿼리는 부르지 않는다', calls === 2, String(calls));
  const failing = new QueryObserver(client, { queryKey: ['school-calendar'], queryFn: async () => { throw new Error('x'); }, retry: false });
  const un2 = failing.subscribe(() => {});
  await new Promise((r) => setTimeout(r, 20));
  let threw = false;
  try { await client.refetchQueries({ queryKey: ['school-calendar'], type: 'active' }, { throwOnError: true }); } catch { threw = true; }
  check('실패를 알 수 있다(throwOnError)', threw);
  un2();
}

console.log('배선(정적)');
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const hook = read('src/hooks/usePageRefresh.ts');
check('훅은 refetchQueries(active) 로 부른다', hook.includes("refetchQueries({ queryKey, type: 'active' }"));
check('회전은 최소 시간을 지킨다', /MIN_SPIN_MS = \d+/.test(hook));
const view = read('src/components/timetable/TimetableView.tsx');
for (const key of ['timetable-data', 'teacher-memo', 'pending-swap-count', 'school-calendar']) {
  check(`교사 시간표 새로고침에 ${key}`, view.includes(`['${key}']`));
}
check('교사 시간표 버튼이 새 훅을 쓴다', view.includes('onRefresh={pageRefresh.refresh}') && view.includes('refreshing={pageRefresh.refreshing}'));
check('시간표 머리 버튼은 다시 불러오는 동안 돈다', read('src/components/timetable/TimetableHeader.tsx').includes("loading || refreshing ? 'animate-spin'"));
const student = read('src/components/timetable/StudentTimetableView.tsx');
check('학생 시간표 새로고침에 수업·쉬는 날', student.includes("['student-timetable'], ['school-calendar']") && student.includes('onClick={pageRefresh.refresh}'));
const page = read('src/pages/Schedule.tsx');
for (const key of ["'schedule-events'", "'task-due-dates-schedule'", "'school-life-events'", "'school-calendar'", "'homeroom-birthdays'", "'schedule-surveys'", "'self-study-supervision-swaps'"]) {
  check(`스케줄 새로고침에 ${key}`, page.includes(key));
}
check('스케줄 버튼이 새 훅을 쓴다', page.includes('onRefresh={pageRefresh.refresh}'));
// 2026-11-06 — extra 가 refetch()(일정·업무 마감 쿼리 포함)면 같은 쿼리를 두 번 불러 앞 요청이 취소 → CancelledError 로 «새로고침 실패»
check('스케줄 extra 는 목록의 쿼리를 다시 부르지 않는다(급식만)', page.includes('], () => fetchMeals());') && !page.includes('], () => refetch());'));
check('스케줄 머리 버튼은 다시 불러오는 동안 돈다', read('src/components/schedule/ScheduleHeader.tsx').includes("loading || refreshing ? 'animate-spin'"));

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과');
process.exit(fails ? 1 : 0);
