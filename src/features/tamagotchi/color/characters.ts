/**
 * 컬러 화면의 캐릭터 — 클래식과 같은 한 줄기(알 → 톨 → 별톨 → 별귀 → 별지기)를 색·명암·볼·눈 반짝임·테두리로.
 *
 * 손으로 1024점씩 찍지 않고 «모양 파라미터 + 자세»로 그린다: 몸(타원) · 그림자(오른쪽 아래 테) · 밝은 면 · 눈 · 볼 · 입 ·
 * 팔다리 · 단계별 장식(별 새싹 · 고양이 귀 · 별 왕관과 망토). 자세(idle 두 장 · 먹기 · 기쁨 · 싫어 · 잠)가 같은 함수를 지나므로
 * 모든 애니메이션이 같은 얼굴을 유지한다. 결과는 (단계·자세·아픔) 별로 기억해 둔다.
 */
import { PixelBuf, rgb, type Rgb } from './pixel';
import type { Stage } from '../model/petModel';
import { codexSprite, speciesSprite } from './codexSprites';
import { isSpeciesLook, parseLook, type LookKey } from '../model/species';
import type { Branch, BranchOrBasic } from '../model/branch';
import { bumpCustomVersion } from '../model/catalog';

export type Pose = 'idle0' | 'idle1' | 'eat' | 'happy' | 'no' | 'sleep';

interface Palette { body: Rgb; dark: Rgb; light: Rgb; line: Rgb; cheek: Rgb; eye: Rgb; white: Rgb; gold: Rgb; goldDark: Rgb; mouth: Rgb; tongue: Rgb }

const BASE: Omit<Palette, 'body' | 'dark' | 'light'> = {
  line: rgb('#2b1d4e'), cheek: rgb('#ff8fbf'), eye: rgb('#24183f'), white: rgb('#ffffff'),
  gold: rgb('#ffd34d'), goldDark: rgb('#d99a1e'), mouth: rgb('#5b2140'), tongue: rgb('#ff6f9a'),
};
const PALETTES: Record<Exclude<Stage, 'egg'>, Palette> = {
  baby: { ...BASE, body: rgb('#c9b8ff'), dark: rgb('#9a86ec'), light: rgb('#f1ebff') },
  child: { ...BASE, body: rgb('#a9bcff'), dark: rgb('#7b8fe8'), light: rgb('#e4ebff') },
  teen: { ...BASE, body: rgb('#b6a2ff'), dark: rgb('#8a72ea'), light: rgb('#ece5ff') },
  adult: { ...BASE, body: rgb('#93a4ff'), dark: rgb('#6c7be0'), light: rgb('#dfe5ff') },
};
const SICK_TINT: Pick<Palette, 'body' | 'dark' | 'light'> = { body: rgb('#b9d6a4'), dark: rgb('#8fb57a'), light: rgb('#e3f2d6') };
/** 진화 가지의 절차적 도트 — codex 그림을 못 받을 때 몸빛만 가지 색으로(Phase 3) */
const BRANCH_TINT: Record<Branch, Pick<Palette, 'body' | 'dark' | 'light'>> = {
  planner: { body: rgb('#9fe0b8'), dark: rgb('#6cbf8f'), light: rgb('#e2f8ea') },
  thinker: { body: rgb('#c3b2f2'), dark: rgb('#957fd8'), light: rgb('#efe9ff') },
  focus: { body: rgb('#6f86e0'), dark: rgb('#4b5fbf'), light: rgb('#cfd8ff') },
  heart: { body: rgb('#ffb6b0'), dark: rgb('#e88c8a'), light: rgb('#ffe6e2') },
};

function star(b: PixelBuf, cx: number, cy: number, r: number, c: Rgb) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  for (let i = 0; i < 10; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 10];
    b.tri(cx, cy, ax, ay, bx, by, c);
  }
}

