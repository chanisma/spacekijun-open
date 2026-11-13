/**
 * 컬러 화면(128×128) 한 장 그리기 — 최근 컬러 기종(Pix · Uni · Paradise)의 화면 문법.
 *
 *  · 위 상태 줄: 시계 · 부름(!) · 새 알림(종)
 *  · 방: 시간대에 따라 낮/저녁/밤, 불을 끄면 달빛만. 수업 시간엔 교실(칠판 + 책상)
 *  · 메뉴: A 를 누르면 아래에 아이콘 줄이 떠오르고 고른 아이콘 위에 이름표
 *  · 알림: 목록 → 고르면 자세한 내용이 이 화면에 쪽으로 나뉘어 보인다(다른 화면으로 가지 않는다)
 *
 * 순수한 그리기다 — `ScreenInput` 만 보고 `PixelBuf` 에 칠한다. 글자는 `text.ts`(갈무리).
 */
import { PixelBuf, rgb, type Rgb } from './pixel';
import { characterSprite, drawStar, type Pose } from './characters';
import { drawText, drawTextCentered, fitText, lineHeight, textWidth, wrapText } from './text';
import { kstParts, TICK_MS } from '../model/clock';
import { MESSAGE_KIND_LABEL, type PetMessage, type PetMessageKind } from '../model/messages';
import { STAGE_AT, STAGE_LABEL, TICKS_PER_DAY, type PetView } from '../model/petModel';
import { MODE_INFO, deathCauseOf } from '../model/petModes';
import type { ScreenInput } from '../model/screenInput';
import { mmss } from '../model/credit';
import { ITEM_BY_ID, customVersionOf, roomKey, type Equipped } from '../model/catalog';
import { lookName, lookOf } from '../model/species';
import { decoOf } from './customDecor';
import { drawRug, drawWallPattern, placeDeco } from './roomDecor';
import { BRANCH_INFO } from '../model/branch';
import { ANIM_MS, GAME_ROUNDS, MEMO_STEP_MS, MENU, type Screen } from '../lcd/deviceUi';
import { MENU_ICONS, MENU_LABELS } from '../lcd/sprites';

export const COLOR_SIZE = 128;
const S = COLOR_SIZE;
const STATUS_H = 12;
const FLOOR_Y = 94;
const FEET_Y = 116;

const C = {
  ink: rgb('#2b1d4e'), white: rgb('#ffffff'), paper: rgb('#fffaf2'), paperLine: rgb('#e9dcc8'),
  pink: rgb('#ff7fb0'), pinkSoft: rgb('#ffe0ee'), gold: rgb('#ffd34d'), red: rgb('#ff5a6e'), green: rgb('#5fcf86'),
  sky: rgb('#4fb3ff'), mute: rgb('#8a7fa8'), shadow: rgb('#1a1233'), brown: rgb('#8a5a3c'),
};
const KIND_COLOR: Record<PetMessageKind, Rgb> = {
  class: rgb('#4fa8ff'), meal: rgb('#ff9f43'), planner: rgb('#36c39a'), schedule: rgb('#a77dff'), pet: rgb('#ff6f9f'),
};
const ICON_COLOR: Rgb[] = [rgb('#ff9f43'), rgb('#ffcf3d'), rgb('#4fc3f7'), rgb('#ff6b81'), rgb('#5aa9ff'), rgb('#5fcf86'), rgb('#ffbf3a'), rgb('#ff5a6e')];

const frameNo = (t: number, period = 500) => Math.floor(t / period);
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ── 배경 ─────────────────────────────────────────────────────────────

type RoomMood = 'day' | 'evening' | 'night' | 'dark' | 'class';
const roomCache = new Map<string, PixelBuf>();

function gradientRect(b: PixelBuf, x: number, y: number, w: number, h: number, top: Rgb, bottom: Rgb) {
  for (let yy = 0; yy < h; yy += 1) {
    const t = h <= 1 ? 0 : yy / (h - 1);
    // 4×4 베이어 디더 — 그라데이션이 띠지지 않게
    for (let xx = 0; xx < w; xx += 1) {
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][((yy & 3) << 2) | (xx & 3)] / 16 - 0.5;
      b.px(x + xx, y + yy, lerp(top, bottom, Math.max(0, Math.min(1, t + bayer * 0.08))));
    }
  }
}

function drawWindow(b: PixelBuf, mood: RoomMood) {
  const x = 10, y = 22, w = 32, h = 28;
  b.rect(x - 2, y - 2, w + 4, h + 4, rgb('#7a4f33'));
  b.rect(x - 1, y - 1, w + 2, h + 2, rgb('#a8734c'));
  if (mood === 'day') {
    gradientRect(b, x, y, w, h, rgb('#7cc8ff'), rgb('#cdeeff'));
    b.ellipse(x + 10, y + 9, 5, 2.5, C.white); b.ellipse(x + 14, y + 8, 4, 3, C.white); b.ellipse(x + 23, y + 18, 4, 2, C.white);
    b.ellipse(x + 26, y + 6, 3, 3, rgb('#fff3a0'));
  } else if (mood === 'evening') {
    gradientRect(b, x, y, w, h, rgb('#6b5bd1'), rgb('#ffa37a'));
    b.ellipse(x + 22, y + 20, 4, 4, rgb('#ffd9a0'));
  } else {
    gradientRect(b, x, y, w, h, rgb('#0f1442'), rgb('#2a2a72'));
    b.ellipse(x + 23, y + 8, 4, 4, rgb('#fff6c8'));
    b.ellipse(x + 25, y + 7, 3.4, 3.4, rgb('#0f1442'));
    [[4, 5], [9, 14], [15, 4], [6, 21], [18, 17], [27, 22], [12, 9]].forEach(([sx, sy]) => b.px(x + sx, y + sy, C.white));
  }
  b.rect(x + w / 2, y, 1, h, rgb('#a8734c'));
  b.rect(x, y + h / 2, w, 1, rgb('#a8734c'));
  b.rect(x - 3, y + h + 2, w + 6, 2, rgb('#7a4f33'));
}

function drawFloor(b: PixelBuf, night: boolean, eq: Equipped = {}) {
  gradientRect(b, 0, FLOOR_Y, S, S - FLOOR_Y, night ? rgb('#6a4a3c') : rgb('#e3a874'), night ? rgb('#4e3530') : rgb('#c98654'));
  const line = night ? rgb('#3e2a26') : rgb('#b4733f');
  for (let y = FLOOR_Y + 6; y < S; y += 7) b.rect(0, y, S, 1, line);
  for (let y = FLOOR_Y; y < S; y += 7) {
    const off = ((y - FLOOR_Y) / 7) % 2 ? 9 : 25;
    for (let x = off; x < S; x += 32) b.rect(x, y, 1, 6, line);
  }
  b.rect(0, FLOOR_Y, S, 1, night ? rgb('#2a1c22') : rgb('#9b6037'));
  // 러그 — 가챠로 고른 것이 있으면 그것(Phase 3)
  drawRug(b, eq.rug ? ITEM_BY_ID.get(eq.rug)?.rug : undefined, night);
}

