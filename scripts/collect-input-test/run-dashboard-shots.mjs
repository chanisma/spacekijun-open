// 홈 「나의 업무」 카드 + 입력 요청 — 실제 카드 스크린샷 + 불변식 (2026-09-27)
//
// 실제 TeacherTasksCard 를 띄우고 데이터 훅·인증·상세 모달만 스텁으로 바꾼다
// (로그인이 Google OAuth 라 실제 세션으로는 닿을 수 없다). 390×844 · 1280×900 에서 본다:
//   · 입력 요청 줄이 할 일 목록보다 위에 보이는가
//   · 할 일이 0건이어도 입력 요청만 있으면 «진행할 업무가 없습니다»가 아니라 요청이 보이는가
//   · 페이지가 가로로 밀리지 않는가(긴 업무 이름)
//
// 실행 (개발 서버를 먼저 켠다 — 모바일 모달 도구와 같은 fixture html 을 쓴다):
//   $env:PLAYWRIGHT_MODULE = "C:\...\node_modules\playwright\index.mjs"   # 필요할 때만
//   $env:PIPELINE_TEST_URL = "http://localhost:8093"                    # 기본 8080
//   node scripts/collect-input-test/run-dashboard-shots.mjs
// 결과 png = .tmp/dashboard-collect-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'dashboard-collect-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.PIPELINE_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';
const router = '/node_modules/.vite/deps/react-router-dom.js';

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

// 라이브 「정보화기기 구입 예산 활용 접수」의 입력 받기 모양 + 긴 이름(넘침 확인)
const REQUESTS = `[
  { action_id:'a1', task_id:'t9', task_title:'정보화기기 구입 예산 활용 접수', work_title:'2026년 정보화기기 구입 예산 운영', action_title:'정보화기기 구입 예산 사용 신청', guide:null, due_date:'2026-09-30', visibility:'shared', answer_mode:'each', total:1, done:0, started_at:'2026-09-24T00:38:38Z' },
  { action_id:'a2', task_id:'t8', task_title:'1차 정기시험 문항 점검', work_title:'2026학년도 2학기 정기시험 운영 — 출제·검토·인쇄·보관 전 과정', action_title:'과목별 출제 원안 점검 결과 입력(이원목적분류표 포함)', guide:null, due_date:'2026-10-02', visibility:'private', answer_mode:'each', total:4, done:1, started_at:'2026-09-25T00:00:00Z' },
  { action_id:'a3', task_id:'t7', task_title:'동아리 활동 장소 확인', work_title:'창체 동아리 운영', action_title:'동아리 활동 장소', guide:null, due_date:null, visibility:'shared', answer_mode:'shared', total:2, done:0, started_at:'2026-09-26T00:00:00Z' },
  { action_id:'a4', task_id:'t6', task_title:'방과후 수요조사', work_title:'방과후학교', action_title:'방과후 개설 희망 과목', guide:null, due_date:null, visibility:'private', answer_mode:'each', total:1, done:0, started_at:'2026-09-26T01:00:00Z' },
  { action_id:'a5', task_id:'t5', task_title:'완료된 요청', work_title:'W', action_title:'다 채운 요청(보이면 안 됨)', guide:null, due_date:'2026-09-28', visibility:'private', answer_mode:'each', total:2, done:2, started_at:'2026-09-20T00:00:00Z' },
]`;

const TASKS = `[
  { id:'t1', event_id:'w1', event_name:'2026년 정보화기기 구입 예산 운영', title:'정보화기기 구입 예산 집행', status:'pending', due_date:'2026-10-10', meta:{ assignees:[{ id:'me', status:'pending' }] } },
  { id:'t2', event_id:'w2', event_name:'학교정보공시', title:'교육과정 편성·운영 공시 자료 제출', status:'pending', due_date:'2026-09-25', meta:{ assignees:[{ id:'me', status:'pending' }] } },
]`;

const MOCKS = {
  '**/src/integrations/supabase/client.ts*': SUPABASE_STUB,
  '**/src/components/auth/AuthProvider.tsx*':
    `export const useAuth=()=>({profile:{id:'me',name:'김교사',role:'teacher'},user:{id:'me'},isAdmin:false,isStudent:false,isStudentView:false,effectiveRole:'teacher',loading:false});export const AuthProvider=({children})=>children;`,
  '**/src/features/task-workflow/hooks/useCollectInput.ts*':
    `export const useMyCollectRequests=()=>({data:${REQUESTS}});export const useCollectBoard=()=>({data:null,isLoading:false});`,
  // 작업 버튼은 그 자체로 또 다른 기능이다 — 모듈 그래프를 여기서 끊는다(useTaskActions 는 진짜를 쓰고
  // supabase 스텁이 빈 결과를 준다. 훅 모듈을 통째로 스텁하면 다른 가져오는 쪽이 이름을 못 찾는다)
  '**/src/features/task-workflow/components/TaskActionButton.tsx*': `export const TaskActionButton=()=>null;`,
  '**/src/features/task-workflow/components/collect/CollectRespondDialog.tsx*': `export const CollectRespondDialog=()=>null;`,
  '**/src/components/tasks/TaskDetailDialog.tsx*': `export const TaskDetailDialog=()=>null;`,
};

