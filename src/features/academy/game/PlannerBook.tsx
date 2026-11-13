import type { ReactNode } from 'react';
import { usePlannerTheme } from './plannerTheme';

/**
 * 별빛 플래너 — 책 껍데기 (2026-10-03 오버홀).
 *
 * 종전 기숙사 플래너는 «달력 | 리아 | 기록» 세 칸이 고정이고 아래 단추 줄이 메뉴였다. 이제 화면 전체가 책상 위에
 * 펼친 한 권의 책이다: 가죽 표지 · 두 쪽 종이 · 가운데 접힘 · 오른쪽 가장자리의 **리본 책갈피 = 메뉴**.
 * 리아는 책 옆에서 지금 상황을 한마디로 말해 준다(넓은 화면에서만 — 좁으면 책이 우선).
 * 그림은 이미지가 아니라 CSS — 칸과 그림이 화면 폭과 무관하게 늘 맞는다(이미지 위에 칸을 맞추면 폭마다 어긋난다).
 */
export interface BookRibbon { id: string; label: string; icon: string; pressed?: boolean; disabled?: boolean; onClick: () => void }

/**
 * 책장 넘김 — 넘기기 «직전»의 쪽을 그대로 본뜬 한 장을 가운데 접힘을 축으로 180° 돌린다.
 * React 는 새 쪽을 곧바로 그리므로, 그 위를 옛 쪽의 사본이 덮고 있다가 넘어가며 새 쪽을 드러낸다.
 * 사본은 그 순간의 HTML(같은 CSS 모듈 클래스라 모양이 같다)이고 누를 수 없다.
 */
export interface PageTurn { id: number; dir: 'next' | 'prev'; html: string }
/** 지금 펼쳐진 쪽의 HTML 을 떠 둔다 — 상태를 바꾸기 «전에» 불러야 한다. */
export function snapshotPage(dir: 'next' | 'prev'): PageTurn | null {
  const page = document.querySelector<HTMLElement>(`[data-book-page="${dir === 'next' ? 'right' : 'left'}"]`);
  if (!page) return null;
  return { id: Date.now(), dir, html: page.innerHTML };
}

/** 코인 지갑·«+N ✦» 는 2026-10-03 사용자 결정으로 뺐다 — 플래너는 플래너로(보상은 서버에서 그대로 쌓인다). */
export function PlannerBook({ ribbons, children, riaImage, riaLine, turn, onTurnEnd }: {
  ribbons: BookRibbon[]; children: ReactNode;
  riaImage?: string; riaLine?: ReactNode;
  turn?: PageTurn | null; onTurnEnd?: () => void;
}) {
  const { css } = usePlannerTheme();
  return <div className={css.desk}>
    {riaImage && <aside className={css.ria} aria-label="리아의 한마디">
      <img src={riaImage} alt="" />
      {riaLine && <p className={css.bubble}>{riaLine}</p>}
    </aside>}
    {/* data-book — 기숙사 전역 `.scene button` 규칙이 책 안 단추에 닿지 않게 하는 표식(dormitory.module.css). */}
    <div className={css.book} data-book>
      <div className={css.spread}>{children}
        {turn && <div key={turn.id} className={css.leaf} data-dir={turn.dir} onAnimationEnd={e => { if (e.target === e.currentTarget) onTurnEnd?.(); }} aria-hidden="true">
          <div className={`${css.leafFace} ${css.page} ${turn.dir === 'next' ? css.right : css.left}`} dangerouslySetInnerHTML={{ __html: turn.html }} />
          <div className={`${css.leafFace} ${css.leafBack}`} />
        </div>}
      </div>
      <nav className={css.ribbons} aria-label="플래너 메뉴">
        {ribbons.map(r => <button key={r.id} type="button" aria-pressed={!!r.pressed} disabled={r.disabled} data-ribbon={r.id} onClick={r.onClick}>
          <span aria-hidden="true">{r.icon}</span>{r.label}
        </button>)}
      </nav>
    </div>
  </div>;
}

/** 책의 한 쪽 — 하루·목표 쪽처럼 펼침면 컴포넌트가 따로 없는 화면이 쓴다. */
export function BookPage({ side, label, children }: { side: 'left' | 'right'; label: string; children: ReactNode }) {
  const { css } = usePlannerTheme();
  return <section className={`${css.page} ${side === 'left' ? css.left : css.right}`} data-book-page={side} aria-label={label}>{children}</section>;
}
/** 두 쪽을 담는 펼침면 — 한 주 펼침면(BookWeek)은 자기 것을 쓰고, 하루·목표 쪽은 이것으로 감싼다. */
export function BookSpread({ children }: { children: ReactNode }) {
  const { css } = usePlannerTheme();
  return <div className={`${css.spreadInner} ${css.weekSpread}`}>{children}</div>;
}
