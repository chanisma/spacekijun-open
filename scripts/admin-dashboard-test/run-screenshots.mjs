// 관리자 대시보드 — 실제 AdminDashboardOverview 를 크롬으로 띄워 스크린샷과 몇 가지 단언을 남긴다.
// 인증·Supabase 는 메모리 모의(관리자 · get_admin_dashboard_stats / refresh_admin_dashboard_datasets).
// 자료는 지어낸 이름이다(운영 응답 모양만 따랐다 — 학생 이름을 저장소에 두지 않는다).
//
// 보는 것: ① 1280 전체(다마고찌 카드 · 운영 점검의 의뢰·푸시 행 · 자료 현황 기준 시각)
//         ② [지금 다시 세기] → 기준 시각이 «수동 집계»로 바뀐다(대시보드 전체를 다시 읽지 않는다)
//         ③ 스냅샷이 낡았을 때 앰버 «(오래됨)»  ④ 390 휴대폰 가로 넘침 없음
//
// 개발 서버(8080) 필요.  PLAYWRIGHT_MODULE=<playwright/index.mjs> ADMIN_CHANNEL=chrome node scripts/admin-dashboard-test/run-screenshots.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.ADMIN_TEST_URL || 'http://localhost:8080';
const out = process.env.ADMIN_OUT || 'output/admin-dashboard';
mkdirSync(out, { recursive: true });

const transformed = await (await fetch(`${base}/src/components/admin/layout/AdminDashboardOverview.tsx`)).text();
const versions = new Map([...transformed.matchAll(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)\?v=([a-f0-9]+)/g)].map((m) => [m[1], m[2]]));
const hash = [...versions.values()][0];
const source = (text) => text.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, (p) => `${p}?v=${versions.get(p) ?? hash}`);
const react = '/node_modules/.vite/deps/react.js';

const day = (offset) => {
  const d = new Date(Date.now() + 9 * 3600e3 + offset * 86400e3);
  return d.toISOString().slice(0, 10);
};
const ds = (total, recent, exact = true) => ({ total, recent, exact, skipped: recent === null ? 'no_timestamp' : null, as_of: null });

/** 운영 응답의 모양(2026-10-08 실측)을 따른 지어낸 자료 */
const fixture = (snapshotAt, source) => ({
  generated_at: new Date().toISOString(),
  live_ms: 14,
  datasets: {
    events: ds(120, 12), tasks: ds(640, 85), meetings: ds(2100, 140), notices: ds(41, 3),
    students: ds(871, 0), detailed_activities: ds(32537, 1752), kg_relations: ds(331490, 215949),
    curriculum: ds(410, 0), enrollments: ds(12571, 6286), mock_problems: ds(5200, null),
    academy_chapters: ds(14, 6), tama_pets: ds(13, 13), tama_album: ds(28, 28), tama_diary: ds(5, 5), tama_gacha: ds(9, 9), tama_focus: ds(3, 3),
  },
  users: { total: 760, student: 640, teacher: 70, staff: 9, admin: 1, new_30d: 12, active_7d: 310, active_30d: 520, never_logged_in: 40, links: 75, unlinked_faculty: 2, privacy_policy_version: 'v1', privacy_consented: 700 },
  resources: { total: 1600, student_active: 630, student_graduated: 231, student_left: 12, teacher: 68, staff: 9, external_menu: 6 },
  login_recency: Array.from({ length: 14 }, (_, i) => ({ date: day(i - 13), count: [3, 5, 2, 8, 30, 41, 39, 12, 4, 6, 35, 44, 50, 61][i] })),
  academy: {
    chapters: [{ key: 'first_star', final_step: 16, student_total: 3, student_done: 1, student_progress_sum: 9, faculty_total: 1, faculty_done: 1, step_max: 16, last_activity: new Date().toISOString() }],
    players: { total: 4, student: 3, faculty: 1, student_active_7d: 2, active_7d: 3 },
    players_list: [],
    prologue: { student_total: 3, student_done: 3, student_skipped: 1, faculty_total: 1, faculty_done: 1 },
  },
  tamagotchi: {
    owners: { total: 13, student: 11, teacher: 1, admin: 1, other: 0 },
    pets: { total: 13, resting: 0, sick: 1, by_stage: { egg: 10, baby: 2, teen: 1 } },
    care: { today: 13, active_7d: 13, students_3days: 0 },
    daily: Array.from({ length: 14 }, (_, i) => ({ date: day(i - 13), count: i === 13 ? 13 : i === 12 ? 2 : 0 })),
    activity_30d: { gacha: 9, trades: 0, diary: 5, focus_started: 3, focus_completed: 1, visits: 0, coins: 4 },
    orders: { character_open: 1, decor_open: 1, oldest_open_at: new Date(Date.now() - 3 * 86400e3).toISOString() },
    event: { title: '가을 별자리 축제', ends_at: new Date(Date.now() + 5 * 86400e3).toISOString() },
    push: { subscriptions: 3, users: 2, failing: 1 },
  },
  system: {
    academic_term: { year: 2026, semester: 2, start_date: '2026-08-24', end_date: '2027-02-12' },
    menu_visibility: { '/exam-schedule': { users: false } },
    notifications_30d: 4200, notifications_unread: 310, database_size: '1.9 GB',
  },
  counting: { counted: 65, estimated: 0, elapsed_ms: 919, budget_hit: false, size_cap_mb: 4096, generated_at: snapshotAt, source },
});

