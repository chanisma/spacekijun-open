/**
 * 지망 비교표 **인쇄** 회귀 테스트.
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/admission-wishlist-test/render-print.mts
 *
 * 인쇄는 **조용히 실패한다** — 화면은 멀쩡한데 종이만 비거나 읽을 수 없게 나오고,
 * 그걸 알아차리는 건 상담 직전에 출력해 본 사람뿐이다. 그래서 두 가지를 함께 본다:
 *
 *  1) **범위 좁히기 로직**: 조상 사슬을 어디까지 훑어 무엇을 감추는지 + **되돌리기**
 *     (표시가 남으면 화면에서 앱의 나머지가 통째로 사라진다).
 *  2) **CSS ↔ JSX 정합(정적)**: 속성 이름이 한쪽만 바뀌면 범위가 안 좁혀지거나 빈 종이가
 *     된다. 그리고 **`position: absolute` 가 되살아나는 것**을 막는다 — 사용자 실사용 PDF 에서
 *     ①종이 위쪽이 비고 ②2쪽이 통째로 백지가 된 원인이다(절대 위치 상자는 페이지 경계에서
 *     조각나지 않는다).
 *  3) **마크업(SSR)**: 머리글의 대학명·`<colgroup>`·영역 띠 표시처럼 "있어야 종이가
 *     읽히는" 요소들. 값 테스트로는 잡히지 않는다.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WishlistItem } from '../../src/features/admission-wishlist/types';

// supabase 클라이언트가 모듈 최상단에서 localStorage 를 읽는다 (동적 import 전에 세운다)
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const { ComparisonTable } = await import('../../src/features/admission-wishlist/components/ComparisonTable');
const { MAX_APPLY_SLOTS } = await import('../../src/features/admission-wishlist/types');
const { markPrintScope, clearPrintScope, PRINT_HIDE_ATTR, PRINT_THROUGH_ATTR } =
  await import('../../src/features/admission-wishlist/utils/printScope');

let pass = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}  ${detail}`); }
};

/* ═════════ 1) 인쇄 범위 좁히기 (순수 로직) ═════════ */
console.log('── 1) 인쇄 범위 마킹 ──');
{
  // 최소 가짜 DOM — `markPrintScope` 는 parentElement/children/setAttribute 만 쓴다.
  // 진짜 브라우저 없이도 **조상 사슬을 어디까지 훑는지**를 못 박을 수 있다.
  type N = {
    name: string; parentElement: N | null; children: N[];
    attrs: Record<string, string>;
    setAttribute(k: string, v: string): void;
    removeAttribute(k: string): void;
    ownerDocument?: { body: N };
  };
  const mk = (name: string): N => ({
    name, parentElement: null, children: [], attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
  });
  const add = (parent: N, ...kids: N[]) => {
    for (const k of kids) { k.parentElement = parent; parent.children.push(k); }
  };

  // 실제 앱 셸 모양: body > [sidebar, root, toast] / root > shell > [header, main] / main > view > [h, list, TABLE]
  const body = mk('body');
  const sidebar = mk('sidebar'); const root = mk('root'); const toast = mk('toast');
  const shell = mk('shell'); const header = mk('header'); const main = mk('main');
  const view = mk('view'); const viewHead = mk('viewHead'); const list = mk('list'); const table = mk('TABLE');
  add(body, sidebar, root, toast);
  add(root, shell);
  add(shell, header, main);
  add(main, view);
  add(view, viewHead, list, table);
  for (const n of [body, sidebar, root, toast, shell, header, main, view, viewHead, list, table]) {
    n.ownerDocument = { body };
  }

  const marked = markPrintScope(table as never);
  const hidden = (n: N) => PRINT_HIDE_ATTR in n.attrs;
  const through = (n: N) => PRINT_THROUGH_ATTR in n.attrs;

  check('대상은 아무 표시도 받지 않는다', !hidden(table) && !through(table));
  check('같은 층 형제를 감춘다', hidden(viewHead) && hidden(list));
  check('위층 형제도 감춘다 (헤더)', hidden(header));
  check('body 층 형제도 감춘다 (사이드바·토스트)', hidden(sidebar) && hidden(toast));
  check('조상은 감추지 않고 제약만 푼다', through(view) && through(main) && through(shell) && through(root));
  check('조상은 hide 표시를 받지 않는다', ![view, main, shell, root].some(hidden));
  check('body 자신은 건드리지 않는다', !hidden(body) && !through(body));

  clearPrintScope(marked);
  check('되돌리면 표시가 남지 않는다',
    ![sidebar, root, toast, shell, header, main, view, viewHead, list, table].some((n) => hidden(n) || through(n)));
  check('되돌리기는 두 번 불러도 안전', (() => { clearPrintScope(marked); return true; })());
  check('대상이 없으면 아무것도 안 한다', markPrintScope(null).length === 0);
}

