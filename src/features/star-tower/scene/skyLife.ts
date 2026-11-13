/**
 * 하늘의 생명 — 방문자(갈매기·열기구·비공정·하늘 고래…) · 오로라 · 무지개 · 유성우.
 *
 * 방문자는 «지금 카메라가 보는 높이»와 «탑이 닿은 높이» 둘 다 맞을 때만 생긴다 — 화면 밖에서 태어나 아무도 못 보는
 * 방문자를 만들지 않고, 아직 닿지 않은 높이의 방문자가 미리 나오지 않게.
 * 누르면 튀어 오르고 말풍선(작은 도트 그림 — 글자는 캔버스에 쓰지 않는다: 저해상도라 글자가 뭉개진다)과 반짝이를 낸다.
 */
import { VISITORS, VISITOR_BY_KEY, visitorUnlocked, type Visitor } from '../model/visitors';
import type { Sprite } from './assets';
import { drawBubble } from './pixelBubble';

export interface SkyContext {
  W: number;
  H: number;
  cam: number;
  T: number;
  /** 0 = 낮 · 1 = 밤 */
  N: number;
  rain: boolean;
  floors: number;
  /** 완성한 탑 — 등성 방문자(2026-10-23) */
  towers?: number;
  /** 수면의 화면 y(물이 안 보이면 H) */
  waterY: number;
  screenY: (a: number) => number;
  /** 밤의 어둠(탑과 같은 값) */
  dim: number;
}

interface Active {
  v: Visitor;
  x: number;
  a: number;
  vx: number;
  phase: number;
  born: number;
  reactAt: number;
  flip: boolean;
  /** rise(고래 꼬리) — 0 → 1 → 0 */
  life?: number;
}

interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string }

export class SkyLife {
  private active: Active[] = [];
  private puffs: Puff[] = [];
  private nextSpawn = 2;
  private dimCache = new Map<string, HTMLCanvasElement>();
  private rainbowCache: { W: number; c: HTMLCanvasElement } | null = null;

  constructor(private sprites: Record<string, Sprite>) {}

  private sprite(v: Visitor, T: number, phase: number): Sprite | undefined {
    const frames = v.sprites.map((s) => this.sprites[s]).filter(Boolean);
    if (!frames.length) return undefined;
    return v.motion === 'flap' ? frames[Math.floor(T * 6 + phase) % frames.length] : frames[0];
  }

  /** 지금 보이는 높이 띠 */
  private visibleBand(c: SkyContext): [number, number] {
    return [c.cam + 8, c.cam + c.H - 8];
  }