function drawRoom(mood: RoomMood, eq: Equipped = {}): PixelBuf {
  // 판 번호 — 나만의 꾸미기 디자인·소품 그림이 도착하면 바뀐다(그 전의 빈 방을 캐시에서 쓰지 않게)
  const key = `${mood}|${roomKey(eq)}|${customVersionOf()}`;
  const hit = roomCache.get(key);
  if (hit) return hit;
  const b = new PixelBuf(S, S);
  if (mood === 'class') {
    // 수업 중에도 꾸민 방(2026-11-05 사용자 — 종전엔 교실 벽·맨바닥으로 바뀌어 벽지·러그·바닥 소품이 사라졌다).
    // 칠판이 창문·선반 자리를 덮으므로 선반·벽 소품은 그리지 않는다.
    const paper = eq.wallpaper ? ITEM_BY_ID.get(eq.wallpaper)?.wallpaper : undefined;
    if (paper) {
      gradientRect(b, 0, 0, S, FLOOR_Y, rgb(paper.day[0]), rgb(paper.day[1]));
      drawWallPattern(b, paper, false, FLOOR_Y);
    } else gradientRect(b, 0, 0, S, FLOOR_Y, rgb('#f6ecd8'), rgb('#e9dcc0'));
    b.rect(12, 18, 104, 40, rgb('#7a4f33'));
    gradientRect(b, 14, 20, 100, 36, rgb('#2f6b55'), rgb('#255647'));
    b.rect(14, 56, 100, 3, rgb('#a8734c'));
    b.rect(30, 57, 8, 2, C.white);
    drawFloor(b, false, eq);
    const floorDeco = decoOf(eq.floor);
    if (floorDeco) placeDeco(b, floorDeco, 'floor', false);
    // 칠판 지우개 자국
    b.rect(20, 46, 18, 1, rgb('#3e7e66'));
    b.rect(84, 26, 22, 1, rgb('#3e7e66'));
  } else {
    const paper = eq.wallpaper ? ITEM_BY_ID.get(eq.wallpaper)?.wallpaper : undefined;
    const wall: Record<Exclude<RoomMood, 'class'>, [string, string]> = paper
      ? { day: paper.day, evening: paper.evening, night: paper.night, dark: paper.night }
      : { day: ['#fff0dc', '#ffdcc0'], evening: ['#7d64b8', '#5b4a9e'], night: ['#4a3a82', '#352a68'], dark: ['#1d1a3e', '#16142f'] };
    gradientRect(b, 0, 0, S, FLOOR_Y, rgb(wall[mood][0]), rgb(wall[mood][1]));
    if (paper) drawWallPattern(b, paper, mood !== 'day', FLOOR_Y);
    else {
      const dot = mood === 'day' ? rgb('#ffd0b0') : rgb('#6e5cb0');
      for (let y = 18; y < FLOOR_Y - 4; y += 10) for (let x = ((y / 10) % 2) * 6 + 4; x < S; x += 12) b.px(x, y, dot);
    }
    drawWindow(b, mood === 'dark' ? 'night' : mood);
    // 선반과 작은 별 트로피 · 책
    b.rect(84, 40, 36, 3, rgb('#a8734c'));
    b.rect(86, 30, 4, 10, rgb('#ff8fb6')); b.rect(91, 32, 3, 8, rgb('#7bc6ff')); b.rect(95, 29, 4, 11, rgb('#ffd56b'));
    const night = mood !== 'day';
    const shelf = decoOf(eq.shelf);
    if (shelf) placeDeco(b, shelf, 'shelf', night);
    else { drawStar(b, 111, 33, 5, rgb('#ffd34d')); b.rect(109, 37, 5, 3, rgb('#c99a2e')); }
    const wallDeco = decoOf(eq.wall);
    if (wallDeco) placeDeco(b, wallDeco, 'wall', night);
    // 화분
    b.rect(110, 82, 12, 12, rgb('#e07a4f')); b.rect(109, 81, 14, 3, rgb('#f29468'));
    b.ellipse(113, 76, 4, 6, rgb('#56b870')); b.ellipse(119, 74, 3.5, 6.5, rgb('#6fcf86')); b.ellipse(116, 70, 3, 4, rgb('#85dc98'));
    drawFloor(b, mood !== 'day', eq);
    const floorDeco = decoOf(eq.floor);
    if (floorDeco) placeDeco(b, floorDeco, 'floor', mood !== 'day');
    if (mood === 'dark') b.darken(0.55, [6, 8, 30]);
  }
  if (roomCache.size > 24) roomCache.clear();
  roomCache.set(key, b);
  return b;
}

function moodOf(view: PetView, now: number, focusing = false): RoomMood {
  if (view.dead) return 'night';
  if (view.inClass) return 'class';
  // 함께 집중 — 펫도 책상에 앉는다(자는 펫·알은 그대로)
  if (focusing && !view.asleep && view.stage !== 'egg') return 'class';
  if (view.asleep && !view.lightsOn) return 'dark';
  if (!view.lightsOn) return 'dark';
  const m = kstParts(now).minutes;
  if (view.asleep || m >= 19 * 60 || m < 6 * 60) return 'night';
  if (m >= 17 * 60) return 'evening';
  return 'day';
}

// ── 공용 조각 ────────────────────────────────────────────────────────

function panel(b: PixelBuf, x: number, y: number, w: number, h: number, fill: Rgb = C.paper) {
  b.rect(x + 2, y + 2, w, h, C.shadow, 120);
  b.rect(x + 1, y, w - 2, h, fill);
  b.rect(x, y + 1, w, h - 2, fill);
  b.rect(x + 1, y, w - 2, 1, C.ink); b.rect(x + 1, y + h - 1, w - 2, 1, C.ink);
  b.rect(x, y + 1, 1, h - 2, C.ink); b.rect(x + w - 1, y + 1, 1, h - 2, C.ink);
}

function pill(b: PixelBuf, x: number, y: number, w: number, h: number, fill: Rgb) {
  b.rect(x + 1, y, w - 2, h, fill);
  b.rect(x, y + 1, w, h - 2, fill);
}

function heartIcon(b: PixelBuf, x: number, y: number, full: boolean) {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch !== '#') return;
    const edge = ry === 0 || rx === 0 || rx === 6 || (ry >= 3 && (rx === ry - 2 || rx === 8 - ry));
    b.px(x + rx, y + ry, full ? (ry === 1 && rx === 1 ? C.white : C.red) : edge ? C.mute : C.paperLine);
  }));
}

function menuIcon(b: PixelBuf, index: number, x: number, y: number, color: Rgb) {
  const icon = MENU_ICONS[index];
  icon.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === '#') b.px(x + rx, y + ry, color); }));
}

function iconWithOutline(b: PixelBuf, index: number, x: number, y: number, color: Rgb) {
  const tmp = new PixelBuf(13, 13);
  menuIcon(tmp, index, 1, 1, color);
  tmp.outline(C.ink);
  b.blit(tmp, x - 1, y - 1);
}

function speech(b: PixelBuf, text: string, cx: number, bottom: number) {
  const w = Math.min(110, textWidth(text, 'small') + 8);
  const x = Math.max(2, Math.min(S - w - 2, Math.round(cx - w / 2)));
  const y = bottom - 14;
  panel(b, x, y, w, 13, C.white);
  b.tri(cx - 3, y + 12, cx + 3, y + 12, cx, y + 16, C.white);
  b.px(cx - 3, y + 12, C.ink); b.px(cx + 3, y + 12, C.ink);
  drawText(b, fitText(text, w - 6, 'small'), x + 4, y + 1, C.ink, 'small');
}

// ── 펫 ───────────────────────────────────────────────────────────────

