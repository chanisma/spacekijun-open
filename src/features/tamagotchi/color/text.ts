/**
 * 컬러 화면의 한글 — 갈무리(Galmuri, OFL · `../fonts/OFL.md`) 비트맵 글꼴.
 *
 * 갈무리는 도트 글꼴이지만 캔버스는 글자 가장자리를 부드럽게 칠한다. 문자열마다 한 번 따로 그려 알파를 문턱(128)으로
 * 잘라 «켜짐/꺼짐» 가면을 만들고 기억해 두므로, 화면의 글자가 그림과 똑같이 딱 떨어진다.
 * 글꼴이 아직 안 받아졌을 때 만든 가면은 대체 글꼴 모양이라 — 글꼴이 오면 기억을 비운다(`loadTamaFonts`).
 */
import type { PixelBuf, Rgb } from './pixel';
import galmuri9 from '../fonts/Galmuri9.woff2?url';
import galmuri11 from '../fonts/Galmuri11.woff2?url';
import galmuri11Bold from '../fonts/Galmuri11-Bold.woff2?url';

export type TextFont = 'body' | 'bold' | 'small';

/** 갈무리는 정해진 크기에서만 점이 정확히 맞는다 — Galmuri11 = 12px, Galmuri9 = 10px */
const FONT: Record<TextFont, { css: string; line: number }> = {
  body: { css: '12px TamaGalmuri11', line: 13 },
  bold: { css: 'bold 12px TamaGalmuri11', line: 13 },
  small: { css: '10px TamaGalmuri9', line: 11 },
};
export const lineHeight = (font: TextFont) => FONT[font].line;

interface Mask { w: number; h: number; bits: Uint8Array }
const masks = new Map<string, Mask>();
let fontsReady = false;
let loading: Promise<void> | null = null;

/** 글꼴을 한 번 등록·로드한다. 화면은 이것을 기다린 뒤에 글자를 그린다. */
export function loadTamaFonts(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  const faces = [
    new FontFace('TamaGalmuri11', `url(${galmuri11}) format("woff2")`, { weight: '400' }),
    new FontFace('TamaGalmuri11', `url(${galmuri11Bold}) format("woff2")`, { weight: '700' }),
    new FontFace('TamaGalmuri9', `url(${galmuri9}) format("woff2")`, { weight: '400' }),
  ];
  loading = Promise.all(faces.map(async (f) => { document.fonts.add(await f.load()); }))
    .then(() => { fontsReady = true; masks.clear(); grids.clear(); })
    .catch(() => { fontsReady = true; masks.clear(); grids.clear(); });
  return loading;
}
export const tamaFontsReady = () => fontsReady;

let scratch: HTMLCanvasElement | null = null;

/**
 * 4배로 그린 뒤 칸 가운데를 찍어 1배 비트맵을 되살린다.
 *
 * 크롬 캔버스는 이 글꼴을 1배(12px)에서 화소 격자에 딱 맞춰 그리지 않는다 — 1화소 획이 두 칸에 반씩 걸쳐
 * ㅐ 의 두 세로획이 한 덩어리로 뭉개지고(«개» → «ㄱ»), 문턱을 올리면 이번엔 ㅈ 윗줄이 사라졌다(«주» → «수»).
 * 2026-10-07 측정: 1배는 어느 소수 위치에서도 반쯤 칠해진 점이 170개 넘게 남았다. 그래서 4배(48px)로 그리고,
 * 기준 글자(ㅣㅡ)의 가장자리에서 글꼴 격자의 위상을 한 번 재 둔 뒤, 각 4×4 칸의 «가운데»만 본다.
 */
const SS = 4;
const PAD = SS * 2;
interface Grid { phaseX: number; phaseY: number; baseline: number; firstCell: number }
const grids = new Map<TextFont, Grid>();
const cssAt = (font: TextFont) => FONT[font].css.replace(/(\d+)px/, (_, n) => `${Number(n) * SS}px`);

function ctx(w: number, h: number) {
  scratch ??= document.createElement('canvas');
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  const g = scratch.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, scratch.width, scratch.height);
  return g;
}

