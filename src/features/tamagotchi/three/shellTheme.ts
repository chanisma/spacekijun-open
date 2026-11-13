/**
 * 껍데기 디자인 — 색·무늬·인쇄를 캔버스로 그려 몸통에 평면 투영한다. 테마 하나 = 기기 모양 하나.
 *
 *  · 별빛(classic) — 아카데미의 밤하늘: 남색 광택 껍데기, 금빛 별 인쇄, 크림색 버튼
 *  · 별사탕(color) — 최근 컬러 기종의 진주빛 파스텔: 라일락→분홍 그라데이션, 무지갯빛 광택, 흰 하트·별 인쇄, 검은 광택 화면 테
 *
 * Phase 3(2026-10-07): 가챠 «기기 디자인»은 `shellFromSpec` — 색·무늬 사양(model/catalog.ts) 하나로 두 기종 모두에 입힌다(모델은 그대로).
 */
import { CLASSIC_MODEL, COLOR_MODEL, SUITCASE_MODEL, eggOutline, toShellCanvas, type DeviceModel } from './dims';
import { ITEM_BY_ID, type ShellSpec } from '../model/catalog';
import { brickFromSpec, DIGI_SHELL } from './brickShell';
import { TRAVEL_SHELL } from './suitcaseShell';
import { backEmblemSpot, drawChip, drawPlanet, paintCircuit, shiftSlices } from './shellArt';

export interface ShellTheme {
  id: string;
  name: string;
  model: DeviceModel;
  bezel: string;
  button: string;
  socket: string;
  sheen: string;
  /** 고리·배터리 덮개 같은 부품 색 */
  trim: string;
  /** 무지갯빛 광택(0 = 없음) */
  iridescence: number;
  /** 버튼 글씨 색 */
  label: string;
  /** size×size 캔버스에 앞면 그림 */
  paint(size: number): HTMLCanvasElement;
  /** 뒷면 그림 — 뒤에서 볼 때 바르게 읽히도록 좌우를 뒤집어 그린다 */
  paintBack(size: number): HTMLCanvasElement;
  /** 돋을무늬(범프 맵) — 밝을수록 솟는다. 디지털형의 벽돌 */
  bump?(size: number): HTMLCanvasElement;
  /** 뒷면 돋을무늬 — paintBack 처럼 좌우를 뒤집어 그린다(여행 가방형의 체리 각인) */
  bumpBack?(size: number): HTMLCanvasElement;
  bumpScale?: number;
  /** 옆면 색(디지털형 — 옆은 벽돌 없이 매끈하다) */
  side?: string;
  /** 화면을 두른 창틀 색(디지털형) */
  frame?: string;
  /** 바탕 거칠기·투명 코트(없으면 기종 기본값) */
  roughness?: number;
  clearcoat?: number;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  g.fill();
}

function eggPath(g: CanvasRenderingContext2D, m: DeviceModel, inset: number, size: number) {
  const pts = eggOutline(m, 200, inset);
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const [px, py] = toShellCanvas(m, x, y, size);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  });
  g.closePath();
}

function roundRect(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(cx - w / 2 + r, cy - h / 2);
  g.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r);
  g.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r);
  g.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r);
  g.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r);
  g.closePath();
}

function canvasOf(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d')! };
}

const FONT = '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif';

// ── 별빛 (클래식) ─────────────────────────────────────────────────────