function walkX(now: number, minX: number, maxX: number, width: number, seed: number) {
  const room = Math.max(0, maxX - minX - width);
  if (room === 0) return { x: minX, flip: false };
  const step = frameNo(now, 400);
  const cycle = room * 2;
  const pause = ((seed >>> (step % 20)) & 3) === 0;
  const t = pause ? step - 1 : step;
  const phase = ((t % cycle) + cycle) % cycle;
  return { x: minX + (phase < room ? phase : cycle - phase), flip: phase >= room };
}

function drawPet(b: PixelBuf, input: ScreenInput, pose: Pose, x: number, opts: { flip?: boolean; dy?: number } = {}) {
  const spr = characterSprite(input.view.stage, pose, input.view.sick, input.view.look);
  b.ellipse(x + spr.w / 2, FEET_Y + 1, spr.w * 0.36, 2, C.shadow, 90);
  b.blit(spr, x, FEET_Y - spr.h + (opts.dy ?? 0), { flip: opts.flip });
  return spr;
}

function petCenterX(input: ScreenInput, pose: Pose) {
  return Math.round(S / 2 - characterSprite(input.view.stage, pose, input.view.sick, input.view.look).w / 2);
}

function poopSprite(b: PixelBuf, x: number, y: number, f: number) {
  const brown = rgb('#8a5a2b'), dark = rgb('#5e3a17'), hi = rgb('#b9814a');
  b.ellipse(x + 5, y + 7, 5, 2.4, brown);
  b.ellipse(x + 5, y + 4.5, 3.8, 2, brown);
  b.ellipse(x + 5 + (f ? 0.5 : 0), y + 2.2, 2.4, 1.6, brown);
  b.px(x + 3, y + 4, hi); b.px(x + 4, y + 6, hi);
  b.rect(x + 1, y + 9, 9, 1, dark);
  const stink = rgb('#9fb87a');
  for (let i = 0; i < 3; i += 1) {
    const sx = x + 2 + i * 3, sy = y - 6;
    for (let k = 0; k < 5; k += 1) b.px(sx + ((k + f + i) % 2), sy + k, stink, 200);
  }
}

function drawPoops(b: PixelBuf, count: number, now: number, minX = -99) {
  const spots = [[112, 104], [100, 106], [112, 92], [100, 94]];
  for (let i = 0; i < Math.min(4, count); i += 1) {
    const [x, y] = spots[i];
    if (x < minX) continue;
    poopSprite(b, x, y, frameNo(now) % 2);
  }
}

function petArea(poop: number) { return poop >= 3 ? 94 : poop >= 1 ? 98 : 120; }

/** 교실 칠판의 글씨 — 수업 중이면 과목, 함께 집중이면 남은 시간. 방 그림의 일부라 기쁨 애니메이션 중에도 그린다. */
function drawBoard(b: PixelBuf, input: ScreenInput) {
  const { view, now } = input;
  if (view.inClass) {
    const cls = input.messages.find((m) => m.kind === 'class' && m.id.startsWith('class-now'));
    drawTextCentered(b, '수업 중', 64, 24, C.white);
    if (cls) drawTextCentered(b, fitText(cls.title.replace(/^지금 /, ''), 96, 'small'), 64, 39, rgb('#cfe8dc'), 'small');
  } else if (input.focusEndsAt) {
    const left = input.focusEndsAt - now;
    drawTextCentered(b, left > 0 ? '함께 집중' : '다 했어!', 64, 24, C.white);
    drawTextCentered(b, left > 0 ? mmss(left) : '끝내기를 눌러 줘', 64, 39, rgb('#cfe8dc'), left > 0 ? 'bold' : 'small');
  }
}

/** 별이 된 펫(죽음 옵션 — 2026-10-19) — 밤의 방에 둥근 묘비와 꽃 둘, 그 옆을 천천히 오르내리는 혼 */
const SPIRIT_ROWS = ['..###..', '.#####.', '##.#.##', '#######', '#######', '#.#.#.#'];
function drawGraveScene(b: PixelBuf, now: number, view: PetView) {
  // 왜 별이 됐는지 — 하드(개복치)는 이유가 곧 웃음이다. 노멀은 «오래 아파서» 한 가지
  if (view.deathCause) {
    const lines = wrapText(deathCauseOf(view.deathCause).phrase, 112, 'small').slice(0, 2);
    lines.forEach((line, i) => drawTextCentered(b, line, 64, STATUS_H + 4 + i * lineHeight('small'), rgb('#e4e0ff'), 'small'));
  }
  const stone = rgb('#c3c8da'), edge = rgb('#7d84a3'), mark = rgb('#5d6485'), stem = rgb('#4f8a4a');
  b.ellipse(64, FEET_Y + 1, 20, 3, C.shadow, 90);
  b.ellipse(64, FEET_Y - 30, 15, 10, edge);
  b.rect(49, FEET_Y - 30, 30, 31, edge);
  b.ellipse(64, FEET_Y - 30, 13, 8, stone);
  b.rect(51, FEET_Y - 30, 26, 29, stone);
  b.sprite(['.#.', '###', '.#.', '.#.'], 61, FEET_Y - 34, mark, { scale: 2 });
  b.rect(44, FEET_Y - 1, 40, 2, rgb('#6d8f5a'));
  for (const [x, c] of [[45, C.pink], [82, C.gold]] as const) {
    b.rect(x, FEET_Y - 7, 1, 6, stem);
    b.ellipse(x + 0.5, FEET_Y - 8, 2.2, 2.2, c);
  }
  const bob = Math.round(Math.sin(now / 700) * 2);
  b.ellipse(93, FEET_Y - 58 + bob, 5, 1.4, C.gold);
  b.sprite(SPIRIT_ROWS, 86, FEET_Y - 55 + bob, C.white, { scale: 2 });
  if (frameNo(now, 900) % 2 === 0) drawStar(b, 28, 44, 2, C.gold);
}

function drawMainScene(b: PixelBuf, input: ScreenInput) {
  const { view, now, state } = input;
  const f = frameNo(now) % 2;
  if (view.dead) { drawGraveScene(b, now, view); return; }
  if (view.stage === 'egg') {
    const fast = view.hatchProgress > 0.6;
    const wob = frameNo(now, fast ? 200 : 600) % 2;
    const spr = characterSprite('egg', view.hatchProgress > 0.8 && wob ? 'no' : 'idle0', false, lookOf(view.species));
    b.ellipse(64, FEET_Y + 1, 10, 2, C.shadow, 90);
    b.blit(spr, 64 - spr.w / 2 + (wob ? 1 : -1), FEET_Y - spr.h);
    if (frameNo(now, 900) % 2 === 0) drawStar(b, 84, 64, 2.5, C.gold);
    return;
  }
  const focusing = !!input.focusEndsAt && !view.inClass && !view.asleep;
  if (view.inClass || focusing) {
    // 칠판 앞 책상 — 수업 중(시간이 멈춤) · 또는 함께 집중. 칠판 글씨는 drawBoard 가 쓴다(애니메이션 중에도 남게)
    const pose: Pose = frameNo(now, 1200) % 2 ? 'idle1' : 'idle0';
    drawPet(b, input, pose, petCenterX(input, pose), { dy: -6 });
    b.rect(30, 104, 68, 4, rgb('#b9814a'));
    b.rect(30, 108, 68, 2, rgb('#8a5a2b'));
    b.rect(34, 110, 3, 12, rgb('#8a5a2b')); b.rect(91, 110, 3, 12, rgb('#8a5a2b'));
    b.rect(48, 100, 16, 4, C.white); b.rect(64, 100, 16, 4, rgb('#f0ecff')); b.rect(63, 100, 2, 4, C.mute);
    return;
  }
  if (view.asleep) {
    drawPet(b, input, 'sleep', petCenterX(input, 'sleep'));
    const z = frameNo(now, 700) % 3;
    drawText(b, 'Z', 84 + z * 3, 62 - z * 6, view.lightsOn ? C.ink : rgb('#c9c3ff'), 'bold');
    if (z > 0) drawText(b, 'z', 78 + z * 2, 72 - z * 4, view.lightsOn ? C.ink : rgb('#c9c3ff'), 'small');
    drawPoops(b, Math.min(view.poop, 1), now);
    return;
  }
  const sad = view.hungerHearts === 0 || view.happyHearts === 0 || view.sick;
  const pose: Pose = sad ? 'no' : f ? 'idle1' : 'idle0';
  const width = characterSprite(view.stage, 'idle0', view.sick, view.look).w;
  const { x, flip } = sad ? { x: Math.round((petArea(view.poop) - width) / 2), flip: false } : walkX(now, 6, petArea(view.poop), width, state.seed);
  const spr = drawPet(b, input, pose, x, { flip, dy: !sad && f ? -1 : 0 });
  drawPoops(b, view.poop, now);
  if (view.sick && f === 0) drawSkullBubble(b, x + spr.w - 2, FEET_Y - spr.h - 4);
  if (sad && !view.sick && f === 0) b.ellipse(x + spr.w + 2, FEET_Y - spr.h + 6, 1.6, 2.4, C.sky);
}

