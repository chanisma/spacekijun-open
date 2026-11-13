// 플래너(`/planner`) — 2026-10-03 전면 개편: 아카데미 «별빛 플래너» 와 같은 컴포넌트를 앱 테마로 그린다.
// 실제 PlannerPage, 데이터는 메모리 모의 RPC(`academy_dormitory_read/write` — 읽기는 실제처럼 p_date ±3일).
// 보는 것: 앱 테마(게임 말투 없음 · 머리글에 기능 이름 없음) · 이번 주(바로 적기 · 완료 표시 · 포인터 끌기로 옮기기 · 지우기 ·
//          HTML5 draggable 없음) · 하루 계획(목록 + 시간표 · 자세히 적기 양식에서 목표 고르기) · 월별 일정(날짜 고르기 · 바로 적기 ·
//          줄을 달력 칸으로 끌기) · 나의 목표(장기 → 단기 · 보관함) · 포모도로 없음 · 1360/390 가로 넘침 없음.
// PLAYWRIGHT_MODULE=<playwright/index.mjs> node scripts/planner-test/browser.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.PLANNER_TEST_URL || 'http://localhost:8080';
const transformed = await (await fetch(`${base}/src/features/planner/PlannerPage.tsx`)).text();
const versions = new Map([...transformed.matchAll(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)\?v=([a-f0-9]+)/g)].map(m => [m[1], m[2]]));
const hash = [...versions.values()][0];
const source = text => text.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, path => `${path}?v=${versions.get(path) ?? hash}`);
const react = '/node_modules/.vite/deps/react.js';
const out = 'output/planner-ui';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLANNER_BROWSER_CHANNEL || undefined, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await context.route('**/rest/v1/**', r => r.abort());
  const mocks = {
    '**/src/components/layout/Layout.tsx*': `import React from '${react}'; export const Layout=({children})=>React.createElement('main',{style:{padding:16,background:'#f8fafc',minHeight:'100vh'}},children);`,
    '**/src/components/auth/AuthProvider.tsx*': `export const useAuth=()=>({user:{id:'planner-owner'},profile:{role:'student'},effectiveRole:'student'});`,
    '**/src/features/academy/game/workshopService.ts*': `export const signWorkshopImages=async()=>new Map();`,
    '**/src/integrations/supabase/client.ts*': `const shift=(d,o)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+o);return x.toISOString().slice(0,10)};export const supabase={rpc:async(name,args)=>{
      window.rpcCalls.push({name,args});
      const s=window.plannerState;
      if(name==='academy_dormitory_read'){const lo=shift(args.p_date,-3),hi=shift(args.p_date,3);return {data:{...structuredClone(s),tasks:s.tasks.filter(t=>t.task_date>=lo&&t.task_date<=hi)},error:null};}
      const p=args.p_payload; let id=p.id||crypto.randomUUID(); const a=args.p_action;
      if(a==='save_task'){const old=s.tasks.find(t=>t.id===id);s.tasks=s.tasks.filter(t=>t.id!==id);s.tasks.push({completed:false,feedback:null,...old,...p,id,related_goal_id:p.related_goal_id||null,start_time:p.start_time||null,end_time:p.end_time||null,plan_id:old?.plan_id||crypto.randomUUID()});}
      if(a==='complete')s.tasks.find(t=>t.id===p.id).completed=p.completed;
      if(a==='delete_task')s.tasks=s.tasks.filter(t=>t.id!==p.id);
      if(a==='save_feedback')s.tasks.find(t=>t.id===p.id).feedback=p.comment;
      if(a==='save_goal'){const old=s.goals.find(g=>g.id===id);s.goals=s.goals.filter(g=>g.id!==id);s.goals.push({is_completed:false,is_archived:false,horizon:'short',parent_goal_id:null,description:null,...old,...p,id,parent_goal_id:p.parent_goal_id||null});}
      if(a==='complete_goal')s.goals.find(g=>g.id===p.id).is_completed=p.completed;
      if(a==='archive_goal')s.goals.find(g=>g.id===p.id).is_archived=p.archived;
      if(a==='delete_goal')s.goals=s.goals.filter(g=>g.id!==p.id);
      return {data:{id},error:null};
    }};`,
  };
  for (const [pattern, body] of Object.entries(mocks)) await context.route(pattern, r => r.fulfill({ contentType: 'application/javascript', body: source(body) }));
  await context.route('**/__planner-check', r => r.fulfill({ contentType: 'text/html', body: '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import("/__planner-main.js");</script></html>' }));
  await context.route('**/__planner-main.js', r => r.fulfill({ contentType: 'application/javascript', body: source(`
    import React from '${react}'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js';
    import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';
    import PlannerPage from '/src/features/planner/PlannerPage.tsx';
    import {seoulDay,offsetDay,weekStartOf} from '/src/features/planner/plannerModel.ts';
    import '/src/index.css';
    localStorage.removeItem('planner:view:v1');
    window.rpcCalls=[];const today=seoulDay();const mon=weekStartOf(today);window.today=today;window.mon=mon;
    window.plannerState={goals:[{id:'goal-eng',title:'영어 1등급',description:'수능 영어를 안정적으로',is_completed:false,is_archived:false,horizon:'short',parent_goal_id:null},{id:'goal-old',title:'예전 목표',description:null,is_completed:false,is_archived:true,horizon:'short',parent_goal_id:null}],plans:[],
      tasks:[
        {id:'t-mon',plan_id:'p1',title:'영어 단어 50개',task_date:mon,completed:false,priority:'high',memo:null,start_time:'07:00',end_time:'07:30',related_goal_id:'goal-eng'},
        {id:'t-wed',plan_id:'p3',title:'독서 40쪽',task_date:offsetDay(mon,2),completed:false,priority:'medium',memo:null,start_time:null,end_time:null,related_goal_id:null},
        {id:'t-thu',plan_id:'p4',title:'화학 개념 정리',task_date:offsetDay(mon,3),completed:false,priority:'medium',memo:null,start_time:null,end_time:null,related_goal_id:null}]};
    const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:cache},React.createElement(MemoryRouter,null,React.createElement(PlannerPage))));
  `) }));
  await page.goto(`${base}/__planner-check`);
  await page.waitForFunction(() => window.mon);
  const mon = await page.evaluate(() => window.mon);
  const shift = (d, o) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + o); return x.toISOString().slice(0, 10); };
  const md = d => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;
  const state = () => page.evaluate(() => window.plannerState);
  const tabs = page.getByRole('navigation', { name: '플래너 쪽' });
  const pointerDrag = async (from, to) => {
    const a = await from.boundingBox(), b = await to.boundingBox();
    await page.mouse.move(a.x + Math.min(24, a.width / 2), a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(a.x + Math.min(36, a.width / 2 + 8), a.y + a.height / 2 + 4, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 }); await page.mouse.up();
  };

  // ── 이번 주(처음 화면) ──
  const weekLeft = page.getByRole('region', { name: '왼쪽 쪽 · 이번 주의 별과 월·화·수' });
  await weekLeft.getByText('영어 단어 50개').waitFor();
  assert.equal(await tabs.getByRole('button', { name: '이번 주' }).getAttribute('aria-pressed'), 'true', '처음 화면은 이번 주');
  assert.equal(await page.getByText('MY PLANNER', { exact: false }).count() > 0, true, '앱 테마의 표지 글씨');
  for (const word of ['STARLIGHT', '깃펜', '인장', '성도', '모든 별']) assert.equal(await page.getByText(word, { exact: false }).count(), 0, `게임 말투가 없다: ${word}`);
  assert.equal(await page.getByRole('heading', { name: '플래너', exact: true }).count(), 0, '머리글에 기능 이름을 쓰지 않는다(UI 규약)');
  assert.equal(await page.locator('[data-book] [draggable="true"]').count(), 0, 'HTML5 끌기 요소가 없다(멈춤 사고)');
  assert.equal(await page.getByText(/집중|포모도로/).count(), 0, '포모도로는 이번 개편에서 뺐다');
  // 바로 적기
  const wedQuill = page.getByLabel(`${md(shift(mon, 2))}에 할 일 적기`);
  await wedQuill.fill('수학 오답 정리'); await wedQuill.press('Enter');
  await page.waitForFunction(day => window.plannerState.tasks.some(t => t.title === '수학 오답 정리' && t.task_date === day), shift(mon, 2));
  // 완료 표시
  await page.getByRole('checkbox', { name: '독서 40쪽 완료' }).click();
  await page.waitForFunction(() => window.plannerState.tasks.find(t => t.id === 't-wed').completed);
  // 포인터 끌기로 금요일에
  const fri = shift(mon, 4);
  await pointerDrag(page.locator('li', { hasText: '화학 개념 정리' }).locator('[role="button"]').first(), page.locator(`[data-drop-day="${fri}"]`));
  await page.waitForFunction(day => window.plannerState.tasks.find(t => t.id === 't-thu').task_date === day, fri);
  assert.equal(await page.getByRole('dialog').count(), 0, '끌고 놓아도 다른 창이 열리지 않는다');
  // 목표 거르기 — 전체 / 영어 1등급
  await weekLeft.getByRole('button', { name: /^영어 1등급/ }).click();
  assert.equal(await page.getByText('독서 40쪽').count(), 0, '다른 목표의 일은 접힌다');
  await weekLeft.getByRole('button', { name: '전체', exact: true }).click();
  // 지우기 — 쪽지 확인
  await page.getByRole('button', { name: '수학 오답 정리 지우기' }).click();
  await page.getByRole('button', { name: '계획 지우기' }).click();
  await page.waitForFunction(() => !window.plannerState.tasks.some(t => t.title === '수학 오답 정리'));
  await page.screenshot({ path: `${out}/week.png` });

  // ── 하루 계획 — 목록 + 시간표, 자세히 적기 ──
  await page.locator(`[data-drop-day="${mon}"]`).getByTitle('이 날의 하루 쪽 펼치기').click();
  await tabs.getByRole('button', { name: '하루 계획' }).and(page.locator('[aria-pressed="true"]')).waitFor();
  const dayLeft = page.getByRole('region', { name: '왼쪽 쪽 · 하루 계획' });
  await dayLeft.getByText('영어 단어 50개').waitFor();
  await page.getByRole('region', { name: '오른쪽 쪽 · 하루 시간표' }).getByLabel(/^영어 단어 50개 07:00/).waitFor();
  await dayLeft.getByRole('button', { name: '＋ 계획 적기' }).click();
  await dayLeft.getByLabel('무엇을 해볼까요?').fill('영어 듣기 20분');
  await dayLeft.getByLabel('어떤 목표의 계획인가요?').selectOption('goal-eng');
  assert.equal(await dayLeft.locator('option', { hasText: '예전 목표' }).count(), 0, '보관한 목표는 고를 수 없다');
  await dayLeft.getByLabel('시작').fill('19:00'); await dayLeft.getByLabel('마침').fill('19:20');
  await page.screenshot({ path: `${out}/day-form.png` });
  await dayLeft.getByRole('button', { name: '플래너에 기록' }).click();
  await page.waitForFunction(day => window.plannerState.tasks.some(t => t.title === '영어 듣기 20분' && t.related_goal_id === 'goal-eng' && t.start_time === '19:00' && t.task_date === day), mon);
  await dayLeft.getByText('영어 듣기 20분').waitFor();
  await page.screenshot({ path: `${out}/day.png` });

  // ── 월별 일정 ──
  await tabs.getByRole('button', { name: '월별 일정' }).click();
  const monthLeft = page.getByRole('region', { name: '왼쪽 쪽 · 한 달의 칸' });
  const monthRight = page.getByRole('region', { name: '오른쪽 쪽 · 고른 날' });
  await monthLeft.waitFor();
  const target = shift(mon, 1);
  await monthLeft.locator(`[data-drop-day="${target}"]`).click();
  await monthRight.getByRole('heading', { level: 3 }).filter({ hasText: md(target) }).waitFor();
  await monthRight.getByLabel(`${md(target)}에 할 일 적기`).fill('도서관 책 반납');
  await monthRight.getByLabel(`${md(target)}에 할 일 적기`).press('Enter');
  await monthRight.getByText('도서관 책 반납').waitFor();
  const later = shift(mon, 5);
  await pointerDrag(monthRight.locator('li', { hasText: '도서관 책 반납' }).locator('[role="button"]').first(), monthLeft.locator(`[data-drop-day="${later}"]`));
  await page.waitForFunction(day => window.plannerState.tasks.find(t => t.title === '도서관 책 반납')?.task_date === day, later);
  await page.screenshot({ path: `${out}/month.png` });

  // ── 나의 목표 — 장기 → 단기 · 보관함 ──
  await tabs.getByRole('button', { name: '나의 목표' }).click();
  const goalsLeft = page.getByRole('region', { name: '왼쪽 쪽 · 나의 별자리' });
  await goalsLeft.getByLabel('새 장기 목표 적기').fill('생명을 연구하는 사람 되기');
  await goalsLeft.getByLabel('새 장기 목표 적기').press('Enter');
  await goalsLeft.getByLabel('생명을 연구하는 사람 되기에 단기 목표 적기').fill('생명과학 1등급');
  await goalsLeft.getByLabel('생명을 연구하는 사람 되기에 단기 목표 적기').press('Enter');
  await page.waitForFunction(() => { const s = window.plannerState.goals; const long = s.find(g => g.title === '생명을 연구하는 사람 되기'); return long?.horizon === 'long' && s.some(g => g.title === '생명과학 1등급' && g.parent_goal_id === long.id); });
  await goalsLeft.getByRole('button', { name: /^보관함/ }).click();
  await goalsLeft.getByText('예전 목표').waitFor();
  await goalsLeft.getByRole('button', { name: /^이어가는 중/ }).click();
  await page.screenshot({ path: `${out}/goals.png` });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '1360 가로 넘침 없음');

  // ── 휴대폰 390 — 네 쪽 모두 넘치지 않는다 ──
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, shot] of [['이번 주', 'week'], ['하루 계획', 'day'], ['월별 일정', 'month'], ['나의 목표', 'goals']]) {
    await tabs.getByRole('button', { name: label }).click();
    await page.waitForTimeout(250);
    const box = await tabs.getByRole('button', { name: label }).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `휴대폰에서 «${label}» 단추가 화면 안에 있다`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `«${label}» 가로 넘침 없음 @390`);
    await page.screenshot({ path: `${out}/${shot}-390.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS planner (app theme): week (quick add · check · pointer drag · goal filter · delete), day (list + timeline · sheet form with goal picker), month (pick · add · drag to cell), goals (long → short · archive tab), no game wording · no pomodoro · no draggable · 1360/390 no overflow');
} finally {
  await browser.close();
}