/* ═════════ 1-2) CSS ↔ JSX 정합 (정적) ═════════ */
console.log('\n── 1-2) 인쇄 CSS ↔ 마크업 정합 ──');
{
  const css = readFileSync('src/index.css', 'utf-8');
  const table = readFileSync('src/features/admission-wishlist/components/ComparisonTable.tsx', 'utf-8');
  const view = readFileSync('src/features/admission-wishlist/components/WishlistView.tsx', 'utf-8');
  // **주석을 걷어내고 본다** — 아래 "쓰지 않는다" 주석 자체에 `position: absolute` 라는
  // 글자가 들어 있어, 그대로 검사하면 규칙이 없는데도 있다고 나온다(실제로 걸렸다).
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const printBlock = cssCode.slice(cssCode.indexOf('body.printing-area'));

  check('CSS 가 body.printing-area 를 쓴다', css.includes('body.printing-area'));
  check('컴포넌트는 printOnly 를 쓴다 (사본 금지)', table.includes('printOnly(printRootRef.current)'));
  check('인쇄 루트에 ref 가 달려 있다', /ref=\{printRootRef\}[^>]*comparison-print-area|comparison-print-area[^>]*ref=\{printRootRef\}/.test(table)
    || (table.includes('ref={printRootRef}') && table.includes('comparison-print-area')));

  // ★ 이 짝이 어긋나면 인쇄가 통째로 깨진다 (범위가 안 좁혀지거나 빈 종이)
  check('CSS 가 data-print-hide 를 안다', css.includes('[data-print-hide]'));
  check('CSS 가 data-print-through 를 안다', css.includes('[data-print-through]'));
  check('속성 이름이 모듈 상수와 같다', PRINT_HIDE_ATTR === 'data-print-hide' && PRINT_THROUGH_ATTR === 'data-print-through');

  // ★★ 되돌아오면 안 되는 것 — 사용자 실사용 PDF 에서 잘림·상단 공백을 만들었다
  check('인쇄 루트에 position:absolute 를 쓰지 않는다',
    !/comparison-print-area\s*\{[^}]*position:\s*absolute/.test(printBlock), '절대 위치는 페이지 경계에서 조각나지 않는다');
  check('visibility 로 감추지 않는다 (자리가 남아 위가 빈다)',
    !printBlock.includes('visibility: hidden'), printBlock.slice(0, 200));

  check('옛 wishlist-print-area 가 남아 있지 않다',
    !css.includes('wishlist-print-area') && !table.includes('wishlist-print-area') && !view.includes('wishlist-print-area'));

  for (const c of ['print-col-label', 'print-col-sub']) {
    check(`CSS 와 마크업이 col.${c} 를 함께 안다`, css.includes(`col.${c}`) && table.includes(c));
  }
  check('CSS 와 마크업이 tr.section-band 를 함께 안다',
    css.includes('tr.section-band') && table.includes('className="section-band"'));
  check('머리글을 페이지마다 반복한다', css.includes('display: table-header-group'));
  check('영역 띠가 페이지 끝에 홀로 남지 않는다', css.includes('break-after: avoid'));
  check('영역 띠를 배경 아닌 선으로도 구분한다', /tr\.section-band td \{[^}]*border-top/.test(css));
  check('A4 가로', /@page \{[^}]*A4 landscape/.test(css));
  check('textarea 도 테두리를 지운다(메모 칸)', /comparison-print-area textarea/.test(css));
}

/* ═════════ 2) 마크업 (SSR) ═════════ */
console.log('\n── 2) 인쇄 마크업 ──');

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

