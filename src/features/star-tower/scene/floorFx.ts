/**
 * 층이 살아 움직이기 — 굴뚝 연기 · 찻주전자 김 · 수조 물방울 · 무전기 불빛 · 밤 창문을 지나가는 사람 그림자 · 누르면 일어나는 일.
 * 자리는 그림에서 찾은 anchors(scene/assets.ts), 무엇을 할지는 model/floorLife.ts.
 */
import { FLOOR_LIFE } from '../model/floorLife';
import type { Sprite } from './assets';
import { drawBubble } from './pixelBubble';

export interface ScreenFloor { key: string; s: Sprite; x: number; y: number }

type Kind = 'smoke' | 'steam' | 'bubble' | 'note' | 'spark';
interface Part { kind: Kind; x: number; y: number; vx: number; vy: number; t: number; life: number; clip?: [number, number, number, number] }

const NOTE = ['.##', '.#.', '##.'];

export class FloorFx {
  private parts: Part[] = [];
  private emitAt = new Map<string, number>();
  private reacts = new Map<string, number>();
  private shadow: { key: string; start: number; dir: 1 | -1 } | null = null;
  private nextShadow = 6;

  tap(key: string, f: ScreenFloor, T: number) {
    this.reacts.set(key, T);
    const life = FLOOR_LIFE[key];
    const burst = life?.burst ?? 'spark';
    const cx = f.x + f.s.w / 2;
    const cy = f.y + f.s.h * 0.35;
    const n = burst === 'notes' ? 5 : 8;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      if (burst === 'notes') this.parts.push({ kind: 'note', x: cx - 10 + k * 5, y: cy, vx: Math.sin(k) * 4, vy: -10 - k * 2, t: -k * 0.12, life: 1.8 });
      else if (burst === 'smoke' || burst === 'steam') {
        const a = f.s.anchors?.top ?? [f.s.w / 2, 0];
        this.parts.push({ kind: burst, x: f.x + a[0] + (k % 3) - 1, y: f.y + a[1], vx: 2 + Math.random() * 4, vy: -8 - Math.random() * 6, t: -k * 0.08, life: 2.2 });
      } else if (burst === 'bubbles' && f.s.anchors?.blue) {
        const [bx, by, bw, bh] = f.s.anchors.blue;
        this.parts.push({ kind: 'bubble', x: f.x + bx + Math.random() * bw, y: f.y + by + bh - 1, vx: 0, vy: -12 - Math.random() * 8, t: -k * 0.05, life: 2, clip: [f.x + bx, f.y + by, bw, bh] });
      } else this.parts.push({ kind: 'spark', x: cx, y: cy, vx: Math.cos(ang) * 16, vy: Math.sin(ang) * 10 - 10, t: 0, life: 0.9 });
    }
  }

  update(dt: number, floors: ScreenFloor[], T: number, N: number) {
    for (const f of floors) {
      const fx = FLOOR_LIFE[f.key]?.idle;
      const a = f.s.anchors;
      if (!fx || !a) continue;
      const due = this.emitAt.get(f.key) ?? 0;
      if (T < due) continue;
      if (fx === 'smoke') {
        this.parts.push({ kind: 'smoke', x: f.x + a.top[0], y: f.y + a.top[1] - 1, vx: 2.5 + Math.random() * 2, vy: -5 - Math.random() * 3, t: 0, life: 3 });
        this.emitAt.set(f.key, T + 0.55 + Math.random() * 0.4);
      } else if (fx === 'steam') {
        const sx = a.window ? a.window[0] + a.window[2] / 2 : f.s.w / 2;
        const sy = a.window ? a.window[1] : f.s.h * 0.35;
        this.parts.push({ kind: 'steam', x: f.x + sx + (Math.random() * 6 - 3), y: f.y + sy, vx: Math.random() * 2 - 1, vy: -6 - Math.random() * 3, t: 0, life: 1.6 });
        this.emitAt.set(f.key, T + 0.7 + Math.random() * 0.6);
      } else if (fx === 'bubbles' && a.blue) {
        const [bx, by, bw, bh] = a.blue;
        this.parts.push({ kind: 'bubble', x: f.x + bx + 1 + Math.random() * (bw - 2), y: f.y + by + bh - 1, vx: 0, vy: -5 - Math.random() * 4, t: 0, life: 3, clip: [f.x + bx, f.y + by, bw, bh] });
        this.emitAt.set(f.key, T + 0.4 + Math.random() * 0.5);
      }
    }
    for (const p of this.parts) {
      p.t += dt;
      if (p.t < 0) continue;
      p.x += p.vx * dt + (p.kind === 'steam' ? Math.sin(T * 4 + p.y) * 0.08 : 0);
      p.y += p.vy * dt;
      if (p.kind === 'spark') p.vy += 24 * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life && (!p.clip || p.y > p.clip[1]));
    // 밤 — 불 켜진 창 하나를 사람 그림자가 지나간다
    if (N > 0.5 && !this.shadow && T > this.nextShadow) {
      const lit = floors.filter((f) => f.s.anchors?.window && f.key !== 'base');
      if (lit.length) this.shadow = { key: lit[Math.floor(Math.random() * lit.length)].key, start: T, dir: Math.random() < 0.5 ? 1 : -1 };
      this.nextShadow = T + 8 + Math.random() * 10;
    }
    if (this.shadow && T - this.shadow.start > 2.8) this.shadow = null;
  }

  /** 탑 위에 덧그린다(창 불빛 다음) */
  draw(g: CanvasRenderingContext2D, floors: ScreenFloor[], T: number, N: number, dim: number) {
    for (const f of floors) {
      const a = f.s.anchors;
      // 무전기의 빨간 불 — 1.2초마다 깜빡
      if (FLOOR_LIFE[f.key]?.idle === 'blink' && a?.red && Math.floor(T / 0.6) % 2 === 0) {
        g.fillStyle = '#ff5a4a';
        g.fillRect(f.x + a.red[0], f.y + a.red[1], 1, 1);
        if (N > 0.3) { g.fillStyle = `rgba(255,80,60,${0.25 * N})`; g.fillRect(f.x + a.red[0] - 1, f.y + a.red[1] - 1, 3, 3); }
      }
    }
    // 사람 그림자
    if (this.shadow) {
      const f = floors.find((x) => x.key === this.shadow!.key);
      const w = f?.s.anchors?.window;
      if (f && w) {
        const p = (T - this.shadow.start) / 2.8;
        const span = w[2] + 6;
        const sx = this.shadow.dir > 0 ? w[0] - 3 + p * span : w[0] + w[2] + 3 - p * span;
        const top = f.y + w[1] + Math.max(0, w[3] - 6);
        g.save();
        g.beginPath(); g.rect(f.x + w[0], f.y + w[1], w[2], w[3]); g.clip();
        g.fillStyle = `rgba(40,24,40,${0.7 * N})`;
        g.fillRect(Math.round(f.x + sx), top + 1, 3, 5);      // 몸
        g.fillRect(Math.round(f.x + sx) + 1, top - 1, 2, 2);  // 머리
        g.restore();
      }
    }
    // 입자
    for (const p of this.parts) {
      if (p.t < 0) continue;
      const k = 1 - p.t / p.life;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (p.clip && (x < p.clip[0] || x >= p.clip[0] + p.clip[2])) continue;
      if (p.kind === 'smoke') {
        const shade = Math.round(200 - dim * 90);
        const size = p.t > 1.2 ? 2 : 1;
        g.fillStyle = `rgba(${shade},${shade},${shade + 10},${0.55 * k})`;
        g.fillRect(x, y, size, size);
      } else if (p.kind === 'steam') {
        g.fillStyle = `rgba(255,255,255,${0.5 * k})`; g.fillRect(x, y, 1, 1);
      } else if (p.kind === 'bubble') {
        g.fillStyle = `rgba(220,245,255,${0.85 * Math.min(1, k * 2)})`; g.fillRect(x, y, 1, 1);
      } else if (p.kind === 'note') {
        g.fillStyle = `rgba(255,240,180,${k})`;
        NOTE.forEach((row, r) => { for (let c = 0; c < 3; c++) if (row[c] === '#') g.fillRect(x + c, y + r, 1, 1); });
      } else {
        g.fillStyle = `rgba(255,240,170,${k})`; g.fillRect(x, y, 1, 1);
      }
    }
    // 누른 층의 말풍선
    for (const [key, at] of this.reacts) {
      const since = T - at;
      if (since > 1.8) { this.reacts.delete(key); continue; }
      const f = floors.find((x) => x.key === key);
      const life = FLOOR_LIFE[key];
      if (f && life) drawBubble(g, life.emote, f.x + f.s.w / 2, f.y + 4 - Math.round(since * 4), 1 - Math.max(0, since - 1.2) / 0.6);
    }
  }
}