function eyes(b: PixelBuf, cx: number, cy: number, gap: number, h: number, pose: Pose, p: Palette) {
  const left = Math.round(cx - gap);
  const right = Math.round(cx + gap - 1);
  const y = Math.round(cy);
  const each = (x: number, mirror: boolean) => {
    if (pose === 'happy') { // ^
      b.px(x - 1, y + 1, p.eye); b.px(x, y, p.eye); b.px(x + 1, y, p.eye); b.px(x + 2, y + 1, p.eye);
    } else if (pose === 'sleep') { // ‿
      b.px(x - 1, y, p.eye); b.px(x, y + 1, p.eye); b.px(x + 1, y + 1, p.eye); b.px(x + 2, y, p.eye);
    } else if (pose === 'no') { // > <
      const d = mirror ? -1 : 1;
      b.px(x + (d > 0 ? 0 : 1), y - 1, p.eye); b.px(x + (d > 0 ? 1 : 0), y, p.eye); b.px(x + (d > 0 ? 0 : 1), y + 1, p.eye);
    } else {
      b.rect(x, y - Math.floor(h / 2), 2, h, p.eye);
      b.px(x, y - Math.floor(h / 2), p.white);
    }
  };
  each(left, false);
  each(right, true);
}

function mouth(b: PixelBuf, cx: number, y: number, pose: Pose, p: Palette, size = 1) {
  const x = Math.round(cx);
  if (pose === 'eat') {
    b.ellipse(cx, y + 1, 1.6 * size + 0.4, 1.4 * size + 0.3, p.mouth);
    b.ellipseOnBody(cx, y + 1.8, 1.1 * size, 0.7, p.tongue);
  } else if (pose === 'happy') {
    b.ellipse(cx, y + 0.5, 1.8 * size, 1.4, p.mouth);
    b.rect(Math.floor(cx - 2 * size), Math.floor(y - 1), Math.ceil(4 * size) + 1, 1, p.body);
    b.ellipseOnBody(cx, y + 1.2, 1 * size, 0.6, p.tongue);
  } else if (pose === 'no') {
    b.rect(x - 1, y, 3, 1, p.mouth);
  } else if (pose === 'sleep') {
    b.px(x, y, p.mouth);
  } else {
    b.px(x - 1, y, p.mouth); b.px(x, y + 1, p.mouth); b.px(x + 1, y, p.mouth);
  }
}

/** 몸통 한 덩이 — 바탕 · 오른쪽 아래 그림자 · 왼쪽 위 밝은 면 */
function body(b: PixelBuf, cx: number, cy: number, rx: number, ry: number, p: Palette) {
  b.ellipse(cx, cy, rx, ry, p.body);
  b.rim([cx, cy, rx, ry], [cx - 1.4, cy - 1.6, rx - 0.6, ry - 0.6], p.dark);
  b.ellipseOnBody(cx - rx * 0.38, cy - ry * 0.45, rx * 0.28, ry * 0.2, p.light);
}

function cheeks(b: PixelBuf, cx: number, cy: number, gap: number, p: Palette) {
  b.ellipseOnBody(cx - gap, cy, 1.6, 0.9, p.cheek, 200);
  b.ellipseOnBody(cx + gap, cy, 1.6, 0.9, p.cheek, 200);
}

function drawBaby(pose: Pose, p: Palette): PixelBuf {
  const b = new PixelBuf(26, 22);
  const squash = pose === 'idle1' ? 1 : 0;
  const lying = pose === 'sleep';
  const cx = 13, cy = lying ? 15 : 12.5 + squash * 0.6, rx = lying ? 10.5 : 9 + squash * 0.5, ry = lying ? 6 : 8 - squash * 0.6;
  b.ellipse(cx - 4, 20, 2.4, 1.4, p.dark);
  b.ellipse(cx + 4, 20, 2.4, 1.4, p.dark);
  body(b, cx, cy, rx, ry, p);
  eyes(b, cx, cy - 1, 3.5, 3, pose, p);
  cheeks(b, cx, cy + 2, 6, p);
  mouth(b, cx, cy + 2, pose, p);
  if (pose === 'happy') { b.ellipse(cx - 10, cy - 3, 1.6, 1.6, p.body); b.ellipse(cx + 10, cy - 3, 1.6, 1.6, p.body); }
  b.outline(p.line);
  return b;
}