const SCENARIOS = [
  { id: 'with-tasks', tasks: TASKS },
  { id: 'requests-only', tasks: '[]' },
];
const VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844 },
  { id: 'desktop', width: 1280, height: 900 },
];

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const results = [];
try {
  for (const vp of VIEWPORTS) {
    for (const sc of SCENARIOS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.id === 'mobile' ? 2 : 1 });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
      await page.route('**/rest/v1/**', (r) => r.abort());
      await page.route('**/auth/v1/**', (r) => r.abort());
      const mocks = {
        ...MOCKS,
        '**/scripts/mobile-modal-test/main.tsx*': `
          import React from '${react}';
          import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
          import {QueryClient,QueryClientProvider} from '${query}';
          import {MemoryRouter} from '${router}';
          import '/src/index.css';
          import {TeacherTasksCard} from '/src/features/teacher-dashboard/components/TeacherTasksCard.tsx';
          ReactDOM.createRoot(document.getElementById('root')).render(
            React.createElement(QueryClientProvider,{client:new QueryClient()},
              React.createElement(MemoryRouter,null,
                React.createElement('div',{style:{padding:'8px',maxWidth:'760px'}},
                  React.createElement(TeacherTasksCard,{myTasksData:{assigned_tasks:${sc.tasks},managed_tasks:[]},currentResourceId:'me',isLoading:false})))));`,
      };
      for (const [glob, source] of Object.entries(mocks)) {
        const body = source.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
        await page.route(glob, (r) => r.fulfill({ contentType: 'application/javascript', body }));
      }
      const name = `${vp.id}-${sc.id}`;
      const row = { name, ok: false };
      try {
        await page.goto(BASE);
        await page.getByText('내 할 일').first().waitFor({ state: 'visible' });
        await page.waitForTimeout(400);
        const m = await page.evaluate(() => {
          const box = document.querySelector('[data-testid="dashboard-collect-requests"]');
          const text = document.body.innerText;
          const firstTaskRow = document.querySelector('.teacher-dashboard-row');
          return {
            pageOverflowsX: document.documentElement.scrollWidth > innerWidth + 1,
            hasBox: !!box,
            rows: box ? box.querySelectorAll('li').length : 0,
            boxAboveTasks: !firstTaskRow || (box && box.getBoundingClientRect().top < firstTaskRow.getBoundingClientRect().top),
            text,
          };
        });
        await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
        row.checks = {
          '페이지 가로 넘침 없음': !m.pageOverflowsX,
          '입력 요청 줄이 보인다': m.hasBox,
          '최대 3줄 + 나머지는 더 보기': m.rows === 3 && m.text.includes('내 할 일에서 1건 더 보기'),
          '다 채운 요청은 빠진다': !m.text.includes('다 채운 요청'),
          '할 일 목록보다 위': m.boxAboveTasks,
          '요청만 있어도 빈 상태 문구를 그리지 않는다': !m.text.includes('진행할 할 일이 없습니다'),
          '카드 설명이 요청을 말한다(기한 초과가 없을 때)': sc.id === 'with-tasks' || m.text.includes('입력·제출할 요청 4건이 남아 있습니다'),
          '마감일이 보인다(잘리지 않는다)': m.text.includes('09/30 까지') && m.text.includes('10/02 까지'),
          '할 일이 없으면 빈 타임라인 상자를 그리지 않는다': sc.id === 'with-tasks' || !m.text.includes('개인 타임라인'),
          '렌더 오류 없음': errors.filter((e) => !/Failed to load resource|net::ERR/.test(e)).length === 0,
        };
        row.errors = errors;
        row.ok = Object.values(row.checks).every(Boolean);
      } catch (e) {
        row.error = String(e);
        row.errors = errors;
      }
      results.push(row);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  console.log(`\n[${r.ok ? '통과' : '실패'}] ${r.name}`);
  if (r.error) { failed++; console.log('  오류:', r.error.slice(0, 300)); }
  for (const [k, v] of Object.entries(r.checks ?? {})) console.log(`  ${v ? '✓' : '✗'} ${k}`);
  if (!r.ok && r.errors?.length) console.log('  콘솔:', r.errors.slice(0, 3).join(' | '));
  if (!r.ok && !r.error) failed++;
}
console.log(`\n${results.length - failed}/${results.length} 통과 — 스크린샷: ${OUT}`);
if (failed) process.exit(1);