function drawSkullBubble(b: PixelBuf, x: number, y: number) {
  b.ellipse(x + 5, y + 4, 6, 5, C.white);
  const skull = ['.###.', '#####', '#.#.#', '#####', '.#.#.'];
  b.sprite(skull, x + 3, y + 2, rgb('#6b5a8e'));
}

// ── 화면별 ───────────────────────────────────────────────────────────

const FOOD_ONIGIRI = ['.....#.....', '....###....', '...#####...', '..#######..', '.#########.', '###########', '###########', '##.......##', '##.......##', '###########'];
const FOOD_CAKE = ['....##.....', '...####....', '..........#', '##########.', '#.#.#.#.#.#', '###########', '###########', '#.........#', '###########'];

function drawFood(b: PixelBuf, kind: 'meal' | 'snack', x: number, y: number, bite: number) {
  const rows = kind === 'meal' ? FOOD_ONIGIRI : FOOD_CAKE;
  const tmp = new PixelBuf(13, 12);
  rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch !== '#') return;
    let c: Rgb = C.white;
    if (kind === 'meal') c = ry >= 7 ? rgb('#2c3a2a') : C.white;
    else c = ry <= 1 ? C.red : ry === 4 ? rgb('#fff2a8') : ry >= 7 ? rgb('#f7c8a0') : rgb('#ffe9f0');
    tmp.px(rx + 1, ry + 1, c);
  }));
  // 한 입씩 — 오른쪽 위부터 동그랗게 사라진다
  for (let k = 0; k < bite; k += 1) {
    const cx = 11 - k * 4, cy = 3 + k * 2;
    for (let yy = 0; yy < 12; yy += 1) for (let xx = 0; xx < 13; xx += 1) {
      if ((xx - cx) ** 2 + (yy - cy) ** 2 <= 12) tmp.data[(yy * 13 + xx) * 4 + 3] = 0;
    }
  }
  if (bite < 3) tmp.outline(C.ink);
  // 접시
  b.ellipse(x + 6, y + 12, 9, 2.2, C.white);
  b.ellipse(x + 6, y + 12, 7, 1.2, rgb('#e6e0f5'));
  b.blit(tmp, x, y);
}

function drawAnim(b: PixelBuf, input: ScreenInput, s: Extract<Screen, { kind: 'anim' }>) {
  const { now, view } = input;
  const t = now - s.at;
  switch (s.anim) {
    case 'eat-meal':
    case 'eat-snack': {
      const bite = Math.min(3, Math.floor(t / 650));
      const kind = s.anim === 'eat-meal' ? 'meal' : 'snack';
      const pose: Pose = frameNo(t, 325) % 2 === 0 && bite < 3 ? 'eat' : 'idle0';
      drawPet(b, input, pose, 62);
      if (bite < 4) drawFood(b, kind, 36, 98, bite);
      if (bite >= 3) floatHearts(b, t - 1950, 76, 70);
      return;
    }
    case 'refuse': {
      const left = frameNo(t, 220) % 2 === 0;
      drawPet(b, input, 'no', petCenterX(input, 'no') + (left ? -2 : 2));
      speech(b, input.notice && now - input.notice.at < 2500 ? input.notice.short : '싫어!', 64, 72);
      return;
    }
    case 'medicine': {
      const x = petCenterX(input, 'idle0');
      const travel = Math.min(1, t / 900);
      const pose: Pose = t > 1100 && s.healed ? 'happy' : 'idle0';
      drawPet(b, input, pose, x);
      if (t < 1100) {
        const sx = Math.round(4 + travel * (x - 22));
        b.rect(sx, 92, 16, 5, rgb('#dff3ff')); b.rect(sx, 92, 16, 1, C.ink); b.rect(sx, 96, 16, 1, C.ink);
        b.rect(sx + 3, 93, 8, 3, rgb('#7fd0ff'));
        b.rect(sx + 16, 94, 5, 1, rgb('#c0c6d0')); b.rect(sx - 4, 93, 4, 3, C.mute);
      } else if (s.healed) floatHearts(b, t - 1100, x + 18, 74);
      else drawText(b, '한 번 더!', 70, 66, C.ink, 'small');
      return;
    }
    case 'clean': {
      const waveX = Math.round(S - (t / ANIM_MS.clean) * (S + 24));
      // 자는 펫은 깨우지 않고 치운다(2026-11-05) — 잠자는 모습 그대로
      const pose: Pose = view.asleep ? 'sleep' : frameNo(now) % 2 ? 'idle1' : 'idle0';
      const x = Math.round((petArea(s.poop ?? 0) - characterSprite(view.stage, pose, view.sick, view.look).w) / 2);
      drawPet(b, input, pose, x);
      drawPoops(b, s.poop ?? 0, now, waveX + 14);
      for (let y = 40; y < S; y += 1) {
        const off = Math.round(Math.sin((y + t / 30) / 4) * 3);
        for (let xx = waveX + off; xx < waveX + off + 14; xx += 1) b.px(xx, y, xx - waveX - off < 3 ? C.white : rgb('#6ec3ff'), 220);
      }
      [[6, 60], [10, 80], [4, 100], [12, 112]].forEach(([dx, dy], i) => b.ellipse(waveX + dx + 8, dy - ((t / 20 + i * 7) % 12), 1.5, 1.5, C.white));
      return;
    }
    case 'happy': {
      const up = frameNo(t, 260) % 2 === 0;
      drawPet(b, input, 'happy', petCenterX(input, 'happy'), { dy: up ? -3 : 0 });
      floatHearts(b, t, 82, 72);
      return;
    }
    case 'walk': {
      drawWalkScene(b, t);
      if (t < 2200) {
        const f = frameNo(t, 250) % 2;
        drawPet(b, input, f ? 'idle1' : 'idle0', 46, { dy: -f });
        for (let i = 0; i < 3; i += 1) b.ellipse(40 - i * 7, FEET_Y - 1, 1.6, 1, rgb('#8fbf6a'), 200 - i * 50);
      } else {
        const up = frameNo(t, 260) % 2 === 0;
        drawPet(b, input, 'happy', petCenterX(input, 'happy'), { dy: up ? -3 : 0 });
        floatHearts(b, t - 2200, 82, 72);
      }
      return;
    }
    case 'lights':
      drawMainScene(b, input);
      return;
    case 'hatch': {
      const egg = characterSprite('egg', t > 600 ? 'no' : 'idle0', false, lookOf(view.species));
      if (t < 1300) {
        const shake = frameNo(t, 110) % 2 ? 2 : -2;
        b.blit(egg, 64 - egg.w / 2 + shake, FEET_Y - egg.h);
      } else if (t < 1700) {
        b.rect(0, STATUS_H, S, S - STATUS_H, C.white, Math.round(255 * (1 - (t - 1300) / 400)));
      } else {
        drawPet(b, input, 'happy', petCenterX(input, 'happy'));
        sparkles(b, t, 64, 80);
        drawTextCentered(b, '태어났어요!', 64, 30, C.ink, 'bold', C.white);
      }
      return;
    }
    case 'evolve': {
      if (t < 2100) {
        const prev = s.fromStage ?? 'baby';
        const showNew = frameNo(t, 240) % 2 === 1;
        const spr = characterSprite(showNew ? view.stage : prev, 'idle0', false, showNew ? view.look : lookOf(view.species));
        b.blit(spr, 64 - spr.w / 2, FEET_Y - spr.h);
        if (frameNo(t, 120) % 3 === 0) b.rect(0, STATUS_H, S, S - STATUS_H, C.white, 170);
        sparkles(b, t, 64, 84);
      } else {
        drawPet(b, input, 'happy', petCenterX(input, 'happy'));
        sparkles(b, t, 64, 80);
        drawTextCentered(b, `${STAGE_LABEL[view.stage]}가 됐어요!`, 64, 30, C.ink, 'bold', C.white);
      }
      return;
    }
    case 'game-end': {
      // 져도 놀아서 기분은 좋아졌다(행복 +1칸) — 고개 젓기 대신 웃는 얼굴, 하트는 이겼을 때만 셋
      const pose: Pose = s.won ? 'happy' : 'idle0';
      drawPet(b, input, pose, petCenterX(input, pose));
      panel(b, 34, 26, 60, 26, C.white);
      drawTextCentered(b, `${s.wins ?? 0} / ${GAME_ROUNDS}`, 64, 29, C.ink, 'bold');
      drawTextCentered(b, s.won ? '이겼다! 기분 최고' : '져도 재밌었어!', 64, 40, s.won ? C.pink : C.mute, 'small');
      if (s.won) floatHearts(b, t, 84, 70);
      else if (t > 600) heartIcon(b, 86, Math.round(70 - Math.min(1, (t - 600) / 900) * 12), true);
    }
  }
}

