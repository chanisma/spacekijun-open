// 자습실 통계 — 실제 StudyRoomStatsPage 를 크롬으로 띄워 네 탭을 돌며 스크린샷과 단언을 남긴다.
// Layout·Supabase 는 메모리 모의. 자료는 지어낸 이름이다(학생 이름을 저장소에 두지 않는다).
// 응답 모양은 운영 seaton_stats_* (2026-10-09 실측)를 따랐다.
//
// 개발 서버(8080) 필요.
//   PLAYWRIGHT_MODULE=<playwright/index.mjs> node scripts/study-room-stats-test/run-screenshots.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.STATS_TEST_URL || 'http://localhost:8080';
const out = process.env.STATS_OUT || 'output/study-room-stats';
mkdirSync(out, { recursive: true });

const transformed = await (await fetch(`${base}/src/features/study-room-stats/StudyRoomStatsPage.tsx`)).text();
const versions = new Map([...transformed.matchAll(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)\?v=([a-f0-9]+)/g)].map((m) => [m[1], m[2]]));
const hash = [...versions.values()][0];
const source = (text) => text.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, (p) => `${p}?v=${versions.get(p) ?? hash}`);
const react = '/node_modules/.vite/deps/react.js';

// ── 지어낸 자료 ───────────────────────────────────────────────────────────────
const rooms = [
  ['r1', '1학년 아침 자습실', true], ['r2', '1학년 야간 자습실', false],
  ['r3', '2학년 야간 자습실', false], ['r4', '3학년 몰입 열람실(아주 긴 이름의 열람실 표기)', false],
];
const days = [];
for (let d = 1; d <= 30; d += 1) {
  const iso = `2026-09-${String(d).padStart(2, '0')}`;
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (dow !== 0 && dow !== 6) days.push(iso);
}
const statuses = ['attended', 'attended', 'attended', 'excused', 'absent', 'supplement'];
const students = Array.from({ length: 36 }, (_, i) => {
  const grade = (i % 3) + 1;
  const att = {};
  let total = 0; let attended = 0; let absent = 0;
  days.forEach((d, j) => {
    if ((i + j) % 3 === 0) return;
    const roomIdx = grade === 1 ? (j % 2) : grade === 2 ? 2 : 3;
    const st = statuses[(i * 7 + j) % statuses.length];
    const entries = [[roomIdx === 0 ? 0 : 1, st, st === 'absent' ? null : '김교사', roomIdx]];
    if ((i + j) % 5 === 0) entries.push([2, 'attended', '김교사', roomIdx]);
    att[d] = entries;
    for (const e of entries) { total += 1; if (e[1] === 'absent') absent += 1; else attended += 1; }
  });
  return {
    id: `s${i}`, name: `학생${String(i + 1).padStart(2, '0')}`, grade, class: (i % 5) + 1, number: i + 1, sid: `25-1${String(i).padStart(4, '0')}`,
    total, attended, absent, pending: 0, rate: Math.round((1000 * attended) / Math.max(1, attended + absent)) / 10,
    temp: Math.round((attended * 0.5 - absent) * 10) / 10 / 3,
    wr: { 1: grade === 1 ? [0, 1] : [grade], 2: [grade === 1 ? 1 : grade], 3: [], 4: [grade === 1 ? 0 : grade], 5: [grade === 1 ? 1 : grade] },
    att,
  };
});
const sum = (k) => students.reduce((n, s) => n + s[k], 0);
const counts = (a, b, t) => ({ total: t, attended: a, absent: b, rate: Math.round((1000 * a) / Math.max(1, a + b)) / 10 });
const grades = (scale) => ({ 1: counts(300 * scale, 12 * scale, 320 * scale), 2: counts(250 * scale, 20 * scale, 280 * scale), 3: counts(210 * scale, 60 * scale, 290 * scale) });
const summary = {
  range: { start: '2026-09-01', end: '2026-09-30', today: '2026-10-09', past_closing: false },
  cards: { total: sum('total'), attended: sum('attended'), absent: sum('absent'), pending: 0, rate: 90.9, students: students.length, rooms: 4 },
  status: { attended: 700, excused: 120, supplement: 40, absent: sum('absent'), pending: 0 },
  by_grade: [1, 2, 3].map((g) => ({ grade: g, ...counts(300 - g * 30, g * 20, 330 - g * 10), students: 12 })).concat([{ grade: null, total: 4, attended: 4, absent: 0, rate: 100, students: 1 }]),
  monthly: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m, i) => ({ month: m, ...counts(700 + i * 40, 90 - i * 8, 800 + i * 30), grades: grades(1 + i / 10) })),
  weekly: Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 6, 13 + i * 7));
    return { week_start: d.toISOString().slice(0, 10), ...counts(160 + i, 20 - i, 185), grades: i === 3 ? {} : grades(0.25) };
  }),
  rooms: rooms.map(([id, name], i) => ({ room_id: id, name, room_grade: (i % 3) + 1, room_grades: [(i % 3) + 1], ...counts(200 - i * 10, 10 + i, 215), pending: 0, students: 12 })),
};
const studentsResult = { range: summary.range, rooms, students };
const weekday = {
  range: summary.range,
  crosstab: rooms.map(([id, name], i) => ({ room_id: id, name, by_day: { 1: 40 + i, 2: 35, 3: 20, 4: 30, 5: 25 - i, 6: 0, 7: 0 }, total: 150, weekday_total: 150, unique_students: 12 })),
  applicants: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), rooms.slice(0, 3).map(([id, name], i) => ({
    room_id: id, name, students: students.filter((s) => s.grade === i + 1).map(({ id: sid, name: n, grade, class: c, number }) => ({ id: sid, name: n, grade, class: c, number })),
  }))])),
};
const temperature = {
  rule: { base: 28, attend: 0.5, absent: 1, feedback: 0.1 },
  today: '2026-10-09',
  month: '2026-10',
  cumulative: students.map((s, i) => ({ rank: i + 1, id: s.id, name: s.name, grade: s.grade, class: s.class, number: s.number, temperature: 70 - i * 1.7, month_change: i % 4 === 0 ? -1 : 1.5 })),
  monthly: students.slice(0, 20).map((s, i) => ({ rank: i + 1, id: s.id, name: s.name, grade: s.grade, class: s.class, number: s.number, change: 4 - i * 0.4, attended_days: 6 - (i % 6) })),
};

