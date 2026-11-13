// 자습 감독 배정 — 실제 모달 스크린샷 + 불변식 (2026-10-11)
//
// 실제 SelfStudySupervisionDialog 를 띄우고 자료 훅 두 모듈만 스텁으로 바꾼다(가짜 이름).
// 스텁도 판정은 진짜 `schoolDay`·`selfStudySupervision` 을 부른다. 방식 = scripts/meal-duty-test/run-screenshots.mjs.
//
//   $env:PLAYWRIGHT_MODULE = "C:\...\node_modules\playwright\index.mjs"
//   $env:MODAL_TEST_URL = "http://localhost:8080"      # 개발 서버를 먼저 켠다
//   node scripts/self-study-supervision-test/run-screenshots.mjs
//
// 결과 png = .tmp/supervision-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'supervision-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';

const CALENDAR_STUB = `
  import { classifySchoolDays, toDateKey } from '/src/lib/schoolDay.ts';
  const entries = [
    {date:'2026-10-09',title:'한글날',dayKind:'공휴일'},
    {date:'2026-10-07',title:'1차고사',dayKind:'해당없음'},{date:'2026-10-07',title:'2차고사',dayKind:'해당없음'},
    {date:'2026-10-10',title:'토요휴업일',dayKind:'휴업일'},{date:'2026-10-17',title:'토요휴업일',dayKind:'휴업일'},
    {date:'2026-10-14',title:'수학여행',dayKind:'해당없음'},
  ];
  export function useSchoolCalendar(start, end) {
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(toDateKey(d));
    return { entries, days: classifySchoolDays(dates, entries), term: null, isLoading: false, isError: false };
  }
  export const useSchoolDay = () => null;
`;

