/**
 * 2D 화면 — 기기 모양에 맞는 그리개의 캔버스를 그대로 붙인다(홈 카드 · WebGL 이 없을 때의 2D 기기).
 * three.js 를 import 하지 않는다.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { ScreenInput } from '../model/screenInput';
import type { DeviceStyle } from '../three/dims';
import { createPainter } from './deviceTypes';

export function ScreenView({ style, subscribe, className, size }: {
  style: DeviceStyle;
  subscribe: (cb: (input: ScreenInput) => void) => () => void;
  className?: string;
  /** 클래식 = 배율, 컬러 = 캔버스 한 변 */
  size?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const painter = createPainter(style, size);
    painter.canvas.className = 'block h-auto w-full';
    painter.canvas.setAttribute('aria-hidden', 'true');
    if (style !== 'classic') painter.canvas.style.imageRendering = 'pixelated';
    el.replaceChildren(painter.canvas);
    const unsubscribe = subscribe((input) => { painter.draw(input); });
    return () => { unsubscribe(); el.replaceChildren(); };
  }, [style, subscribe, size]);
  return <div ref={host} className={cn('w-full', className)} />;
}