const mocks = {
  '**/src/components/auth/AuthProvider.tsx*': `export const useAuth=()=>({user:{id:'admin-1',email:'admin@myschool.hs.kr'},profile:{role:'admin'},effectiveRole:'admin',isAdmin:true,isRealAdmin:true,isStudentView:false});`,
  '**/src/integrations/supabase/client.ts*': `export const supabase={rpc:async(name)=>{window.rpcCalls.push(name);
      if(name==='get_admin_dashboard_stats')return {data:window.__stats,error:null};
      if(name==='refresh_admin_dashboard_datasets'){await new Promise(r=>setTimeout(r,300));const s=window.__stats;
        return {data:{datasets:s.datasets,counting:{counted:61,estimated:4,elapsed_ms:3100,budget_hit:false,size_cap_mb:20},generated_at:new Date().toISOString(),source:'manual',throttled:false},error:null};}
      return {data:null,error:{message:'unknown rpc '+name}};}};`,
};

const harness = (initScript) => source(`
  import React from '${react}'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
  import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js';
  import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';
  import {AdminDashboardOverview} from '/src/components/admin/layout/AdminDashboardOverview.tsx';
  import '/src/index.css';
  window.rpcCalls=[]; ${initScript}
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:cache},React.createElement(MemoryRouter,null,React.createElement('div',{style:{padding:16}},React.createElement(AdminDashboardOverview,{onNavigateTab:(t)=>{window.__tab=t;}})))));
`);

const browser = await chromium.launch({ headless: true, channel: process.env.ADMIN_CHANNEL || undefined });
const errors = [];
let shots = 0;

