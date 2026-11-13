/**
 * 버튼 누르기 — 짧게 / 길게(0.55초). 길게는 손을 떼기 전에 그 순간 발동한다(실물처럼 «눌러 있으면 일어난다»).
 * 길게 누르는 중에는 버튼 둘레에 링이 차오른다 — 보이지 않는 길게 누르기는 발견되지 않는다.
 * 키보드: A·S·D (또는 1·2·3), Enter/Space 는 포커스된 버튼.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const LONG_PRESS_MS = 550;

export function useButtonPress(onPress: (index: 0 | 1 | 2, long: boolean) => void, onHold?: (index: number, down: boolean) => void) {
  const [holding, setHolding] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const active = useRef<number | null>(null);

  const start = useCallback((index: 0 | 1 | 2) => {
    if (active.current !== null) return;
    active.current = index;
    longFired.current = false;
    setHolding(index);
    onHold?.(index, true);
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      onPress(index, true);
    }, LONG_PRESS_MS);
  }, [onPress, onHold]);

  const end = useCallback((cancel = false) => {
    const index = active.current as 0 | 1 | 2 | null;
    if (index === null) return;
    if (timer.current) window.clearTimeout(timer.current);
    active.current = null;
    setHolding(null);
    onHold?.(index, false);
    if (!cancel && !longFired.current) onPress(index, false);
  }, [onPress, onHold]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // 전역 키보드 — 입력 칸에 쓰는 중에는 가로채지 않는다
  useEffect(() => {
    const keyIndex = (key: string): 0 | 1 | 2 | null => {
      const k = key.toLowerCase();
      if (k === 'a' || k === '1') return 0;
      if (k === 's' || k === '2') return 1;
      if (k === 'd' || k === '3') return 2;
      return null;
    };
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // 대화상자(조작 방법·펫 일기)가 떠 있으면 그 뒤의 기기를 누르지 않는다
      return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('[role="dialog"]'));
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const index = keyIndex(e.key);
      if (index === null || e.repeat) return;
      e.preventDefault();
      start(index);
    };
    const up = (e: KeyboardEvent) => {
      if (keyIndex(e.key) === null) return;
      end();
    };
    const blur = () => end(true);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [start, end]);

  const bind = useCallback((index: 0 | 1 | 2) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      start(index);
    },
    onPointerUp: () => end(),
    onPointerCancel: () => end(true),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(index); }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); end(); }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }), [start, end]);

  return { holding, bind };
}

export const BUTTON_LABELS = [
  'A 버튼 — 메뉴 옮기기',
  'S 버튼 — 고르기 (아무것도 안 골랐으면 시계)',
  'D 버튼 — 취소 · 길게 누르면 쓰다듬기',
] as const;