/** 산책 길 — 하늘·언덕·지나가는 나무(오른쪽 → 왼쪽, 펫이 걷는 것처럼) */
function drawWalkScene(b: PixelBuf, t: number) {
  gradientRect(b, 0, 0, S, 80, rgb('#8fd3ff'), rgb('#d9f1ff'));
  b.ellipse(104, 26, 7, 7, rgb('#ffe066'));
  b.ellipse(30, 30, 12, 4, C.white, 220); b.ellipse(40, 27, 8, 4, C.white, 220);
  b.ellipse(40, 92, 70, 20, rgb('#9fd67a'));
  b.ellipse(110, 96, 50, 16, rgb('#8cc96a'));
  b.rect(0, 92, S, S - 92, rgb('#7dbb5c'));
  b.rect(0, FEET_Y - 2, S, 6, rgb('#d8c08a'));
  const shift = Math.min(1, t / 2200);
  for (const [x0, k] of [[150, 1], [230, 0.8]] as const) drawTree(b, Math.round(x0 - shift * 200), FEET_Y - 2, k);
}

function drawTree(b: PixelBuf, x: number, base: number, k: number) {
  const trunk = rgb('#8a5a3c'), leaf = rgb('#4f9e4a'), hi = rgb('#7cc96a');
  b.rect(x - Math.round(2 * k), base - Math.round(14 * k), Math.max(2, Math.round(4 * k)), Math.round(14 * k), trunk);
  b.ellipse(x, base - 20 * k, 11 * k, 10 * k, leaf);
  b.ellipse(x - 3 * k, base - 23 * k, 5 * k, 4 * k, hi);
}

function floatHearts(b: PixelBuf, t: number, x: number, y: number) {
  if (t < 0) return;
  for (let i = 0; i < 3; i += 1) {
    const life = ((t / 900 + i / 3) % 1);
    heartIcon(b, Math.round(x + Math.sin(life * 6 + i) * 4 + i * 6 - 6), Math.round(y - life * 24), true);
  }
}

function sparkles(b: PixelBuf, t: number, cx: number, cy: number) {
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + t / 600;
    const r = 22 + Math.sin(t / 200 + i) * 4;
    drawStar(b, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 2.2, i % 2 ? C.gold : C.white);
  }
}

function drawStatusBar(b: PixelBuf, input: ScreenInput) {
  b.rect(0, 0, S, STATUS_H, rgb('#1b1438'), 210);
  const { minutes } = kstParts(input.now);
  drawText(b, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, 3, 1, C.white, 'small');
  let x = S - 3;
  if (input.view.attention && frameNo(input.now, 600) % 2 === 0) {
    x -= 9; pill(b, x, 2, 8, 8, C.red); drawText(b, '!', x + 3, 0, C.white, 'small');
  }
  if (input.messages.length) {
    x -= 12;
    menuIcon(b, MENU.messages, x, 0, C.gold);
    if (input.unread) b.ellipse(x + 10, 2, 1.6, 1.6, C.red);
  }
  // 하트 요약 — 배부름·행복 칸 수
  if (input.view.stage !== 'egg') {
    const hx = 34;
    for (let i = 0; i < 4; i += 1) b.rect(hx + i * 4, 4, 3, 4, i < input.view.hungerHearts ? rgb('#ff9f43') : rgb('#4a3f6e'));
    for (let i = 0; i < 4; i += 1) b.rect(hx + 19 + i * 4, 4, 3, 4, i < input.view.happyHearts ? C.pink : rgb('#4a3f6e'));
  }
}

function drawDock(b: PixelBuf, cursor: number, now: number) {
  const y = 104;
  b.rect(2, y, S - 4, 22, rgb('#1b1438'), 215);
  b.rect(3, y - 1, S - 6, 1, rgb('#1b1438'), 215);
  const step = (S - 8) / 7;
  for (let i = 0; i <= MENU.messages; i += 1) {
    const x = Math.round(4 + i * step + (step - 11) / 2);
    const selected = i === cursor;
    if (selected) {
      pill(b, x - 3, y + 2, 17, 18, C.white);
      iconWithOutline(b, i, x, y + 5 - (frameNo(now, 300) % 2), ICON_COLOR[i]);
    } else {
      menuIcon(b, i, x, y + 6, lerp(ICON_COLOR[i], rgb('#1b1438'), 0.25));
    }
  }
  const label = MENU_LABELS[cursor];
  const lx = Math.round(4 + cursor * step + step / 2);
  const w = textWidth(label, 'small') + 10;
  const px = Math.max(2, Math.min(S - w - 2, lx - w / 2));
  pill(b, px, y - 15, w, 12, C.pink);
  b.tri(lx - 3, y - 4, lx + 3, y - 4, lx, y - 1, C.pink);
  drawText(b, label, px + 5, y - 15, C.white, 'small');
}

