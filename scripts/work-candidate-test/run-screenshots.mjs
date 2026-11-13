// 업무 후보 서랍 스크린샷 — 2026-09-28 (재검토 반영 목록 · 담당 · 근거 문서).
//
// 실제 `WorkCandidateDialog` 를 **그대로** 띄우고, 후보·근거는 시드 원본(source-2026.json)의
// 진짜 행으로 채운다. 담당 패널과 근거 목록은 펼쳐야 보이고, 긴 업무 이름·사람 이름이 휴대폰
// 폭을 밀어내는지는 그림으로만 드러난다(정적 검사는 통과한다).
//
// 실행 (개발 서버를 먼저 켠다):
//   $env:PLAYWRIGHT_MODULE = "C:\path\to\playwright\index.mjs"   # node_modules 에 없을 때만
//   $env:MODAL_TEST_URL = "http://localhost:8081"                # 기본 8080
//   node scripts/work-candidate-test/run-screenshots.mjs
//
// 결과 png = .tmp/work-candidate-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'work-candidate-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
// 해시는 서버가 실제로 변환한 모듈에서 읽는다 — 새 의존성이 메모리에서만 다시 최적화되면 디스크 값이 낡아 React 가 두 벌 뜬다
const transformed = await (await fetch(`${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/src/components/tasks/WorkCandidateDialog.tsx`)).text();
const browserHash = /\/node_modules\/\.vite\/deps\/react\.js\?v=([0-9a-f]+)/.exec(transformed)?.[1]
  ?? JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8')).browserHash;
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';

// ── 진짜 행으로 채운다 — 「분장과 다름」이 섞인 자리 하나 + 분장 자리 없는 업무 하나 ──
const source = JSON.parse(readFileSync('scripts/work-candidate-seed/source-2026.json', 'utf8'));
// 절차 검토(2026-09-29) — 있으면 싣고, **절차가 가장 긴 업무의 자리**를 띄운다
const procedures = (() => {
  try { return JSON.parse(readFileSync('scripts/work-candidate-seed/procedures-2026.json', 'utf8')).works; } catch { return {}; }
})();
const stepsOf = (name) => Math.max(0, ...(procedures[name] ?? []).filter((e) => e.kind === '절차').map((e) => e.steps.length));
const summaryOf = (name) => {
  const list = procedures[name];
  if (!list) return null;
  const n = (k) => list.filter((e) => e.kind === k).length;
  return { procedure: n('절차'), repeat: n('반복'), once: n('일회성'), reference: n('참고'), max_steps: stepsOf(name),
    related: list.reduce((a, e) => a + e.related.length, 0) };
};
const different = [...source.works].filter((w) => w.seat && w.department !== '행정실')
  .sort((a, b) => stepsOf(b.name) - stepsOf(a.name))[0];
const seat = different.seat;
const picked = [
  ...source.works.filter((w) => w.seat === seat),
  source.works.find((w) => !w.seat),
].filter(Boolean);
const rows = picked.map((w) => ({
  id: w.code, academic_year: 2026, kind: 'work', code: w.code, name: w.name, area_name: w.areaName,
  seat_id: w.seat ? 's' : null, seat_label: w.seat, department: w.department, brm: w.carried?.brm ?? null,
  work_type: w.carried?.type ?? null, scale: w.carried?.scale ?? null, load: w.carried?.load ?? null,
  months: w.months, repeat_hint: w.carried?.repeat ?? null, counts: w.counts, budget: w.carried?.budget?.total ?? null,
  note: null, created_at: '', updated_at: '',
  meta: {
    ...(w.office === 'admin' ? { office: 'admin' } : {}),
    owner: w.owner, tier_counts: w.tierCounts, first: w.first, last: w.last,
    carried_from: w.carried?.from ?? null, detail: w.carried?.detail ?? null,
    budget: w.carried?.budget ?? null, budget_notices: w.carried?.budgetNotices ?? [], supports: w.carried?.supports ?? [],
    procedure_summary: summaryOf(w.name),
  },
}));
const evidence = Object.fromEntries(picked.map((w) => [w.code, w.evidence]));
const procByCode = Object.fromEntries(picked.map((w) => [w.code, procedures[w.name] ?? []]));
const noSeat = picked.find((w) => !w.seat);

