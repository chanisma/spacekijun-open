/**
 * 방 꾸미기(Phase 3) — 가챠로 얻은 벽지 · 러그 · 소품을 컬러 화면 방에 그린다. 128×128 도트.
 * 자리: 벽지(벽 전체) · 러그(바닥 가운데) · 바닥 소품(왼쪽 바닥) · 선반 소품(오른쪽 선반의 별 트로피 자리) · 벽 장식(창문 오른쪽 위).
 * 펫이 서는 가운데(x 40~88, y 60~120)는 비워 둔다 — 소품이 펫을 가리지 않게.
 */
import { PixelBuf, rgb, type Rgb } from './pixel';
import type { DecoSprite, RugSpec, WallpaperSpec } from '../model/catalog';

const OUTLINE = rgb('#2b1d4e');

function star(b: PixelBuf, cx: number, cy: number, r: number, c: Rgb) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  for (let i = 0; i < 10; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 10];
    b.tri(cx, cy, ax, ay, bx, by, c);
  }
}

// ── 벽지 무늬 ────────────────────────────────────────────────────────

export function drawWallPattern(b: PixelBuf, spec: WallpaperSpec, night: boolean, floorY: number) {
  const ink = rgb(night ? spec.ink.night : spec.ink.day);
  if (spec.pattern === 'stripes') {
    for (let x = 3; x < b.w; x += 10) b.rect(x, 12, 3, floorY - 12, ink, 150);
  } else if (spec.pattern === 'checks') {
    for (let y = 12; y < floorY; y += 8) b.rect(0, y, b.w, 3, ink, 110);
    for (let x = 0; x < b.w; x += 8) b.rect(x, 12, 3, floorY - 12, ink, 110);
  } else if (spec.pattern === 'leaves') {
    for (let y = 18; y < floorY - 4; y += 12) {
      for (let x = ((y / 12) % 2) * 7 + 3; x < b.w; x += 14) {
        b.ellipse(x, y, 2.5, 1.4, ink);
        b.px(x + 3, y + 1, ink);
      }
    }
  } else {
    let s = 9;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i += 1) {
      const x = Math.floor(r() * b.w);
      const y = 14 + Math.floor(r() * (floorY - 18));
      if (r() < 0.25) star(b, x, y, 2.2, ink);
      else b.px(x, y, ink);
    }
  }
}

// ── 러그 ─────────────────────────────────────────────────────────────

export function drawRug(b: PixelBuf, spec: RugSpec | undefined, night: boolean) {
  if (!spec) {
    b.ellipse(64, 112, 46, 9, night ? rgb('#8a4a78') : rgb('#f7a6c6'));
    b.ellipse(64, 112, 38, 6.5, night ? rgb('#a65a8e') : rgb('#ffc7dc'));
    return;
  }
  if (spec.rainbow) {
    const bands = ['#ff7b9c', '#ffb066', '#ffe27a', '#8fe3a0', '#7cc8ff', '#b79bff'];
    bands.forEach((c, i) => {
      const col = rgb(c);
      b.ellipse(64, 112, 46 - i * 6, 9 - i * 1.2, night ? [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6] as Rgb : col);
    });
    return;
  }
  b.ellipse(64, 112, 46, 9, rgb(night ? spec.outer.night : spec.outer.day));
  b.ellipse(64, 112, 38, 6.5, rgb(night ? spec.inner.night : spec.inner.day));
  // 술 장식
  const tassel = rgb(night ? spec.outer.night : spec.outer.day);
  for (let x = 22; x <= 106; x += 6) b.px(x, 121, tassel);
}

// ── 소품 ─────────────────────────────────────────────────────────────

const decoCache = new Map<string, PixelBuf>();

function make(w: number, h: number, draw: (b: PixelBuf) => void): PixelBuf {
  const b = new PixelBuf(w, h);
  draw(b);
  b.outline(OUTLINE);
  return b;
}