function optionPanel(b: PixelBuf, title: string, options: { label: string; note: string; draw: (x: number, y: number) => void }[], cursor: number, now: number) {
  // 고를 것이 셋이면 판을 늘린다(셋째 줄이 판 밖으로 나가지 않게). 넷(놀이 + 산책)이면 판 전체를 위로 올린다
  const four = options.length > 3;
  const top = four ? STATUS_H + 1 : options.length > 2 ? 18 : 24;
  const titleY = four ? top + 3 : 28;
  // 넷: 줄 간격 21 · 판 높이 109 (13..122 — 화면 128 안). 셋 이하는 예전 그대로
  const rowStep = four ? 21 : 22;
  panel(b, 10, top, 108, four ? 109 : 28 + options.length * 22);
  drawText(b, title, 18, titleY, C.ink, 'bold');
  b.rect(16, titleY + 14, 96, 1, C.paperLine);
  options.forEach((o, i) => {
    const y = titleY + 19 + i * rowStep;
    if (i === cursor) pill(b, 14, y - 2, 100, 20, C.pinkSoft);
    if (i === cursor && frameNo(now, 400) % 2 === 0) b.tri(17, y + 3, 17, y + 11, 21, y + 7, C.pink);
    o.draw(24, y);
    drawText(b, o.label, 42, y, C.ink, 'body');
    drawText(b, o.note, 42 + textWidth(o.label) + 4, y + 2, C.mute, 'small');
  });
}

function bulb(b: PixelBuf, x: number, y: number, on: boolean) {
  b.ellipse(x + 6, y + 5, 5, 5, on ? rgb('#ffe066') : rgb('#9a94b8'));
  b.rect(x + 4, y + 10, 5, 4, C.mute);
  if (on) { b.px(x + 4, y + 3, C.white); b.px(x + 5, y + 2, C.white); }
}

function drawStatus(b: PixelBuf, input: ScreenInput, page: number) {
  const { view, state, now } = input;
  panel(b, 6, 16, 116, 104);
  // 단계 옆에 모드(이지는 적지 않는다 — 기본값이라 말할 것이 없다). 이름은 남는 폭만큼만
  const tag = view.mode === 'easy' ? STAGE_LABEL[view.stage] : `${MODE_INFO[view.mode].badge} · ${STAGE_LABEL[view.stage]}`;
  const tagW = textWidth(tag, 'small');
  drawText(b, fitText(state.name, Math.min(70, 116 - 4 - tagW - 6 - 13), 'bold'), 13, 20, C.ink, 'bold');
  drawText(b, tag, 116 - tagW - 4, 22, view.mode === 'hard' ? C.red : C.pink, 'small');
  b.rect(12, 34, 104, 1, C.paperLine);
  for (let i = 0; i < 3; i += 1) b.ellipse(56 + i * 8, 115, 1.6, 1.6, i === page ? C.pink : C.paperLine);
  if (page === 0) {
    // 값 칸은 가장 긴 이름(몸무게) 뒤로 — 짧은 자리에 두면 «몸무게22g» 처럼 붙는다
    const vx = 58;
    drawText(b, '나이', 14, 40, C.mute, 'small'); drawText(b, `${view.ageYears}살`, vx, 39, C.ink);
    drawText(b, '몸무게', 14, 54, C.mute, 'small'); drawText(b, `${view.weight}g`, vx, 53, C.ink);
    drawText(b, '배부름', 14, 70, C.mute, 'small');
    for (let i = 0; i < 4; i += 1) heartIcon(b, vx + i * 10, 72, i < view.hungerHearts);
    drawText(b, '행복', 14, 86, C.mute, 'small');
    for (let i = 0; i < 4; i += 1) heartIcon(b, vx + i * 10, 88, i < view.happyHearts);
  } else if (page === 1) {
    const rows: [string, string, Rgb][] = [
      ['몸 상태', view.dead ? '별이 됐어요' : view.critical ? '위독 · 주사' : view.sick ? '아파요 · 주사' : '건강해요', view.dead ? C.mute : view.sick ? C.red : C.green],
      ['똥', view.poop ? `${view.poop}개` : '깨끗해요', view.poop ? rgb('#b9814a') : C.green],
      ['불', view.lightsOn ? '켜짐' : '꺼짐', C.ink],
      ['돌봄 실수', `${view.careMisses}번`, view.careMisses ? C.red : C.ink],
    ];
    rows.forEach(([k, v, c], i) => { drawText(b, k, 14, 41 + i * 17, C.mute, 'small'); drawText(b, v, 60, 40 + i * 17, c); });
  } else {
    // 지금 모습 → 다음 모습(검은 그림자) — 네 단계를 다 늘어놓으면 화면 폭(104)을 넘는다
    const order = ['egg', 'baby', 'child', 'teen', 'adult'] as const;
    const idx = order.indexOf(view.stage);
    const next = idx < order.length - 1 ? order[idx + 1] : null;
    const cur = characterSprite(view.stage, 'happy', false, view.look);
    const baseY = 92;
    const curX = next ? 22 : 64 - cur.w / 2;
    b.blit(cur, curX, baseY - cur.h);
    if (next) {
      const nx = characterSprite(next, 'idle0', false, lookOf(view.species));
      const shadow = new PixelBuf(nx.w, nx.h);
      for (let i = 0; i < nx.data.length; i += 4) if (nx.data[i + 3]) { shadow.data[i] = 70; shadow.data[i + 1] = 58; shadow.data[i + 2] = 110; shadow.data[i + 3] = 255; }
      b.blit(shadow, 104 - nx.w / 2 - 6, baseY - nx.h);
      b.tri(curX + cur.w + 4, baseY - 18, curX + cur.w + 4, baseY - 10, curX + cur.w + 9, baseY - 14, C.pink);
      drawText(b, '?', 104 - 9, baseY - nx.h - 12, C.mute, 'bold');
    }
    if (view.stage === 'egg') drawText(b, '곧 깨어나요', 14, 98, C.ink, 'small');
    else if (next) {
      const ticksLeft = STAGE_AT[next as Exclude<typeof next, 'egg' | 'baby'>] - (state.tick - state.hatchTick);
      const hours = Math.max(0, Math.ceil((ticksLeft * TICK_MS) / 3600000));
      drawText(b, `${STAGE_LABEL[next]}까지 약 ${hours >= 24 ? `${Math.ceil(hours / 24)}일` : `${hours}시간`}`, 14, 98, C.ink, 'small');
    } else drawText(b, `다 자랐어요 · ${Math.floor((state.tick - state.hatchTick) / TICKS_PER_DAY)}일째`, 14, 98, C.ink, 'small');
    drawText(b, lookName(view.species, view.stage, view.branch) ?? '자라는 중', 14, 40, C.mute, 'small');
    void now;
  }
}

