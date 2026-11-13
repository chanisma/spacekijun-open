/**
 * 장면 캔버스 — 컨테이너를 꽉 채우고, 내부 해상도는 «정수 배율로 나눈 컨테이너 크기»다(도트가 번지지 않게).
 *
 * ⚠️ requestAnimationFrame 은 «캔버스가 사는 창»의 것을 쓴다. 작은 창(Document Picture-in-Picture)으로 옮겨 그리면
 *    본 탭이 뒤로 가는 순간 본 창의 rAF 가 멈춘다 — 작은 창의 rAF 를 써야 작은 창이 계속 움직인다.
 */
import { useEffect, useRef } from 'react';
import { TowerScene, type SceneView } from '../scene/TowerScene';
import { loadTowerAssets } from '../scene/assets';

interface Props {
  getView: () => SceneView;
  /** 정수 배율. 'auto' = 내부 높이가 340 안팎이 되도록 */
  scale?: number | 'auto';
  className?: string;
  onScene?: (scene: TowerScene) => void;
  /** 눌렀다(끌지 않고) — 'merchant' · 방문자 key */
  onTap?: (hit: string) => void;
}

const FRAME_MS = 1000 / 30;

export function TowerCanvas({ getView, scale = 'auto', className, onScene, onTap }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(getView);
  viewRef.current = getView;
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const win = canvas.ownerDocument.defaultView ?? window;
    let scene: TowerScene | null = null;
    let raf = 0;
    let last = 0;
    let alive = true;
    let px = 2;

    const fit = () => {
      const r = wrap.getBoundingClientRect();
      if (!r.width || !r.height) return;
      px = scale === 'auto' ? Math.max(2, Math.round(r.height / 340)) : scale;
      const W = Math.ceil(r.width / px);
      const H = Math.ceil(r.height / px);
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${W * px}px`;
      canvas.style.height = `${H * px}px`;
      scene?.resize(W, H, px);
    };
    const ro = new (win as typeof window).ResizeObserver(fit);
    ro.observe(wrap);

    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingEnabled = false;
    void loadTowerAssets().then((assets) => {
      if (!alive) return;
      scene = new TowerScene(assets);
      fit();
      onSceneRef.current?.(scene);
      const tick = (t: number) => {
        if (!alive) return;
        raf = win.requestAnimationFrame(tick);
        if (t - last < FRAME_MS) return;
        const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
        last = t;
        scene!.render(g, viewRef.current(), dt);
      };
      raf = win.requestAnimationFrame(tick);
    });

    // 끌어서 위아래로 보기 · 휠 · 누르기(6px 안에서 떼면 «누름» — 방문자에게 인사)
    let dragY: number | null = null;
    let start: [number, number] | null = null;
    let moved = 0;
    const down = (e: PointerEvent) => { dragY = e.clientY; start = [e.clientX, e.clientY]; moved = 0; try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 — 끌기만 못 할 뿐 */ } };
    const move = (e: PointerEvent) => {
      if (dragY == null || !scene) return;
      if (start) moved = Math.max(moved, Math.hypot(e.clientX - start[0], e.clientY - start[1]));
      if (moved < 6) return;
      const dy = (e.clientY - dragY) / px;
      if (Math.abs(dy) >= 1) { scene.pan(Math.round(dy), performance.now()); dragY = e.clientY; }
    };
    const up = (e: PointerEvent) => {
      if (start && moved < 6 && scene && e.type === 'pointerup') {
        const r = canvas.getBoundingClientRect();
        const hit = scene.tap((e.clientX - r.left) / px, (e.clientY - r.top) / px);
        if (hit) onTapRef.current?.(hit);
      }
      dragY = null; start = null;
    };
    const wheel = (e: WheelEvent) => { if (scene) { e.preventDefault(); scene.pan(Math.round(-e.deltaY / px / 2), performance.now()); } };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    // React onWheel 은 passive 라 preventDefault 가 무시된다 — 직접 단다
    canvas.addEventListener('wheel', wheel, { passive: false });

    return () => {
      alive = false;
      win.cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }, [scale]);

  return (
    <div ref={wrapRef} className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated', touchAction: 'none', cursor: 'grab' }} aria-label="물 위에 쌓아 올린 탑 — 하늘은 지금 한국 시각을 따른다" role="img" />
    </div>
  );
}
