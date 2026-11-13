// 결강 처리 화면 스크린샷 + 불변식 — 2026-09-28.
//
// 실제 컴포넌트를 그대로 띄우고(백엔드·결강 훅은 메모리 스텁) 390×844 · 1280×900 에서 찍는다.
// 방식은 scripts/mobile-modal-test/run-screenshots.mjs 와 같다(그 fixture 페이지를 빌려 쓴다).
//
// 실행 (개발 서버를 먼저 켠다):
//   $env:PLAYWRIGHT_MODULE = "C:\path\to\playwright\index.mjs"   # node_modules 에 없으면
//   $env:MODAL_TEST_URL = "http://localhost:8080"
//   node scripts/absence-lessons-test/run-screenshots.mjs
//
// 결과 png = .tmp/absence-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'absence-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';

const SUPABASE_STUB = `
  const result = { data: [], error: null, count: 0 };
  const make = () => new Proxy(() => {}, {
    get(_t, key) {
      if (key === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      if (key === 'catch') return (fn) => Promise.resolve(result).catch(fn);
      if (key === 'finally') return (fn) => Promise.resolve(result).finally(fn);
      return make();
    },
    apply() { return make(); },
  });
  export const supabase = new Proxy({}, { get: () => make() });
  export default supabase;
`;

/** 네 가지 상태가 한 화면에 모이는 결강 — 거절 뒤 미처리 / 응답 대기 / 승인 / 교체로 맡은 수업 */
const LESSONS_STUB = (subjectLong) => `
  const entry = (period, extra={}) => ({ id:'e'+period, type:'pattern', weekday:3, period, subject:${JSON.stringify(subjectLong)}+period, grade:1, class_number:String(period), section_id:'s'+period, resource_id:'me', ...extra });
  const weekEntries = [1,2,3,5,6].map(p=>entry(p)).concat([entry(2,{weekday:1}),entry(4,{weekday:2})]);
  const lessons = [
    { period:2, state:'unhandled', entry:entry(2), subject:${JSON.stringify(subjectLong)}+'2', gradeClass:'1학년 2반',
      lastRejected:{ id:'r1', status:'rejected', requester_resource_id:'me', requester_swap_date:'2026-09-30', requester_original_period:2, approver_swap_date:'2026-10-01', approver_original_period:5, meta:{ approver_name:'신선우', rejection_reason:'그날 출장이 있습니다' } } },
    { period:3, state:'pending', entry:entry(3), subject:'인공지능 기초 1-3', gradeClass:'1학년 3반',
      swap:{ id:'p1', status:'pending', requester_resource_id:'me', requester_swap_date:'2026-09-30', requester_original_period:3, approver_swap_date:'2026-09-30', approver_original_period:3, meta:{ type:'substitute', approver_name:'이수민' } } },
    { period:5, state:'approved', subject:'정보 2-1', gradeClass:'2학년 1반',
      swap:{ id:'a1', status:'approved', requester_resource_id:'me', requester_swap_date:'2026-09-30', requester_original_period:5, approver_swap_date:'2026-10-02', approver_original_period:4, meta:{ approver_name:'최은정' } } },
    { period:6, state:'swapped_in', entry:entry(6,{is_swapped:true}), subject:'프로그래밍 2-4', gradeClass:'2학년 4반' },
  ];
  export const useAbsenceLessons = () => ({
    window:{ date:'2026-09-30', weekday:3, startMinutes:600, endMinutes:960 },
    lessons,
    summary:{ total:4, resolved:1, pending:1, open:2 },
    weekEntries, swaps:[lessons[2].swap], myResourceId:'me', isLoading:false,
  });
`;