function gridOf(font: TextFont): Grid {
  const hit = grids.get(font);
  if (hit) return hit;
  const h = (FONT[font].line + 6) * SS;
  const g = ctx(200, h);
  g.font = cssAt(font);
  g.textBaseline = 'alphabetic';
  const baseline = Math.round(g.measureText('가').fontBoundingBoxAscent || (FONT[font].line - 2) * SS) + PAD;
  g.fillStyle = '#fff';
  g.fillText('ㅣㅡ가', PAD, baseline);
  const d = g.getImageData(0, 0, 200, h).data;
  let left = Infinity, top = Infinity;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < 200; x += 1) {
    if (d[(y * 200 + x) * 4 + 3] >= 128) { left = Math.min(left, x); top = Math.min(top, y); }
  }
  const grid = Number.isFinite(left)
    ? { phaseX: left % SS, phaseY: top % SS, baseline, firstCell: Math.floor(top / SS) - 1 }
    : { phaseX: 0, phaseY: 0, baseline, firstCell: 0 };
  if (fontsReady) grids.set(font, grid);
  return grid;
}

function maskOf(text: string, font: TextFont): Mask {
  const key = `${font}|${text}`;
  const hit = masks.get(key);
  if (hit) return hit;
  const grid = gridOf(font);
  const h = FONT[font].line;
  const probe = ctx(1, 1);
  probe.font = cssAt(font);
  const w = Math.max(1, Math.ceil(probe.measureText(text).width / SS) + 2);
  const W4 = PAD + w * SS + SS;
  const H4 = (grid.firstCell + h + 2) * SS;
  const g = ctx(W4, H4);
  g.font = cssAt(font);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.fillText(text, PAD, grid.baseline);
  const data = g.getImageData(0, 0, W4, H4).data;
  const bits = new Uint8Array(w * h);
  let maxX = 0;
  // 출력 칸 (cx, cy) = 4배 그림의 (위상 + 칸×4 + 2) — 칸의 가운데. 왼쪽 여백(PAD)도 격자 위에 있다.
  const startCellX = Math.floor((PAD - grid.phaseX) / SS);
  for (let cy = 0; cy < h; cy += 1) {
    const sy = grid.phaseY + (grid.firstCell + cy) * SS + SS / 2;
    if (sy < 0 || sy >= H4) continue;
    for (let cx = 0; cx < w; cx += 1) {
      const sx = grid.phaseX + (startCellX + cx) * SS + SS / 2;
      if (sx >= W4) continue;
      if (data[(sy * W4 + sx) * 4 + 3] >= 128) { bits[cy * w + cx] = 1; maxX = Math.max(maxX, cx); }
    }
  }
  const mask = { w: text.trim() ? maxX + 1 : Math.ceil(probe.measureText(text).width / SS), h, bits };
  if (fontsReady) {
    if (masks.size > 600) masks.clear();
    masks.set(key, mask);
  }
  return mask;
}

export function textWidth(text: string, font: TextFont = 'body'): number {
  if (typeof document === 'undefined') return text.length * 6;
  return maskOf(text, font).w;
}

/** 글자를 찍는다(위 왼쪽 기준). 너비를 돌려준다. */
export function drawText(buf: PixelBuf, text: string, x: number, y: number, color: Rgb, font: TextFont = 'body', shadow?: Rgb): number {
  if (!text || typeof document === 'undefined') return 0;
  const m = maskOf(text, font);
  const fullW = m.bits.length / m.h;
  for (let yy = 0; yy < m.h; yy += 1) {
    for (let xx = 0; xx < fullW; xx += 1) {
      if (!m.bits[yy * fullW + xx]) continue;
      if (shadow) buf.px(x + xx + 1, y + yy + 1, shadow);
      buf.px(x + xx, y + yy, color);
    }
  }
  return m.w;
}

export function drawTextCentered(buf: PixelBuf, text: string, cx: number, y: number, color: Rgb, font: TextFont = 'body', shadow?: Rgb) {
  return drawText(buf, text, Math.round(cx - textWidth(text, font) / 2), y, color, font, shadow);
}

/** 한 줄 안에 맞게 자른다(…) */
export function fitText(text: string, maxW: number, font: TextFont = 'body'): string {
  if (textWidth(text, font) <= maxW) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, font) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

/** 폭에 맞게 줄을 나눈다 — 띄어쓰기에서 먼저 끊고, 한 낱말이 너무 길면 글자 단위로 */
export function wrapText(text: string, maxW: number, font: TextFont = 'body'): string[] {
  if (!text) return [''];
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    const candidate = line + word;
    if (textWidth(candidate.trimEnd(), font) <= maxW) { line = candidate; continue; }
    if (line.trim()) out.push(line.trimEnd());
    line = word.trimStart();
    while (textWidth(line, font) > maxW) {
      let cut = line.length - 1;
      while (cut > 1 && textWidth(line.slice(0, cut), font) > maxW) cut -= 1;
      out.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line.trim() || out.length === 0) out.push(line.trimEnd());
  return out;
}
