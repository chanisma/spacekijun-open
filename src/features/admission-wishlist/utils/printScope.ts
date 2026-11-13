// 화면의 한 영역만 인쇄하기 — **범위를 CSS 만으로 좁힐 수 없다.**
//
// 흔한 방법은 `body * { visibility: hidden }` 으로 전부 감추고 대상만 되살린 뒤
// `position: absolute; top: 0` 으로 끌어올리는 것인데, 실사용 PDF 에서 **두 가지가 함께
// 깨진다**(2026-09-09 실측):
//   ① `top: 0` 은 페이지가 아니라 **가장 가까운 위치 지정 조상** 기준이라 종이 위쪽이
//      그 조상 높이만큼 빈다.
//   ② **절대 위치 상자는 페이지 경계에서 조각나지 않는다** — 1쪽에서 잘리고 나머지가
//      통째로 사라진다(실측 2쪽 텍스트 0자, 완전 백지).
//
// 그래서 여기서는 대상의 **조상 사슬을 훑어 형제를 `display: none` 으로 지운다**.
// 자리까지 사라지므로 대상이 **정상 흐름**으로 종이 맨 위에서 시작하고, 정상 흐름 상자는
// 브라우저가 페이지에 나눠 담는다. 짝이 되는 규칙은 `index.css` 의 `@media print` 안에 있다.
//
// DOM 만 쓰는 순수 모듈 — 화면과 인쇄 하니스가 **같은 코드**를 쓴다(하니스가 자기 사본을
// 들면 정작 화면에서만 깨지는 버그를 못 잡는다).

/** 대상 밖(형제)에 다는 표시 — `display: none` */
export const PRINT_HIDE_ATTR = 'data-print-hide';
/** 대상까지 이어지는 조상에 다는 표시 — 폭·여백·스크롤 제약 해제 */
export const PRINT_THROUGH_ATTR = 'data-print-through';

/**
 * `root` 만 남기고 나머지를 인쇄에서 지우도록 표시한다.
 * 반환값을 그대로 `clearPrintScope` 에 넘겨 **반드시 되돌려야 한다** —
 * 표시가 남으면 화면에서 앱의 나머지가 통째로 사라진다.
 */
export function markPrintScope(root: HTMLElement | null | undefined): Element[] {
  const marked: Element[] = [];
  if (!root) return marked;
  const body = root.ownerDocument?.body;
  if (!body) return marked;

  for (let el: HTMLElement | null = root; el && el !== body; el = el.parentElement) {
    const parent = el.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children)) {
      if (sib === el) continue;
      sib.setAttribute(PRINT_HIDE_ATTR, '');
      marked.push(sib);
    }
    // 대상 자신은 조상 취급하지 않는다 — 그쪽은 자기 인쇄 규칙을 갖는다
    if (el !== root) {
      el.setAttribute(PRINT_THROUGH_ATTR, '');
      marked.push(el);
    }
  }
  return marked;
}

/** `markPrintScope` 가 단 표시를 전부 제거한다 (두 번 불러도 안전) */
export function clearPrintScope(marked: Element[]): void {
  for (const el of marked) {
    el.removeAttribute(PRINT_HIDE_ATTR);
    el.removeAttribute(PRINT_THROUGH_ATTR);
  }
  marked.length = 0;
}

/**
 * 한 영역만 인쇄한다.
 *
 * 되돌리기를 `afterprint` **와** 타이머 양쪽에 건다 — `afterprint` 를 주지 않는 브라우저가
 * 있는데, 표시가 남으면 화면이 깨진 채로 남기 때문이다. 두 번 불려도 한 번만 실행된다.
 */
export function printOnly(root: HTMLElement | null | undefined, bodyClass = 'printing-area'): void {
  const marked = markPrintScope(root);
  const doc = root?.ownerDocument ?? document;
  const win = doc.defaultView ?? window;

  doc.body.classList.add(bodyClass);
  let restored = false;
  const done = () => {
    if (restored) return;
    restored = true;
    doc.body.classList.remove(bodyClass);
    clearPrintScope(marked);
    win.removeEventListener('afterprint', done);
  };
  win.addEventListener('afterprint', done);
  win.print();
  win.setTimeout(done, 1000);
}
