// 입력 요청의 발견 경로 — 메뉴 배지 · 내 할 일 계획표 — 실제 컴포넌트 스크린샷 + 불변식 (2026-09-27)
//
// 입력 받기의 응답자는 할 일 담당자가 아니라서 담당 목록(assigned_tasks)에서 출발하는 화면에 없다.
// 여기서는 ①사이드바(펼침·접힘) ②모바일 하단 5칸 ③모바일 메뉴 시트의 «내 할 일» 숫자 배지와
// ④내 할 일 계획표의 입력 요청 줄을 실제 컴포넌트로 띄워 본다. 데이터 훅·인증·무거운 부품만 스텁.
//
// 실행 (개발 서버를 먼저 켠다):
//   $env:PLAYWRIGHT_MODULE = "C:\...\node_modules\playwright\index.mjs"   # 필요할 때만
//   $env:PIPELINE_TEST_URL = "http://localhost:8093"                    # 기본 8080
//   node scripts/collect-input-test/run-nav-planner-shots.mjs
// 결과 png = .tmp/nav-planner-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'nav-planner-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.PIPELINE_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';
const router = '/node_modules/.vite/deps/react-router-dom.js';
const lucide = '/node_modules/.vite/deps/lucide-react.js';

// 날짜는 «오늘» 기준으로 — 계획표는 이번 주를 그린다
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date();
const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
// 월요일 시작 주 — 오늘이 일요일이면 +1 이 다음 주로 넘어가므로 오늘로 둔다
const inWeek = today.getDay() === 0 ? today : plus(1);

const REQUESTS = JSON.stringify([
  // 할 일 마감(timestamptz::text) 모양 — 정규화하지 않으면 날짜 칸에 영원히 안 들어간다
  { action_id: 'a1', task_id: 't9', task_title: '정보화기기 구입 예산 활용 접수', work_title: '2026년 정보화기기 구입 예산 운영', action_title: '정보화기기 구입 예산 사용 신청', guide: null, due_date: `${ymd(inWeek)} 00:00:00+00`, visibility: 'shared', answer_mode: 'each', total: 1, done: 0, started_at: '2026-09-24T00:38:38Z' },
  { action_id: 'a2', task_id: 't8', task_title: '1차 정기시험 문항 점검', work_title: '2026학년도 2학기 정기시험 운영', action_title: '과목별 출제 원안 점검 결과 입력', guide: null, due_date: ymd(today), visibility: 'private', answer_mode: 'each', total: 4, done: 1, started_at: '2026-09-25T00:00:00Z' },
  { action_id: 'a3', task_id: 't7', task_title: '동아리 활동 장소 확인', work_title: '창체 동아리 운영', action_title: '동아리 활동 장소', guide: null, due_date: null, visibility: 'shared', answer_mode: 'shared', total: 2, done: 0, started_at: '2026-09-26T00:00:00Z' },
  { action_id: 'a4', task_id: 't6', task_title: '방과후 수요조사', work_title: '방과후학교', action_title: '방과후 개설 희망 과목', guide: null, due_date: null, visibility: 'private', answer_mode: 'each', total: 1, done: 0, started_at: '2026-09-26T01:00:00Z' },
  { action_id: 'a5', task_id: 't5', task_title: '완료', work_title: 'W', action_title: '다 채운 요청(보이면 안 됨)', guide: null, due_date: ymd(today), visibility: 'private', answer_mode: 'each', total: 2, done: 2, started_at: '2026-09-20T00:00:00Z' },
]);

const MY_TASKS = JSON.stringify({
  assigned_tasks: [
    { id: 't1', event_id: 'w1', event_name: '2026년 정보화기기 구입 예산 운영', title: '정보화기기 구입 예산 집행', status: 'pending', type: 'procedural', order_index: 4, due_date: `${ymd(inWeek)}T00:00:00+00:00`, meta: { assignees: [{ id: 'me', name: '김교사', status: 'pending' }] }, updated_at: '' },
  ],
  managed_tasks: [], urgent_tasks: [], summary: {},
});

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

const NAV_STUB = `
  import {Home, Clock, CalendarDays, ListTodo, GraduationCap, Megaphone} from '${lucide}';
  const items = [
    { name:'홈', href:'/', icon: Home },
    { name:'시간표', href:'/timetable', icon: Clock },
    { name:'스케줄', href:'/schedule', icon: CalendarDays },
    { name:'내 할 일', href:'/my-tasks', icon: ListTodo },
    { name:'입시정보', href:'/ipsi', icon: GraduationCap },
    { name:'공지사항', href:'/notices', icon: Megaphone },
  ];
  export const useNavSections = () => ({ sections: [{ id:'today', label:'오늘', items }], flatItems: items });
`;