function starlightFront(size: number): HTMLCanvasElement {
  const m = CLASSIC_MODEL;
  const { c, g } = canvasOf(size);
  const unit = size / m.H;
  const base = g.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, '#3e44b6');
  base.addColorStop(0.5, '#30359a');
  base.addColorStop(1, '#222574');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rnd = seeded(20261006);
  for (let i = 0; i < 6; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = (0.25 + rnd() * 0.35) * size;
    const neb = g.createRadialGradient(x, y, 0, x, y, r);
    neb.addColorStop(0, i % 2 ? 'rgba(170,140,255,0.16)' : 'rgba(120,190,255,0.12)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = neb;
    g.fillRect(0, 0, size, size);
  }
  const s = m.screen;
  const avoid = (x: number, y: number) =>
    (Math.abs(x) < s.w / 2 + 0.38 && Math.abs(y - s.y) < s.h / 2 + 0.38)
    || (y < m.buttons.y + 0.5 && y > m.buttons.y - 0.85 && Math.abs(x) < 1.55)
    || (y > m.H / 2 - 0.85 && Math.abs(x) < 1.1);
  for (let i = 0; i < 150; i += 1) {
    const x = (rnd() - 0.5) * m.W;
    const y = (rnd() - 0.5) * m.H;
    if (avoid(x, y)) continue;
    const [px, py] = toShellCanvas(m, x, y, size);
    const big = rnd() < 0.18;
    g.fillStyle = big ? 'rgba(255, 222, 140, 0.95)' : rnd() < 0.5 ? 'rgba(255, 236, 190, 0.8)' : 'rgba(255,255,255,0.65)';
    if (big) sparkle(g, px, py, (0.05 + rnd() * 0.05) * unit);
    else { g.beginPath(); g.arc(px, py, (0.008 + rnd() * 0.014) * unit, 0, Math.PI * 2); g.fill(); }
  }
  g.strokeStyle = 'rgba(240, 205, 120, 0.95)';
  g.lineWidth = 0.032 * unit;
  eggPath(g, m, 0.36, size);
  g.stroke();
  g.strokeStyle = 'rgba(240, 205, 120, 0.45)';
  g.lineWidth = 0.014 * unit;
  eggPath(g, m, 0.46, size);
  g.stroke();
  const [sx, sy] = toShellCanvas(m, 0, s.y, size);
  g.strokeStyle = 'rgba(240, 205, 120, 0.85)';
  g.lineWidth = 0.022 * unit;
  roundRect(g, sx, sy, (s.w + 0.66) * unit, (s.h + 0.66) * unit, 0.5 * unit);
  g.stroke();
  const [lx, ly] = toShellCanvas(m, 0, m.H / 2 - 0.55, size);
  g.fillStyle = 'rgba(250, 225, 160, 0.95)';
  g.font = `800 ${0.17 * unit}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('S P A C E K I J U N', lx, ly);
  sparkle(g, lx, ly - 0.24 * unit, 0.07 * unit);
  g.font = `700 ${0.16 * unit}px ${FONT}`;
  g.fillStyle = 'rgba(246, 236, 214, 0.9)';
  ['A', 'S', 'D'].forEach((letter, i) => {
    const [bx, by] = toShellCanvas(m, m.buttons.xs[i], m.buttons.y + m.buttons.arc[i] - 0.5, size);
    g.fillText(letter, bx, by);
  });
  return c;
}

function starlightBack(size: number): HTMLCanvasElement {
  const m = CLASSIC_MODEL;
  const { c, g } = canvasOf(size);
  const unit = size / m.H;
  g.translate(size, 0);
  g.scale(-1, 1);
  const base = g.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, '#3a40ae');
  base.addColorStop(0.5, '#2d3292');
  base.addColorStop(1, '#20236e');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rnd = seeded(77);
  for (let i = 0; i < 110; i += 1) {
    const x = (rnd() - 0.5) * m.W;
    const y = (rnd() - 0.5) * m.H;
    if (Math.abs(x) < 1.45 && y < 0.35 && y > -1.6) continue;
    const [px, py] = toShellCanvas(m, x, y, size);
    g.fillStyle = rnd() < 0.2 ? 'rgba(255, 222, 140, 0.9)' : 'rgba(255,255,255,0.55)';
    if (rnd() < 0.18) sparkle(g, px, py, (0.04 + rnd() * 0.05) * unit);
    else { g.beginPath(); g.arc(px, py, (0.008 + rnd() * 0.012) * unit, 0, Math.PI * 2); g.fill(); }
  }
  g.strokeStyle = 'rgba(240, 205, 120, 0.7)';
  g.lineWidth = 0.024 * unit;
  eggPath(g, m, 0.36, size);
  g.stroke();
  g.fillStyle = 'rgba(250, 225, 160, 0.9)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [tx, ty] = toShellCanvas(m, 0, 1.35, size);
  g.font = `800 ${0.15 * unit}px ${FONT}`;
  g.fillText('STARLIGHT PET', tx, ty);
  g.font = `600 ${0.1 * unit}px ${FONT}`;
  g.fillStyle = 'rgba(250, 225, 160, 0.7)';
  g.fillText('별빛 아카데미 공방 · C 를 길게 누르면 쓰다듬어요', tx, ty + 0.24 * unit);
  return c;
}

export const STARLIGHT_SHELL: ShellTheme = {
  id: 'starlight', name: '별빛', model: CLASSIC_MODEL,
  bezel: '#0e1136', button: '#f6ecd6', socket: '#0c0f2e', sheen: '#b9b4ff', trim: '#2c3190', iridescence: 0, label: '#f6ecd6',
  paint: starlightFront, paintBack: starlightBack,
};

// ── 별사탕 (컬러) ─────────────────────────────────────────────────────

function candyFront(size: number): HTMLCanvasElement {
  const m = COLOR_MODEL;
  const { c, g } = canvasOf(size);
  const unit = size / m.H;
  const base = g.createLinearGradient(0, 0, size * 0.3, size);
  base.addColorStop(0, '#cdb6ff');
  base.addColorStop(0.45, '#e8bdf0');
  base.addColorStop(1, '#ffb0d2');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // 진주빛 얼룩
  const rnd = seeded(31415);
  for (let i = 0; i < 7; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = (0.2 + rnd() * 0.3) * size;
    const glow = g.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, ['rgba(255,255,255,0.4)', 'rgba(180,230,255,0.3)', 'rgba(255,220,250,0.35)'][i % 3]);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
  }
  const s = m.screen;
  const avoid = (x: number, y: number) =>
    (Math.abs(x) < s.w / 2 + 0.3 && Math.abs(y - s.y) < s.h / 2 + 0.3)
    || (y < m.buttons.y + 0.42 && y > m.buttons.y - 0.75 && Math.abs(x) < 1.35)
    || (y > m.H / 2 - 0.7 && Math.abs(x) < 0.9);
  for (let i = 0; i < 120; i += 1) {
    const x = (rnd() - 0.5) * m.W;
    const y = (rnd() - 0.5) * m.H;
    if (avoid(x, y)) continue;
    const [px, py] = toShellCanvas(m, x, y, size);
    const roll = rnd();
    g.fillStyle = roll < 0.3 ? 'rgba(255,255,255,0.9)' : roll < 0.55 ? 'rgba(255,150,200,0.55)' : 'rgba(160,140,255,0.45)';
    if (roll < 0.22) heart(g, px, py, (0.045 + rnd() * 0.03) * unit);
    else if (roll < 0.4) sparkle(g, px, py, (0.04 + rnd() * 0.04) * unit);
    else { g.beginPath(); g.arc(px, py, (0.01 + rnd() * 0.012) * unit, 0, Math.PI * 2); g.fill(); }
  }
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 0.028 * unit;
  eggPath(g, m, 0.34, size);
  g.stroke();
  g.strokeStyle = 'rgba(214, 170, 90, 0.55)';
  g.lineWidth = 0.012 * unit;
  eggPath(g, m, 0.42, size);
  g.stroke();
  const [lx, ly] = toShellCanvas(m, 0, s.y + s.h / 2 + s.pad + 0.3, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(110, 70, 170, 0.9)';
  g.font = `800 ${0.15 * unit}px ${FONT}`;
  g.fillText('S P A C E K I J U N', lx, ly);
  g.fillStyle = 'rgba(255, 120, 180, 0.95)';
  heart(g, lx, ly - 0.22 * unit, 0.05 * unit);
  g.font = `800 ${0.13 * unit}px ${FONT}`;
  g.fillStyle = 'rgba(110, 70, 170, 0.85)';
  ['A', 'S', 'D'].forEach((letter, i) => {
    const [bx, by] = toShellCanvas(m, m.buttons.xs[i], m.buttons.y + m.buttons.arc[i] - 0.42, size);
    g.fillText(letter, bx, by);
  });
  return c;
}

function candyBack(size: number): HTMLCanvasElement {
  const m = COLOR_MODEL;
  const { c, g } = canvasOf(size);
  const unit = size / m.H;
  g.translate(size, 0);
  g.scale(-1, 1);
  const base = g.createLinearGradient(size, 0, 0, size);
  base.addColorStop(0, '#c9b4ff');
  base.addColorStop(1, '#ffadd0');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const rnd = seeded(2718);
  for (let i = 0; i < 70; i += 1) {
    const x = (rnd() - 0.5) * m.W;
    const y = (rnd() - 0.5) * m.H;
    if (Math.abs(x) < 1.5 && y < 0.2 && y > -1.7) continue;
    const [px, py] = toShellCanvas(m, x, y, size);
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(255,150,200,0.5)';
    heart(g, px, py, (0.035 + rnd() * 0.03) * unit);
  }
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 0.022 * unit;
  eggPath(g, m, 0.34, size);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [tx, ty] = toShellCanvas(m, 0, 1.3, size);
  g.fillStyle = 'rgba(110, 70, 170, 0.85)';
  g.font = `800 ${0.15 * unit}px ${FONT}`;
  g.fillText('STARLIGHT PET · COLOR', tx, ty);
  g.font = `600 ${0.1 * unit}px ${FONT}`;
  g.fillText('다이얼을 돌리듯 A 로 메뉴를 넘겨요', tx, ty + 0.24 * unit);
  return c;
}

export const CANDY_SHELL: ShellTheme = {
  id: 'candy', name: '별사탕', model: COLOR_MODEL,
  bezel: '#16131f', button: '#fff3fa', socket: '#b48cff', sheen: '#ffe6f6', trim: '#c9a8ff', iridescence: 0.32, label: '#6e46aa',
  paint: candyFront, paintBack: candyBack,
};

export const DEFAULT_SHELL = STARLIGHT_SHELL;
export const SHELL_FOR: Record<DeviceModel['style'], ShellTheme> = { classic: STARLIGHT_SHELL, color: CANDY_SHELL, digimon: DIGI_SHELL, suitcase: TRAVEL_SHELL };

/** 이 기종에 입힐 껍데기 — 가챠에서 고른 디자인이 있으면 그것, 없으면 기종의 기본 */
export function themeFor(style: DeviceModel['style'], shellId?: string | null): ShellTheme {
  const item = shellId ? ITEM_BY_ID.get(shellId) : undefined;
  if (!item?.shell) return SHELL_FOR[style];
  if (style === 'digimon') return brickFromSpec(item.id, item.name, item.shell);
  // 여행 가방형은 몸 모양(둥근 네모)에 맞춰 그린다 — 손잡이·모서리 보호대 색은 사양의 trim
  return shellFromSpec(style === 'classic' ? CLASSIC_MODEL : style === 'suitcase' ? SUITCASE_MODEL : COLOR_MODEL, item.id, item.name, item.shell);
}

// ── 가챠 껍데기 (Phase 3) — 색·무늬 사양 하나로 두 기종 모두에 ─────────────────

function flower(g: CanvasRenderingContext2D, x: number, y: number, r: number, center: string) {
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, 0, Math.PI * 2);
    g.fill();
  }
  const keep = g.fillStyle;
  g.fillStyle = center;
  g.beginPath(); g.arc(x, y, r * 0.32, 0, Math.PI * 2); g.fill();
  g.fillStyle = keep;
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y - r); g.lineTo(x + r * 0.7, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.7, y);
  g.closePath(); g.fill();
}

function motifAt(g: CanvasRenderingContext2D, spec: ShellSpec, x: number, y: number, r: number, roll: number) {
  if (spec.motif === 'heart') heart(g, x, y, r);
  else if (spec.motif === 'star') sparkle(g, x, y, r * 1.1);
  else if (spec.motif === 'flower') flower(g, x, y, r, spec.motifColors[1]);
  else if (spec.motif === 'diamond') (roll < 0.5 ? diamond(g, x, y, r) : sparkle(g, x, y, r));
  else if (spec.motif === 'circuit') drawChip(g, x, y, r * 0.8, roll);
  else { g.beginPath(); g.arc(x, y, r * 0.55, 0, Math.PI * 2); g.fill(); }
}

function specFront(m: DeviceModel, spec: ShellSpec, seed: number) {
  return (size: number): HTMLCanvasElement => {
    const { c, g } = canvasOf(size);
    const unit = size / m.H;
    const base = g.createLinearGradient(0, 0, size * 0.3, size);
    base.addColorStop(0, spec.base[0]);
    base.addColorStop(0.45, spec.base[1]);
    base.addColorStop(1, spec.base[2]);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    const rnd = seeded(seed);
    for (let i = 0; i < 8; i += 1) {
      const x = rnd() * size, y = rnd() * size, r = (0.2 + rnd() * 0.3) * size;
      const glow = g.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, spec.blobs[i % 3]);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, size, size);
    }
    const s = m.screen;
    const top = m.style === 'classic';
    const avoid = (x: number, y: number) =>
      (Math.abs(x) < s.w / 2 + 0.32 && Math.abs(y - s.y) < s.h / 2 + 0.32)
      || (y < m.buttons.y + 0.45 && y > m.buttons.y - 0.8 && Math.abs(x) < 1.45)
      || (top ? y > m.H / 2 - 0.85 && Math.abs(x) < 1.1 : false);
    // 네온 회로 껍데기(2026-11-11 «글리치») — 회로·크롬 반사·글리치를 깔고, 그 위에 칩 무늬를 흩는다(글씨는 맨 뒤라 밀리지 않는다)
    if (spec.motif === 'circuit') paintCircuit(g, m, size, spec, rnd, avoid);
    for (let i = 0; i < 120; i += 1) {
      const x = (rnd() - 0.5) * m.W, y = (rnd() - 0.5) * m.H;
      if (avoid(x, y)) continue;
      const [px, py] = toShellCanvas(m, x, y, size);
      const roll = rnd();
      g.fillStyle = spec.motifColors[roll < 0.4 ? 0 : roll < 0.7 ? 1 : 2];
      if (roll < 0.45) motifAt(g, spec, px, py, (0.045 + rnd() * 0.035) * unit, rnd());
      else { g.beginPath(); g.arc(px, py, (0.01 + rnd() * 0.012) * unit, 0, Math.PI * 2); g.fill(); }
    }
    g.strokeStyle = spec.ring;
    g.lineWidth = 0.028 * unit;
    eggPath(g, m, top ? 0.36 : 0.34, size);
    g.stroke();
    if (top) {
      const [sx, sy] = toShellCanvas(m, 0, s.y, size);
      g.lineWidth = 0.02 * unit;
      roundRect(g, sx, sy, (s.w + 0.66) * unit, (s.h + 0.66) * unit, 0.5 * unit);
      g.stroke();
    }
    const [lx, ly] = toShellCanvas(m, 0, top ? m.H / 2 - 0.55 : s.y + s.h / 2 + s.pad + 0.3, size);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = spec.print;
    g.font = `800 ${(top ? 0.17 : 0.15) * unit}px ${FONT}`;
    g.fillText('S P A C E K I J U N', lx, ly);
    g.fillStyle = spec.motifColors[1];
    motifAt(g, spec, lx, ly - 0.23 * unit, 0.055 * unit, 0.3);
    g.font = `800 ${(top ? 0.16 : 0.13) * unit}px ${FONT}`;
    g.fillStyle = spec.print;
    ['A', 'S', 'D'].forEach((letter, i) => {
      const [bx, by] = toShellCanvas(m, m.buttons.xs[i], m.buttons.y + m.buttons.arc[i] - (top ? 0.5 : 0.42), size);
      g.fillText(letter, bx, by);
    });
    return c;
  };
}

function specBack(m: DeviceModel, spec: ShellSpec, seed: number, name: string) {
  return (size: number): HTMLCanvasElement => {
    const { c, g } = canvasOf(size);
    const unit = size / m.H;
    g.translate(size, 0);
    g.scale(-1, 1);
    const base = g.createLinearGradient(size, 0, 0, size);
    base.addColorStop(0, spec.base[0]);
    base.addColorStop(1, spec.base[2]);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    const rnd = seeded(seed + 7);
    // 뒷면 가운데 큰 그림(2026-11-11 «글리치»의 행성) — 덮개를 피한 자리. 무늬·회로는 그 둘레를 비운다
    const spot = spec.back ? backEmblemSpot(m) : null;
    const nearSpot = (x: number, y: number) => !!spot && Math.hypot(x / 2, y - spot.y) < spot.r * 1.25;
    const underCover = (x: number, y: number) => Math.abs(x) < 1.5 && y < 0.3 && y > -1.7;
    if (spec.motif === 'circuit') {
      paintCircuit(g, m, size, spec, rnd, (x, y) => underCover(x, y) || nearSpot(x, y), { traces: 22, glitch: false });
    }
    for (let i = 0; i < 70; i += 1) {
      const x = (rnd() - 0.5) * m.W, y = (rnd() - 0.5) * m.H;
      if (underCover(x, y) || nearSpot(x, y)) continue;
      const [px, py] = toShellCanvas(m, x, y, size);
      g.fillStyle = spec.motifColors[i % 3];
      motifAt(g, spec, px, py, (0.035 + rnd() * 0.03) * unit, rnd());
    }
    g.strokeStyle = spec.ring;
    g.lineWidth = 0.022 * unit;
    eggPath(g, m, 0.34, size);
    g.stroke();
    if (spot) {
      const [cx, cy] = toShellCanvas(m, 0, spot.y, size);
      drawPlanet(g, cx, cy, spot.r * unit, spec);
      // 행성을 가로지르는 글리치 두 줄(행성 높이 안에서만)
      if (spec.motif === 'circuit') shiftSlices(g, size, unit, rnd, 2, [cy - spot.r * unit * 0.8, cy + spot.r * unit * 0.8]);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const [tx, ty] = toShellCanvas(m, 0, spot ? spot.textY + 0.12 : 1.3, size);
    g.fillStyle = spec.print;
    g.font = `800 ${0.15 * unit}px ${FONT}`;
    g.fillText('STARLIGHT PET', tx, ty);
    g.font = `600 ${0.11 * unit}px ${FONT}`;
    g.fillText(`«${name}» 에디션 · 별빛 가챠`, tx, ty + 0.24 * unit);
    return c;
  };
}

const specCache = new Map<string, ShellTheme>();

/** 가챠 껍데기 사양 → 그 기종의 테마. 같은 (물건, 기종)은 한 번만 만든다. */
export function shellFromSpec(model: DeviceModel, id: string, name: string, spec: ShellSpec): ShellTheme {
  const key = `${id}:${model.style}`;
  const hit = specCache.get(key);
  if (hit) return hit;
  let seed = 7;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const theme: ShellTheme = {
    id, name, model,
    bezel: spec.bezel, button: spec.button, socket: spec.socket, sheen: spec.sheen, trim: spec.trim, iridescence: spec.iridescence, label: spec.label,
    paint: specFront(model, spec, seed), paintBack: specBack(model, spec, seed, name),
    ...(spec.roughness !== undefined ? { roughness: spec.roughness } : {}),
    ...(spec.clearcoat !== undefined ? { clearcoat: spec.clearcoat } : {}),
  };
  specCache.set(key, theme);
  return theme;
}