const COMMON = {
  '**/src/integrations/supabase/client.ts*': SUPABASE_STUB,
  '**/src/components/auth/AuthProvider.tsx*':
    `export const useAuth=()=>({profile:{id:'me',name:'김교사',role:'teacher'},user:{id:'me',email:'teacher@myschool.hs.kr'},isAdmin:false,isStudent:false,isStudentView:false,effectiveRole:'teacher',loading:false});`
    + `export const AuthProvider=({children})=>children;`,
  '**/src/hooks/useClassSwapMutations.ts*': `export const useCancelClassSwap=()=>({mutate:()=>{},isPending:false});export const useCreateClassSwap=()=>({mutate:()=>{},isPending:false});`,
  '**/src/services/notificationService.ts*': `export class NotificationService{static async notifyClassSwapCancelled(){}};`,
  '**/src/components/timetable/ClassSwapDialog.tsx*': `export const ClassSwapDialog=()=>null;`,
  '**/src/components/timetable/SwapDocumentDialog.tsx*': `export const SwapDocumentDialog=()=>null;`,
  '**/src/hooks/useTimetableTerm.ts*': `export const useTimetableTerm=()=>({term:{year:2026,semester:2},isLoading:false});`,
};

const meeting = (kind, title) =>
  `{id:'m1',kind:'${kind}',title:${JSON.stringify(title)},starts_at:'2026-09-30T10:00:00+09:00',ends_at:'2026-09-30T16:00:00+09:00',created_by:'me',date_only:false,assignee:{'김교사':{name:'김교사'}}}`;

