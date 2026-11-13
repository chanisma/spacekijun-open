/**
 * 디지털형 «돌벽돌» 껍데기 — 디지털 몬스터 COLOR 실물 사진을 보고 옮김(2026-10-07 사용자 요청 «실제 이미지 찾아서 더 정확하게»).
 *
 * 실물: 몸 앞면 전체에 크기가 제각각인 돌벽돌이 몸과 «같은 색»으로 돋아 있다(색 대비가 아니라 돋을무늬로 읽힌다).
 * 화면은 다른 색의 창틀이 두르고(deviceScene 이 3D 로 만든다), 버튼은 진한 색 동그라미, 버튼 옆에 작은 리셋 구멍.
 * 돋을무늬는 범프 맵 — 줄눈이 파이고 벽돌 모서리가 깎이고 겉이 조금 오톨도톨하다. 색은 벽돌마다 아주 조금만 다르다.
 * 가챠의 «기기 디자인»을 입히면 몸·창틀·버튼 색만 그 사양으로 바뀐다(모양·돋을무늬는 그대로).
 */
import { DIGIMON_MODEL, toShellCanvas, type DeviceModel } from './dims';
import type { ShellTheme } from './shellTheme';
import type { ShellSpec } from '../model/catalog';
import { backEmblemSpot, drawPlanet, paintCircuit } from './shellArt';

