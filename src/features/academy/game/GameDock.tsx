import { useEffect, useState, type CSSProperties } from 'react';
import styles from './dock.module.css';

/**
 * 왼쪽 아래 «핵심 기능» 서랍 (2026-10-03 사용자 요청 · 2026-10-04 아스트롤라베 서랍으로 개편).
 *
 * 여정과 소지품 메뉴에 섞여 있던 기능 바로가기(완성한 별자리·세린의 서가·지도…)를 모은다. 각 기능은
 * **그 기능을 배우는 장(章)을 마쳐야** 열리고, 잠긴 칸은 자물쇠와 «제N장을 마치면 열려요»를 보여 준다.
 * 잠긴 칸은 `disabled` 가 아니라 `aria-disabled` 다: 눌러서 «언제 열리는지»를 들을 수 있어야 한다.
 *
 * 데스크톱·휴대폰 모두 서랍이다(2026-10-04 «데스크톱에서도 서랍식으로») — 메달을 누르면 칸들이 사분원 궤도로
 * 펼쳐지고 다시 누르면 메달 속으로 접힌다. 펼침 여부는 기억한다(처음은 펼침 — 무엇이 있는지 보여야 한다).
 * 궤도는 안쪽부터 칸 2·3·4… 개 — 안쪽 궤도는 둘레가 짧아 칸이 많으면 이름이 겹친다. 자리 계산은 CSS(`dock.module.css`).
 */
/** `badge` — 기다리는 일의 수(예: 받은 친구 요청). 0 이면 그리지 않는다. 서랍을 접어도 메달에 합계가 남는다. */
export interface DockItem { id: string; icon: string; label: string; unlocked: boolean; unlockChapter: number; badge?: number; onOpen: () => void }

const OPEN_KEY = 'academy-dock-open:v1';
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== 'false'; } catch { return true; } };

/** i 번째 칸의 궤도(0부터)와 궤도 안 위치(0~1). 궤도 k 에는 k+2 칸. */
export function orbitSlot(i: number, total: number) {
  let ring = 0; let start = 0;
  while (i >= start + ring + 2) { start += ring + 2; ring += 1; }
  const size = Math.min(ring + 2, total - start);
  return { ring, t: size <= 1 ? 0.5 : (i - start) / (size - 1) };
}
export function orbitCount(total: number) { return total ? orbitSlot(total - 1, total).ring + 1 : 0; }

export function GameDock({ items, hidden }: { items: DockItem[]; hidden?: boolean }) {
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(readOpen);
  useEffect(() => { if (!hint) return; const t = window.setTimeout(() => setHint(null), 2400); return () => window.clearTimeout(t); }, [hint]);
  const toggle = () => setOpen(value => { const next = !value; try { localStorage.setItem(OPEN_KEY, String(next)); } catch { /* 기억 못 해도 동작은 한다 */ } return next; });
  const waiting = items.reduce((sum, item) => sum + (item.unlocked ? item.badge ?? 0 : 0), 0);
  if (hidden) return null;
  const rings = orbitCount(items.length);
  return <div className={styles.shell} data-open={open}>
    <button type="button" className={styles.toggle} aria-expanded={open} aria-controls="academy-dock" aria-label={open ? '핵심 기능 접기' : '핵심 기능 펼치기'} onClick={toggle}>
      <span className={styles.medal} aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle className={styles.dial} cx="50" cy="50" r="44" />
          <path className={styles.ticks} d="M50 22v6M50 72v6M22 50h6M72 50h6" />
          <path className={styles.star} fillRule="evenodd" d="M50 24 L55 45 L76 50 L55 55 L50 76 L45 55 L24 50 L45 45 Z M50 33 L52.5 47.5 L67 50 L52.5 52.5 L50 67 L47.5 52.5 L33 50 L47.5 47.5 Z" />
          <circle className={styles.starCore} cx="50" cy="50" r="2.6" />
        </svg>
        {!open && waiting > 0 && <b className={styles.badge} aria-label={`기다리는 일 ${waiting}개`}>{waiting > 9 ? '9+' : waiting}</b>}
      </span>
      <span className={styles.toggleLabel}>기능</span>
    </button>
    {hint && <p className={styles.hint} role="status">{hint}</p>}
    <nav id="academy-dock" className={styles.dock} aria-label="핵심 기능" style={{ '--rings': rings } as CSSProperties}
      onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); toggle(); } }}>
      {Array.from({ length: rings }, (_, ring) => <span key={ring} className={styles.orbit} style={{ '--ring': ring } as CSSProperties} aria-hidden="true" />)}
      {items.map((item, i) => {
        const slot = orbitSlot(i, items.length);
        return <button key={item.id} type="button" className={styles.item} data-locked={!item.unlocked} aria-disabled={!item.unlocked} tabIndex={open ? 0 : -1}
          style={{ '--ring': slot.ring, '--t': slot.t, '--i': i } as CSSProperties}
          aria-label={item.unlocked ? (item.badge ? `${item.label} · 새 소식 ${item.badge}개` : item.label) : `${item.label} · 제${item.unlockChapter}장을 마치면 열려요`}
          onClick={() => { if (item.unlocked) { setHint(null); item.onOpen(); } else setHint(`${item.label} · 제${item.unlockChapter}장을 마치면 열려요`); }}>
          <span className={styles.icon} aria-hidden="true">{item.unlocked ? item.icon : '🔒'}</span>
          <span className={styles.label} aria-hidden="true">{item.label}</span>
          {item.unlocked && !!item.badge && <b className={styles.badge} aria-hidden="true">{item.badge > 9 ? '9+' : item.badge}</b>}
        </button>;
      })}
    </nav>
  </div>;
}
