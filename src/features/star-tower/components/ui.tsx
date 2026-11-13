/**
 * 별까지 쌓기 — 작은 부품: 도트 아이콘 · 겹쳐 뜨는 판 · 재료 칩.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalBackClose } from '@/components/ui/modal-back';
import { RESOURCES, type Inventory, type Resource } from '../model/catalog';

const BASE = '/images/star-tower';

/** 그림이 없을 때 대신 보일 색 — 아이콘 그림이 늦게 오거나 빠져도 칸이 비지 않게 */
const FALLBACK: Record<string, string> = {
  'fish-sardine': '#b8c6d6', 'fish-mackerel': '#4f7fbf', 'fish-flounder': '#8a6a44', 'fish-star': '#ffd36a',
  wood: '#9a6a3a', scrap: '#a8622e', bottle: '#7fb6e6', star: '#a78bfa',
};

export function ItemIcon({ name, size = 2, label }: { name: string; size?: 1 | 2 | 3; label?: string }) {
  const [broken, setBroken] = useState(false);
  const [dim, setDim] = useState<[number, number] | null>(null);
  if (broken) {
    return <span aria-label={label} role={label ? 'img' : undefined} style={{ display: 'inline-block', width: 9 * size, height: 9 * size, borderRadius: 2, background: FALLBACK[name] ?? '#ccc', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.5)' }} />;
  }
  return (
    <img
      className="st-sprite"
      src={`${BASE}/item-${name}.png`}
      alt={label ?? ''}
      onError={() => setBroken(true)}
      onLoad={(e) => setDim([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
      // 정수 배율만 쓴다(도트가 번지지 않게). 아이콘은 18 화소 안팎으로 만들어 두었다
      style={dim ? { width: dim[0] * size, height: dim[1] * size } : { width: 18 * size, height: 18 * size, opacity: 0 }}
    />
  );
}

export function FloorThumb({ floorKey, scale = 1 }: { floorKey: string; scale?: 1 | 2 }) {
  const [dim, setDim] = useState<[number, number] | null>(null);
  return (
    <img
      className="st-sprite"
      src={`${BASE}/floor-${floorKey}.png`}
      alt=""
      onLoad={(e) => setDim([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
      style={dim ? { width: dim[0] * scale, height: dim[1] * scale } : { width: 56 * scale, height: 48 * scale }}
    />
  );
}

export const RESOURCE_ICON: Record<Resource, string> = Object.fromEntries(RESOURCES.map((r) => [r.key, r.icon])) as Record<Resource, string>;
export const RESOURCE_LABEL: Record<Resource, string> = Object.fromEntries(RESOURCES.map((r) => [r.key, r.label])) as Record<Resource, string>;

/** 재료 칩 — have 를 주면 모자랄 때 붉게 */
export function CostChips({ cost, have }: { cost: Partial<Inventory>; have?: Inventory }) {
  const keys = (Object.keys(cost) as Resource[]).filter((k) => (cost[k] ?? 0) > 0);
  if (!keys.length) return <span className="st-hint">재료 없음</span>;
  return (
    <span className="st-cost">
      {keys.map((k) => {
        const short = have && (have[k] ?? 0) < (cost[k] ?? 0);
        return (
          <span key={k} className={`st-res ${short ? 'short' : ''}`} title={RESOURCE_LABEL[k]}>
            <ItemIcon name={RESOURCE_ICON[k]} size={1} label={RESOURCE_LABEL[k]} />
            <b>{cost[k]}</b>
            {short && <span className="st-bad">({have![k]})</span>}
          </span>
        );
      })}
    </span>
  );
}

/** 겹쳐 뜨는 판 — 휴대폰 뒤로가기·Esc·바깥 누르기로 닫힌다 */
export function Sheet({ title, onClose, children, footer, extra }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; extra?: ReactNode }) {
  useModalBackClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="st-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="st-panel st-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          {extra}
          <button type="button" className="st-close" aria-label="닫기" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="st-body">{children}</div>
        {footer && <div style={{ padding: '10px 12px', borderTop: '2px solid rgba(214,178,106,.35)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{footer}</div>}
      </section>
    </div>
  );
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