  update(c: SkyContext, dt: number) {
    const [lo, hi] = this.visibleBand(c);
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      this.nextSpawn = 4 + Math.random() * 6;
      if (this.active.length < 4) this.spawn(c, lo, hi);
    }
    for (const a of this.active) {
      const boost = c.T - a.reactAt < 1.4 ? 2.2 : 1;
      a.x += a.vx * dt * boost;
      if (a.life !== undefined) a.life += dt;
    }
    this.active = this.active.filter((a) => {
      if (a.v.motion === 'rise') return (a.life ?? 0) < 5;
      return a.x > -120 && a.x < c.W + 120;
    });
    for (const p of this.puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 14 * dt; }
    this.puffs = this.puffs.filter((p) => p.t < p.life);
  }

  private spawn(c: SkyContext, lo: number, hi: number) {
    const pool = VISITORS.filter((v) => {
      if (!visitorUnlocked(v, c.floors, c.towers ?? 0)) return false;
      if (v.nightOnly && c.N < 0.5) return false;
      if (c.rain && v.motion !== 'rise' && v.key !== 'gull') return false; // 비 오는 날엔 갈매기와 고래만
      if (v.motion === 'rise') return c.waterY < c.H - 12;
      return v.band[1] > lo && v.band[0] < hi;
    });
    if (!pool.length) return;
    let r = Math.random() * pool.reduce((s, v) => s + v.weight, 0);
    const v = pool.find((p) => (r -= p.weight) < 0) ?? pool[0];
    const s = this.sprites[v.sprites[0]];
    if (!s) return;
    if (v.motion === 'rise') {
      const side = Math.random() < 0.5 ? 0.12 : 0.72;
      this.active.push({ v, x: Math.round(c.W * side + Math.random() * c.W * 0.14), a: 0, vx: 0, phase: 0, born: c.T, reactAt: -9, flip: Math.random() < 0.5, life: 0 });
      return;
    }
    const from = Math.max(lo, v.band[0]);
    const to = Math.min(hi - s.h, v.band[1]);
    if (to <= from) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = v.speed[0] + Math.random() * (v.speed[1] - v.speed[0]);
    const a = from + Math.random() * (to - from);
    const x = dir > 0 ? -s.w - 4 : c.W + 4;
    // 큰 그림은 오른쪽을 본다 — 왼쪽으로 가면 뒤집는다
    const base = { v, a, vx: dir * speed, phase: Math.random() * 6, born: c.T, reactAt: -9, flip: dir < 0 };
    this.active.push({ ...base, x });
    // 갈매기는 가끔 무리(V 자)로 — 구름 아래(3층)부터
    if (v.key === 'gull' && c.floors >= 3 && Math.random() < 0.35) {
      for (let k = 1; k <= 4; k++) {
        const side = k % 2 ? 1 : -1;
        const rank = Math.ceil(k / 2);
        this.active.push({ ...base, x: x - dir * rank * 10, a: a + side * rank * 5, phase: Math.random() * 6 });
      }
    }
  }

  private place(a: Active, c: SkyContext): { s: Sprite; x: number; y: number } | null {
    const s = this.sprite(a.v, c.T, a.phase);
    if (!s) return null;
    const since = c.T - a.reactAt;
    const hop = since < 0.6 ? -Math.sin((since / 0.6) * Math.PI) * 5 : 0;
    let y: number;
    if (a.v.motion === 'rise') {
      const t = a.life ?? 0;
      const up = t < 1.2 ? t / 1.2 : t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) / 1.2);
      // 수평선의 실제 자리(H + cam) — waterY 는 화면 아래에서 멈춰, 시점이 오르면 고래가 따라 올라온다
      y = Math.round(c.H + c.cam - s.h * up * 0.85);
    } else {
      const wob = a.v.motion === 'bob' ? Math.sin(c.T * 1.3 + a.phase) * 2 : a.v.motion === 'swim' ? Math.sin(c.T * 0.6 + a.phase) * 3 : a.v.motion === 'flap' ? Math.sin(c.T * 3 + a.phase) * 1 : 0;
      y = Math.round(c.screenY(a.a) - s.h + wob + hop);
    }
    return { s, x: Math.round(a.x), y };
  }

  /** 밤엔 탑처럼 어둡게 — 스프라이트마다 «곱하기» 판을 만들어 둔다(어둠 6단계) */
  private dimmed(name: string, s: Sprite, dim: number): CanvasImageSource {
    const level = Math.round(dim * 6);
    if (level === 0) return s.img;
    const key = `${name}|${level}`;
    let hit = this.dimCache.get(key);
    if (!hit) {
      hit = document.createElement('canvas');
      hit.width = s.w; hit.height = s.h;
      const x = hit.getContext('2d')!;
      x.drawImage(s.img, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = `rgba(20,22,60,${level / 6})`;
      x.fillRect(0, 0, s.w, s.h);
      this.dimCache.set(key, hit);
    }
    return hit;
  }

  /** layer: behind = 탑 뒤(큰 것) · front = 탑 앞(갈매기·연·고래 꼬리) */
  draw(g: CanvasRenderingContext2D, c: SkyContext, layer: 'behind' | 'front') {
    for (const a of this.active) {
      const front = a.v.key === 'gull' || a.v.key === 'kite' || a.v.motion === 'rise';
      if (front !== (layer === 'front')) continue;
      const p = this.place(a, c);
      if (!p) continue;
      const img = this.dimmed(a.v.sprites[0] + (p.s === this.sprites[a.v.sprites[1]] ? '#2' : ''), p.s, c.dim);
      if (a.flip) {
        g.save(); g.translate(p.x + p.s.w, p.y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore();
      } else g.drawImage(img, p.x, p.y);
      const since = c.T - a.reactAt;
      if (since < 1.8) drawBubble(g, a.v.emote, p.x + Math.round(p.s.w / 2), p.y - 3 - Math.round(since * 4), 1 - Math.max(0, since - 1.2) / 0.6);
    }
    if (layer === 'front') {
      for (const q of this.puffs) {
        g.fillStyle = `rgba(${q.c},${Math.max(0, 1 - q.t / q.life)})`;
        g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
      }
    }
  }

  /** 누른 자리의 방문자(맨 앞 것부터). 반응까지 일으킨다. */
  tap(x: number, y: number, c: SkyContext): string | null {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      const p = this.place(a, c);
      if (!p) continue;
      const pad = 4; // 작은 갈매기도 손가락으로 누를 수 있게
      if (x >= p.x - pad && x <= p.x + p.s.w + pad && y >= p.y - pad && y <= p.y + p.s.h + pad) {
        a.reactAt = c.T;
        if (a.v.motion === 'rise') a.life = Math.min(a.life ?? 0, 2.2);
        const cx = p.x + p.s.w / 2;
        const color = a.v.key === 'whale-tail' || a.v.key === 'sky-whale' ? '210,235,255' : '255,240,170';
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2;
          this.puffs.push({ x: cx, y: p.y + (a.v.key === 'sky-whale' ? 2 : p.s.h / 2), vx: Math.cos(ang) * 14, vy: Math.sin(ang) * 10 - 12, t: 0, life: 0.9, c: color });
        }
        return a.v.key;
      }
    }
    return null;
  }

  /** 시험·연출용 — 특정 방문자를 지금 화면에 불러온다 */
  summon(key: string, c: SkyContext) {
    const v = VISITOR_BY_KEY[key];
    const s = v && this.sprites[v.sprites[0]];
    if (!v || !s) return;
    if (v.motion === 'rise') { this.active.push({ v, x: Math.round(c.W * 0.2), a: 0, vx: 0, phase: 0, born: c.T, reactAt: -9, flip: false, life: 1.3 }); return; }
    const [lo, hi] = this.visibleBand(c);
    const a = Math.max(lo, Math.min(hi - s.h, (Math.max(lo, v.band[0]) + Math.min(hi, v.band[1])) / 2));
    this.active.push({ v, x: Math.round(c.W * 0.15), a, vx: v.speed[0] || 4, phase: 0, born: c.T, reactAt: -9, flip: false });
  }

  // ── 하늘의 큰 장면 ─────────────────────────────────────────

  /** 오로라 — 높은 하늘(10층)부터, 맑은 밤. 세계 높이 430~760 에 커튼처럼 */
  aurora(g: CanvasRenderingContext2D, c: SkyContext) {
    if (c.floors < 10 || c.rain || c.N < 0.6) return;
    const strength = (c.N - 0.6) / 0.4;
    for (let x = 0; x < c.W; x++) {
      const wave = Math.sin(x * 0.07 + c.T * 0.25) + Math.sin(x * 0.023 - c.T * 0.13) * 0.8;
      const base = 470 + wave * 26;
      const len = 90 + Math.sin(x * 0.05 + c.T * 0.4) * 30;
      const k = Math.max(0, 0.5 + 0.5 * Math.sin(x * 0.11 + c.T * 0.6 + wave));
      for (let seg = 0; seg < 6; seg++) {
        const a0 = base + (seg / 6) * len;
        const y1 = Math.round(c.screenY(a0 + len / 6));
        const y0 = Math.round(c.screenY(a0));
        if (y0 < 0 || y1 > c.waterY) continue;
        const t = seg / 5;
        const col = t < 0.5 ? `90,255,170` : `170,120,255`;
        g.fillStyle = `rgba(${col},${(0.16 * (1 - t * 0.7) * k * strength).toFixed(3)})`;
        g.fillRect(x, y1, 1, y0 - y1);
      }
    }
  }

  /** 무지개 — 비가 그친 낮(지난 3시간이 비, 지금 맑음). 수면에서 솟는 반원 */
  rainbow(g: CanvasRenderingContext2D, c: SkyContext) {
    if (!this.rainbowCache || this.rainbowCache.W !== c.W) {
      const R = Math.round(Math.max(120, c.W * 0.55));
      const cv = document.createElement('canvas');
      cv.width = c.W; cv.height = R + 2;
      const x = cv.getContext('2d')!;
      const cols = ['255,90,90', '255,170,70', '255,235,110', '120,220,120', '110,170,255', '170,120,255'];
      const cx = Math.round(c.W * 0.32);
      for (let py = 0; py <= R; py++) for (let px = 0; px < c.W; px++) {
        const d = Math.hypot(px - cx, R - py);
        const band = Math.floor(R - d);
        if (band >= 0 && band < 6) { x.fillStyle = `rgba(${cols[band]},0.22)`; x.fillRect(px, py, 1, 1); }
      }
      this.rainbowCache = { W: c.W, c: cv };
    }
    const cv = this.rainbowCache.c;
    g.drawImage(cv, 0, Math.round(c.waterY - cv.height + 2));
  }
}