const COMMON_MOCKS = {
  '**/src/integrations/supabase/client.ts*': SUPABASE_STUB,
  '**/src/components/auth/AuthProvider.tsx*':
    `export const useAuth=()=>({profile:{id:'me',name:'김교사',role:'teacher'},user:{id:'me'},isAdmin:false,isStudent:false,isStudentView:false,effectiveRole:'teacher',loading:false});export const AuthProvider=({children})=>children;`,
  '**/src/features/task-workflow/hooks/useCollectInput.ts*':
    `export const COLLECT_KEY='collect-input';export const useMyCollectRequests=(enabled=true)=>({data: enabled ? ${REQUESTS} : []});export const useCollectBoard=()=>({data:null,isLoading:false});`,
  '**/src/hooks/useNavSections.ts*': NAV_STUB,
  '**/src/hooks/useNotifications.ts*': `export const useNotifications=()=>({data:[]});export const useNotificationMutations=()=>({});`,
  '**/src/components/meal/MealPopup.tsx*': `export const MealPopup=()=>null;`,
  '**/src/components/ui/action-search-bar.tsx*': `const X=()=>null; export default X;`,
  '**/src/components/profile/PersonalDeviceToggle.tsx*': `export const PersonalDeviceToggle=()=>null;`,
  '**/src/hooks/usePermissions.ts*':
    `export const useCurrentUserResourceId=()=>({data:'me',isLoading:false,isError:false,isSuccess:true});export const useCanEditTask=()=>({data:false});export const useCanDeleteTask=()=>({data:false});export const useCanEditWork=()=>({data:false});export const useCanDeleteWork=()=>({data:false});`,
  '**/src/components/tasks/TaskAssigneeSummary.tsx*': `export const TaskAssigneeSummary=()=>null;`,
};

const main = (body) => `
  import React from '${react}';
  import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
  import {QueryClient,QueryClientProvider} from '${query}';
  import {MemoryRouter} from '${router}';
  import '/src/index.css';
  ${body}
`;