function drawChild(pose: Pose, p: Palette): PixelBuf {
  const b = new PixelBuf(32, 30);
  const squash = pose === 'idle1' ? 1 : 0;
  const lying = pose === 'sleep';
  const cx = 16, cy = lying ? 21 : 18 + squash * 0.6, rx = lying ? 12.5 : 10.5 + squash * 0.5, ry = lying ? 7.5 : 9.5 - squash * 0.6;
  const top = cy - ry;
  // 별 새싹
  b.line(cx, Math.round(top), cx, Math.round(top - 3), rgb('#5fbf7a'));
  b.ellipse(cx + 1.6, top - 2, 1.4, 0.8, rgb('#7fd894'));
  star(b, cx, top - 5.5, 3.6, p.gold);
  b.ellipseOnBody(cx - 0.7, top - 6.3, 1, 0.8, rgb('#fff2b0'));
  // 발 · 팔
  b.ellipse(cx - 5, 28, 3, 1.6, p.dark);
  b.ellipse(cx + 5, 28, 3, 1.6, p.dark);
  if (!lying) {
    const armUp = pose === 'happy' ? -5 : 0;
    b.ellipse(cx - rx - 0.5, cy + 2 + armUp, 2.4, 1.8, p.body);
    b.ellipse(cx + rx + 0.5, cy + 2 + armUp, 2.4, 1.8, p.body);
  }
  body(b, cx, cy, rx, ry, p);
  eyes(b, cx, cy - 1.5, 4, 4, pose, p);
  cheeks(b, cx, cy + 2, 7, p);
  mouth(b, cx, cy + 2.5, pose, p);
  b.outline(p.line);
  return b;
}

function drawTeen(pose: Pose, p: Palette): PixelBuf {
  const b = new PixelBuf(36, 36);
  const squash = pose === 'idle1' ? 1 : 0;
  const lying = pose === 'sleep';
  const cx = 18, cy = lying ? 26 : 22 + squash * 0.6, rx = lying ? 14 : 12 + squash * 0.5, ry = lying ? 8.5 : 11 - squash * 0.6;
  const top = cy - ry;
  // 고양이 귀
  b.tri(cx - 11, top + 6, cx - 9, top - 7, cx - 2, top + 3, p.body);
  b.tri(cx + 11, top + 6, cx + 9, top - 7, cx + 2, top + 3, p.body);
  b.tri(cx - 9, top + 3, cx - 8.5, top - 3.5, cx - 4.5, top + 2, p.cheek);
  b.tri(cx + 9, top + 3, cx + 8.5, top - 3.5, cx + 4.5, top + 2, p.cheek);
  // 꼬리 — 몸 뒤로 말린 짧은 꼬리, 끝에 별빛
  if (!lying) {
    b.ellipse(cx + rx - 0.5, cy + 6, 3.2, 1.8, p.dark);
    b.ellipse(cx + rx + 2, cy + 4.5, 1.5, 1.5, p.gold);
  }
  b.ellipse(cx - 5.5, 34, 3.4, 1.8, p.dark);
  b.ellipse(cx + 5.5, 34, 3.4, 1.8, p.dark);
  if (!lying) {
    const armUp = pose === 'happy' ? -6 : 0;
    b.ellipse(cx - rx, cy + 3 + armUp, 2.6, 2, p.body);
    b.ellipse(cx + rx, cy + 3 + armUp, 2.6, 2, p.body);
  }
  body(b, cx, cy, rx, ry, p);
  // 이마의 작은 별
  star(b, cx, top + 3.5, 2.2, p.gold);
  eyes(b, cx, cy - 1, 4.5, 4, pose, p);
  cheeks(b, cx, cy + 2.5, 8, p);
  mouth(b, cx, cy + 3, pose, p, 1.2);
  b.outline(p.line);
  return b;
}