const HOOK_STUB = `
  const EV = ${JSON.stringify(evidence)};
  const idle = { mutateAsync: async () => {}, isPending: false };
  export const workCandidateKeys = { all: ['wc'] };
  export const useWorkCandidates = () => ({ data: [], error: null });
  export const useWorkCandidateEvidence = (id) => ({ data: EV[id] ?? [], isLoading: false, error: null });
  const PR = ${JSON.stringify(procByCode)};
  export const useWorkCandidateProcedures = (id) => ({ data: PR[id] ?? [], isLoading: false, error: null });
  export const useUpdateWorkCandidate = () => idle;
  export const useCreateWorkCandidate = () => idle;
  export const useDeleteWorkCandidate = () => idle;
`;
const MOUNT = `
  import {WorkCandidateDialog} from '/src/components/tasks/WorkCandidateDialog.tsx';
  const ROWS = ${JSON.stringify(rows)};
  export const Case = () => React.createElement(WorkCandidateDialog, {
    open: true, onOpenChange: () => {}, rowLabel: ${JSON.stringify(seat)}, candidates: ROWS,
    academicYear: 2026, seatId: null, department: null,
  });
`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const viewport of [{ width: 390, height: 844, tag: 'phone' }, { width: 1280, height: 900, tag: 'desktop' }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/rest/v1/**', (route) => route.abort());
    await page.route('**/auth/v1/**', (route) => route.abort());
    const mocks = {
      '**/src/hooks/useWorkCandidates.ts*': HOOK_STUB,
      // 서랍이 «업무로 만듦»을 눌렀을 때 이동한다(2026-10-05) — 라우터 없이 띄우므로 막아 둔다
      '**/node_modules/.vite/deps/react-router-dom.js*': 'export const useNavigate = () => () => {};',
      '**/scripts/mobile-modal-test/main.tsx*': `
        import React from '${react}';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import {QueryClient,QueryClientProvider} from '${query}';
        import '/src/index.css';
        ${MOUNT}
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(Case)));`,
    };
    for (const [glob, src] of Object.entries(mocks)) {
      const body = src.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
      await page.route(glob, (route) => route.fulfill({ contentType: 'application/javascript', body }));
    }

    await page.goto(BASE);
    const dialog = page.locator('[data-slot="dialog-content"]').first();
    await dialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${viewport.tag}-list.png`) });

    // ⚠️ 서랍은 한 번에 한 줄만 펼친다 — 둘을 차례로 누르면 앞의 것이 접힌다. 분장 자리 없는
    //    업무를 먼저 찍고, 마지막에 「분장과 다름」 업무를 펼쳐 둔 채 검사한다.
    if (noSeat) {
      const item = page.locator('li', { hasText: noSeat.name }).first();
      await item.getByRole('button', { name: '상세 보기' }).click();
      await page.waitForTimeout(250);
      await item.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(OUT, `${viewport.tag}-no-seat.png`) });
      await item.getByRole('button', { name: '상세 접기' }).click();
    }
    const item = page.locator('li', { hasText: different.name }).first();
    await item.getByRole('button', { name: '상세 보기' }).click();
    await page.waitForTimeout(250);
    await item.locator('text=절차 — 사람별 검토').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `${viewport.tag}-procedure.png`) });
    // 첫 단계를 눌러 근거 문서를 편다
    await item.locator('ol li button').first().click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, `${viewport.tag}-procedure-step.png`) });
    // 일회성 분석 칩(2026-09-29) — 행위·부담 · 누구의 일 · 올릴 만함
    const onceChip = item.locator('text=/^부담 /').first();
    if (await onceChip.count()) {
      await onceChip.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(OUT, `${viewport.tag}-once.png`) });
    }
    await item.locator('text=담당 — 분장표와 문서').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `${viewport.tag}-expanded.png`) });

    const metrics = await page.evaluate(() => {
      const el = document.querySelector('[data-slot="dialog-content"]');
      const overflowing = [...el.querySelectorAll('*')].filter((n) => {
        const r = n.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
      }).map((n) => `${n.tagName}.${String(n.className).slice(0, 40)}`);
      return {
        pageScrollX: document.documentElement.scrollWidth > window.innerWidth,
        overflowing: overflowing.slice(0, 5),
        ownerPanels: el.querySelectorAll('p').length && [...el.querySelectorAll('p')].filter((p) => p.textContent?.startsWith('담당 — 분장표와 문서')).length,
        procedurePanels: [...el.querySelectorAll('p')].filter((p) => p.textContent?.startsWith('절차 — 사람별 검토')).length,
        procedureChips: [...el.querySelectorAll('span')].filter((s) => /^절차 \d+단계$/.test(s.textContent ?? '')).length,
        onceChips: [...el.querySelectorAll('span')].filter((s) => /^부담 /.test(s.textContent ?? '')).length,
        evidenceHeads: [...el.querySelectorAll('p')].filter((p) => p.textContent?.startsWith('근거 문서')).map((p) => p.textContent),
        maskedTitles: [...el.querySelectorAll('span')].filter((s) => s.textContent === '(제목 가림)').length,
      };
    });
    results.push({ viewport: viewport.tag, errors, ...metrics });
    await context.close();
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  const ok = r.errors.length === 0 && !r.pageScrollX && r.overflowing.length === 0 && r.ownerPanels >= 1
    && r.evidenceHeads.length >= 1 && r.procedurePanels >= 1 && r.procedureChips >= 1;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${r.viewport} — 일회성 분석 칩 ${r.onceChips} · 절차 패널 ${r.procedurePanels} · 절차 칩 ${r.procedureChips} · 담당 패널 ${r.ownerPanels} · ${r.evidenceHeads.join(' / ')} · 제목 가림 ${r.maskedTitles}`
    + `${r.pageScrollX ? ' · 페이지 가로 넘침' : ''}${r.overflowing.length ? ` · 모달 밖으로 나간 요소 ${r.overflowing.join(', ')}` : ''}`
    + `${r.errors.length ? ` · 오류 ${r.errors.join(' | ')}` : ''}`);
}
console.log(`자리 「${seat}」 · 펼친 업무 「${different.name}」${noSeat ? ` · 「${noSeat.name}」(분장 자리 없음)` : ''} → ${OUT}`);
process.exit(failed ? 1 : 0);
