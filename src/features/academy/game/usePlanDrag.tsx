import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PlannerTask } from '@/features/planner/types';
import { usePlannerTheme } from './plannerTheme';

/**
 * 별빛 플래너의 «계획을 다른 날로 끌어 옮기기» — 이번 주 쪽과 월별 일정 쪽이 함께 쓴다 (2026-10-03).
 *
 * ⚠️ HTML5 draggable 을 쓰지 말 것 — 이 책의 filter·3D 원근 아래에서 브라우저가 끌기 그림을 뜨다 페이지 전체가 멈췄다
 *    (사용자 제보 «드래그하려고 할 때 시스템 자체가 마비»). 포인터 끌기라 그런 일이 없고 터치에서도 같은 코드가 돈다.
 *
 * 손가락과 마우스는 시작 방식이 다르다:
 *  - 마우스 = 눌러서 5px 넘게 움직이면 바로 끌기.
 *  - 터치·펜 = **길게 누르기(0.3초)** 로 집는다. 집기 전에 손가락이 움직이면 그건 스크롤이다(놓아 준다) —
 *    바로 끌기로 잡으면 계획이 잔뜩 적힌 쪽에서 스크롤할 자리가 사라진다. 집은 뒤에는 `touchmove` 를 막아(길게 누르기 대기 중에는 막지 않는다)
 *    화면이 따라 움직이지 않게 하고, 화면 가장자리로 가져가면 그 쪽(스크롤 상자)이 저절로 흐른다.
 *
 * 놓을 자리 = `data-drop-day="YYYY-MM-DD"` 가 달린 요소(요일 칸·달력 칸). 끌리는 쪽지는 pointer-events:none 이라 판정을 가리지 않는다.
 */
const MOUSE_THRESHOLD = 5;
const TOUCH_HOLD_MS = 300;
const TOUCH_SLOP = 8;
const EDGE = 48;
/** 집은 자리에서 이만큼 움직인 뒤에야 가장자리 자동 스크롤을 켠다 — 화면 아래쪽 줄을 길게 누르자마자 쪽이 흘러가 버리지 않게. */
const SCROLL_ARM = 24;

export const dropDayAt = (x: number, y: number) =>
  (document.elementFromPoint(x, y)?.closest('[data-drop-day]') as HTMLElement | null)?.dataset.dropDay ?? null;

function scrollerAt(x: number, y: number): HTMLElement | null {
  let el = document.elementFromPoint(x, y) as HTMLElement | null;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  // 스크롤 상자가 없으면 창 자체 — 일반 플래너는 휴대폰에서 펼침면이 페이지째 흐른다(아카데미는 책 안에서 흐른다).
  const page = document.scrollingElement as HTMLElement | null;
  return page && page.scrollHeight > window.innerHeight + 1 ? page : null;
}

type Drag = { task: PlannerTask; pointerId: number; x: number; y: number; px: number; py: number; ax: number; ay: number; armed: boolean; touch: boolean; active: boolean; timer: number | null; cleanup: () => void };

