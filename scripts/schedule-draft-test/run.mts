// 일정 AI 도우미 회귀 — 2026-09-30 신설.
//
// 못 박는 이유: 모델 출력은 무엇이든 올 수 있고, 여기서 걸러지지 않은 값은
// **오류 없이** 일정 추가 창에 채워진다(없는 날짜가 옆 날로 굴러가거나,
// 동명이인 중 아무나 출장자로 들어가거나). 전부 조용히 틀리는 부류다.
//
// 실행: npx tsx scripts/schedule-draft-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addMinutes,
  buildDraftCalendar,
  buildScheduleDraftUserPrompt,
  matchPeople,
  parseDateKey,
  parseScheduleDraft,
  toScheduleDraftSeed,
} from '../../src/lib/scheduleDraft';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
const ROOT = join(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8');

console.log('① 날짜표 — 모델이 요일 산수를 하지 않게');
{
  const today = new Date(2026, 8, 30); // 2026-09-30 수
  const cal = buildDraftCalendar(today);
  check('이번 주는 월요일 09-28 부터', cal[1].startsWith('이번 주: 월 2026-09-28'), cal[1]);
  check('다음 주 수요일 = 10-07', cal[2].includes('수 2026-10-07'), cal[2]);
  check('지난 주가 맨 앞', cal[0].startsWith('지난 주: 월 2026-09-21'));
  const sunday = buildDraftCalendar(new Date(2026, 9, 4)); // 일요일
  check('일요일은 그 주의 끝(월요일 시작)', sunday[1].startsWith('이번 주: 월 2026-09-28'), sunday[1]);
  const prompt = JSON.parse(buildScheduleDraftUserPrompt('원문', today));
  check('today 에 요일이 붙는다', prompt.today === '2026-09-30 (수)', prompt.today);
}

console.log('② 파싱 — 폼에 들어갈 수 있는 값만');
{
  const ok = parseScheduleDraft(
    '```json\n' +
      JSON.stringify({
        title: ' 협의회 ',
        description: '교육청',
        kind: 'event',
        date: '2026-10-07',
        start_time: '14:00',
        end_time: '16:00',
        all_day: false,
        people: ['김민수', '김민수', null],
        checks: [' 장소 확인 '],
        author_id: 'x',
      }) +
      '\n```'
  );
  check('펜스 JSON 허용·공백 정리', ok.title === '협의회' && ok.kind === 'event');
  check('사람 중복 제거', ok.people.length === 1);
  check('모르는 키는 남지 않는다', !('author_id' in ok));
  check('시각 보존', ok.startTime === '14:00' && ok.endTime === '16:00' && !ok.allDay);

  for (const bad of ['not json', '[]', 'null', '{"title":" "}', JSON.stringify({ title: '가'.repeat(201) })]) {
    check(`거부: ${bad.slice(0, 20)}`, throws(() => parseScheduleDraft(bad)));
  }

  const badDate = parseScheduleDraft(JSON.stringify({ title: 't', date: '2026-02-30', start_time: '9:00' }));
  check('없는 날짜는 버리고 묻는다', badDate.date === null && badDate.checks.some((c) => c.includes('2026-02-30')));
  check('9:00 → 09:00', badDate.startTime === '09:00');

  const unknownKind = parseScheduleDraft(JSON.stringify({ title: 't', kind: 'document_submission' }));
  check('신규 생성 중단된 종류는 업무로', unknownKind.kind === 'duty');

  const noTime = parseScheduleDraft(JSON.stringify({ title: 't', date: '2026-10-07' }));
  check('시각 없음 → 종일 + 알림', noTime.allDay && noTime.checks.some((c) => c.includes('하루 종일')));

  const reversed = parseScheduleDraft(JSON.stringify({ title: 't', start_time: '15:00', end_time: '14:00' }));
  check('종료가 시작보다 빠르면 비운다', reversed.endTime === null && reversed.startTime === '15:00');

  const badTime = parseScheduleDraft(JSON.stringify({ title: 't', start_time: '25:00' }));
  check('25:00 은 시각이 아니다', badTime.startTime === null && badTime.allDay);

  check('parseDateKey 윤년', !!parseDateKey('2028-02-29') && !parseDateKey('2026-02-29'));
}

console.log('③ 담당자 — 정확히 한 명일 때만');
{
  const resources = [
    { id: 'a', name: '김민수', type: 'teacher' },
    { id: 'b', name: '이서연', type: 'teacher' },
    { id: 'c', name: '이서연', type: 'teacher' },
    { id: 'd', name: '박행정', type: 'staff' },
    { id: 'e', name: '최학생', type: 'student' },
  ];
  const m = matchPeople(['김민수 선생님', '이서연', '박행정', '최학생', '없는사람', '김민수'], resources);
  check('호칭을 떼고 일치', m.matched.some((p) => p.id === 'a'));
  check('같은 사람 두 번 넣지 않음', m.matched.filter((p) => p.id === 'a').length === 1);
  check('동명이인은 확정하지 않는다', m.unmatched.includes('이서연'));
  check('직원도 담당자', m.matched.some((p) => p.id === 'd'));
  check('학생은 담당자가 아니다', m.unmatched.includes('최학생'));
  check('명단에 없는 이름', m.unmatched.includes('없는사람'));
}

console.log('④ 일정 추가 창으로 넘기는 값');
{
  const base = parseScheduleDraft(JSON.stringify({ title: 't', kind: 'duty', date: '2026-10-07', start_time: '14:00' }));
  const seed = toScheduleDraftSeed(base, ['a']);
  check('종료 없음 → 50분', seed.endTime === '14:50' && seed.dateOnly === false);
  check('날짜는 로컬 자정', seed.date?.getDate() === 7 && seed.date?.getHours() === 0);
  check('담당자 전달', seed.assignee?.[0] === 'a');
  const allDay = toScheduleDraftSeed(parseScheduleDraft(JSON.stringify({ title: 't', all_day: true })), []);
  check('종일 → 00:00~23:59', allDay.dateOnly === true && allDay.startTime === '00:00' && allDay.endTime === '23:59');
  const personal = toScheduleDraftSeed(parseScheduleDraft(JSON.stringify({ title: 't', kind: 'personal' })), ['a']);
  check('개인일정은 담당자를 넘기지 않는다(창이 본인을 넣는다)', personal.assignee === undefined);
  check('자정을 넘기지 않는다', addMinutes('23:30', 50) === '23:59');
}

console.log('⑤ 배선 — 조용히 끊기는 자리');
{
  const page = read('src/pages/Schedule.tsx');
  check('페이지가 위젯을 그린다', page.includes('<ScheduleDraftWidget'));
  check('초안이 창으로 들어간다', page.includes('initialValues={scheduleDraft}'));
  check('[일정 추가]로 열면 초안을 비운다', /handleCreateEvent = \(\) => \{\s*setScheduleDraft\(undefined\)/.test(page));
  const dialog = read('src/components/schedule/ScheduleCreateDialog.tsx');
  check('창이 날짜·시각을 받는다', dialog.includes('if (initialValues.date) setDate(initialValues.date)') && dialog.includes('setDateOnly(initialValues.dateOnly)'));
  // 초깃값 effect 가 selectedDate 동기화 effect 보다 뒤에 있어야 같은 커밋에서 이긴다
  check(
    '초깃값 effect 가 selectedDate effect 보다 뒤',
    dialog.indexOf('if (open && selectedDate)') < dialog.indexOf('if (initialValues.date)')
  );
  const service = read('src/services/scheduleDraftService.ts');
  check('공용 aiChat 을 쓴다', service.includes("from '@/services/aiChat'") && !service.includes('functions.invoke'));
  check('게이트웨이보다 먼저 포기', /timeoutMs: SCHEDULE_DRAFT_TIMEOUT_MS/.test(service));
}

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과');
process.exit(fails ? 1 : 0);
