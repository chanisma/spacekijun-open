/**
 * 기기 하나 — 3D 는 동적으로 불러오고, WebGL 을 못 쓸 때(또는 맥락을 잃었을 때)는 같은 모양의 2D 기기를 보여 준다.
 * 불러오는 동안은 아무것도 그리지 않는다 — 첫 로딩 화면이 덮고 있다(2026-10-09: 종전엔 2D 기기를 먼저 보였다가 3D 로 바뀌었다).
 * 꾸밈(배경·머리줄)은 페이지가 맡는다 — 이 컴포넌트는 기기만.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { canUseWebGL } from '../three/webgl';
import TamagotchiDevice2D from './TamagotchiDevice2D';
import type { DeviceProps } from './deviceTypes';

const load3D = () => import('./TamagotchiDevice3D');
const TamagotchiDevice3D = lazy(load3D);

/** 페이지가 들어오자마자 3D 묶음을 받기 시작한다 — 펫·상점을 읽는 동안 함께(같은 import 라 두 번 받지 않는다) */
export function prefetchDevice3D() {
  if (canUseWebGL()) void load3D().catch(() => undefined);
}

export function DeviceView(props: Omit<DeviceProps, 'onContextLost'>) {
  const [mode, setMode] = useState<'3d' | '2d'>(() => (canUseWebGL() ? '3d' : '2d'));
  if (mode === '2d') return <Device2DReady {...props} />;
  return (
    <Suspense fallback={null}>
      <TamagotchiDevice3D key={`${props.style}:${props.shellId ?? ''}`} {...props} onContextLost={() => setMode('2d')} />
    </Suspense>
  );
}

/** 2D 는 그리는 즉시 준비된 것 */
function Device2DReady(props: Omit<DeviceProps, 'onContextLost'>) {
  const { onReady } = props;
  useEffect(() => { onReady?.(); }, [onReady]);
  return <TamagotchiDevice2D {...props} />;
}
