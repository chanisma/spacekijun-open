/**
 * 3D 기기 화면 — three.js 장면 위에 «진짜 DOM 버튼»을 겹친다.
 * 레이캐스트만으로 버튼을 만들면 키보드·스크린리더·44px 손가락 규약을 잃는다. 버튼의 화면 자리는 장면이
 * 그릴 때마다 투영해서 알려 주고(`onAnchors`), 기기를 돌려 버튼이 뒤로 가면 DOM 버튼도 숨는다.
 *
 * 이 파일만 three.js 장면을 import 한다 — 페이지가 동적으로 불러 메인 번들에 three 가 섞이지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import { createDeviceScene, type ButtonAnchor, type DeviceScene } from '../three/deviceScene';
import { themeFor } from '../three/shellTheme';
import { BUTTON_LABELS, useButtonPress } from './useButtonPress';
import { HoldRing } from './LcdCanvas';
import { createPainter, type DeviceProps } from './deviceTypes';
import type { ScreenPainter } from '../lcd/classicPainter';

export default function TamagotchiDevice3D({ style, subscribe, onPress, onContextLost, shellId, onReady }: DeviceProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<DeviceScene | null>(null);
  const painterRef = useRef<ScreenPainter | null>(null);
  const [anchors, setAnchors] = useState<ButtonAnchor[]>([]);
  const lostRef = useRef(onContextLost);
  lostRef.current = onContextLost;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  const { holding, bind } = useButtonPress(onPress, (index, down) => {
    sceneRef.current?.press(index, down);
    if (down && index === 0) sceneRef.current?.turnDial(1);
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const painter = createPainter(style);
    painterRef.current = painter;
    const scene = createDeviceScene(canvas, {
      theme: themeFor(style, shellId), screen: painter.canvas, reducedMotion, onContextLost: () => lostRef.current?.(),
    });
    sceneRef.current = scene;
    let pending: ButtonAnchor[] | null = null;
    let raf = 0;
    scene.onAnchors((a) => {
      pending = a;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        if (pending) setAnchors((prev) => (sameAnchors(prev, pending!) ? prev : pending!));
      });
    });
    const resize = () => scene.resize(wrap.clientWidth, wrap.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    // 첫 프레임이 실제로 화면에 나간 뒤(두 번째 rAF) «준비됨» — 로딩 화면이 빈 캔버스를 드러내지 않게
    let readyRaf = requestAnimationFrame(() => { readyRaf = requestAnimationFrame(() => { readyRaf = 0; readyRef.current?.(); }); });
    return () => {
      observer.disconnect();
      if (readyRaf) cancelAnimationFrame(readyRaf);
      if (raf) cancelAnimationFrame(raf);
      scene.dispose();
      sceneRef.current = null;
      painterRef.current = null;
    };
  }, [style]);

  // 화면 공급원(알 미리보기 → 살아 있는 펫)이 바뀌어도 장면은 그대로 두고 구독만 바꾼다
  useEffect(() => subscribe((input) => {
    if (painterRef.current?.draw(input)) sceneRef.current?.refreshScreen();
  }), [subscribe, style]);

  return (
    <div ref={wrapRef} className="relative h-full w-full select-none">
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'pan-y' }} />
      {anchors.map((a, i) => {
        const size = Math.max(44, a.radius * 2 + 16);
        return (
          <button key={i} type="button" aria-label={BUTTON_LABELS[i]} {...bind(i as 0 | 1 | 2)}
            tabIndex={a.visible ? 0 : -1}
            className="absolute rounded-full outline-none ring-offset-0 focus-visible:ring-4 focus-visible:ring-amber-300/80"
            style={{
              left: a.x - size / 2, top: a.y - size / 2, width: size, height: size,
              opacity: a.visible ? 1 : 0, pointerEvents: a.visible ? 'auto' : 'none', touchAction: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {holding === i && <HoldRing size={size} />}
          </button>
        );
      })}
    </div>
  );
}

function sameAnchors(a: ButtonAnchor[], b: ButtonAnchor[]) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => Math.abs(x.x - b[i].x) < 0.5 && Math.abs(x.y - b[i].y) < 0.5
    && Math.abs(x.radius - b[i].radius) < 0.5 && x.visible === b[i].visible);
}