const mocks = {
  '**/src/components/layout/Layout.tsx*': `export const Layout=({children})=>children; export default Layout;`,
  '**/src/integrations/supabase/client.ts*': `
    const chain=(rows)=>{const o={select:()=>o,eq:()=>o,order:()=>o,then:(res)=>res({data:rows,error:null})};return o;};
    export const supabase={
      rpc:async(name,args)=>{window.rpcCalls.push([name,args]);await new Promise(r=>setTimeout(r,60));
        const f=window.__fx;
        if(name==='seaton_stats_summary')return {data:f.summary,error:null};
        if(name==='seaton_stats_students')return {data:f.students,error:null};
        if(name==='seaton_stats_weekday')return {data:f.weekday,error:null};
        if(name==='seaton_stats_temperature')return {data:f.temperature,error:null};
        return {data:null,error:{message:'unknown rpc '+name}};},
      from:()=>chain(window.__fx.rooms.map(([id,name])=>({id,name}))),
    };`,
};

const harness = (init) => source(`
  import React from '${react}'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
  import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js';
  import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';
  import Page from '/src/features/study-room-stats/StudyRoomStatsPage.tsx';
  import '/src/index.css';
  window.rpcCalls=[]; ${init}
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:cache},React.createElement(MemoryRouter,null,React.createElement('div',{style:{padding:12}},React.createElement(Page)))));
`);

const browser = await chromium.launch({ headless: true, channel: process.env.STATS_CHANNEL || undefined });
const errors = [];
let shots = 0;
const fx = { summary, students: studentsResult, weekday, temperature, rooms };

