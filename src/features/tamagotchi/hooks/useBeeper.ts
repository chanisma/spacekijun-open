/**
 * 삑 소리 — 다마고찌의 압전 부저를 Web Audio 사각파로 합성한다(파일 없음).
 * 기본은 꺼짐이고 기기마다 기억한다(교실에서 갑자기 울리지 않게).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { readStoredString, writeStoredString } from '@/lib/safeLocalStorage';

const KEY = 'tamagotchi:sound:v1';
export type BeepKind = 'tick' | 'select' | 'cancel' | 'alert' | 'happy';

const PATTERNS: Record<BeepKind, [number, number][]> = {
  tick: [[3900, 0.035]],
  select: [[3900, 0.04], [0, 0.03], [3900, 0.04]],
  cancel: [[2600, 0.06]],
  alert: [[3600, 0.09], [0, 0.07], [3600, 0.09], [0, 0.07], [3600, 0.09]],
  happy: [[2600, 0.07], [3100, 0.07], [3900, 0.11]],
};

export function useBeeper() {
  const [enabled, setEnabled] = useState(() => readStoredString(KEY) === 'on');
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => () => { void ctxRef.current?.close(); }, []);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      writeStoredString(KEY, on ? 'off' : 'on');
      return !on;
    });
  }, []);

  const beep = useCallback((kind: BeepKind) => {
    if (!enabled || typeof window === 'undefined') return;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = ctxRef.current ?? (ctxRef.current = new Ctor());
      if (ctx.state === 'suspended') void ctx.resume();
      let t = ctx.currentTime + 0.005;
      for (const [freq, dur] of PATTERNS[kind]) {
        if (freq > 0) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.045, t + 0.004);
          gain.gain.setValueAtTime(0.045, t + dur - 0.006);
          gain.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + dur + 0.01);
        }
        t += dur;
      }
    } catch {
      /* 소리는 덤이다 — 실패해도 조용히 */
    }
  }, [enabled]);

  return { enabled, toggle, beep };
}

export const buzz = (ms = 12) => {
  try { navigator.vibrate?.(ms); } catch { /* iOS 는 지원하지 않는다 */ }
};
