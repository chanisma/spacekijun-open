/**
 * 가챠 소리 — Web Audio 합성(파일 없음). 기기 삑 소리와 같은 켜기/끄기를 따른다(기본 꺼짐).
 * 동전 «짤랑» · 손잡이 «딸깍» · 캡슐 «툭» · 뚜껑 «뽁» · 등급별 팡파르. 진동(navigator.vibrate)은 소리와 무관하게 휴대폰에서만.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { Rarity } from '../model/catalog';

type Ctx = AudioContext;

function tone(ctx: Ctx, t: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(ctx: Ctx, t: number, dur: number, vol: number, hp: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
}

const vibrate = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* 무시 */ } };

export function useGachaSound(enabled: boolean) {
  const ctxRef = useRef<Ctx | null>(null);
  useEffect(() => () => { void ctxRef.current?.close(); }, []);

  const withCtx = useCallback((play: (ctx: Ctx, t: number) => void) => {
    if (!enabled || typeof window === 'undefined') return;
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      const ctx = ctxRef.current ?? (ctxRef.current = new C());
      if (ctx.state === 'suspended') void ctx.resume();
      play(ctx, ctx.currentTime + 0.005);
    } catch { /* 소리는 덤 */ }
  }, [enabled]);

  return {
    coin: useCallback(() => {
      vibrate(12);
      withCtx((ctx, t) => { tone(ctx, t, 2350, 0.18, 'triangle', 0.18); tone(ctx, t + 0.07, 3140, 0.32, 'triangle', 0.14); });
    }, [withCtx]),
    notch: useCallback((step: number) => {
      vibrate(8);
      withCtx((ctx, t) => { noise(ctx, t, 0.035, 0.5, 2500); tone(ctx, t, 600 + step * 40, 0.04, 'square', 0.05); });
    }, [withCtx]),
    drop: useCallback(() => {
      vibrate([10, 40, 18]);
      withCtx((ctx, t) => { tone(ctx, t, 220, 0.16, 'sine', 0.3, 90); noise(ctx, t, 0.06, 0.25, 400); tone(ctx, t + 0.18, 180, 0.1, 'sine', 0.15, 90); });
    }, [withCtx]),
    pop: useCallback(() => {
      vibrate(25);
      withCtx((ctx, t) => { tone(ctx, t, 380, 0.12, 'sine', 0.3, 1400); noise(ctx, t, 0.05, 0.3, 1800); });
    }, [withCtx]),
    fanfare: useCallback((rarity: Rarity) => {
      if (rarity === 'legendary') vibrate([30, 60, 30, 60, 80]);
      const notes: Record<Rarity, number[]> = {
        common: [784, 988],
        rare: [784, 988, 1175],
        epic: [659, 784, 988, 1319],
        legendary: [523, 659, 784, 1047, 1319, 1568],
      };
      withCtx((ctx, t) => notes[rarity].forEach((f, i) => {
        tone(ctx, t + i * 0.09, f, 0.35, 'triangle', 0.12);
        tone(ctx, t + i * 0.09, f * 2, 0.2, 'sine', 0.04);
      }));
    }, [withCtx]),
  };
}