async function openPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|WebSocket|\[vite\]|width\(0\) and height\(0\)/.test(m.text())) errors.push(m.text()); });
  await context.route('**/rest/v1/**', (r) => r.abort());
  for (const [pattern, body] of Object.entries(mocks)) await context.route(pattern, (r) => r.fulfill({ contentType: 'application/javascript', body: source(body) }));
  await context.route('**/__stats-check', (r) => r.fulfill({ contentType: 'text/html', body: '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import("/__stats-main.js");</script></html>' }));
  await context.route('**/__stats-main.js', (r) => r.fulfill({ contentType: 'application/javascript', body: harness(`window.__fx=${JSON.stringify(fx)};`) }));
  await page.goto(`${base}/__stats-check`);
  await page.getByText('총 신청').waitFor({ timeout: 60000 });
  return { page, context };
}
const shot = async (page, name, full = true) => { await page.screenshot({ path: `${out}/${name}.png`, fullPage: full }); shots += 1; };
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const culprits = o > 0 ? await page.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1))
    .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} «${(el.textContent || '').trim().slice(0, 30)}»`)) : [];
  assert.ok(o <= 0, `${label} 가로 넘침 ${o}px — ${culprits.join(' / ')}`);
};
const tab = (page, name) => page.getByRole('button', { name, exact: true }).first().click();

try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const w = viewport.width;
    const { page, context } = await openPage(viewport);
    // 요약
    assert.ok(await page.getByText('출석률 추이').isVisible(), '요약: 추이');
    assert.ok(await page.getByText('학년 미상 4건 제외').isVisible(), '요약: 학년 미상은 숨기지 않고 말한다');
    const first = page.evaluate(() => window.rpcCalls.map((c) => c[0]));
    assert.deepEqual((await first).filter((n) => n.startsWith('seaton_')), ['seaton_stats_summary'], '첫 화면은 요약 RPC 하나만');
    const args = await page.evaluate(() => window.rpcCalls[0][1]);
    assert.equal(args.p_include_future, false, '미래 예약 기본 = 빼기');
    assert.match(args.p_start, /^\d{4}-\d{2}-01$/, '기본 기간 = 이번 달 1일부터');
    await page.waitForTimeout(2000); // 도넛·선 등장 애니메이션이 끝난 뒤 찍는다
    if (w > 500) await noOverflow(page, `${w} 요약`); else await noOverflow(page, `${w} 요약`);
    await shot(page, `${w}-01-summary`);
    // 주별
    await page.getByRole('button', { name: '주별', exact: true }).click();
    await page.waitForTimeout(300);
    // 학생별
    await tab(page, '학생별');
    await page.getByText('학생01').first().waitFor();
    await noOverflow(page, `${w} 학생별`);
    await shot(page, `${w}-02-students`);
    await page.getByRole('button', { name: '일별 출석', exact: true }).click();
    await page.getByText(/대표 상태를 보입니다/).waitFor();
    await noOverflow(page, `${w} 일별 출석`);
    await shot(page, `${w}-03-matrix`, false);
    // 검색
    await page.getByPlaceholder('이름·학번').fill('학생02');
    assert.equal(await page.locator('tbody tr').count(), 1, '이름 검색');
    // 요일별
    await tab(page, '요일별');
    await page.getByText('요일별 신청자').waitFor();
    await noOverflow(page, `${w} 요일별`);
    await shot(page, `${w}-04-weekday`);
    // 온도 랭킹 — 기간 대신 달 고르기
    await tab(page, '온도 랭킹');
    await page.getByText(/기준 28° · 출석 \+0\.5/).waitFor();
    assert.equal(await page.locator('input[type="date"]').count(), 0, '온도 랭킹은 기간 입력 대신 달');
    assert.equal(await page.locator('input[type="month"]').count(), 1, '달 입력');
    await noOverflow(page, `${w} 온도`);
    await shot(page, `${w}-05-temperature`);
    await page.getByRole('button', { name: '10월', exact: true }).click();
    await page.getByText('출석일').waitFor();
    const rpcNames = await page.evaluate(() => window.rpcCalls.map((c) => c[0]));
    assert.ok(rpcNames.every((n) => n.startsWith('seaton_stats_')), `통계는 계약 RPC 만 부른다: ${rpcNames}`);
    await context.close();
  }
  assert.deepEqual(errors, [], `콘솔·페이지 오류 없음: ${errors.join(' | ')}`);
  console.log(`✓ 자습실 통계 브라우저 확인 — 스크린샷 ${shots}장 → ${out}`);
} finally {
  await browser.close();
}
