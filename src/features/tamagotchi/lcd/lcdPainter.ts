/**
 * LCD 를 «진짜 반사형 LCD 처럼» 칠한다 — three.js 화면 텍스처와 홈 카드(2D)가 같은 함수를 쓴다.
 *
 * 실물 다마고찌 화면에서 눈이 «LCD 다»라고 알아보는 단서 넷을 그대로 옮겼다:
 *  ① 꺼진 점도 아주 옅게 보인다(격자의 유령)
 *  ② 켜진 점은 반사판 위에 살짝 어긋난 그림자를 드리운다(액정층과 반사판 사이의 틈)
 *  ③ 바탕은 녹회색이고 가장자리로 갈수록 조금 어둡다
 *  ④ 위·아래 아이콘은 인쇄된 세그먼트라 꺼져 있어도 흐릿하게 모양이 남는다
 */
import { LCD_H, LCD_W, ICON_COUNT, type LcdFrame } from './frame';
import { MENU_ICONS } from './sprites';

/** 패널 좌표계(배율 1). 3D 화면은 이 비율의 평면에 붙는다. */
export const PANEL = {
  w: 640,
  h: 520,
  pitch: 18,
  matrixX: 32,
  matrixY: 116,
  iconPitch: 5.5,
  topIconY: 54,
  bottomIconY: 466,
  iconXs: [92, 245, 395, 548],
} as const;
export const PANEL_ASPECT = PANEL.w / PANEL.h;

const INK = 'rgb(26, 32, 24)';
const backgroundCache = new Map<number, HTMLCanvasElement>();

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

function background(scale: number): HTMLCanvasElement {
  const cached = backgroundCache.get(scale);
  if (cached) return cached;
  const c = makeCanvas(PANEL.w * scale, PANEL.h * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  // 녹회색 바탕 — 위가 밝고 아래가 조금 짙다
  const base = g.createLinearGradient(0, 0, 0, PANEL.h);
  base.addColorStop(0, '#cdd6b0');
  base.addColorStop(0.55, '#bfca9f');
  base.addColorStop(1, '#b0bc90');
  g.fillStyle = base;
  g.fillRect(0, 0, PANEL.w, PANEL.h);
  // 가장자리 어둠
  const vignette = g.createRadialGradient(PANEL.w / 2, PANEL.h * 0.45, PANEL.h * 0.25, PANEL.w / 2, PANEL.h / 2, PANEL.w * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(40,52,24,0.22)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, PANEL.w, PANEL.h);
  // 반사판의 고운 결
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i += 1) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,240,0.05)' : 'rgba(30,40,20,0.05)';
    g.fillRect(rnd() * PANEL.w, rnd() * PANEL.h, 1.2, 1.2);
  }
  // 꺼진 점의 유령 격자
  g.fillStyle = 'rgba(40, 54, 30, 0.07)';
  for (let y = 0; y < LCD_H; y += 1) {
    for (let x = 0; x < LCD_W; x += 1) {
      g.fillRect(PANEL.matrixX + x * PANEL.pitch + 1, PANEL.matrixY + y * PANEL.pitch + 1, PANEL.pitch - 2, PANEL.pitch - 2);
    }
  }
  // 아이콘 칸을 나누는 얇은 인쇄선
  g.strokeStyle = 'rgba(40, 54, 30, 0.12)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(18, PANEL.matrixY - 10); g.lineTo(PANEL.w - 18, PANEL.matrixY - 10);
  g.moveTo(18, PANEL.matrixY + LCD_H * PANEL.pitch + 8); g.lineTo(PANEL.w - 18, PANEL.matrixY + LCD_H * PANEL.pitch + 8);
  g.stroke();
  backgroundCache.set(scale, c);
  return c;
}

function iconOrigin(index: number) {
  const size = 11 * PANEL.iconPitch;
  const cx = PANEL.iconXs[index % 4];
  const cy = index < 4 ? PANEL.topIconY : PANEL.bottomIconY;
  return { x: cx - size / 2, y: cy - size / 2 };
}

function drawIcon(g: CanvasRenderingContext2D, index: number) {
  const { x, y } = iconOrigin(index);
  const icon = MENU_ICONS[index];
  const p = PANEL.iconPitch;
  for (let row = 0; row < icon.length; row += 1) {
    for (let col = 0; col < icon[row].length; col += 1) {
      if (icon[row][col] === '#') g.fillRect(x + col * p, y + row * p, p + 0.25, p + 0.25);
    }
  }
}

let inkLayer: HTMLCanvasElement | null = null;

/** 프레임 하나를 칠한다. `ctx` 의 캔버스 크기는 PANEL × scale 이어야 한다. */
export function paintLcd(ctx: CanvasRenderingContext2D, frame: LcdFrame, scale: number) {
  const W = PANEL.w * scale;
  const H = PANEL.h * scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(background(scale), 0, 0);

  // 잉크 층을 따로 그린 뒤 ①그림자 ②본체 순서로 두 번 찍는다
  if (!inkLayer || inkLayer.width !== Math.round(W) || inkLayer.height !== Math.round(H)) inkLayer = makeCanvas(W, H);
  const ink = inkLayer.getContext('2d')!;
  ink.setTransform(1, 0, 0, 1, 0, 0);
  ink.clearRect(0, 0, inkLayer.width, inkLayer.height);
  ink.scale(scale, scale);
  ink.fillStyle = INK;
  const p = PANEL.pitch;
  for (let y = 0; y < LCD_H; y += 1) {
    for (let x = 0; x < LCD_W; x += 1) {
      if (frame.dots[y * LCD_W + x]) ink.fillRect(PANEL.matrixX + x * p + 1, PANEL.matrixY + y * p + 1, p - 2, p - 2);
    }
  }
  for (let i = 0; i < ICON_COUNT; i += 1) if (frame.icons[i]) drawIcon(ink, i);

  // 꺼진 아이콘 — 인쇄된 세그먼트가 흐릿하게 남는다
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(30, 40, 24, 0.13)';
  for (let i = 0; i < ICON_COUNT; i += 1) if (!frame.icons[i]) drawIcon(ctx, i);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.2;
  try { ctx.filter = `blur(${1.6 * scale}px)`; } catch { /* 필터 미지원 — 선명한 그림자 */ }
  ctx.drawImage(inkLayer, 3 * scale, 4 * scale);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(inkLayer, 0, 0);
  ctx.restore();
}

/** 화면 좌표(패널 픽셀) → 아이콘 번호. 휴대폰에서 아이콘을 직접 눌러 고를 때 쓴다. */
export function iconAt(px: number, py: number): number | null {
  const half = (11 * PANEL.iconPitch) / 2 + 14;
  for (let i = 0; i < ICON_COUNT; i += 1) {
    const cx = PANEL.iconXs[i % 4];
    const cy = i < 4 ? PANEL.topIconY : PANEL.bottomIconY;
    if (Math.abs(px - cx) <= half && Math.abs(py - cy) <= half) return i;
  }
  return null;
}
