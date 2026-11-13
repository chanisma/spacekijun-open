import { useCallback, useEffect, useMemo, useState } from 'react';
import { fallbackRotation, isRotatedEmbed, orientationButtonLabel, orientationTarget, UNROTATE_MESSAGE, type OrientationState, type RotationDeg } from './screenRotation';

/**
 * 가로/세로 바꾸기 상태 (2026-10-03). 진짜 잠금이 되면 그걸 쓰고, 안 되면 돌린 iframe 으로(`screenRotation.ts`).
 * - 진짜 잠금: 전체 화면 → `screen.orientation.lock(target)`. 전체 화면에서 나오면 잠금도 풀리므로 상태를 되돌린다.
 * - 돌린 iframe: 휴대폰을 실제로 돌려 화면 방향 자체가 바뀌면 돌림을 푼다(두 번 돌아가 거꾸로 보이지 않게).
 * - iframe 안(`embedded`): 단추는 부모에게 «원래대로»를 부탁할 뿐이다 — 돌림을 가진 것은 부모다.
 */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape' | 'portrait') => Promise<void>; unlock?: () => void };

const framed = () => { try { return window.self !== window.top; } catch { return true; } };

/** `routePath` = 지금 아카데미 장소(라우터 경로). 돌린 iframe 안에서 «원래대로» 를 누르면 부모가 이 장소로 돌아온다. */
export function useScreenOrientation(routePath = typeof window !== 'undefined' ? window.location.pathname : '/academy') {
  const embedded = useMemo(() => typeof window !== 'undefined' && isRotatedEmbed(window.location.search, framed()), []);
  const portraitQuery = useMemo(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(orientation: portrait)') : null), []);
  /** 단추를 보일 화면 — 손가락으로 쓰는 기기 또는 좁은 화면. 데스크톱 마우스에서는 쓸 일이 없다. */
  const handheldQuery = useMemo(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(pointer: coarse), (max-width: 760px)') : null), []);
  const [portrait, setPortrait] = useState(() => portraitQuery?.matches ?? true);
  const [handheld, setHandheld] = useState(() => handheldQuery?.matches ?? false);
  const [state, setState] = useState<OrientationState>(() => (embedded ? { mode: 'rotated', deg: 90 } : { mode: 'none' }));
  const [busy, setBusy] = useState(false);
  /** 돌린 화면에서 돌아왔다 — 게임이 다시 그려지지만 사람은 이미 세계 안에 있었다(타이틀을 다시 보이지 않는다). */
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    if (!portraitQuery) return;
    const onChange = (e: MediaQueryListEvent) => {
      setPortrait(e.matches);
      if (!embedded) setState(s => (s.mode === 'rotated' ? { mode: 'none' } : s));
    };
    portraitQuery.addEventListener('change', onChange);
    return () => portraitQuery.removeEventListener('change', onChange);
  }, [portraitQuery, embedded]);
  useEffect(() => {
    if (!handheldQuery) return;
    const onChange = (e: MediaQueryListEvent) => setHandheld(e.matches);
    handheldQuery.addEventListener('change', onChange);
    return () => handheldQuery.removeEventListener('change', onChange);
  }, [handheldQuery]);
  useEffect(() => {
    const onFullscreen = () => { if (!document.fullscreenElement) setState(s => (s.mode === 'native' ? { mode: 'none' } : s)); };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const reset = useCallback(() => { setState({ mode: 'none' }); setResumed(true); }, []);
  const toggle = useCallback(async () => {
    if (busy) return;
    if (embedded) { window.parent.postMessage({ type: UNROTATE_MESSAGE, path: routePath }, window.location.origin); return; }
    if (state.mode === 'native') {
      try { (screen.orientation as LockableOrientation).unlock?.(); } catch { /* 이미 풀림 */ }
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setState({ mode: 'none' });
      return;
    }
    if (state.mode === 'rotated') { reset(); return; }
    const target = orientationTarget(portrait);
    const orientation = typeof screen !== 'undefined' ? (screen.orientation as LockableOrientation | undefined) : undefined;
    setBusy(true);
    try {
      if (orientation?.lock && document.documentElement.requestFullscreen) {
        let entered = false;
        try {
          if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); entered = true; }
          await orientation.lock(target);
          setState({ mode: 'native', target });
          return;
        } catch {
          // 잠금이 거절되면(데스크톱·일부 브라우저) 들어간 전체 화면을 되돌리고 돌린 iframe 으로.
          if (entered && document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
        }
      }
      setState({ mode: 'rotated', deg: fallbackRotation(portrait) });
    } finally { setBusy(false); }
  }, [busy, embedded, portrait, reset, routePath, state.mode]);

  const rotation: RotationDeg = !embedded && state.mode === 'rotated' ? state.deg : 0;
  return { state, portrait, rotation, busy, embedded, available: handheld || embedded, resumeWorld: embedded || resumed, label: orientationButtonLabel(state, portrait), toggle, reset };
}

export type ScreenOrientationControl = ReturnType<typeof useScreenOrientation>;
