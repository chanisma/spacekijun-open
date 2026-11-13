// «수업 없는 날 · 학년» 필드 — 실제 Dialog 안 스크린샷 + 불변식 (2026-10-11)
//
//   $env:PLAYWRIGHT_MODULE = "C:\...\node_modules\playwright\index.mjs"
//   $env:MODAL_TEST_URL = "http://localhost:8080"      # 개발 서버를 먼저 켠다
//   node scripts/school-day-test/run-screenshots.mjs
//
// 결과 png = .tmp/no-class-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const OUT = join(process.cwd(), '.tmp', 'no-class-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';

const MAIN = `
  import React from '${react}';
  import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
  import '/src/index.css';
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '/src/components/ui/dialog.tsx';
  import { NoClassDayField } from '/src/components/schedule/NoClassDayField.tsx';
  function Case() {
    const [v, setV] = React.useState({ enabled: true, grades: [2] });
    return React.createElement(Dialog, { open: true }, React.createElement(DialogContent, { className: 'max-w-lg' },
      React.createElement(DialogHeader, null, React.createElement(DialogTitle, null, '새 일정 추가')),
      React.createElement('div', { className: 'p-4' },
        React.createElement(NoClassDayField, { value: v, onChange: setV }),
        React.createElement('pre', { id: 'state' }, JSON.stringify(v)))));
  }
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Case));`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let failed = 0;
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/rest/v1/**', (r) => r.abort());
    await page.route('**/scripts/mobile-modal-test/main.tsx*', (r) => r.fulfill({
      contentType: 'application/javascript',
      body: MAIN.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`),
    }));
    const problems = [];
    await page.goto(BASE);
    await page.locator('[data-slot="dialog-content"]').waitFor();
    const state = async () => JSON.parse(await page.locator('#state').innerText());
    // 1학년 추가 → [1,2], 3학년 추가 → 셋 다 = 전 학년(빈 배열)
    await page.getByRole('button', { name: '1학년' }).click();
    if (JSON.stringify((await state()).grades) !== '[1,2]') problems.push(`1학년 추가 실패 ${JSON.stringify(await state())}`);
    await page.getByRole('button', { name: '3학년' }).click();
    if ((await state()).grades.length !== 0) problems.push('셋 다 고르면 전 학년으로 접히지 않았다');
    await page.getByRole('button', { name: '2학년' }).click();
    const m = await page.evaluate(() => {
      const el = document.querySelector('[data-slot="dialog-content"]');
      const buttons = [...el.querySelectorAll('[role="group"] button')];
      return {
        overflowsX: el.scrollWidth > el.clientWidth + 1,
        heights: buttons.map((b) => b.getBoundingClientRect().height),
        pressed: buttons.map((b) => b.getAttribute('aria-pressed')),
        text: el.innerText,
      };
    });
    if (m.overflowsX) problems.push('가로로 넘친다');
    if (viewport.width < 640 && m.heights.some((h) => h < 44)) problems.push(`휴대폰 버튼 높이 ${m.heights}`);
    if (!m.text.includes('2학년만 수업이 없습니다')) problems.push('학년 요약 문구 없음');
    await page.getByLabel('수업 없는 날').click();
    if ((await state()).enabled) problems.push('체크 해제가 안 된다');
    if (await page.getByRole('group', { name: '수업이 없는 학년' }).count()) problems.push('해제했는데 학년 선택이 남았다');
    await page.getByLabel('수업 없는 날').click();
    await page.screenshot({ path: join(OUT, `field-${viewport.width}.png`), animations: 'disabled' });
    for (const e of errors) problems.push(`페이지 오류 — ${e}`);
    if (problems.length) { failed += 1; console.log(`✗ ${viewport.width}\n  - ${problems.join('\n  - ')}`); }
    else console.log(`✓ ${viewport.width} 버튼 높이 ${m.heights.join('/')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`\n스크린샷: ${OUT}`);
if (failed) process.exit(1);
