/**
 * 작은 창 — CELESTAY 의 «바탕화면 한쪽에 띄워 두는 창»을 웹에서.
 *
 * 1순위 Document Picture-in-Picture(크롬·엣지 116+): 다른 창보다 늘 위에 떠 있는 작은 창에 우리 DOM 을 그린다.
 * 2순위 작은 팝업(`/star-tower?mini=1`): 늘 위는 아니지만 따로 떼어 둘 수 있다.
 *
 * ⚠️ PiP 창에는 React 포털이 아니라 «그 창의 새 root»를 만든다 — React 는 이벤트를 자기 root 의 document 에서 듣기 때문에
 *    다른 document 로 포털하면 그려지기는 하는데 버튼이 눌리지 않는다.
 * ⚠️ 스타일은 저절로 따라가지 않는다 — 본 창의 스타일시트를 복사한다(Tailwind·이 기능의 CSS·글꼴 @font-face).
 */
import { createRoot, type Root } from 'react-dom/client';

export interface MiniHandle {
  win: Window;
  root: Root;
}

interface DocumentPip {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
}

export function supportsDocumentPip(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
}

function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const el = target.document.createElement('style');
      el.textContent = css;
      target.document.head.appendChild(el);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }
}

export async function openDocumentPip(onClosed: () => void): Promise<MiniHandle | null> {
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
  if (!dpip) return null;
  const win = await dpip.requestWindow({ width: 280, height: 460 });
  copyStyles(win);
  win.document.title = '별까지 쌓기';
  win.document.body.style.margin = '0';
  win.document.body.style.background = '#07081a';
  const host = win.document.createElement('div');
  win.document.body.appendChild(host);
  const root = createRoot(host);
  win.addEventListener('pagehide', () => { root.unmount(); onClosed(); }, { once: true });
  return { win, root };
}

export function openMiniPopup(): void {
  window.open('/star-tower?mini=1', 'star-tower-mini', 'popup,width=300,height=500');
}