async function openPage(viewport, stats) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|WebSocket|\[vite\]/.test(m.text())) errors.push(m.text()); });
  await context.route('**/rest/v1/**', (r) => r.abort());
  for (const [pattern, body] of Object.entries(mocks)) await context.route(pattern, (r) => r.fulfill({ contentType: 'application/javascript', body: source(body) }));
  await context.route('**/__admin-check', (r) => r.fulfill({ contentType: 'text/html', body: '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import("/__admin-main.js");</script></html>' }));
  await context.route('**/__admin-main.js', (r) => r.fulfill({ contentType: 'application/javascript', body: harness(`window.__stats=${JSON.stringify(stats)};`) }));
  await page.goto(`${base}/__admin-check`);
  await page.getByText('기능별 자료 현황').waitFor({ timeout: 60000 });
  return { page, context };
}
const shot = async (page, name, full = true) => { await page.screenshot({ path: `${out}/${name}.png`, fullPage: full }); shots += 1; };
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // 넘치면 범인(오른쪽 끝이 화면 밖인 가장 깊은 요소)을 함께 말한다
  const culprits = o > 0 ? await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1))
    .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} «${(el.textContent || '').trim().slice(0, 30)}»`)) : [];
  assert.ok(o <= 0, `${label} 가로 넘침 ${o}px — ${culprits.join(' / ')}`);
};

try {
  // ① 오늘 새벽 야간 집계
  const dawn = new Date(); dawn.setHours(4, 30, 0, 0);
  {
    const { page, context } = await openPage({ width: 1280, height: 900 }, fixture(dawn.toISOString(), 'nightly'));
    await page.getByText('다마고찌', { exact: true }).first().waitFor();
    assert.ok(await page.getByText(/야간 집계 기준/).isVisible(), '자료 현황에 야간 집계 기준 시각');
    assert.ok(await page.getByText(/캐릭터 1 · 꾸미기 1건 대기 — 가장 오래된 것 3일째/).isVisible(), '운영 점검: 의뢰 대기와 대기 일수');
    assert.ok(await page.getByText(/전송 실패 중 1대/).isVisible(), '운영 점검: 푸시 실패 기기');
    assert.ok(await page.getByText('어른', { exact: true }).isVisible(), '0마리 단계(어른)도 행으로 남는다');
    assert.ok(await page.getByText(/가을 별자리 축제/).isVisible(), '진행 중 이벤트');
    assert.deepEqual(await page.evaluate(() => window.rpcCalls), ['get_admin_dashboard_stats'], '첫 화면은 RPC 한 번');
    await shot(page, '01-dashboard-1280');
    const card = page.locator('div.rounded-lg.border', { hasText: '성장 단계' }).first();
    await card.screenshot({ path: `${out}/02-tamagotchi-card.png` }); shots += 1;

    // ② [지금 다시 세기] — 자료 부분만 바꾼다(대시보드 RPC 를 다시 부르지 않는다)
    await page.getByRole('button', { name: /지금 다시 세기/ }).click();
    await page.getByText(/수동 집계 기준/).waitFor();
    assert.ok(await page.getByText(/추정 4개/).isVisible(), '수동 집계는 큰 표를 추정으로 돌린다(그렇게 말한다)');
    assert.deepEqual(await page.evaluate(() => window.rpcCalls), ['get_admin_dashboard_stats', 'refresh_admin_dashboard_datasets'], '다시 세기는 자료 RPC 하나만');
    await page.getByRole('button', { name: '관리 · 측정' }).click();
    assert.equal(await page.evaluate(() => window.__tab), 'tamagotchi', '[관리 · 측정] → 다마고찌 탭');
    await context.close();
  }
  // ③ 이틀 전 스냅샷 = 크론이 멈춤
  {
    const { page, context } = await openPage({ width: 1280, height: 900 }, fixture(new Date(Date.now() - 50 * 3600e3).toISOString(), 'nightly'));
    assert.ok(await page.getByText(/\(오래됨\)/).isVisible(), '낡은 스냅샷은 (오래됨)');
    await page.getByText('기능별 자료 현황').scrollIntoViewIfNeeded();
    await shot(page, '03-stale', false);
    await context.close();
  }
  // ④ 휴대폰
  {
    const { page, context } = await openPage({ width: 390, height: 844 }, fixture(dawn.toISOString(), 'nightly'));
    await noOverflow(page, '390');
    await shot(page, '04-dashboard-390');
    await context.close();
  }
  assert.deepEqual(errors, [], `콘솔·페이지 오류 없음: ${errors.join(' | ')}`);
  console.log(`✓ 관리자 대시보드 브라우저 확인 — 스크린샷 ${shots}장 → ${out}`);
} finally {
  await browser.close();
}