function decoSprite(kind: DecoSprite, night: boolean): PixelBuf {
  const key = `${kind}:${night ? 'n' : 'd'}`;
  const hit = decoCache.get(key);
  if (hit) return hit;
  let out: PixelBuf;
  switch (kind) {
    case 'ball':
      out = make(16, 16, (b) => {
        b.ellipse(8, 8, 6, 6, rgb('#ff6b81'));
        b.rect(2, 7, 12, 3, rgb('#ffffff'));
        b.ellipse(8, 8, 2, 6, rgb('#4fb3ff'));
        b.ellipse(6, 5, 1.5, 1.2, rgb('#ffffff'));
      });
      break;
    case 'teddy':
      out = make(18, 20, (b) => {
        b.ellipse(4, 4, 2.5, 2.5, rgb('#c98a5a')); b.ellipse(14, 4, 2.5, 2.5, rgb('#c98a5a'));
        b.ellipse(9, 7, 5.5, 5, rgb('#d9a06c'));
        b.ellipse(9, 14, 6, 5, rgb('#d9a06c'));
        b.ellipse(9, 15, 3, 3, rgb('#f2cfa6'));
        b.px(7, 6, OUTLINE); b.px(11, 6, OUTLINE); b.rect(8, 8, 2, 1, rgb('#6b3f2a'));
        b.ellipse(3, 17, 2, 2, rgb('#c98a5a')); b.ellipse(15, 17, 2, 2, rgb('#c98a5a'));
      });
      break;
    case 'fish':
      out = make(20, 20, (b) => {
        b.ellipse(10, 11, 8, 7.5, rgb('#d8f3ff'), 220);
        b.rect(3, 7, 15, 1, rgb('#9fdcff'));
        b.ellipse(10, 12, 7, 5.5, rgb('#9fdcff'), 170);
        b.ellipse(9, 11, 3, 2, rgb('#ff9a3c'));
        b.tri(12, 11, 15, 9, 15, 13, rgb('#ff9a3c'));
        b.px(8, 10, OUTLINE);
        b.rect(5, 16, 10, 2, rgb('#c9a27a'));
        b.ellipse(6, 6, 1.5, 1, rgb('#ffffff'));
      });
      break;
    case 'scope':
      out = make(22, 26, (b) => {
        b.line(11, 14, 4, 25, rgb('#8a5a3c')); b.line(11, 14, 18, 25, rgb('#8a5a3c')); b.line(11, 14, 11, 25, rgb('#8a5a3c'));
        for (let i = 0; i < 4; i += 1) b.line(4 + i, 12 - i * 2 + 4, 18 + i, 4 - i * 2 + 4, rgb(i < 1 ? '#3a4fa8' : '#4f6ad0'));
        b.rect(10, 7, 3, 3, rgb('#ffd34d'));
        star(b, 19, 3, 2.5, rgb('#ffd34d'));
      });
      break;
    case 'globe':
      out = make(14, 16, (b) => {
        b.ellipse(7, 6, 5.5, 5.5, rgb('#4fa8ff'));
        b.ellipse(5, 4, 2.5, 1.8, rgb('#5fcf86')); b.ellipse(9, 8, 2, 1.5, rgb('#5fcf86'));
        b.ellipse(5, 3, 1, 0.8, rgb('#ffffff'));
        b.rect(6, 12, 2, 2, rgb('#c99a2e')); b.rect(3, 14, 8, 2, rgb('#c99a2e'));
      });
      break;
    case 'lamp':
      out = make(16, 16, (b) => {
        if (night) b.ellipse(8, 6, 7, 6, rgb('#fff1a8'), 90);
        star(b, 8, 6, 5.5, rgb('#ffe066'));
        b.ellipse(7, 4, 1.2, 1, rgb('#ffffff'));
        b.rect(5, 12, 6, 3, rgb('#b48cff'));
      });
      break;
    case 'crown':
      out = make(16, 12, (b) => {
        b.rect(2, 6, 12, 5, rgb('#ffcb3d'));
        b.tri(2, 7, 2, 1, 6, 7, rgb('#ffcb3d')); b.tri(6, 7, 8, 0, 10, 7, rgb('#ffcb3d')); b.tri(10, 7, 14, 1, 14, 7, rgb('#ffcb3d'));
        b.rect(2, 9, 12, 1, rgb('#e09a1e'));
        b.px(8, 7, rgb('#ff5a8a')); b.px(4, 8, rgb('#4fb3ff')); b.px(12, 8, rgb('#5fcf86'));
        b.px(7, 3, rgb('#fff6c8'));
      });
      break;
    case 'clock':
      out = make(16, 16, (b) => {
        b.ellipse(8, 8, 6.5, 6.5, rgb('#fff6dc'));
        b.ellipse(8, 8, 5, 5, rgb('#ffffff'));
        b.rect(8, 4, 1, 4, OUTLINE); b.rect(8, 8, 3, 1, OUTLINE);
        b.ellipse(13, 3, 2.5, 2.5, rgb('#ffd34d'));
      });
      break;
    case 'pumpkin':
      out = make(20, 18, (b) => {
        if (night) b.ellipse(10, 11, 9, 7, rgb('#ffcf6a'), 70);
        b.ellipse(10, 11, 8.5, 6.5, rgb('#ff8a2a'));
        b.ellipse(6, 11, 3, 6, rgb('#ff9f43')); b.ellipse(14, 11, 3, 6, rgb('#ff9f43'));
        b.rect(9, 2, 2, 4, rgb('#4f8a3c'));
        b.tri(5, 9, 8, 9, 6, 7, rgb('#3a1f1a')); b.tri(12, 9, 15, 9, 14, 7, rgb('#3a1f1a'));
        b.rect(6, 13, 8, 2, rgb('#3a1f1a'));
        b.px(8, 13, rgb('#ff8a2a')); b.px(11, 14, rgb('#ff8a2a'));
        if (night) { b.tri(5, 9, 8, 9, 6, 7, rgb('#ffe27a')); b.tri(12, 9, 15, 9, 14, 7, rgb('#ffe27a')); }
      });
      break;
    case 'robot':
      out = make(16, 20, (b) => {
        b.rect(7, 0, 2, 3, rgb('#8a8fb0')); b.ellipse(8, 1, 1.5, 1.5, night ? rgb('#ffe27a') : rgb('#ff5a6e'));
        b.rect(3, 3, 10, 7, rgb('#b8c4e0')); b.rect(4, 4, 8, 5, rgb('#dfe6f5'));
        b.rect(5, 5, 2, 2, night ? rgb('#7dfcff') : OUTLINE); b.rect(9, 5, 2, 2, night ? rgb('#7dfcff') : OUTLINE);
        b.rect(4, 11, 8, 6, rgb('#9aa8d0')); b.rect(6, 13, 4, 2, rgb('#ffd34d'));
        b.rect(1, 12, 2, 4, rgb('#8a8fb0')); b.rect(13, 12, 2, 4, rgb('#8a8fb0'));
        b.rect(4, 17, 3, 3, rgb('#6a7090')); b.rect(9, 17, 3, 3, rgb('#6a7090'));
      });
      break;
    case 'plant':
      out = make(12, 14, (b) => {
        b.ellipse(4, 4, 3, 2, rgb('#5fcf86')); b.ellipse(8, 3, 3, 2, rgb('#4fb874')); b.ellipse(6, 6, 2.5, 2, rgb('#7fe0a0'));
        b.rect(5, 6, 2, 3, rgb('#3f9a5c'));
        b.rect(2, 9, 8, 5, rgb('#e08a5a')); b.rect(1, 9, 10, 1, rgb('#c46f42'));
      });
      break;
    case 'snowman':
      out = make(16, 22, (b) => {
        b.ellipse(8, 16, 6, 5.5, rgb('#ffffff'));
        b.ellipse(8, 8, 4.5, 4.5, rgb('#ffffff'));
        b.rect(4, 2, 8, 2, rgb('#3a3a4a')); b.rect(5, 0, 6, 2, rgb('#3a3a4a'));
        b.px(6, 7, OUTLINE); b.px(10, 7, OUTLINE);
        b.tri(8, 9, 8, 10, 12, 9, rgb('#ff8a2a'));
        b.rect(3, 12, 10, 2, rgb('#ff5a6e'));
        b.px(8, 15, OUTLINE); b.px(8, 18, OUTLINE);
      });
      break;
    default:
      out = make(1, 1, () => undefined);
  }
  decoCache.set(key, out);
  return out;
}

