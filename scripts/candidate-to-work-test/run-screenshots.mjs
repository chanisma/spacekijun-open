// 후보 → 업무 만들기 창 스크린샷 — 2026-10-05.
//
// 실제 `CandidateWorkDialog` 를 띄우고, 절차 검토(procedures-2026.json)에서 **단계가 가장 긴 업무**로 채운다.
// 긴 단계 이름·담당자 칩·날짜 입력이 휴대폰 폭을 밀어내는지는 그림으로만 드러난다.
//
// 실행 (개발 서버를 먼저 켠다):
//   $env:PLAYWRIGHT_MODULE = "C:\path\to\playwright\index.mjs"   # node_modules 에 없을 때만
//   node scripts/candidate-to-work-test/run-screenshots.mjs
//
// 결과 png = .tmp/candidate-to-work-shots/ (gitignore). DB 에는 아무것도 쓰지 않는다(REST 를 가로챈다).
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'candidate-to-work-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
// ⚠️ 디스크의 _metadata.json 해시를 쓰지 말 것 — 이 창이 처음 끌어오는 의존성(react-router-dom 등)을 서버가
//    새로 최적화하면 해시가 **메모리에서만** 바뀌어, 옛 해시의 React 와 새 React 두 벌이 뜬다(Invalid hook call).
//    서버가 실제로 변환한 모듈에서 해시를 읽는다.
const ORIGIN = process.env.MODAL_TEST_URL || 'http://localhost:8080';
const transformed = await (await fetch(`${ORIGIN}/src/components/tasks/CandidateWorkDialog.tsx`)).text();
const browserHash = /\/node_modules\/\.vite\/deps\/react\.js\?v=([0-9a-f]+)/.exec(transformed)?.[1]
  ?? JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8')).browserHash;
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';

const procedures = JSON.parse(readFileSync('scripts/work-candidate-seed/procedures-2026.json', 'utf8')).works;
const stepsOf = (list) => Math.max(0, ...list.filter((e) => e.kind === '절차').map((e) => e.steps.length));
const [name, entries] = Object.entries(procedures).sort((a, b) => stepsOf(b[1]) - stepsOf(a[1]))[0];
// 명단 = 절차에 나온 이름 전부(가짜 id). 첫 이름은 분장 자리 담당자 = 매니저 기본값
const names = [...new Set(entries.flatMap((e) => [e.person, ...e.steps.map((s) => s.by)]).filter(Boolean).flatMap((n) => n.split('·')))];
const roster = names.map((n, i) => ({ id: `p${i}`, name: n, type: 'teacher', status: 'active' }));
const candidate = {
  id: 'c1', academic_year: 2026, kind: 'work', code: 'P999', name, area_name: null, seat_id: 's1', seat_label: '시험 자리',
  department: '교무기획부', brm: '학사관리', work_type: '정기', scale: null, load: null, months: [3, 4], repeat_hint: null,
  counts: {}, budget: null, note: null, meta: {},
};