export function usePlanDrag({ disabled, onDrop }: { disabled: boolean; onDrop: (task: PlannerTask, day: string) => void }) {
  const { css } = usePlannerTheme();
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** 길게 누르는 중(터치) — 집히기 직전 줄을 살짝 눌린 모양으로 보여 «기다리면 집힌다»를 알린다. */
  const [pressing, setPressing] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => () => drag.current?.cleanup(), []);
  // ⚠️ 집힌 뒤 화면이 따라 스크롤되지 않게 막는 touchmove 는 **누르기 전부터** 걸려 있어야 한다 — 크롬은 touchstart 순간에
  //    «이 손짓의 touchmove 를 막을 수 있는가»를 정하므로, 누른 뒤에 단 non-passive 리스너는 취소할 수 없는 이벤트를 받는다
  //    (그러면 브라우저가 스크롤을 시작하며 pointercancel 을 보내 끌기가 끊긴다 — 테스트로 확인). 플래너가 열려 있는 동안만 단다.
  useEffect(() => {
    const block = (e: TouchEvent) => { if (drag.current?.active && e.cancelable) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, []);

  const begin = useCallback((event: ReactPointerEvent, task: PlannerTask) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // 단추·입력 위에서는 시작하지 않는다(인장·작은 동작). 달력 칸 안의 계획 칩(data-drag-chip)만 예외 — 칸 자체가 단추다.
    const hit = (event.target as HTMLElement).closest('[data-drag-chip], button, input, textarea, select, form, a');
    if (hit && !hit.hasAttribute('data-drag-chip')) return;
    drag.current?.cleanup();
    const touch = event.pointerType !== 'mouse';
    let frame = 0;

    const activate = (d: Drag) => {
      d.active = true; d.timer = null; d.ax = d.px; d.ay = d.py; d.armed = false;
      setPressing(null); setDragging(d.task.id);
      setGhost({ x: d.px, y: d.py, title: d.task.title });
      const day = dropDayAt(d.px, d.py); setOverDay(day);
      if (touch) navigator.vibrate?.(12);
      const tick = () => {
        const cur = drag.current; if (!cur?.active) return;
        if (!cur.armed && Math.hypot(cur.px - cur.ax, cur.py - cur.ay) >= SCROLL_ARM) cur.armed = true;
        const box = cur.armed ? scrollerAt(cur.px, cur.py) : null;
        if (box) {
          const r = box.getBoundingClientRect();
          const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
          const dy = cur.py < top + EDGE ? -(top + EDGE - cur.py) : cur.py > bottom - EDGE ? cur.py - (bottom - EDGE) : 0;
          if (dy) { box.scrollTop += Math.max(-18, Math.min(18, dy / 3)); const over = dropDayAt(cur.px, cur.py); setOverDay(p => (p === over ? p : over)); }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d || e.pointerId !== d.pointerId) return;
      d.px = e.clientX; d.py = e.clientY;
      const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (!d.active) {
        if (d.touch) { if (dist > TOUCH_SLOP) finish(e, true); return; } // 집기 전에 움직였다 = 스크롤
        if (dist < MOUSE_THRESHOLD) return;
        activate(d);
      }
      setGhost({ x: e.clientX, y: e.clientY, title: d.task.title });
      const day = dropDayAt(e.clientX, e.clientY);
      setOverDay(p => (p === day ? p : day));
    };
    const finish = (e: PointerEvent | null, cancelled: boolean) => {
      const d = drag.current; if (!d) return;
      d.cleanup(); drag.current = null;
      setGhost(null); setDragging(null); setOverDay(null); setPressing(null);
      if (!d.active || cancelled || !e) return;
      // 놓은 손이 그 자리의 클릭(줄 «고쳐 적기»·달력 칸 고르기)으로 이어지지 않게 다음 클릭 한 번을 삼킨다.
      const swallow = (c: MouseEvent) => { c.preventDefault(); c.stopPropagation(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      const day = dropDayAt(e.clientX, e.clientY);
      if (day && day !== d.task.task_date) onDropRef.current(d.task, day);
    };
    const up = (e: PointerEvent) => { if (drag.current && e.pointerId === drag.current.pointerId) finish(e, false); };
    const cancel = (e: PointerEvent) => { if (drag.current && e.pointerId === drag.current.pointerId) finish(e, true); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current) { e.preventDefault(); finish(null, true); } };
    const blockMenu = (e: Event) => { if (drag.current) e.preventDefault(); };
    const cleanup = () => {
      const d = drag.current; if (d?.timer) window.clearTimeout(d.timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key); window.removeEventListener('contextmenu', blockMenu);
    };
    const d: Drag = { task, pointerId: event.pointerId, x: event.clientX, y: event.clientY, px: event.clientX, py: event.clientY, ax: event.clientX, ay: event.clientY, armed: false, touch, active: false, timer: null, cleanup };
    drag.current = d;
    if (touch) { setPressing(task.id); d.timer = window.setTimeout(() => { if (drag.current === d) activate(d); }, TOUCH_HOLD_MS); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('contextmenu', blockMenu);
  }, [disabled]);

  const ghostLayer = ghost ? createPortal(<div className={css.dragGhost} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">{ghost.title}</div>, document.body) : null;
  return { begin, dragging, pressing, overDay, ghostLayer };
}
