/**
 * 지망 비교표 인쇄 **미리보기 HTML** 생성 (개발 보조 + PDF 검증용 원본).
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/admission-wishlist-test/print-preview.mts [출력경로]
 *   (먼저 `npm run build` — Tailwind CSS 는 빌드 때 생성된다)
 *
 * 브라우저로 열어 Ctrl+P 하면 **실제 앱과 같은 인쇄 결과**가 나온다.
 *
 * ⚠️ **앱 셸(조상 사슬)을 반드시 재현한다.** 처음 만든 하니스는 표만 상자에 넣어 그렸는데,
 * 그래서 실사용에서 종이가 잘리고 위가 비는 버그를 **하나도 못 잡았다** — 그 두 증상은
 * `position: absolute` 의 기준이 되는 **위치 지정 조상**과 페이지 조각내기에서 나오므로,
 * 조상이 없으면 재현되지 않는다. 여기서는 사이드바·헤더·스크롤 컨테이너·`max-w` 래퍼·
 * 표 위의 긴 목록을 실제 앱과 같은 모양으로 두른다.
 *
 * 인쇄 범위를 좁히는 코드는 **실제 모듈(`utils/printScope.ts`)을 직렬화해 주입**한다.
 * 하니스가 자기 사본을 들면 정작 화면에서만 깨지는 버그를 놓친다.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WishlistItem } from '../../src/features/admission-wishlist/types';

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: () => null, length: 0,
};

const { ComparisonTable } = await import('../../src/features/admission-wishlist/components/ComparisonTable');
const { markPrintScope, PRINT_HIDE_ATTR, PRINT_THROUGH_ATTR } =
  await import('../../src/features/admission-wishlist/utils/printScope');

const out = process.argv[2] ?? 'print-preview.html';

/** 빌드된 Tailwind CSS (가장 큰 것 = 앱 본체) */
function builtCss(): string {
  const dir = 'dist/assets';
  const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
  if (files.length === 0) throw new Error('dist/assets 에 CSS 가 없습니다 — 먼저 `npm run build`');
  return files
    .map((f) => readFileSync(`${dir}/${f}`, 'utf-8'))
    .sort((a, b) => b.length - a.length)[0];
}

const item = (over: Partial<WishlistItem> & { id: string }): WishlistItem => ({
  studentCode: '00-00232', track: 'gyogwa',
  university: '테스트대', department: '테스트학과', admissionName: '교과전형',
  memo: null, sortOrder: 0, tier: 'apply',
  convertedScore: null, interviewDate: null, firstAnnounceDate: null, finalAnnounceDate: null,
  csatCheck6: null, csatCheck9: null,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  gyogwa: null, jonghap: null, adiga: null,
  ...over,
});

// 실사용에 가까운 6지망 — 긴 학과명·긴 전형명으로 줄바꿈을 재현한다
// (사용자 PDF 의 실제 조합을 본떴다: 학과명이 두 줄로 접히는 열이 섞여 있어야 한다)
const items: WishlistItem[] = [
  item({ id: 'w1', university: '협성대', department: '건축공학과', admissionName: '학생부교과(미래역량우수자)' }),
  item({ id: 'w2', university: '한경국립대', department: '건축공학전공', admissionName: '학생부교과(일반전형)', sortOrder: 1 }),
  item({ id: 'w3', university: '동덕여대', department: '앙트러프러너리얼리더십학부 문화예술경영전공', admissionName: '학생부교과우수자전형', sortOrder: 2 }),
  item({ id: 'w4', university: '한세대', department: '디자인학부', admissionName: '학생부 교과우수자', sortOrder: 3 }),
  item({ id: 'w5', university: '인천대', department: '디자인학부', admissionName: '학생부교과(교과성적우수자전형)', sortOrder: 4 }),
  item({ id: 'w6', university: '가천대', department: '패션산업학과', admissionName: '학생부종합(가천바람개비)', track: 'jonghap', sortOrder: 5 }),
];

// `--tall` 이면 메모를 길게 넣어 **표가 여러 장에 걸치게** 한다.
// 사용자 신고("내용이 많아서 페이지가 넘어가는데 잘려서 나옴")가 이 상황이라
// 머리글 반복·잘림 없음을 이 모드로 확인한다.
if (process.argv.includes('--tall')) {
  for (const [i, it] of items.entries()) {
    it.memo = Array.from({ length: 12 }, (_, n) =>
      `${i + 1}지망 상담 메모 ${n + 1}행 — 면접 준비 항목과 서류 준비 일정을 적어 둔 긴 메모입니다.`)
      .join('\n');
  }
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
const table = renderToStaticMarkup(
  h(QueryClientProvider, { client: qc },
    h(ComparisonTable as never, {
      studentCode: '00-00232', items,
      ctx: { naesin: null, subjects: null, mock: null, mockRounds: [] },
      canEdit: false, studentLabel: '한수아 (3-2 #3)',
    })),
);

// 표 위에 오는 긴 목록 — 절대 위치였다면 이 높이만큼 종이 위가 비었다
const fakeList = Array.from({ length: 8 }, (_, i) =>
  `<li class="rounded-xl border border-slate-200 bg-white p-4 mb-2">지원희망 ${i + 1} — 목록 항목(인쇄 대상 아님)</li>`).join('');

const html = `<!doctype html>
<meta charset="utf-8">
<title>지망 비교표 인쇄 미리보기</title>
<style>${builtCss()}</style>
<body>
  <!-- ── 앱 셸 재현: 이 조상들이 있어야 인쇄 버그가 재현된다 ── -->
  <aside class="fixed left-0 top-0 h-screen w-56 bg-slate-100 border-r">사이드바(인쇄 대상 아님)</aside>
  <div id="root">
    <div class="min-h-screen relative bg-slate-50">
      <header class="sticky top-0 h-14 bg-white border-b flex items-center px-4">앱 헤더(인쇄 대상 아님)</header>
      <main class="p-4 sm:p-6 overflow-y-auto" style="height: calc(100vh - 3.5rem)">
        <div class="w-full max-w-[1600px] mx-auto p-4 sm:p-6 space-y-5">
          <div class="flex items-center justify-between"><h1 class="text-lg font-bold">수시 지원 관리 · 한수아</h1></div>
          <ul>${fakeList}</ul>
          ${table}
        </div>
      </main>
    </div>
  </div>
  <div id="toast-portal" class="fixed bottom-4 right-4">토스트(인쇄 대상 아님)</div>

<script>
  // 실제 모듈을 직렬화해 주입한다 — 하니스 사본을 만들면 이 검증이 거짓말을 한다
  const PRINT_HIDE_ATTR = ${JSON.stringify(PRINT_HIDE_ATTR)};
  const PRINT_THROUGH_ATTR = ${JSON.stringify(PRINT_THROUGH_ATTR)};
  const markPrintScope = ${markPrintScope.toString()};

  // 인쇄 상태를 미리 걸어 둔다 — 그대로 Ctrl+P 하거나 page.pdf() 하면 실제 결과가 나온다
  window.__applyPrintScope = () => {
    const root = document.querySelector('.comparison-print-area');
    markPrintScope(root);
    document.body.classList.add('printing-area');
    return !!root;
  };
  window.__applyPrintScope();
</script>
</body>`;

writeFileSync(out, html, 'utf-8');
console.log(`✅ ${out}`);
console.log('   브라우저로 열고 Ctrl+P — 실제 앱과 같은 인쇄 결과가 나옵니다.');