const stubs = {
  '**/src/hooks/useWorkCandidates.ts*': `
    const PR = ${JSON.stringify(entries)};
    export const workCandidateKeys = { all: ['wc'] };
    export const useWorkCandidateProcedures = () => ({ data: PR, isLoading: false, error: null });`,
  '**/src/hooks/useDutySeats.ts*': `
    export const useDutySeats = () => ({ isLoading: false, data: [{ id: 's1', academic_year: 2026, name: '시험 자리', holders: [
      { id: 'h', seat_id: 's1', resource_id: 'p0', holder_name: ${JSON.stringify(roster[0].name)}, role: null, start_date: null, end_date: null, note: null }] }] });`,
  '**/src/hooks/useDepartments.ts*': `
    export const useDepartments = () => ({ departments: ['교무기획부', '교육과정부', '행정실'], departmentObjects: [] });`,
  '**/node_modules/.vite/deps/react-router-dom.js*': `export const useNavigate = () => () => {};`,
  '**/scripts/mobile-modal-test/main.tsx*': `
    import React from '${react}';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import {QueryClient,QueryClientProvider} from '${query}';
    import '/src/index.css';
    import {CandidateWorkDialog} from '/src/components/tasks/CandidateWorkDialog.tsx';
    const C = ${JSON.stringify(candidate)};
    ReactDOM.createRoot(document.getElementById('root')).render(
      React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},
        React.createElement(CandidateWorkDialog,{open:true,onOpenChange:()=>{},candidate:C,existing:{workId:'w',workName:'이미 만든 업무'}})));`,
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const viewport of [{ width: 390, height: 844, tag: 'phone' }, { width: 1280, height: 900, tag: 'desktop' }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const writes = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('requestfailed', (r) => { if (!/rest\/v1|auth\/v1/.test(r.url())) errors.push(`요청 실패 ${r.url()}`); });
    await page.route('**/auth/v1/**', (route) => route.abort());
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() !== 'GET') { writes.push(route.request().url()); return route.abort(); }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(/\/resource\b/.test(route.request().url()) ? roster : []) });
    });
    for (const [glob, src] of Object.entries(stubs)) {
      const body = src.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
      await page.route(glob, (route) => route.fulfill({ contentType: 'application/javascript', body }));
    }

    await page.goto(BASE);
    const dialog = page.locator('[data-slot="dialog-content"]').first();
    await dialog.waitFor({ state: 'visible' }).catch((e) => { console.log(errors); throw e; });
    await page.locator('text=할 일 초안의 바탕').first().waitFor().catch(async (e) => {
      await page.screenshot({ path: join(OUT, `${viewport.tag}-stuck.png`) });
      console.log(errors, (await dialog.innerText()).slice(0, 400));
      throw e;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `${viewport.tag}-top.png`) });
    await page.locator('text=/^할 일 \\d+개/').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `${viewport.tag}-tasks.png`) });

    const metrics = await page.evaluate(() => {
      const el = document.querySelector('[data-slot="dialog-content"]');
      const box = el.getBoundingClientRect();
      const overflowing = [...el.querySelectorAll('*')].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
      }).map((n) => `${n.tagName}.${String(n.className).slice(0, 40)}`);
      const create = [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('업무 만들기'));
      return {
        pageScrollX: document.documentElement.scrollWidth > window.innerWidth,
        overflowing: overflowing.slice(0, 5),
        taskRows: el.querySelectorAll('ol > li').length,
        dueFilled: [...el.querySelectorAll('input[type="date"]')].filter((i) => i.value).length,
        duplicateWarning: el.textContent?.includes('이미 만든 업무') ?? false,
        createLabel: create?.textContent ?? null,
        createEnabled: create ? !create.disabled : false,
      };
    });
    results.push({ viewport: viewport.tag, errors, writes, ...metrics });
    await context.close();
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  const ok = r.errors.length === 0 && r.writes.length === 0 && !r.pageScrollX && r.overflowing.length === 0
    && r.taskRows >= 2 && r.dueFilled >= 1 && r.duplicateWarning && r.createEnabled;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${r.viewport} — 할 일 ${r.taskRows} · 기한 채움 ${r.dueFilled} · 중복 경고 ${r.duplicateWarning} · [${r.createLabel}] ${r.createEnabled ? '활성' : '비활성'}`
    + `${r.pageScrollX ? ' · 페이지 가로 넘침' : ''}${r.overflowing.length ? ` · 모달 밖 ${r.overflowing.join(', ')}` : ''}`
    + `${r.writes.length ? ` · 쓰기 시도 ${r.writes.length}` : ''}${r.errors.length ? ` · 오류 ${r.errors.join(' | ')}` : ''}`);
}
console.log(`업무 「${name}」(절차 ${stepsOf(entries)}단계) → ${OUT}`);
process.exit(failed ? 1 : 0);