const CASES = [
  {
    id: '01-resolution-personal-390', viewport: { width: 390, height: 844 },
    mocks: { '**/src/hooks/useAbsenceLessons.ts*': LESSONS_STUB('아주아주긴과목이름_심화탐구_프로젝트_세미나 1-') },
    mount: `import {AbsenceResolutionDialog} from '/src/components/schedule/absence/AbsenceResolutionDialog.tsx';
      export const Case=()=>React.createElement(AbsenceResolutionDialog,{open:true,onOpenChange:()=>{},meeting:${meeting('personal', '병원 진료')}});`,
    expect: ['결강 처리', '처리 1/4', '미처리', '응답 대기', '처리됨', '교체로 맡은 수업', '개인 사정', '신선우 선생님이 요청을 거절했습니다', '나중에 처리', '보강 계획서'],
  },
  {
    id: '02-resolution-event-1280', viewport: { width: 1280, height: 900 },
    mocks: { '**/src/hooks/useAbsenceLessons.ts*': LESSONS_STUB('창의융합 탐구 1-') },
    mount: `import {AbsenceResolutionDialog} from '/src/components/schedule/absence/AbsenceResolutionDialog.tsx';
      export const Case=()=>React.createElement(AbsenceResolutionDialog,{open:true,onOpenChange:()=>{},meeting:${meeting('event', '교육청 정보교육 연수')}});`,
    expect: ['출장', '교육청 정보교육 연수', '이수민 선생님께 대체를 요청했습니다', '최은정 선생님과 교체'],
  },
  {
    id: '03-create-personal-390', viewport: { width: 390, height: 844 },
    mocks: {
      '**/src/hooks/useAbsenceLessons.ts*': LESSONS_STUB('정보 1-'),
      '**/src/hooks/useTasks.ts*': `export const useResources=()=>({data:[{id:'me',name:'김교사',type:'teacher'}],isLoading:false});`,
      '**/src/hooks/usePlugins.ts*': `export const usePlugins=()=>({data:[],isLoading:false});export const useCreatePluginInstance=()=>({mutateAsync:async()=>({})});`,
      '**/src/hooks/usePermissions.ts*': `export const useCurrentUserResourceId=()=>({data:'me'});export const usePermissions=()=>({canEdit:true});`,
      '**/src/services/meetingFileService.ts*': `export class MeetingFileService{static async upload(){return []}};`,
      '**/src/services/googleDriveIntegrationService.ts*': `export class GoogleDriveIntegrationService{static async upload(){return {}}};`,
      '**/src/hooks/useGoogleDrive.ts*': `export const useGoogleDrive=()=>({isAuthenticated:true,isLoading:false,error:null,authenticate:async()=>{},clearError:()=>{}});`,
      '**/src/services/absenceLessonService.ts*': `export const notifyAbsenceParticipants=async()=>({sent:0,ok:true});`,
    },
    mount: `import {ScheduleCreateDialog} from '/src/components/schedule/ScheduleCreateDialog.tsx';
      export const Case=()=>React.createElement(ScheduleCreateDialog,{open:true,onOpenChange:()=>{},selectedDate:new Date('2026-09-30'),onCreateEvent:async()=>true});`,
    open: async (page) => {
      await page.locator('[data-slot="dialog-content"]').first().waitFor({ state: 'visible' });
      await page.getByText('개인일정', { exact: true }).first().click();
      await page.getByText(/이 시간에 내 수업/).first().waitFor({ state: 'visible' });
      await page.getByText(/이 시간에 내 수업/).first().scrollIntoViewIfNeeded();
    },
    expect: ['이 시간에 내 수업 4개가 있습니다', '저장하고 수업 처리', '개인 사정'],
  },
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
    const mocks = {
      ...COMMON,
      ...testCase.mocks,
      '**/scripts/mobile-modal-test/main.tsx*': `
        import React from '${react}';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import {QueryClient,QueryClientProvider} from '${query}';
        import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';
        import '/src/index.css';
        ${testCase.mount}
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},
            React.createElement(MemoryRouter,null,React.createElement(Case))));`,
    };
    for (const [glob, source] of Object.entries(mocks)) {
      const body = source.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
      await page.route(glob, (r) => r.fulfill({ contentType: 'application/javascript', body }));
    }

    const row = { id: testCase.id, problems: [] };
    try {
      await page.goto(BASE);
      if (testCase.open) await testCase.open(page);
      await page.locator('[data-slot="dialog-content"]').first().waitFor({ state: 'visible' });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const el = document.querySelector('[data-slot="dialog-content"]');
        const text = el.innerText;
        return {
          text,
          mobile: el.dataset.mobile,
          overflowsX: el.scrollWidth > el.clientWidth + 1,
          bodyOverflowsX: document.body.scrollWidth > innerWidth + 1,
          clipped: [...el.querySelectorAll('*')].filter((n) => {
            if (n.closest('.sr-only') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName)) return false;
            const o = getComputedStyle(n).overflowX;
            if (o !== 'hidden' && o !== 'clip') return false;
            if (getComputedStyle(n).textOverflow === 'ellipsis') return false;
            return n.scrollWidth > n.clientWidth + 8 && n.clientWidth > 24;
          }).map((n) => `${n.tagName.toLowerCase()}.${String(n.className).split(' ').slice(0, 2).join('.')} ${n.scrollWidth}>${n.clientWidth}`).slice(0, 3),
          // 누르는 것은 휴대폰에서 44px 에 가깝게 — 행 버튼은 h-9(36px)+여백, 푸터는 규약
          smallButtons: innerWidth < 640
            ? [...el.querySelectorAll('button:not([role=switch])')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 36 && !b.closest('[data-slot="dialog-close"]') && b.getAttribute('aria-label') !== 'Close').map((b) => `${(b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 12)} ${Math.round(b.getBoundingClientRect().height)}px`)
            : [],
        };
      });
      row.mobile = m.mobile;
      if (m.overflowsX) row.problems.push('모달이 가로로 넘친다');
      if (m.bodyOverflowsX) row.problems.push('본문이 가로로 밀린다');
      for (const c of m.clipped) row.problems.push(`잘림 — ${c}`);
      for (const b of m.smallButtons) row.problems.push(`36px 미만 버튼 — ${b}`);
      for (const t of testCase.expect) if (!m.text.includes(t)) row.problems.push(`문구 없음 — "${t}"`);
      if (testCase.id.includes('personal') && m.text.includes('병원 진료') && testCase.id.startsWith('03')) {
        row.problems.push('생성 모달 미리보기에 개인일정 제목이 새어 나왔다');
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
  if (r.problems.length === 0) console.log(`✓ ${r.id} (${r.mobile ?? '-'})`);
  else {
    failed += 1;
    console.log(`✗ ${r.id} (${r.mobile ?? '-'})`);
    for (const p of r.problems) console.log(`    - ${p}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} 통과 · 스크린샷 = ${OUT}`);
process.exit(failed ? 1 : 0);