const SCENES = [
  {
    id: 'mobile-bottom-and-sheet', width: 390, height: 844,
    main: main(`
      import {MobileNavigation} from '/src/components/layout/MobileNavigation.tsx';
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(QueryClientProvider,{client:new QueryClient()},
          React.createElement(MemoryRouter,{initialEntries:['/']}, React.createElement(MobileNavigation))));`),
    async run(page) {
      await page.getByRole('link', { name: /내 할 일, 입력 요청 4건/ }).first().waitFor({ state: 'visible' });
      const bottom = await page.evaluate(() => {
        const link = [...document.querySelectorAll('a')].find((a) => a.getAttribute('aria-label') === '내 할 일, 입력 요청 4건');
        return { found: !!link, text: link?.innerText ?? '' };
      });
      await page.screenshot({ path: join(OUT, 'mobile-bottom.png') });
      await page.getByRole('button', { name: '메뉴 열기' }).click();
      await page.getByText('공지사항').last().waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      const sheetLinks = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] a')]
        .filter((a) => a.getAttribute('aria-label') === '내 할 일, 입력 요청 4건').length);
      await page.screenshot({ path: join(OUT, 'mobile-sheet.png') });
      return {
        '하단 5칸 «내 할 일»에 배지 4 + 화면 읽기 이름': bottom.found && /4/.test(bottom.text),
        '메뉴 시트의 «내 할 일»에도 배지': sheetLinks === 1,
        '페이지 가로 넘침 없음': await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      };
    },
  },
  ...[true, false].map((expanded) => ({
    id: `sidebar-${expanded ? 'expanded' : 'collapsed'}`, width: 1280, height: 700,
    extraMocks: {
      '**/src/contexts/SidebarContext.tsx*':
        `export const useSidebar=()=>({isExpanded:${expanded},toggleSidebar:()=>{}});export const SidebarProvider=({children})=>children;`,
    },
    main: main(`
      import {Sidebar} from '/src/components/layout/Sidebar.tsx';
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(QueryClientProvider,{client:new QueryClient()},
          React.createElement(MemoryRouter,{initialEntries:['/']},
            React.createElement('div',{style:{height:'640px',display:'flex'}}, React.createElement(Sidebar)))));`),
    async run(page) {
      await page.locator('a[aria-label="내 할 일, 입력 요청 4건"]').first().waitFor({ state: 'attached' });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const a = document.querySelector('a[aria-label="내 할 일, 입력 요청 4건"]');
        const badge = a ? [...a.querySelectorAll('span')].find((s) => s.textContent === '4') : null;
        const r = badge?.getBoundingClientRect();
        return { hasBadge: !!badge, visible: !!r && r.width > 0 && r.height > 0 };
      });
      await page.screenshot({ path: join(OUT, `sidebar-${expanded ? 'expanded' : 'collapsed'}.png`), clip: { x: 0, y: 0, width: expanded ? 320 : 120, height: 640 } });
      return { [`사이드바(${expanded ? '펼침 = 이름 오른쪽 숫자' : '접힘 = 아이콘 모서리 숫자'})`]: m.hasBadge && m.visible };
    },
  })),
  ...[{ vp: 'mobile', width: 390, height: 844 }, { vp: 'desktop', width: 1280, height: 900 }].map(({ vp, width, height }) => ({
    id: `planner-${vp}`, width, height,
    main: main(`
      import {MyTaskInbox} from '/src/components/tasks/MyTaskInbox.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
      qc.setQueryData(['my-tasks-jsonb', true, undefined], ${MY_TASKS});
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement(QueryClientProvider,{client:qc},
          React.createElement(MemoryRouter,null, React.createElement(TooltipProvider,null,
            React.createElement('div',{style:{padding:'8px'}},
              React.createElement(MyTaskInbox,{works:[],onTaskDetail:()=>{},plannerOpen:true,onPlannerOpenChange:()=>{},
                collectRequests:${REQUESTS},onOpenCollect:()=>{}}))))));`),
    async run(page) {
      await page.getByText('할 일 계획표').first().waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      // 휴대폰은 마감일 미정을 접어 둔다 — 펴고 본다
      if (vp === 'mobile') {
        const summary = page.locator('#my-task-planner details summary');
        if (await summary.count()) await summary.first().click();
      }
      const m = await page.evaluate(() => {
        const planner = document.querySelector('#my-task-planner');
        const text = planner?.innerText ?? '';
        const visibleChips = [...(planner?.querySelectorAll('button') ?? [])]
          .filter((b) => b.textContent?.includes('입력 요청') && b.getBoundingClientRect().height > 0);
        return {
          text,
          chips: visibleChips.length,
          chipTitles: visibleChips.map((b) => b.textContent),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });
      await page.screenshot({ path: join(OUT, `planner-${vp}.png`), fullPage: true });
      return {
        '마감이 있는 요청 2건 + 미정 2건이 계획표에(다 채운 것 제외)': m.chips === 4 && !m.text.includes('다 채운 요청'),
        'timestamptz 모양 마감도 날짜 칸에 들어간다': m.chipTitles.some((t) => t?.includes('정보화기기 구입 예산 사용 신청')),
        '이번 주 마감 수에 요청이 포함된다(할 일 1 + 요청 2)': m.text.includes('이번 주 마감 3건'),
        '마감일 미정 건수에 요청이 포함된다': vp === 'desktop' || /마감일 미정\s*2건/.test(m.text),
        '진척 N/M칸이 보인다': m.text.includes('1/4칸'),
        '페이지 가로 넘침 없음': !m.overflow,
      };
    },
  })),
];

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
let failed = 0;
try {
  for (const scene of SCENES) {
    const context = await browser.newContext({ viewport: { width: scene.width, height: scene.height }, deviceScaleFactor: scene.width < 600 ? 2 : 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
    await page.route('**/rest/v1/**', (r) => r.abort());
    await page.route('**/auth/v1/**', (r) => r.abort());
    const mocks = { ...COMMON_MOCKS, ...(scene.extraMocks ?? {}), '**/scripts/mobile-modal-test/main.tsx*': scene.main };
    for (const [glob, source] of Object.entries(mocks)) {
      const body = source.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
      await page.route(glob, (r) => r.fulfill({ contentType: 'application/javascript', body }));
    }
    let checks = {};
    let error = '';
    try {
      await page.goto(BASE);
      checks = await scene.run(page);
      checks['렌더 오류 없음'] = errors.filter((e) => !/Failed to load resource|net::ERR/.test(e)).length === 0;
    } catch (e) {
      error = String(e);
    }
    const ok = !error && Object.values(checks).every(Boolean);
    if (!ok) failed++;
    console.log(`\n[${ok ? '통과' : '실패'}] ${scene.id}`);
    if (error) console.log('  오류:', error.slice(0, 300));
    for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✓' : '✗'} ${k}`);
    if (!ok && errors.length) console.log('  콘솔:', errors.slice(0, 3).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${SCENES.length - failed}/${SCENES.length} 통과 — 스크린샷: ${OUT}`);
if (failed) process.exit(1);
