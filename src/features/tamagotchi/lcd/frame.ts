/**
 * LCD 한 장 — 32×16 점 + 아이콘 8개의 켜짐.
 *
 * 그림을 «무엇을 켤까»(이 파일)와 «어떻게 보일까»(lcdPainter)로 나눴다. 이 파일은 순수해서
 * three.js 화면·홈 카드·회귀가 같은 프레임을 쓴다.
 */
import type { Sprite } from './sprites';
import { FONT_3x5 } from './sprites';

export const LCD_W = 32;
export const LCD_H = 16;
export const ICON_COUNT = 8;

export interface LcdFrame {
  dots: Uint8Array; // LCD_W * LCD_H, 1 = 켜짐
  icons: boolean[]; // 8
}

export const emptyFrame = (): LcdFrame => ({ dots: new Uint8Array(LCD_W * LCD_H), icons: Array(ICON_COUNT).fill(false) });

export const spriteWidth = (s: Sprite) => s[0]?.length ?? 0;
export const spriteHeight = (s: Sprite) => s.length;

/** 스프라이트를 찍는다. `invert` 면 켜진 점을 끈다(불 꺼진 화면의 글씨) */
export function blit(frame: LcdFrame, sprite: Sprite, x: number, y: number, opts: { flip?: boolean; invert?: boolean } = {}) {
  const w = spriteWidth(sprite);
  for (let row = 0; row < sprite.length; row += 1) {
    const line = sprite[row];
    for (let col = 0; col < w; col += 1) {
      if (line[opts.flip ? w - 1 - col : col] !== '#') continue;
      const px = x + col;
      const py = y + row;
      if (px < 0 || py < 0 || px >= LCD_W || py >= LCD_H) continue;
      frame.dots[py * LCD_W + px] = opts.invert ? 0 : 1;
    }
  }
}

const glyphOf = (ch: string) => FONT_3x5[ch] ?? FONT_3x5[ch.toUpperCase()] ?? FONT_3x5[' '];

/** 3×5 글꼴로 쓴다(M·W 는 5칸). 너비(점)를 돌려준다 */
export function text(frame: LcdFrame, value: string, x: number, y: number, opts: { invert?: boolean } = {}): number {
  let cursor = x;
  for (const ch of value) {
    const glyph = glyphOf(ch);
    blit(frame, glyph, cursor, y, opts);
    cursor += spriteWidth(glyph) + 1;
  }
  return cursor - x - 1;
}

export const textWidth = (value: string) => [...value].reduce((w, ch) => w + spriteWidth(glyphOf(ch)) + 1, 0) - 1;

export function fill(frame: LcdFrame, on = true) {
  frame.dots.fill(on ? 1 : 0);
}

export function invert(frame: LcdFrame) {
  for (let i = 0; i < frame.dots.length; i += 1) frame.dots[i] = frame.dots[i] ? 0 : 1;
}

/** 프레임이 바뀌었는지 싸게 비교 — 같으면 텍스처를 다시 올리지 않는다 */
export function frameKey(frame: LcdFrame): string {
  let key = '';
  for (let i = 0; i < frame.dots.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | frame.dots[i + b];
    key += String.fromCharCode(65 + (byte >> 4), 65 + (byte & 15));
  }
  return key + frame.icons.map((on) => (on ? '1' : '0')).join('');
}