function drawHilo(b: PixelBuf, input: ScreenInput, s: Extract<Screen, { kind: 'game' }>) {
  const { now } = input;
  const hit = s.guess === s.answer;
  panel(b, 24, 18, 80, 16, C.white);
  // 패널 폭 80 — 긴 물음은 넘친다(첫 스크린샷)
  drawTextCentered(b, s.phase === 'ask' ? '높을까 낮을까?' : hit ? '맞았다!' : '아쉬워!', 64, 20, s.phase === 'ask' ? C.ink : hit ? C.pink : C.mute, 'small');
  for (let r = 0; r < GAME_ROUNDS; r += 1) {
    const done = r < s.round || (r === s.round && s.phase === 'reveal');
    b.ellipse(48 + r * 8, 40, 2.4, 2.4, done ? C.gold : C.white);
    b.ellipse(48 + r * 8, 40, 1.4, 1.4, done ? C.gold : rgb('#c9c3e0'));
  }
  // 숫자 카드 — 지금 숫자, 드러나면 그 옆에 다음 숫자
  const card = (cx: number, value: string, color: Rgb) => {
    panel(b, cx - 11, 50, 22, 28, C.white);
    drawTextCentered(b, value, cx, 56, color, 'bold');
  };
  if (s.phase === 'ask') {
    card(84, String(s.shown ?? 5), C.ink);
    drawPet(b, input, frameNo(now) % 2 ? 'idle1' : 'idle0', 36);
    const blink = frameNo(now, 400) % 2 === 0;
    drawText(b, 'A 낮아', 8, 112, blink ? C.pink : C.white, 'small', C.ink);
    drawText(b, 'S 높아', 92, 112, blink ? C.pink : C.white, 'small', C.ink);
  } else {
    card(70, String(s.shown ?? 5), C.mute);
    card(100, String(s.next ?? 0), hit ? C.pink : C.ink);
    drawTextCentered(b, (s.next ?? 0) > (s.shown ?? 0) ? '높아!' : '낮아!', 85, 82, C.ink, 'small');
    const pose: Pose = hit ? 'happy' : 'no';
    drawPet(b, input, pose, 30);
  }
}

function drawMemo(b: PixelBuf, input: ScreenInput, s: Extract<Screen, { kind: 'game' }>) {
  const { now } = input;
  const seq = s.seq ?? [];
  const hit = s.guess === s.answer;
  panel(b, 24, 18, 80, 16, C.white);
  drawTextCentered(b, s.phase === 'show' ? '순서를 기억해!' : s.phase === 'ask' ? '따라 해 봐!' : hit ? '맞았다!' : '아쉬워!', 64, 20,
    s.phase === 'reveal' ? (hit ? C.pink : C.mute) : C.ink, 'small');
  for (let r = 0; r < GAME_ROUNDS; r += 1) {
    const done = r < s.round || (r === s.round && s.phase === 'reveal');
    b.ellipse(48 + r * 8, 40, 2.4, 2.4, done ? C.gold : C.white);
    b.ellipse(48 + r * 8, 40, 1.4, 1.4, done ? C.gold : rgb('#c9c3e0'));
  }
  // 화살표 칸 줄 — 보여 줄 땐 지금 칸만 밝게, 따라 할 땐 맞게 누른 칸이 채워진다
  const w = seq.length * 16;
  const x0 = 64 - w / 2;
  const showing = s.phase === 'show' ? Math.min(seq.length - 1, Math.floor((now - s.at) / MEMO_STEP_MS)) : -1;
  const gap = s.phase === 'show' && (now - s.at) % MEMO_STEP_MS > MEMO_STEP_MS - 150;
  seq.forEach((dir, i) => {
    const x = x0 + i * 16 + 8;
    const lit = s.phase === 'show' ? i === showing && !gap : s.phase === 'ask' ? i < (s.pos ?? 0) : true;
    panel(b, x - 7, 50, 14, 16, lit ? C.white : rgb('#cfc6ea'));
    if (lit) {
      const c = dir === 'L' ? C.sky : C.pink;
      if (dir === 'L') b.tri(x - 4, 58, x + 3, 53, x + 3, 63, c); else b.tri(x + 4, 58, x - 3, 53, x - 3, 63, c);
    }
  });
  if (s.phase === 'reveal') drawPet(b, input, hit ? 'happy' : 'no', petCenterX(input, hit ? 'happy' : 'no'));
  else drawPet(b, input, frameNo(now) % 2 ? 'idle1' : 'idle0', petCenterX(input, 'idle0'));
  if (s.phase === 'ask') {
    drawText(b, 'A 왼쪽', 8, 112, C.white, 'small', C.ink);
    drawText(b, 'S 오른쪽', 82, 112, C.white, 'small', C.ink);
  }
}

function drawGame(b: PixelBuf, input: ScreenInput, s: Extract<Screen, { kind: 'game' }>) {
  if (s.game === 'hilo') { drawHilo(b, input, s); return; }
  if (s.game === 'memo') { drawMemo(b, input, s); return; }
  const { now } = input;
  panel(b, 24, 18, 80, 16, C.white);
  drawTextCentered(b, s.phase === 'ask' ? '어느 쪽일까?' : s.guess === s.answer ? '맞았다!' : '아쉬워!', 64, 20, s.phase === 'ask' ? C.ink : s.guess === s.answer ? C.pink : C.mute, 'small');
  for (let r = 0; r < GAME_ROUNDS; r += 1) {
    const done = r < s.round || (r === s.round && s.phase === 'reveal');
    b.ellipse(48 + r * 8, 40, 2.4, 2.4, done ? C.gold : C.white);
    b.ellipse(48 + r * 8, 40, 1.4, 1.4, done ? C.gold : rgb('#c9c3e0'));
  }
  if (s.phase === 'ask') {
    drawPet(b, input, frameNo(now) % 2 ? 'idle1' : 'idle0', petCenterX(input, 'idle0'));
    const blink = frameNo(now, 400) % 2 === 0;
    b.tri(8, 84, 18, 76, 18, 92, blink ? C.pink : C.white);
    b.tri(120, 84, 110, 76, 110, 92, blink ? C.pink : C.white);
    drawText(b, 'A', 10, 94, C.ink, 'small'); drawText(b, 'S', 113, 94, C.ink, 'small');
  } else {
    const right = s.answer === 'R';
    const pose: Pose = s.guess === s.answer ? 'happy' : 'no';
    drawPet(b, input, pose, petCenterX(input, pose) + (right ? 14 : -14), { flip: right });
  }
}

// ── 알림 ─────────────────────────────────────────────────────────────

const LIST_TOP = 34;
const ROW_H = 15;
const DETAIL_TITLE_Y = 31;
const DETAIL_BODY_BOTTOM = 112;
const BODY_W = 108;

function kindChip(b: PixelBuf, kind: PetMessageKind, x: number, y: number) {
  const label = MESSAGE_KIND_LABEL[kind];
  const w = textWidth(label, 'small') + 6;
  pill(b, x, y, w, 11, KIND_COLOR[kind]);
  drawText(b, label, x + 3, y, C.white, 'small');
  return w;
}

function drawMessageList(b: PixelBuf, input: ScreenInput, index: number) {
  const msgs = input.messages;
  panel(b, 4, 14, 120, 110);
  menuIcon(b, MENU.messages, 10, 18, C.gold);
  drawText(b, `알림 ${msgs.length}`, 25, 17, C.ink, 'bold');
  b.rect(9, 31, 110, 1, C.paperLine);
  if (msgs.length === 0) {
    drawTextCentered(b, '새 알림이 없어요', 64, 62, C.mute);
    return;
  }
  const visible = 5;
  const sel = index % msgs.length;
  const first = Math.max(0, Math.min(sel - 2, msgs.length - visible));
  msgs.slice(first, first + visible).forEach((m, i) => {
    const row = first + i;
    const y = LIST_TOP + i * (ROW_H + 2);
    if (row === sel) pill(b, 7, y - 1, 114, ROW_H + 1, C.pinkSoft);
    const chipW = kindChip(b, m.kind, 10, y + 2);
    drawText(b, fitText(m.title, 104 - chipW, 'small'), 13 + chipW, y + 2, C.ink, 'small');
  });
  if (msgs.length > visible) drawTextCentered(b, `${sel + 1}/${msgs.length}`, 64, 112, C.mute, 'small');
  else drawTextCentered(b, 'S 자세히 · D 닫기', 64, 112, C.mute, 'small');
}