function render(items: WishlistItem[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(
    h(QueryClientProvider, { client: qc },
      h(ComparisonTable as never, {
        studentCode: '00-00232',
        items,
        ctx: { naesin: null, subjects: null, mock: null, mockRounds: [] },
        canEdit: false,
        studentLabel: '김기전',
      })),
  );
}

{
  const html = render([
    item({ id: 'w1', university: '전북대', department: '간호학과', admissionName: '학생부교과' }),
    item({ id: 'w2', university: '원광대', department: '의예과', sortOrder: 1 }),
  ]);

  check('인쇄 루트 클래스가 붙는다', html.includes('comparison-print-area'), html.slice(0, 200));
  check('인쇄 루트는 하나뿐', (html.match(/comparison-print-area/g) ?? []).length === 1);

  // colgroup — 라벨 2열 + 지망 열
  check('colgroup 이 있다', html.includes('<colgroup>'));
  check('라벨 열 col', html.includes('class="print-col-label"'));
  check('세부 열 col', html.includes('class="print-col-sub"'));
  const colCount = (html.match(/<col[ /]/g) ?? []).length;
  check(`col 수 = 2 + 지망 ${MAX_APPLY_SLOTS} = ${2 + MAX_APPLY_SLOTS}`, colCount === 2 + MAX_APPLY_SLOTS, String(colCount));

  // ★ 머리글의 대학명 — 2페이지에서 어느 열이 어느 대학인지 알려 주는 유일한 수단
  const thead = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
  check('머리글에 대학·학과가 있다', thead.includes('전북대 · 간호학과') && thead.includes('원광대 · 의예과'), thead.slice(0, 400));
  check('머리글의 대학명은 화면에서 숨긴다(본문 대학 행과 중복)', /class="hidden print:block[^"]*"/.test(thead));
  check('빈 지망도 열로 남고 비었음을 말한다', thead.includes('(비어 있음)'));
  check('지망 번호는 화면에도 보인다', thead.includes('1지망') && thead.includes('6지망'));

  // 영역 띠 — 44줄을 축별로 가르는 유일한 표시.
  // **6개가 맞다**: 변경사항 자료가 없으면 `buildComparisonRows` 가 그 영역의 행을
  // 아예 만들지 않아 띠도 생기지 않는다(빈 영역을 남기지 않는 의도된 동작).
  const bands = (html.match(/class="section-band"/g) ?? []).length;
  check('영역 띠 6개 (변경사항 자료 없음 → 그 영역 없음)', bands === 6, String(bands));

  // 인쇄 머리글: 누구 것인지 · 언제 뽑았는지
  check('학생 이름을 인쇄물에 적는다', html.includes('김기전'));
  check('출력일을 함께 적는다', /\d{4}년 \d{1,2}월 \d{1,2}일 출력/.test(html), html.slice(html.indexOf('출력') - 60, html.indexOf('출력') + 10));
  check('그 머리글은 화면에서 숨긴다', /hidden print:inline[^"]*"[^>]*>[^<]*출력/.test(html) || html.includes('hidden print:inline'));

  // 조작 요소는 종이에 없다
  check('버튼 묶음에 print:hidden', html.includes('print:hidden'));
}

console.log('\n── 3) 6회 초과 (7지망) ──');
{
  const many = Array.from({ length: 7 }, (_, i) =>
    item({ id: `w${i}`, university: `대학${i}`, sortOrder: i }));
  const html = render(many);
  const thead = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
  // 화면은 앰버 배경으로 구분하지만 **브라우저는 배경을 기본으로 인쇄하지 않는다**
  check('초과 열을 글자로도 표시한다', thead.includes('6회 초과'), thead.slice(-500));
  check('초과 표시는 화면에서 숨긴다(배경이 이미 말한다)', /hidden print:inline[^"]*">· 6회 초과/.test(thead));
  check('7지망까지 열이 늘어난다', thead.includes('7지망'));
  const colCount = (html.match(/<col[ /]/g) ?? []).length;
  check('col 수도 함께 늘어난다 (2 + 7)', colCount === 9, String(colCount));
}

console.log(`\n${failures.length === 0 ? '✅' : '❌'} pass ${pass} / fail ${failures.length}`);
if (failures.length > 0) for (const f of failures) console.log(`   · ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