/** 방에 소품을 놓는다. 선반 소품은 기본 별 트로피 자리를 대신한다(그 자리는 호출부가 비운다). */
export function placeDeco(b: PixelBuf, kind: DecoSprite | PixelBuf, where: 'floor' | 'shelf' | 'wall', night: boolean) {
  if (kind === 'garland') {
    // 창문 위에서 오른쪽 선반 위까지 늘어진 별 가랜드
    const pts: [number, number][] = [];
    for (let x = 6; x <= 122; x += 2) pts.push([x, 15 + Math.round(4 * Math.sin(((x - 6) / 116) * Math.PI))]);
    pts.forEach(([x, y]) => b.px(x, y, rgb('#8a7fa8')));
    const colors = ['#ffd34d', '#ff8fb6', '#7bc6ff', '#5fcf86'];
    for (let i = 0; i < 9; i += 1) {
      const [x, y] = pts[Math.min(pts.length - 1, 3 + i * 6)];
      star(b, x, y + 3, 2.6, rgb(colors[i % colors.length]));
    }
    return;
  }
  if (kind === 'bunting') {
    // 창문 위에 늘어진 세모 깃발 줄(만국기)
    const pts: [number, number][] = [];
    for (let x = 6; x <= 122; x += 2) pts.push([x, 14 + Math.round(3 * Math.sin(((x - 6) / 116) * Math.PI))]);
    pts.forEach(([x, y]) => b.px(x, y, rgb('#8a7fa8')));
    const colors = ['#ff5a6e', '#ffd34d', '#4fb3ff', '#5fcf86', '#b48cff'];
    for (let i = 0; i < 10; i += 1) {
      const [x, y] = pts[Math.min(pts.length - 1, 2 + i * 6)];
      b.tri(x - 3, y + 1, x + 3, y + 1, x, y + 7, rgb(colors[i % colors.length]));
    }
    return;
  }
  // 나만의 소품(꾸미기 의뢰)은 받아 둔 픽셀을 그대로 — 고정 소품과 같은 자리에 놓는다
  const s = typeof kind === 'string' ? decoSprite(kind, night) : kind;
  if (where === 'floor') b.blit(s, 15 - Math.floor(s.w / 2), 106 - s.h);
  else if (where === 'shelf') b.blit(s, 111 - Math.floor(s.w / 2), 40 - s.h);
  else b.blit(s, 62 - Math.floor(s.w / 2), 16);
}