/**
 * 알림 하나의 자세한 내용 배치 — 제목 줄(최대 2) · 구분선 · 본문 쪽.
 * 상태 기계가 A(다음 쪽)의 끝을 알아야 해서 밖에 내놓고, 그리기도 같은 값을 쓴다(쪽 수와 그림이 어긋나지 않게).
 */
export function colorDetailLayout(m: PetMessage): { title: string[]; sep: number; top: number; pages: string[][] } {
  const title = wrapText(m.title, BODY_W, 'bold').slice(0, 2);
  const sep = DETAIL_TITLE_Y + title.length * 13 + 1;
  const top = sep + 4;
  const lines = m.lines.flatMap((line) => (line ? wrapText(line, BODY_W, 'body') : ['']));
  const per = Math.max(1, Math.floor((DETAIL_BODY_BOTTOM - top) / lineHeight('body')));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
  return { title, sep, top, pages: pages.length ? pages : [['']] };
}

function drawMessageDetail(b: PixelBuf, input: ScreenInput, index: number, page: number) {
  const msgs = input.messages;
  panel(b, 4, 14, 120, 110);
  if (!msgs.length) return;
  const m = msgs[index % msgs.length];
  kindChip(b, m.kind, 9, 18);
  drawText(b, `${(index % msgs.length) + 1}/${msgs.length}`, 118 - textWidth(`${(index % msgs.length) + 1}/${msgs.length}`, 'small'), 18, C.mute, 'small');
  // 구분선은 제목 «아래» — 제목 줄 수에 따라 내려간다(고정 자리면 받침이 선에 잘린다)
  const { title, sep, top, pages } = colorDetailLayout(m);
  title.forEach((line, i) => drawText(b, line, 10, DETAIL_TITLE_Y + i * 13, C.ink, 'bold'));
  b.rect(9, sep, 110, 1, C.paperLine);
  const p = page % pages.length;
  pages[p].forEach((line, i) => drawText(b, line, 10, top + i * lineHeight('body'), line.startsWith('■') ? C.mute : C.ink));
  drawText(b, pages.length > 1 ? `A 다음 쪽 ${p + 1}/${pages.length}` : 'S 다음 알림', 10, 112, C.mute, 'small');
  drawText(b, 'D 뒤로', 118 - textWidth('D 뒤로', 'small'), 112, C.mute, 'small');
}

function drawClock(b: PixelBuf, input: ScreenInput) {
  const p = kstParts(input.now);
  const hh = String(Math.floor(p.minutes / 60)).padStart(2, '0');
  const mm = String(p.minutes % 60).padStart(2, '0');
  panel(b, 14, 30, 100, 56, C.white);
  const text = `${hh}${frameNo(input.now) % 2 ? ':' : ' '}${mm}`;
  // 두 배 크기 시계 — 한 번 그린 글자를 2×2 로 찍는다
  const tmp = new PixelBuf(60, 14);
  drawText(tmp, text, 0, 0, C.ink, 'bold');
  const w = textWidth(`${hh}:${mm}`, 'bold');
  for (let y = 0; y < tmp.h; y += 1) for (let x = 0; x < tmp.w; x += 1) {
    if (tmp.alphaAt(x, y)) b.rect(64 - w + x * 2, 38 + y * 2, 2, 2, C.ink);
  }
  const day = ['일', '월', '화', '수', '목', '금', '토'][p.weekday % 7];
  drawTextCentered(b, `${Number(p.date.slice(5, 7))}월 ${Number(p.date.slice(8))}일 ${day}요일`, 64, 68, C.mute, 'small');
}

// ── 한 장 ────────────────────────────────────────────────────────────

/** 꾸미기 미리보기 — 낮의 방 한 장(가챠 상품 카드 · 꾸미기 창) */
export function roomPreview(eq: Equipped): PixelBuf {
  return drawRoom('day', eq);
}

export function drawColorScreen(b: PixelBuf, input: ScreenInput) {
  const { ui, view, now } = input;
  const mood = moodOf(view, now, !!input.focusEndsAt);
  b.data.set(drawRoom(mood, input.equipped ?? {}).data);
  const s = ui.screen;
  if (mood === 'class' && (s.kind === 'main' || s.kind === 'anim')) drawBoard(b, input);
  const dimRoom = s.kind !== 'main' && s.kind !== 'anim' && s.kind !== 'game';
  if (s.kind === 'anim') drawAnim(b, input, s);
  else if (s.kind !== 'game') drawMainScene(b, input);
  if (dimRoom) b.darken(0.35, [20, 14, 50]);

  switch (s.kind) {
    case 'food':
      optionPanel(b, '무엇을 줄까?', [
        { label: '밥', note: '배부름 +1', draw: (x, y) => drawFood(b, 'meal', x - 4, y - 3, 0) },
        { label: '간식', note: '행복 +1', draw: (x, y) => drawFood(b, 'snack', x - 4, y - 3, 0) },
      ], s.cursor, now);
      break;
    case 'light':
      optionPanel(b, '불을 어떻게 할까?', [
        { label: '켜기', note: '', draw: (x, y) => bulb(b, x, y - 1, true) },
        { label: '끄기', note: '잘 시간', draw: (x, y) => bulb(b, x, y - 1, false) },
      ], s.cursor, now);
      break;
    case 'gamePick':
      optionPanel(b, '무엇을 하고 놀까?', [
        { label: '좌우 맞히기', note: '', draw: (x, y) => { b.tri(x - 6, y + 2, x - 1, y - 2, x - 1, y + 6, C.pink); b.tri(x + 9, y + 2, x + 4, y - 2, x + 4, y + 6, C.pink); } },
        { label: '높낮이', note: '', draw: (x, y) => drawTextCentered(b, '7', x + 2, y - 4, C.ink, 'bold') },
        { label: '순서 기억', note: '', draw: (x, y) => { b.tri(x - 6, y + 2, x - 2, y - 1, x - 2, y + 5, C.sky); b.tri(x + 1, y + 2, x + 5, y - 1, x + 5, y + 5, C.pink); b.tri(x + 12, y + 2, x + 8, y - 1, x + 8, y + 5, C.sky); } },
        { label: '산책', note: '행복 +2', draw: (x, y) => drawTree(b, x + 2, y + 13, 0.5) },
      ], s.cursor, now);
      break;
    case 'status': drawStatus(b, input, s.page); break;
    case 'game': drawGame(b, input, s); break;
    case 'messages': drawMessageList(b, input, s.index); break;
    case 'detail': drawMessageDetail(b, input, s.index, s.page); break;
    case 'clock': drawClock(b, input); break;
    default: break;
  }

  if (s.kind === 'main' && ui.cursor !== null) drawDock(b, ui.cursor, now);
  if (s.kind === 'main' && input.notice && now - input.notice.at < 2600 && view.stage !== 'egg') {
    speech(b, input.notice.short, 64, FEET_Y - characterSprite(view.stage, 'idle0', view.sick, view.look).h - 2);
  }
  drawStatusBar(b, input);
  if (input.screenOff) b.darken(0.82, [4, 4, 10]);
}