const SOURCES_STUB = `
  import { gradeSlotConfig, schoolMorningConfig } from '/src/lib/selfStudySupervision.ts';
  const P2 = [{start_time:'18:40',end_time:'20:10'},{start_time:'20:20',end_time:'21:40'}];
  const rooms = [
    {name:'3층 열람실 1',grades:[3],operating_days:[1,2,3,4,5],operating_periods:P2},
    {name:'3층 열람실 2',grades:[3],operating_days:[1,2,3,4,5],operating_periods:P2},
    {name:'[아침] 열람실 1 (3학년)',grades:[3],operating_days:[1,2,3,4,5],operating_periods:[]},
    {name:'[토] 3학년',grades:[3],operating_days:[6],operating_periods:[{start_time:'09:00',end_time:'12:30'},{start_time:'13:30',end_time:'17:00'}]},
    {name:'[아침] 열람실 2 (1, 2, 3학년)',grades:[1,2,3],operating_days:[1,2,3,4,5],operating_periods:[]},
  ];
  const names = ['가선생','나선생','다선생','라선생','마선생','바선생','사선생','아선생','자선생','차선생'];
  const pool = names.map((n,i)=>({resourceId:'r'+i,name:n,source:'department',grades:[3]}));
  const lowerPool = ['하선생','거선생','너선생','더선생','러선생','머선생'].map((n,i)=>({resourceId:'l'+i,name:n,source:'department',grades:[i<3?1:2]}));
  const history = [
    {meetingId:'h1',date:'2026-09-14',slot:'evening',withMorning:false,names:['가선생']},
    {meetingId:'h2',date:'2026-09-15',slot:'evening',withMorning:false,names:['가선생']},
    {meetingId:'h3',date:'2026-10-02',slot:'evening',withMorning:false,names:['나선생']},
  ];
  const absent = new Set(['2026-10-12|다선생','2026-10-13|다선생']);
  const absentTitles = new Map([['2026-10-12|다선생',['교육청 협의회']],['2026-10-13|다선생',['교육청 협의회']]]);
  export const useSupervisionSources = (grade) => ({
    data: grade === 0
      ? {academicYear:2026,pool:[...pool,...lowerPool].sort((a,b)=>a.name.localeCompare(b.name,'ko')),config:schoolMorningConfig(rooms),history:[],absent,absentTitles,
         schoolMorningDates:new Set(),schoolMorningInYear:false,csatDate:'2026-10-21'}
      : {academicYear:2026,pool,config:gradeSlotConfig(rooms,3),history,absent,absentTitles,schoolMorningDates:new Set(),schoolMorningInYear:false,csatDate:null},
    isLoading:false,isError:false,refetch:()=>{},
  });
  // 가선생 = 매주 수요일 저녁 수업 · 나선생 = 10/19 하루
  const rules = [
    {id:'u1',resourceId:'r0',name:'가선생',weekday:3,date:null,from:null,until:null,slots:['evening'],note:'대학원 수업'},
    {id:'u2',resourceId:'r1',name:'나선생',weekday:null,date:'2026-10-19',from:null,until:null,slots:['morning','evening'],note:null},
  ];
  export const UNAVAILABILITY_QUERY_KEY = ['u'];
  export const useSupervisionUnavailability = () => ({ data: rules, isLoading:false });
  export const addUnavailability = async () => {};
  export const deleteUnavailability = async () => {};
  const upcoming = [
    {meetingId:'u1',date:'2026-10-20',slot:'evening',withMorning:false,names:['라선생']},
    {meetingId:'u2',date:'2026-10-22',slot:'evening',withMorning:false,names:['마선생']},
  ];
  export const useUpcomingSupervision = () => ({ data: upcoming, isLoading:false });
  export const useSupervisionPool = () => ({ data: pool, isLoading:false });
  export const useMyUpcomingSupervision = () => ({ data: [
    {meetingId:'m1',date:'2026-10-15',slot:'evening',withMorning:false,names:['가선생'],grade:3},
    {meetingId:'m2',date:'2026-10-24',slot:'saturday',withMorning:false,names:['가선생'],grade:3},
  ], isLoading:false });
  export const useMySupervisionSwaps = () => ({ data: [
    {id:'s1',grade:3,status:'pending',message:'그날 출장이 잡혔습니다. 부탁드려요!',created_at:'2026-10-01',i_am_requester:false,
     requester_name:'바선생',partner_name:'가선생',requester_meeting_id:'x',requester_date:'2026-10-16',requester_slot:'evening',
     partner_meeting_id:'m1',partner_date:'2026-10-15',partner_slot:'evening'},
    {id:'s2',grade:3,status:'accepted',message:null,created_at:'2026-09-20',i_am_requester:true,
     requester_name:'가선생',partner_name:'사선생',requester_meeting_id:'y',requester_date:'2026-09-25',requester_slot:'morning',
     partner_meeting_id:null,partner_date:null,partner_slot:null},
  ], isLoading:false });
`;

const MOCKS = {
  '**/src/hooks/useSchoolCalendar.ts*': CALENDAR_STUB,
  '**/src/features/self-study-supervision/useSupervisionSources.ts*': SOURCES_STUB,
};

const mountWith = (tab) => `import {SelfStudySupervisionDialog} from '/src/features/self-study-supervision/SelfStudySupervisionDialog.tsx';
  export const Case=()=>React.createElement(SelfStudySupervisionDialog,{open:true,onOpenChange:()=>{},initialDate:new Date(2026,9,1),
    initialTab:'${tab}',manageableGrades:[3],myName:'가선생',myResourceId:'r0',onCreateEvent:async()=>true,onChanged:()=>{}});`;