function drawAdult(pose: Pose, p: Palette): PixelBuf {
  const b = new PixelBuf(42, 44);
  const squash = pose === 'idle1' ? 1 : 0;
  const lying = pose === 'sleep';
  const cx = 21, cy = lying ? 33 : 28 + squash * 0.6, rx = lying ? 16 : 13.5 + squash * 0.5, ry = lying ? 9 : 12.5 - squash * 0.6;
  const top = cy - ry;
  const cape = rgb('#2f3690');
  const capeLight = rgb('#4450b8');
  // 망토(몸 뒤)
  if (!lying) {
    b.tri(cx - 9, cy - 4, cx - 17, 42, cx + 17, 42, cape);
    b.tri(cx - 9, cy - 4, cx + 9, cy - 4, cx + 17, 42, cape);
    b.tri(cx - 7, cy - 3, cx - 13, 40, cx - 4, 40, capeLight);
    [[cx - 12, 36], [cx + 10, 33], [cx + 14, 39], [cx - 6, 41]].forEach(([x, y]) => b.px(x, y, p.gold));
  }
  b.ellipse(cx - 6, 42, 3.8, 2, rgb('#3a2a6b'));
  b.ellipse(cx + 6, 42, 3.8, 2, rgb('#3a2a6b'));
  if (!lying) {
    const armUp = pose === 'happy' ? -8 : 0;
    b.ellipse(cx - rx - 0.5, cy + 3 + armUp, 3, 2.3, p.body);
    b.ellipse(cx + rx + 0.5, cy + 3 + armUp, 3, 2.3, p.body);
  }
  body(b, cx, cy, rx, ry, p);
  // 별 왕관
  const crownY = Math.round(top - 1);
  b.rect(cx - 7, crownY, 15, 3, p.gold);
  b.rect(cx - 7, crownY + 2, 15, 1, p.goldDark);
  b.tri(cx - 7, crownY + 0.5, cx - 5, crownY - 5, cx - 3, crownY + 0.5, p.gold);
  b.tri(cx + 3, crownY + 0.5, cx + 5, crownY - 5, cx + 7.5, crownY + 0.5, p.gold);
  star(b, cx + 0.5, crownY - 3, 4.2, p.gold);
  b.px(cx, crownY + 1, rgb('#ff6fa8'));
  b.px(cx + 1, crownY + 1, rgb('#ff6fa8'));
  eyes(b, cx + 0.5, cy - 0.5, 5, 5, pose, p);
  cheeks(b, cx + 0.5, cy + 3, 9, p);
  mouth(b, cx + 0.5, cy + 3.5, pose, p, 1.3);
  b.outline(p.line);
  return b;
}

function drawEgg(cracked: boolean): PixelBuf {
  const b = new PixelBuf(26, 32);
  const cx = 13, cy = 17;
  b.ellipse(cx, cy, 10.5, 13.5, rgb('#fff1d2'));
  b.rim([cx, cy, 10.5, 13.5], [cx - 1.4, cy - 1.8, 9.8, 12.8], rgb('#ead1a4'));
  b.ellipseOnBody(cx - 4, cy - 7, 2.6, 2, rgb('#ffffff'));
  // 지그재그 띠
  for (let x = 0; x < 26; x += 1) {
    const y = cy + 3 + ((x >> 1) % 2);
    if (b.alphaAt(x, y)) { b.px(x, y, rgb('#b79cff')); b.px(x, y + 1, rgb('#9c7ef2')); }
  }
  star(b, cx + 0.5, cy - 4, 3.6, rgb('#ffcc3d'));
  [[cx - 5, cy + 8], [cx + 5, cy + 9], [cx + 6, cy - 9]].forEach(([x, y]) => b.ellipseOnBody(x, y, 1.3, 1.1, rgb('#ffb3cf')));
  if (cracked) {
    const crack = rgb('#7a5a3a');
    let y = cy - 2;
    for (let x = 3; x < 23; x += 1) { y += x % 3 === 0 ? 2 : -1; b.px(x, y, crack); }
  }
  b.outline(rgb('#6b4f3a'));
  return b;
}

const memo = new Map<string, PixelBuf>();

/** 캐릭터 그림체 — 'codex'(codex 가 그린 그림, 받아졌을 때만) · 'procedural'(이 파일의 도트) */
export type CharacterArt = 'codex' | 'procedural';
let art: CharacterArt = 'codex';
export const setCharacterArt = (next: CharacterArt) => { art = next; };

/**
 * 의뢰로 받은 «내 캐릭터»(Phase 5) — 입히면 **어른 단계에서만** 이 그림을 쓴다(2026-10-13 — 종전엔 알을 뺀 모든 단계, 그림체 설정보다 앞선다).
 * 자세 다섯(가만히·기쁨·먹기·잠·싫어)을 `customCharacter.ts` 가 시트에서 잘라 넣는다. 아픈 모습은 연두빛을 덮는다.
 */
export type CustomPose = 'idle' | 'happy' | 'eat' | 'sleep' | 'no';
let custom: Record<CustomPose, PixelBuf> | null = null;
const customSick = new Map<CustomPose, PixelBuf>();
export function setCustomCharacter(frames: Record<CustomPose, PixelBuf> | null) {
  custom = frames;
  customSick.clear();
  // 멈춰 있는 그림(펫 집 · 미리보기)이 스킨이 오면 다시 그리도록(2026-10-13)
  bumpCustomVersion();
}
export const hasCustomCharacter = () => custom !== null;

