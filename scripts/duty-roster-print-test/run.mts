// 업무 명단 출력(급식지도·자습 감독) 회귀 — 2026-10-11 신설.
//
// 출력물은 틀려도 오류가 나지 않는다 — 날짜가 한 칸씩 밀리거나, 휴일이 빈칸으로 나와 «안 정했다»로
// 읽히거나, 이름이 HTML 로 해석될 뿐이다.
//
// 실행: npx tsx scripts/duty-roster-print-test/run.mts
import { readFileSync } from 'node:fs';
import { buildDutyRosterDocument, buildRosterCalendar, escapeHtml } from '../../src/lib/dutyRosterPrint';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

console.log('달력 격자');
// 2026-11-01 = 일요일. 월~금 달력의 첫 주는 11/2(월)부터
const nov = buildRosterCalendar({ year: 2026, month: 11, weekdays: [1, 2, 3, 4, 5], entries: [], offDays: [] });
check('일요일로 시작하는 달 — 빈 첫 주를 만들지 않는다', nov[0][0]?.day === 2, String(nov[0][0]?.day));
check('11월 평일 주 = 5주', nov.length === 5, String(nov.length));
check('마지막 칸 = 11/30(월)', nov[4][0]?.day === 30 && nov[4].slice(1).every((c) => c === null));
const oct = buildRosterCalendar({ year: 2026, month: 10, weekdays: [1, 2, 3, 4, 5], entries: [], offDays: [] });
check('10/1(목) = 첫 주 넷째 칸, 앞은 비움', oct[0][3]?.day === 1 && oct[0][0] === null && oct[0][2] === null);
const sat = buildRosterCalendar({ year: 2026, month: 10, weekdays: [1, 2, 3, 4, 5, 6], entries: [], offDays: [] });
check('월~토 달력 — 10/3 은 토요일 칸', sat[0][5]?.day === 3);
check('일요일은 어떤 달력에도 없다', sat.flat().every((c) => !c || new Date(2026, 9, c.day).getDay() !== 0));

console.log('칸 내용');
const cal = buildRosterCalendar({
  year: 2026, month: 10, weekdays: [1, 2, 3, 4, 5, 6],
  entries: [
    { date: '2026-10-12', slot: '저녁', names: ['정시우'] },
    { date: '2026-10-12', slot: '아침', names: ['이서연'] },
    { date: '2026-10-12', slot: '저녁', names: ['정시우'] },
  ],
  offDays: [{ date: '2026-10-09', reason: '한글날' }],
  slotOrder: ['아침', '저녁', '토요일'],
});
const c12 = cal.flat().find((c) => c?.day === 12)!;
check('같은 날 칸은 정한 순서(아침 → 저녁)', c12.items.map((i) => i.slot).join() === '아침,저녁');
check('같은 칸 중복 이름은 한 번', c12.items[1].names.join() === '정시우');
check('휴일은 이유를 적는다', cal.flat().find((c) => c?.day === 9)?.off === '한글날');

console.log('문서');
const html = buildDutyRosterDocument({
  title: '2026년 10월 급식지도 명단', subtitle: '11:50~12:20 · 하루 2명', year: 2026, month: 10,
  weekdays: [1, 2, 3, 4, 5],
  entries: [{ date: '2026-10-12', names: ['<b>김</b>', '이서연'] }, { date: '2026-10-13', names: [] }],
  offDays: [{ date: '2026-10-09', reason: '한글날' }],
});
check('이름을 HTML 로 해석하지 않는다', html.includes('&lt;b&gt;김&lt;/b&gt;') && !html.includes('<b>김</b>'));
check('A4 가로', html.includes('size: A4 landscape'));
check('휴일 칸에 이유', html.includes('<div class="off">한글날</div>'));
check('빈 담당 칸은 대시', html.includes('<span class="blank">—</span>'));
check('인쇄 버튼은 인쇄할 때 숨는다', html.includes('.toolbar { display: none !important; }'));
check('선생님별 표는 없다(달력만 — 사용자 결정)', !html.includes('선생님별') && !html.includes('class="people"'));
check('escapeHtml 따옴표', escapeHtml(`"'`) === '&quot;&#39;');

console.log('배선(정적)');
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const meal = read('src/features/meal-duty/MealDutyPlannerDialog.tsx');
check('급식지도 [출력]', meal.includes('onClick={printRoster}') && meal.includes("weekdays: [1, 2, 3, 4, 5]"));
check('급식지도 — 이미 만든 명단이 초안보다 먼저', /const made = model\.existing\.get\(d\.date\);\s*if \(made\)/.test(meal));
check('급식지도 — 쉬는 날(시험 등)에 이유', meal.includes("reason: d.defaultSkip ?? '쉼'"));
const sup = read('src/features/self-study-supervision/SupervisionPlanTab.tsx');
check('자습 감독 [출력]', sup.includes('onClick={printRoster}'));
check('자습 감독 — 토요 자습이 있으면 월~토', sup.includes('weekdays: showSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]'));
check('자습 감독 — 이미 만든 감독은 이력에서', sup.includes('for (const row of data.history)'));
check('창은 클릭 흐름에서 열고 차단을 알린다', [meal, sup].every((s) => s.includes('if (!openPrintDocument(html)) toast.error(')));

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 전부 통과');
process.exit(fails ? 1 : 0);