interface BrickPalette { body: string; mortar: string; frame: string; button: string; socket: string; side: string; print: string }

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';
const MORTAR = 0.05;

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvasOf(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d')! };
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const shade = (c: string, k: number) => {
  const [r, g, b] = hex(c);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

interface Stone { x: number; y: number; w: number; h: number; tone: number }

/** 크기가 제각각인 돌벽돌 — 줄 높이도 조금씩, 한 줄 안에서 폭이 다르고 이음매가 엇갈린다. 같은 씨앗이면 같은 벽(색·돋을무늬가 맞물린다). */
function stones(m: DeviceModel, seed: number): Stone[] {
  const rnd = seeded(seed);
  const out: Stone[] = [];
  let y = -m.H / 2 - 0.1;
  while (y < m.H / 2) {
    const h = 0.34 + rnd() * 0.16;
    let x = -m.W / 2 - rnd() * 0.5;
    while (x < m.W / 2) {
      const w = 0.42 + rnd() * 0.62;
      out.push({ x, y, w, h, tone: rnd() * 2 - 1 });
      x += w;
    }
    y += h;
  }
  return out;
}

function stoneRect(m: DeviceModel, st: Stone, size: number) {
  const unit = size / m.H;
  const [px, py] = toShellCanvas(m, st.x, st.y + st.h, size);
  const gap = MORTAR * unit;
  return { x: px + gap / 2, y: py + gap / 2, w: st.w * unit - gap, h: st.h * unit - gap, r: 0.05 * unit };
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, Math.max(1, w), Math.max(1, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}

const RESET = { dx: -0.4, dy: -0.45, r: 0.07 };

function printName(m: DeviceModel, g: CanvasRenderingContext2D, size: number, fill: string) {
  const unit = size / m.H;
  const f = m.frame!;
  const [nx, ny] = toShellCanvas(m, f.x - f.w / 2 + 0.05, f.y - f.h / 2 - 0.3, size);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  g.font = `900 ${0.17 * unit}px ${FONT}`;
  g.fillText('DIGI·PET', nx, ny);
}

function brickFront(m: DeviceModel, pal: BrickPalette, seed: number) {
  return (size: number): HTMLCanvasElement => {
    const { c, g } = canvasOf(size);
    const unit = size / m.H;
    const rnd = seeded(seed + 7);
    g.fillStyle = pal.mortar;
    g.fillRect(0, 0, size, size);
    for (const st of stones(m, seed)) {
      const r = stoneRect(m, st, size);
      g.fillStyle = shade(pal.body, st.tone * 0.05);
      rr(g, r.x, r.y, r.w, r.h, r.r);
      g.fill();
      // 위 모서리 빛 · 아래 모서리 그늘(깎인 모서리)
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(r.x + r.r, r.y, r.w - r.r * 2, 0.025 * unit);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(r.x + r.r, r.y + r.h - 0.03 * unit, r.w - r.r * 2, 0.03 * unit);
      for (let k = 0; k < 6; k += 1) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
        g.beginPath();
        g.arc(r.x + rnd() * r.w, r.y + rnd() * r.h, (0.01 + rnd() * 0.03) * unit, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 리셋 구멍 — 버튼 B 와 C 사이 왼쪽
    const b = m.buttons;
    const [hx, hy] = toShellCanvas(m, b.xs[0] + RESET.dx, b.y + RESET.dy, size);
    g.fillStyle = '#17141f';
    g.beginPath(); g.arc(hx, hy, RESET.r * unit, 0, Math.PI * 2); g.fill();
    printName(m, g, size, shade(pal.body, -0.22));
    return c;
  };
}

function brickBump(m: DeviceModel, seed: number) {
  return (size: number): HTMLCanvasElement => {
    const { c, g } = canvasOf(size);
    const unit = size / m.H;
    const rnd = seeded(seed + 3);
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    for (const st of stones(m, seed)) {
      const r = stoneRect(m, st, size);
      const lift = 205 + Math.floor(rnd() * 35);
      // 모서리가 깎인 돌 — 안쪽으로 갈수록 높아진다(가장자리 0.06cm 경사)
      const edge = 0.06 * unit;
      for (let k = 0; k <= 4; k += 1) {
        const t = k / 4;
        const v = Math.round(lift * (0.45 + 0.55 * t));
        g.fillStyle = `rgb(${v},${v},${v})`;
        rr(g, r.x + edge * t, r.y + edge * t, r.w - edge * 2 * t, r.h - edge * 2 * t, r.r - edge * t * 0.5);
        g.fill();
      }
      // 오톨도톨한 돌 겉면
      for (let k = 0; k < 26; k += 1) {
        const v = Math.floor(lift - 40 + rnd() * 70);
        g.fillStyle = `rgba(${v},${v},${v},0.55)`;
        g.fillRect(r.x + edge + rnd() * (r.w - edge * 2), r.y + edge + rnd() * (r.h - edge * 2), (0.008 + rnd() * 0.025) * unit, (0.008 + rnd() * 0.02) * unit);
      }
    }
    // 리셋 구멍은 파여 있다 · 이름은 살짝 돋는다
    const b = m.buttons;
    const [hx, hy] = toShellCanvas(m, b.xs[0] + RESET.dx, b.y + RESET.dy, size);
    g.fillStyle = '#000';
    g.beginPath(); g.arc(hx, hy, RESET.r * unit * 1.2, 0, Math.PI * 2); g.fill();
    printName(m, g, size, '#ffffff');
    return c;
  };
}

function brickBack(m: DeviceModel, pal: BrickPalette) {
  return (size: number): HTMLCanvasElement => {
    const { c, g } = canvasOf(size);
    const unit = size / m.H;
    g.translate(size, 0);
    g.scale(-1, 1);
    g.fillStyle = shade(pal.body, -0.06);
    g.fillRect(0, 0, size, size);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = shade(pal.body, -0.32);
    const [tx, ty] = toShellCanvas(m, 0, 1.0, size);
    g.font = `900 ${0.2 * unit}px ${FONT}`;
    g.fillText('DIGI · PET  COLOR', tx, ty);
    g.font = `600 ${0.11 * unit}px ${FONT}`;
    g.fillText('별빛 아카데미 공방 · A 를 길게 누르면 알림', tx, ty + 0.28 * unit);
    return c;
  };
}

// 실물 Ver.3 색 — 보라 몸 · 민트 창틀 · 주황 버튼
const VER3: BrickPalette = { body: '#6c4fd8', mortar: '#4a33a8', frame: '#5fd8b4', button: '#ff9b3d', socket: '#3d2a8c', side: '#5f44c6', print: '#ffffff' };

function brickTheme(id: string, name: string, pal: BrickPalette, seed: number): ShellTheme {
  const m = DIGIMON_MODEL;
  return {
    id, name, model: m,
    bezel: '#221f30', button: pal.button, socket: pal.socket, sheen: '#ffffff', trim: pal.side, iridescence: 0, label: pal.print,
    paint: brickFront(m, pal, seed), paintBack: brickBack(m, pal), bump: brickBump(m, seed),
    bumpScale: 2.6, roughness: 0.64, clearcoat: 0.1, side: pal.side, frame: pal.frame,
  };
}

export const DIGI_SHELL: ShellTheme = brickTheme('digi-ver3', '보라 돌벽돌', VER3, 1997);

const cache = new Map<string, ShellTheme>();

/** 가챠 껍데기를 디지털형에 — 몸은 사양의 가운데 색, 창틀은 테두리 색, 버튼은 소켓 색 */
export function brickFromSpec(id: string, name: string, spec: ShellSpec): ShellTheme {
  const hit = cache.get(id);
  if (hit) return hit;
  let seed = 11;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const body = /^#[0-9a-f]{6}$/i.test(spec.base[1]) ? spec.base[1] : VER3.body;
  const base = brickTheme(`${id}:digi`, name, {
    body, mortar: shade(body, -0.3), frame: spec.trim, button: spec.socket, socket: shade(body, -0.45), side: shade(body, -0.1), print: spec.print,
  }, seed);
  const theme = spec.motif === 'circuit' || spec.back ? withSpecArt(base, spec, seed) : base;
  cache.set(id, theme);
  return theme;
}

/** 코드 껍데기(2026-11-11 «글리치»)의 회로·행성을 벽돌 위에 덧그린다 — 그림 조각은 달걀형과 같은 shellArt */
function withSpecArt(theme: ShellTheme, spec: ShellSpec, seed: number): ShellTheme {
  const m = theme.model;
  const s = m.screen;
  const b = m.buttons;
  const avoid = (x: number, y: number) =>
    (Math.abs(x - s.x) < s.w / 2 + 0.3 && Math.abs(y - s.y) < s.h / 2 + 0.3)
    || (Math.abs(x - b.xs[0]) < b.r + 0.32 && Math.abs(y - b.y) < 1.35);
  return {
    ...theme,
    paint: (size) => {
      const c = theme.paint(size);
      if (spec.motif === 'circuit') paintCircuit(c.getContext('2d')!, m, size, spec, seeded(seed + 3), avoid, { traces: 26 });
      return c;
    },
    paintBack: (size) => {
      const c = theme.paintBack(size); // 좌우를 뒤집은 그리기 상태가 그대로 남아 있다 — 행성도 같은 좌표로
      const spot = spec.back === 'planet' ? backEmblemSpot(m) : null;
      if (spec.motif === 'circuit') {
        // 뒷면에도 회로(덮개 자리 · 행성 둘레는 비운다) — 앞면만 회로면 돌려 볼 때 다른 물건처럼 보였다
        const coverY = b.y + 0.9;
        paintCircuit(c.getContext('2d')!, m, size, spec, seeded(seed + 5), (x, y) =>
          (Math.abs(x) < m.W * 0.3 && Math.abs(y - coverY) < 0.95) || (!!spot && Math.hypot(x / 2, y - spot.y) < spot.r * 1.25),
        { traces: 20, glitch: false });
      }
      if (spot) {
        const [cx, cy] = toShellCanvas(m, 0, spot.y, size);
        drawPlanet(c.getContext('2d')!, cx, cy, spot.r * (size / m.H), spec);
      }
      return c;
    },
    ...(spec.roughness !== undefined ? { roughness: spec.roughness } : {}),
    ...(spec.clearcoat !== undefined ? { clearcoat: spec.clearcoat } : {}),
  };
}