const CASES = [
  { id: '01-plan-1280', viewport: { width: 1280, height: 900 }, tab: 'plan' },
  { id: '02-plan-390', viewport: { width: 390, height: 844 }, tab: 'plan' },
  { id: '03-plan-390-loads', viewport: { width: 390, height: 844 }, tab: 'plan', open: async (page) => { await page.getByRole('button', { name: '사람별 횟수' }).click(); } },
  { id: '04-swap-390', viewport: { width: 390, height: 844 }, tab: 'swap' },
  { id: '05-swap-390-form', viewport: { width: 390, height: 844 }, tab: 'swap', open: async (page) => { await page.getByRole('button', { name: /교체 신청/ }).first().click(); } },
  { id: '06-swap-1280-form', viewport: { width: 1280, height: 900 }, tab: 'swap', open: async (page) => { await page.getByRole('button', { name: /교체 신청/ }).first().click(); } },
  { id: '07-plan-1280-unavailable', viewport: { width: 1280, height: 900 }, tab: 'plan', open: async (page) => { await page.getByRole('button', { name: /못 하는 날/ }).click(); } },
  { id: '08-plan-390-unavailable', viewport: { width: 390, height: 844 }, tab: 'plan', open: async (page) => { await page.getByRole('button', { name: /못 하는 날/ }).click(); } },
  { id: '09-school-1280', viewport: { width: 1280, height: 900 }, tab: 'plan', school: true, open: async (page) => { await page.getByRole('button', { name: '전 학년 아침' }).click(); } },
  { id: '10-school-390', viewport: { width: 390, height: 844 }, tab: 'plan', school: true, open: async (page) => { await page.getByRole('button', { name: '전 학년 아침' }).click(); } },
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const testCase of CASES) {
    const context = await browser.newContext({ viewport: testCase.viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/rest/v1/**', (r) => r.abort());
    await page.route('**/auth/v1/**', (r) => r.abort());
    await page.clock.setFixedTime(new Date('2026-10-01T08:00:00+09:00'));
    const mocks = {
      ...MOCKS,
      '**/scripts/mobile-modal-test/main.tsx*': `
        import React from '${react}';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import {QueryClient,QueryClientProvider} from '${query}';
        import '/src/index.css';
        ${mountWith(testCase.tab)}
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(Case)));`,
    };
    for (const [glob, source] of Object.entries(mocks)) {
      const body = source.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
      await page.route(glob, (r) => r.fulfill({ contentType: 'application/javascript', body }));
    }

    const row = { id: testCase.id, problems: [] };
    try {
      await page.goto(BASE);
      await page.locator('[data-slot="dialog-content"]').first().waitFor({ state: 'visible' });
      if (testCase.open) await testCase.open(page);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const el = document.querySelector('[data-slot="dialog-content"]');
        const selects = [...el.querySelectorAll('select')];
        const footer = [...el.querySelectorAll('button')].map((b) => b.innerText);
        return {
          text: el.innerText,
          mobile: el.dataset.mobile,
          overflowsX: el.scrollWidth > el.clientWidth + 1,
          bodyOverflowsX: document.body.scrollWidth > innerWidth + 1,
          selectFont: selects.map((s) => parseFloat(getComputedStyle(s).fontSize)),
          // <select> 의 innerText 는 모든 option 을 포함한다 — 고른 값은 따로 읽는다
          rows: [...el.querySelectorAll('li')].map((li) => {
            const clone = li.cloneNode(true);
            clone.querySelectorAll('select').forEach((s) => s.remove());
            const sel = li.querySelector('select');
            return (clone.innerText + ' ' + (sel ? '[' + sel.value + ']' : '')).replace(/\s+/g, ' ');
          }),
          createLabel: footer.find((t) => /일정 \d+건 만들기|먼저 고쳐/.test(t)),
          assignees: selects.filter((s) => / 감독$/.test(s.getAttribute('aria-label') ?? '')).map((s) => s.value),
        };
      });
      row.mobile = m.mobile;
      if (m.overflowsX) row.problems.push('모달이 가로로 넘친다');
      if (m.bodyOverflowsX) row.problems.push('본문이 가로로 밀린다');
      if (testCase.viewport.width < 640) {
        if (m.selectFont.some((f) => f < 16)) row.problems.push(`휴대폰 선택 글자 16px 미만 ${m.selectFont}`);
        if (m.mobile !== 'fullscreen') row.problems.push(`휴대폰 표시 = ${m.mobile}`);
      }
      if (testCase.school) {
        if (!m.rows.length || !m.rows.every((r) => r.includes('아침'))) row.problems.push('전 학년 아침에 아침 아닌 칸');
        if (!m.text.includes('학사일정의 수능일')) row.problems.push('수능일 기본값 표시 없음');
        const seniorAfter = m.rows.filter((r) => Number(r.match(/^10\/(\d+)\(/)?.[1] ?? 0) >= 21 && /\[[가나다라마바사아자차]선생\]/.test(r));
        if (seniorAfter.length) row.problems.push(`수능 이후 3학년 배정 ${seniorAfter.join(' / ')}`);
        if (!m.rows.some((r) => /\[(하|거|너|더|러|머)선생\]/.test(r))) row.problems.push('1·2학년 선생님이 명단에 없다');
        row.note = `${m.createLabel}`;
      } else if (testCase.tab === 'plan') {
        if (m.rows.some((r) => /\(수\)/.test(r) && r.includes('저녁') && r.includes('[가선생]'))) row.problems.push('수요일 저녁 수업인 가선생에게 배정했다');
        if (m.rows.some((r) => r.startsWith('10/19(') && r.includes('[나선생]'))) row.problems.push('10/19 못 하는 나선생에게 배정했다');
        if (testCase.id.includes('unavailable') && !m.text.includes('매주 수요일 저녁')) row.problems.push('못 하는 날 목록 없음');
        if (m.rows.some((r) => r.startsWith('10/9('))) row.problems.push('한글날에 칸이 생겼다');
        if (!m.rows.some((r) => r.startsWith('10/10(토)') && r.includes('토요일'))) row.problems.push('토요휴업일 토요일에 토요 자습 칸이 없다');
        if (!m.rows.some((r) => r.startsWith('10/7(') && r.includes('1차고사'))) row.problems.push('시험일 메모 없음');
        if (!m.createLabel) row.problems.push('만들기 버튼 없음');
        if (m.assignees.some((v) => v === '')) row.problems.push('빈칸이 생겼다');
        const rowOf = (prefix) => m.rows.find((r) => r.startsWith(prefix)) ?? '';
        // 다선생은 10/12·13 출장 — 초안이 그날 다선생을 피해야 한다
        if (['10/12(월)', '10/13(화)'].some((d) => m.rows.some((r) => r.startsWith(d) && r.includes('[다선생]')))) row.problems.push('출장자에게 배정했다');
        if (!m.text.includes('18:40~21:40')) row.problems.push('저녁 시간(seaton) 표시 없음');
        if (testCase.id.includes('loads') && !m.text.includes('2026학년도 누적')) row.problems.push('사람별 횟수 표 없음');
        row.note = `${m.createLabel}`;
      } else {
        if (!m.text.includes('바선생 선생님의 요청')) row.problems.push('받은 요청 없음');
        if (!m.text.includes('수락하고 바꾸기')) row.problems.push('수락 버튼 없음');
        if (!m.text.includes('교체됨')) row.problems.push('지난 교체 표시 없음');
        if (!m.text.includes('내가 못 하는 날')) row.problems.push('내가 못 하는 날 칸 없음');
        if (testCase.id.includes('form')) {
          if (!m.text.includes('다른 감독과 맞바꾸기')) row.problems.push('신청 폼 없음');
          const opts = await page.evaluate(() => [...document.querySelectorAll('[data-slot="dialog-content"] option')].map((o) => o.textContent));
          if (!opts.some((t) => /10\/20\(화\) 저녁 · 라선생/.test(t))) row.problems.push(`맞바꿀 감독 목록 이상 ${opts.join('|')}`);
        }
      }
      await page.screenshot({ path: join(OUT, `${testCase.id}.png`), animations: 'disabled' });
    } catch (e) {
      row.problems.push(`렌더 실패 — ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: join(OUT, `${testCase.id}-FAILED.png`) }).catch(() => {});
    }
    for (const e of errors) row.problems.push(`페이지 오류 — ${e}`);
    results.push(row);
    await context.close();
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (r.problems.length === 0) console.log(`✓ ${r.id} (${r.mobile ?? '-'}) ${r.note ?? ''}`);
  else { failed += 1; console.log(`✗ ${r.id}\n  - ${r.problems.join('\n  - ')}`); }
}
console.log(`\n스크린샷: ${OUT}`);
if (failed) process.exit(1);
