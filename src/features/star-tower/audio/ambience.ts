/**
 * 별까지 쌓기 — 소리. 파일 없이 WebAudio 로 합성한다(번들·저작권·로딩이 없다).
 *
 * 배경(늘 깔리는 것): 파도(갈색 잡음 → 저역 통과 + 느린 너울) · 비(백색 잡음 → 고역) · 바람(높이 올라갈수록 커진다).
 * 효과(한 번): 종 · 갈매기 · 고래 노래 · 축음기 음표 · 물방울 · 지글지글 …
 *
 * ⚠️ 브라우저는 사람의 손짓 전엔 소리를 막는다(자동 재생 정책) — `unlock()` 은 반드시 누르기 처리 안에서 부를 것.
 * ⚠️ 탭이 안 보이면 멈춘다(`suspend`) — 켜 둔 채 잊은 탭이 배터리를 먹지 않게.
 */

export type SoundName =
  | 'chime' | 'splash' | 'knock' | 'sizzle' | 'page' | 'chirp' | 'saw' | 'yawn' | 'water' | 'blip'
  | 'steam' | 'notes' | 'tick' | 'bubble' | 'bell' | 'chalk' | 'gull' | 'whale' | 'horn' | 'sparkle';

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

function noiseBuffer(ctx: AudioContext, kind: 'white' | 'brown', seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return buf;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wave: GainNode | null = null;
  private rain: GainNode | null = null;
  private wind: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private enabled = true;

  /** 누르기 안에서 한 번 — 소리 길을 연다 */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && this.enabled) void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);
    this.white = noiseBuffer(ctx, 'white');
    const brown = noiseBuffer(ctx, 'brown', 4);

    // 파도 — 갈색 잡음 · 저역 통과 · 0.09Hz 너울
    this.wave = this.loop(brown, (src) => {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      src.connect(lp); return lp;
    }, 0.0);
    const swell = ctx.createOscillator(); swell.frequency.value = 0.09;
    const swellAmt = ctx.createGain(); swellAmt.gain.value = 0.035;
    swell.connect(swellAmt).connect(this.wave.gain); swell.start();

    // 비 — 백색 잡음 · 고역
    this.rain = this.loop(this.white, (src) => {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      src.connect(hp); return hp;
    }, 0);

    // 바람 — 대역 통과 잡음, 중심 주파수가 천천히 흔들린다
    this.wind = this.loop(this.white, (src) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const amt = ctx.createGain(); amt.gain.value = 180;
      lfo.connect(amt).connect(bp.frequency); lfo.start();
      src.connect(bp); return bp;
    }, 0);
  }

  private loop(buf: AudioBuffer, chain: (src: AudioBufferSourceNode) => AudioNode, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = gain;
    chain(src).connect(g).connect(this.master!);
    src.start();
    return g;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2);
    if (on && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 탭이 안 보이면 멈추고, 돌아오면 다시 */
  setVisible(visible: boolean) {
    if (!this.ctx) return;
    if (visible && this.enabled) void this.ctx.resume();
    else if (!visible) void this.ctx.suspend();
  }

  /** 배경 섞기 — 물이 얼마나 보이나(0~1) · 비 · 높이(0~1) */
  mix(water: number, raining: boolean, altitude: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wave?.gain.setTargetAtTime(0.05 * water + 0.012, t, 1.2);
    this.rain?.gain.setTargetAtTime(raining ? 0.035 : 0, t, 1.5);
    this.wind?.gain.setTargetAtTime(0.004 + 0.05 * Math.min(1, altitude), t, 2);
  }

  play(name: SoundName) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t = ctx.currentTime;
    const tone = (freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, glide?: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t + at);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + at + dur);
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(vol, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, t + at + dur);
      o.connect(g).connect(this.master!);
      o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    const hiss = (at: number, dur: number, freq: number, vol: number, type: BiquadFilterType = 'highpass') => {
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.0008, t + at + dur);
      s.connect(f).connect(g).connect(this.master!);
      s.start(t + at); s.stop(t + at + dur + 0.05);
    };
    switch (name) {
      case 'chime': [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, i * 0.11, 0.6, 'triangle', 0.1)); break;
      case 'sparkle': [1318.5, 1567.98, 2093].forEach((f, i) => tone(f, i * 0.06, 0.35, 'sine', 0.05)); break;
      case 'splash': hiss(0, 0.45, 600, 0.12, 'lowpass'); hiss(0.05, 0.3, 2500, 0.04); break;
      case 'knock': tone(160, 0, 0.09, 'square', 0.06); tone(150, 0.16, 0.09, 'square', 0.06); break;
      case 'sizzle': hiss(0, 0.9, 3500, 0.05); break;
      case 'page': hiss(0, 0.18, 1800, 0.06, 'bandpass'); break;
      case 'chirp': tone(2400, 0, 0.08, 'sine', 0.05, 3200); tone(2600, 0.12, 0.08, 'sine', 0.05, 3400); break;
      case 'saw': hiss(0, 0.22, 900, 0.07, 'bandpass'); hiss(0.3, 0.22, 900, 0.07, 'bandpass'); break;
      case 'yawn': tone(330, 0, 0.7, 'sine', 0.06, 220); break;
      case 'water': tone(1200, 0, 0.12, 'sine', 0.07, 600); tone(900, 0.18, 0.12, 'sine', 0.05, 450); break;
      case 'blip': tone(880, 0, 0.06, 'square', 0.03); tone(1320, 0.09, 0.06, 'square', 0.03); hiss(0.2, 0.4, 2000, 0.02, 'bandpass'); break;
      case 'steam': hiss(0, 1.1, 5000, 0.04); break;
      case 'notes': for (let i = 0; i < 5; i++) tone(PENTA[Math.floor(Math.random() * PENTA.length)], i * 0.18, 0.4, 'triangle', 0.07); break;
      case 'tick': for (let i = 0; i < 4; i++) tone(2000, i * 0.09, 0.03, 'square', 0.025); break;
      case 'bubble': for (let i = 0; i < 4; i++) tone(500 + i * 120, i * 0.07, 0.08, 'sine', 0.06, 900 + i * 150); break;
      case 'bell': [220, 440, 554, 660].forEach((f, i) => tone(f, 0, 2.6 - i * 0.4, 'sine', 0.12 / (i + 1))); break;
      case 'chalk': hiss(0, 0.25, 3000, 0.04, 'bandpass'); break;
      case 'gull': tone(1400, 0, 0.18, 'triangle', 0.05, 900); tone(1500, 0.22, 0.2, 'triangle', 0.05, 950); break;
      case 'whale': tone(240, 0, 1.8, 'sine', 0.1, 140); tone(180, 1.2, 1.6, 'sine', 0.07, 260); break;
      case 'horn': tone(196, 0, 0.9, 'sawtooth', 0.04); tone(196.5, 0, 0.9, 'triangle', 0.06); break;
    }
  }
}