function sickWash(src: PixelBuf): PixelBuf {
  const out = new PixelBuf(src.w, src.h);
  out.data.set(src.data);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = (Math.max(d[i], d[i + 1], d[i + 2]) + Math.min(d[i], d[i + 1], d[i + 2])) / 510;
    if (l < 0.25) continue;
    d[i] = Math.round(d[i] * 0.6 + 185 * 0.4);
    d[i + 1] = Math.round(d[i + 1] * 0.6 + 214 * 0.4);
    d[i + 2] = Math.round(d[i + 2] * 0.6 + 164 * 0.4);
  }
  return out;
}

/**
 * 주어진 스킨으로 그린 펫 — 쉬는 펫처럼 «함께하는 펫이 아닌» 내 펫을 그 펫의 스킨으로 그릴 때(2026-10-14 스킨은 펫마다).
 * frames 가 없거나 어른이 아니면 기본 그림. (함께하는 펫은 characterSprite — 아픈 모습 캐시를 쓴다)
 */
export function skinnedSprite(frames: Record<CustomPose, PixelBuf> | null, stage: Stage, pose: Pose, sick = false, branch?: LookKey): PixelBuf {
  if (!frames || stage !== 'adult') return baseCharacterSprite(stage, pose, sick, branch);
  const img = frames[pose === 'idle0' || pose === 'idle1' ? 'idle' : pose];
  return sick ? sickWash(img) : img;
}

/** 함께하는 펫 — 입힌 스킨(setCustomCharacter)은 이 펫의 것이다. 펫을 바꾸면 화면이 그 펫의 스킨으로 다시 넣는다. */
export function characterSprite(stage: Stage, pose: Pose, sick = false, branch?: LookKey): PixelBuf {
  // 스킨은 다 자란 펫만(2026-10-13 사용자 지시) — 어린 펫이 함께하는 펫이 되면 스킨을 입은 채로도 원래 모습이다
  if (custom && stage === 'adult') {
    const key: CustomPose = pose === 'idle0' || pose === 'idle1' ? 'idle' : pose;
    if (!sick) return custom[key];
    let s = customSick.get(key);
    if (!s) { s = sickWash(custom[key]); customSick.set(key, s); }
    return s;
  }
  return baseCharacterSprite(stage, pose, sick, branch);
}

/**
 * «내 캐릭터»를 건너뛴 기본 그림 — 남의 펫(친구 방)을 그릴 때. ⚠️ characterSprite 는 내가 입힌 캐릭터를 전역으로 쓰므로
 * 친구의 펫을 그것으로 그리면 친구 펫이 내 캐릭터로 보인다(2026-10-07 스크린샷에서 잡음).
 */
export function baseCharacterSprite(stage: Stage, pose: Pose, sick = false, branch?: LookKey): PixelBuf {
  // 새 종(2026-10-26) — 그 종의 codex 그림. 못 받았으면 별 가족 그림으로 대신한다(그림체 선택과 상관없이 — 새 종엔 절차적 도트가 없다)
  if (isSpeciesLook(branch)) {
    const { species, form } = parseLook(branch);
    const drawn = speciesSprite(species, form, stage, pose, sick);
    if (drawn) return drawn;
  }
  const sb = isSpeciesLook(branch) ? undefined : branch;
  if (art === 'codex') {
    const drawn = codexSprite(stage, pose, sick, sb);
    if (drawn) return drawn;
  }
  const b = stage === 'adult' && sb && sb !== 'basic' ? sb : undefined;
  const key = `${stage}:${pose}:${sick ? 1 : 0}:${b ?? ''}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let out: PixelBuf;
  if (stage === 'egg') out = drawEgg(pose === 'no');
  else {
    const p = sick ? { ...PALETTES[stage], ...SICK_TINT } : b ? { ...PALETTES[stage], ...BRANCH_TINT[b] } : PALETTES[stage];
    out = stage === 'baby' ? drawBaby(pose, p) : stage === 'child' ? drawChild(pose, p) : stage === 'teen' ? drawTeen(pose, p) : drawAdult(pose, p);
  }
  memo.set(key, out);
  return out;
}

export { star as drawStar };
