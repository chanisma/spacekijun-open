/**
 * 기기 화면의 상태 기계 — 버튼 세 개와 LCD 한 장.
 *
 * 원작의 버튼 문법을 그대로 따른다:
 *   A = 아이콘 사이를 옮겨 다닌다 · B = 고른다 · C = 취소(메인으로)
 *   아무것도 고르지 않은 채 B = 시계, C 길게 = 쓰다듬기, 20초 동안 아무것도 안 누르면 메인으로 돌아간다.
 *   ⚠️ 여기 A·B·C 는 «자리»(왼쪽·가운데·오른쪽)의 내부 이름이다. 사람에게 보이는 글자는 키보드와 같은 A·S·D
 *   (2026-10-23 사용자 결정 — 기기 각인 shellTheme · 화면 안내 colorScreen · 도움말 AppChrome·useButtonPress).
 *
 * 순수 함수다 — 펫 상태를 바꾸는 일은 «의도(intent)»로 돌려주고, 바꾼 결과를 `afterAction` 으로 다시 받아
 * 어떤 애니메이션을 틀지 정한다. 그래서 화면 규칙을 브라우저 없이 시험할 수 있다.
 */
import type { PetAction, ActionResult, PetState, PetView, Stage } from '../model/petModel';
import { HEART } from '../model/petModel';
import { kstParts } from '../model/clock';
import type { PetMessageKind } from '../model/messages';
import {
  ARROW_RIGHT, CHARACTERS, DESK, EGG, EGG_CRACK, EXCLAIM, HEART_EMPTY, HEART_FULL, MEAL_BITES, MESSAGE_GLYPHS, NOTE,
  GRAVE, POOP, QUESTION, SKULL, SNACK_BITES, SPIRIT, STEPS, STINK, SWEAT, SYRINGE, TREE, WAVE, ZZ, type Sprite,
} from './sprites';
import {
  blit, emptyFrame, fill, invert, LCD_H, LCD_W, spriteHeight, spriteWidth, text, textWidth, type LcdFrame,
} from './frame';

export type Button = 'A' | 'B' | 'C';
export type GameKind = 'lr' | 'hilo' | 'memo';
export const GAME_KINDS: readonly GameKind[] = ['lr', 'hilo', 'memo'];
export const GAME_LABEL: Record<GameKind, string> = { lr: '좌우 맞히기', hilo: '높낮이', memo: '순서 기억' };
/** 순서 기억(Phase 7) — 화살표 하나가 보이는 시간 · 판마다 길이(2·2·3·3·4) */
export const MEMO_STEP_MS = 700;
export const memoLength = (round: number) => 2 + Math.floor(round / 2);
/** 순서 기억의 화살표 줄 — 씨앗에서 결정적으로(같은 씨앗 = 같은 줄, 회귀가 검사) */
export function memoSequence(seed: number, length: number): ('L' | 'R')[] {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return Array.from({ length }, () => { s = (s * 16807) % 2147483647; return s % 2 ? 'L' : 'R'; });
}
const nextSeed = (seed: number) => ((Math.abs(Math.floor(seed)) % 2147483646) + 1) * 48271 % 2147483647;
export type AnimKind = 'eat-meal' | 'eat-snack' | 'refuse' | 'medicine' | 'clean' | 'happy' | 'hatch' | 'evolve' | 'game-end' | 'lights' | 'walk';
/** 놀이 고르기의 넷째 칸(2026-10-19) — 놀이가 아니라 돌보기 하나(산책)다 */
export const WALK_PICK = GAME_KINDS.length;

export type Screen =
  | { kind: 'main' }
  | { kind: 'clock' }
  | { kind: 'food'; cursor: 0 | 1 }
  | { kind: 'light'; cursor: 0 | 1 }
  | { kind: 'status'; page: number }
  /** 놀이 고르기(Phase 5) — 0 = 좌우 맞히기, 1 = 높낮이, 2 = 순서 기억, 3 = 산책(2026-10-19) */
  | { kind: 'gamePick'; cursor: 0 | 1 | 2 | 3 }
  /**
   * 놀이 한 판. lr = 좌우 맞히기(원작 P1) · hilo = 높낮이(원작 P2 — 지금 숫자보다 다음 숫자가 높을까 낮을까).
   * 높낮이에서 L = «낮아»(A) · R = «높아»(B), shown = 지금 숫자, next = 드러난 다음 숫자.
   */
  | {
    kind: 'game'; game: GameKind; round: number; wins: number; phase: 'show' | 'ask' | 'reveal'; guess?: 'L' | 'R'; answer?: 'L' | 'R'; shown?: number; next?: number; at: number;
    /** 순서 기억 — 이번 판 화살표 줄 · 지금까지 맞게 누른 수 · 다음 판 씨앗 */
    seq?: ('L' | 'R')[]; pos?: number; seed?: number;
  }
  | { kind: 'messages'; index: number }
  /** 알림 하나를 고른 화면 — 컬러는 기기 화면에, 클래식은 기기 옆 쪽지에 자세한 내용이 보인다 */
  | { kind: 'detail'; index: number; page: number }
  | { kind: 'anim'; anim: AnimKind; at: number; won?: boolean; poop?: number; fromStage?: Stage; wins?: number; healed?: boolean };

export interface UiState {
  screen: Screen;
  /** 고른 아이콘 (0..6), 없으면 null */
  cursor: number | null;
  lastInput: number;
}

export const MENU = { food: 0, light: 1, game: 2, medicine: 3, clean: 4, status: 5, messages: 6, attention: 7 } as const;
export const GAME_ROUNDS = 5;
const IDLE_RESET_MS = 20_000;
const STATUS_PAGES = 3;

export const ANIM_MS: Record<AnimKind, number> = {
  'eat-meal': 2600, 'eat-snack': 2600, refuse: 1600, medicine: 2000, clean: 1900, happy: 1600,
  hatch: 2600, evolve: 3000, 'game-end': 2200, lights: 500, walk: 3000,
};

export const initialUi = (now: number): UiState => ({ screen: { kind: 'main' }, cursor: null, lastInput: now });

// 알림은 표시만 한다 — 다른 화면으로 가는 «열기» 의도는 없다(2026-10-06 사용자 결정)
export type Intent =
  | { type: 'action'; action: PetAction }
  | { type: 'startGame'; game: GameKind }
  | null;

export type Sound = 'tick' | 'select' | 'cancel' | 'none';

export interface UiContext {
  stage: Stage;
  lightsOn: boolean;
  messageCount: number;
  /** 알림마다 자세한 내용이 몇 쪽인가(기기 모양마다 다르다 — 클래식은 쪽지라 1쪽) */
  messagePages?: number[];
  /** 0..1 — 놀이의 정답을 정한다(화면 밖에서 넣어 준다 = 이 함수는 순수하다) */
  rand: number;
}

export interface PressResult {
  ui: UiState;
  intent: Intent;
  sound: Sound;
}

const toMain = (ui: UiState, now: number): UiState => ({ ...ui, screen: { kind: 'main' }, lastInput: now });

export function press(ui: UiState, button: Button, long: boolean, ctx: UiContext, now: number): PressResult {
  const touched = { ...ui, lastInput: now };
  const s = ui.screen;
  const none = (next: UiState, sound: Sound = 'tick'): PressResult => ({ ui: next, intent: null, sound });

  if (s.kind === 'anim') return none(touched, 'none');
  // A 를 길게 = 어디서든 알림 목록으로(2026-10-07 사용자 요청) — 종 아이콘까지 A 를 여덟 번 누르지 않게.
  // 놀이 중에는 A 가 «왼쪽» 고르기라 빼고, 알 때도 알림은 볼 수 있다.
  if (button === 'A' && long && s.kind !== 'game') {
    return none({ ...touched, cursor: MENU.messages, screen: { kind: 'messages', index: 0 } }, 'select');
  }
  // 알일 때는 메뉴(밥·불·놀이…)만 막는다 — 알림 목록·자세히 화면은 위에서 A 길게로 열 수 있으니
  // 그 안의 C(닫기)·A(넘기기)·B(자세히)는 알이어도 동작해야 한다. 전부 삼키면 알림을 열고 못 나온다
  // (2026-11-05 «알일 때 오늘의 할 일을 켜면 안 지워져요», 유휴 20초 뒤에야 닫혔다).
  if (ctx.stage === 'egg' && s.kind !== 'messages' && s.kind !== 'detail') {
    return none(touched, button === 'B' ? 'select' : 'tick');
  }

  switch (s.kind) {
    case 'clock':
      return none(toMain(touched, now), 'cancel');
    case 'main': {
      if (button === 'A') {
        const next = ui.cursor === null ? 0 : ui.cursor + 1;
        return none({ ...touched, cursor: next > MENU.messages ? null : next });
      }
      if (button === 'C') {
        if (long) return { ui: touched, intent: { type: 'action', action: { type: 'pat' } }, sound: 'select' };
        return none({ ...touched, cursor: null }, 'cancel');
      }
      // B
      switch (ui.cursor) {
        case null: return none({ ...touched, screen: { kind: 'clock' } }, 'select');
        case MENU.food: return none({ ...touched, screen: { kind: 'food', cursor: 0 } }, 'select');
        case MENU.light: return none({ ...touched, screen: { kind: 'light', cursor: ctx.lightsOn ? 0 : 1 } }, 'select');
        case MENU.game: return none({ ...touched, screen: { kind: 'gamePick', cursor: 0 } }, 'select');
        case MENU.medicine: return { ui: touched, intent: { type: 'action', action: { type: 'medicine' } }, sound: 'select' };
        case MENU.clean: return { ui: touched, intent: { type: 'action', action: { type: 'clean' } }, sound: 'select' };
        case MENU.status: return none({ ...touched, screen: { kind: 'status', page: 0 } }, 'select');
        case MENU.messages: return none({ ...touched, screen: { kind: 'messages', index: 0 } }, 'select');
        default: return none(touched);
      }
    }
    case 'food':
      if (button === 'A') return none({ ...touched, screen: { kind: 'food', cursor: s.cursor === 0 ? 1 : 0 } });
      if (button === 'C') return none(toMain(touched, now), 'cancel');
      return { ui: touched, intent: { type: 'action', action: { type: s.cursor === 0 ? 'meal' : 'snack' } }, sound: 'select' };
    case 'light':
      if (button === 'A') return none({ ...touched, screen: { kind: 'light', cursor: s.cursor === 0 ? 1 : 0 } });
      if (button === 'C') return none(toMain(touched, now), 'cancel');
      return { ui: touched, intent: { type: 'action', action: { type: 'lights', on: s.cursor === 0 } }, sound: 'select' };
    case 'status':
      if (button === 'C') return none(toMain(touched, now), 'cancel');
      return none({ ...touched, screen: { kind: 'status', page: (s.page + 1) % STATUS_PAGES } });
    case 'messages':
      if (button === 'C') return none(toMain(touched, now), 'cancel');
      if (button === 'A') return none({ ...touched, screen: { kind: 'messages', index: ctx.messageCount ? (s.index + 1) % ctx.messageCount : 0 } });
      return ctx.messageCount
        ? none({ ...touched, screen: { kind: 'detail', index: s.index % ctx.messageCount, page: 0 } }, 'select')
        : none(touched);
    case 'detail': {
      if (button === 'C') return none({ ...touched, screen: { kind: 'messages', index: s.index } }, 'cancel');
      const count = Math.max(1, ctx.messageCount);
      if (button === 'A') {
        const pages = Math.max(1, ctx.messagePages?.[s.index] ?? 1);
        return none({ ...touched, screen: { kind: 'detail', index: s.index, page: (s.page + 1) % pages } });
      }
      return none({ ...touched, screen: { kind: 'detail', index: (s.index + 1) % count, page: 0 } }, 'select');
    }
    case 'gamePick':
      if (button === 'A') return none({ ...touched, screen: { kind: 'gamePick', cursor: ((s.cursor + 1) % (WALK_PICK + 1)) as 0 | 1 | 2 | 3 } });
      if (button === 'C') return none(toMain(touched, now), 'cancel');
      if (s.cursor === WALK_PICK) return { ui: touched, intent: { type: 'action', action: { type: 'walk' } }, sound: 'select' };
      return { ui: touched, intent: { type: 'startGame', game: GAME_KINDS[s.cursor] }, sound: 'select' };
    case 'game': {
      if (button === 'C') return none(toMain(touched, now), 'cancel');
      if (s.phase !== 'ask') return none(touched, 'none');
      const guess = button === 'A' ? 'L' : 'R';
      if (s.game === 'memo') {
        const seq = s.seq ?? [];
        const pos = s.pos ?? 0;
        if (seq[pos] !== guess) {
          return none({ ...touched, screen: { ...s, phase: 'reveal', guess, answer: seq[pos], at: now } }, 'cancel');
        }
        if (pos + 1 < seq.length) return none({ ...touched, screen: { ...s, pos: pos + 1 } }, 'tick');
        return none({ ...touched, screen: { ...s, pos: pos + 1, phase: 'reveal', guess, answer: guess, at: now, wins: s.wins + 1 } }, 'select');
      }
      if (s.game === 'hilo') {
        const shown = s.shown ?? 5;
        const next = nextHiloNumber(shown, ctx.rand);
        const answer = next > shown ? 'R' : 'L';
        return none({
          ...touched,
          screen: { ...s, phase: 'reveal', guess, answer, next, at: now, wins: s.wins + (guess === answer ? 1 : 0) },
        }, 'select');
      }
      const answer = ctx.rand < 0.5 ? 'L' : 'R';
      return none({
        ...touched,
        screen: { ...s, phase: 'reveal', guess, answer, at: now, wins: s.wins + (guess === answer ? 1 : 0) },
      }, 'select');
    }
  }
}

/** 높낮이의 다음 숫자 — 1~9 중 지금 숫자를 뺀 8개에서 고르게(같은 숫자가 나오면 맞힐 수 없다) */
export function nextHiloNumber(shown: number, rand: number): number {
  const options = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n !== shown);
  return options[Math.min(options.length - 1, Math.floor(rand * options.length))];
}

/** 놀이 화면 열기(돌볼 수 있을 때만 — 막히면 거절 애니메이션). rand 는 높낮이의 첫 숫자를 정한다. */
export function startGame(ui: UiState, blocked: boolean, now: number, game: GameKind = 'lr', rand = 0.5): UiState {
  if (blocked) return { ...ui, screen: { kind: 'anim', anim: 'refuse', at: now } };
  const shown = game === 'hilo' ? 1 + Math.min(8, Math.floor(rand * 9)) : undefined;
  if (game === 'memo') {
    const seed = Math.floor(rand * 2147483646) + 1;
    return { ...ui, screen: { kind: 'game', game, round: 0, wins: 0, phase: 'show', seq: memoSequence(seed, memoLength(0)), pos: 0, seed, at: now } };
  }
  return { ...ui, screen: { kind: 'game', game, round: 0, wins: 0, phase: 'ask', shown, at: now } };
}

/** 돌보기를 적용한 뒤 무엇을 보여 줄지 */
export function afterAction(ui: UiState, action: PetAction, result: ActionResult, now: number, before: PetState): UiState {
  const anim = (kind: AnimKind, extra: Partial<Extract<Screen, { kind: 'anim' }>> = {}): UiState =>
    ({ ...ui, screen: { kind: 'anim', anim: kind, at: now, ...extra } });
  // 별이 된 펫은 어떤 동작에도 움직이지 않는다(고개 젓는 애니메이션이 살아 있는 펫을 그리지 않게)
  if ('reason' in result && result.reason === 'dead') return { ...ui, screen: { kind: 'main' } };
  // 하드(개복치) — 돌보다가 별이 됐다. 애니메이션 없이 곧장 묘비(살아 있는 펫이 기뻐하는 장면을 그리지 않게)
  if (!('reason' in result) && result.detail === 'died') return { ...ui, screen: { kind: 'main' }, cursor: null };
  if (action.type === 'clean') return anim('clean', { poop: before.poop });
  if (!result.ok) return action.type === 'pat' ? ui : anim('refuse');
  switch (action.type) {
    case 'meal': return anim('eat-meal');
    case 'snack': return anim('eat-snack');
    case 'medicine': return anim('medicine', { healed: result.detail === 'healed' });
    case 'lights': return anim('lights');
    case 'pat': return anim('happy');
    case 'cheer': return anim('happy');
    case 'walk': return anim('walk');
    case 'game': return anim('game-end', { won: result.detail === 'win', wins: action.wins });
  }
}

/** 시간이 흘러 저절로 바뀌는 화면 (애니메이션 끝 · 놀이 다음 판 · 20초 무입력). 놀이가 끝나면 그 결과를 돌려준다. */
export function tickUi(ui: UiState, now: number): { ui: UiState; gameOver?: { wins: number; rounds: number } } {
  const s = ui.screen;
  if (s.kind === 'anim') {
    return now - s.at >= ANIM_MS[s.anim] ? { ui: { ...ui, screen: { kind: 'main' } } } : { ui };
  }
  // 순서 기억 — 화살표를 다 보여 주면 따라 하기
  if (s.kind === 'game' && s.game === 'memo' && s.phase === 'show' && now - s.at >= (s.seq?.length ?? 0) * MEMO_STEP_MS + 300) {
    return { ui: { ...ui, lastInput: now, screen: { ...s, phase: 'ask', pos: 0, at: now } } };
  }
  if (s.kind === 'game' && s.phase === 'reveal' && now - s.at >= 1300) {
    const round = s.round + 1;
    if (round >= GAME_ROUNDS) return { ui, gameOver: { wins: s.wins, rounds: GAME_ROUNDS } };
    if (s.game === 'memo') {
      const seed = nextSeed(s.seed ?? 1);
      return { ui: { ...ui, screen: { kind: 'game', game: 'memo', round, wins: s.wins, phase: 'show', seq: memoSequence(seed, memoLength(round)), pos: 0, seed, at: now } } };
    }
    // 높낮이는 드러난 숫자가 다음 판의 기준이 된다(원작 P2)
    return { ui: { ...ui, screen: { kind: 'game', game: s.game, round, wins: s.wins, phase: 'ask', shown: s.game === 'hilo' ? s.next : undefined, at: now } } };
  }
  if (now - ui.lastInput >= IDLE_RESET_MS && (ui.cursor !== null || (s.kind !== 'main' && s.kind !== 'game'))) {
    return { ui: { ...ui, cursor: null, screen: { kind: 'main' } } };
  }
  return { ui };
}

/** 부화·진화를 화면에서 보여 줘야 하는가 — 본 적 없는 사건이 생겼을 때 */
export function eventAnim(ui: UiState, kind: 'hatch' | 'evolve', fromStage: Stage, now: number): UiState {
  return { ...ui, cursor: null, screen: { kind: 'anim', anim: kind, at: now, fromStage } };
}

// ── 그리기 ────────────────────────────────────────────────────────────

export interface ComposeInput {
  ui: UiState;
  state: PetState;
  view: PetView;
  now: number;
  messageKinds: PetMessageKind[];
  unread: boolean;
}

const frameNo = (now: number, period = 500) => Math.floor(now / period);

function characterOf(stage: Stage) {
  return stage === 'egg' ? CHARACTERS.baby : CHARACTERS[stage];
}

/** 펫이 화면 안에서 어슬렁거리는 자리 — 0.5초마다 한 칸, 가끔 멈춘다 */
function walkX(now: number, available: number, width: number, seed: number): { x: number; flip: boolean } {
  const room = Math.max(0, available - width);
  if (room === 0) return { x: 0, flip: false };
  const step = frameNo(now, 500);
  // 12걸음마다 방향을 바꾸는 왕복 + 씨앗에 따라 멈추는 구간
  const cycle = room * 2;
  const pause = ((seed >>> (step % 16)) & 3) === 0;
  const t = pause ? step - 1 : step;
  const phase = ((t % cycle) + cycle) % cycle;
  const x = phase < room ? phase : cycle - phase;
  return { x, flip: phase < room };
}

/**
 * 똥 자리 — 원작처럼 오른쪽에 2×2 로 쌓인다. 냄새 물결은 아래 줄 똥 위에만(위 줄은 자리가 없어 겹친다).
 * 아플 때 해골은 오른쪽 위 똥 자리에서 깜빡인다(그 순간 그 똥은 잠깐 가려진다).
 */
const POOP_SPOTS = [{ x: 25, y: 10 }, { x: 25, y: 1 }, { x: 18, y: 10 }, { x: 18, y: 1 }];

function drawPoops(frame: LcdFrame, count: number, now: number, minX = -99, skullBlink = false) {
  const f = frameNo(now) % 2;
  for (let i = 0; i < Math.min(4, count); i += 1) {
    const { x, y } = POOP_SPOTS[i];
    if (x < minX) continue;
    if (skullBlink && i === 1) continue;
    blit(frame, POOP[f], x, y);
    if (y > 5) blit(frame, STINK[f], x + 2, y - 3);
  }
}

function petArea(poop: number) {
  return poop >= 3 ? 17 : poop >= 1 ? 24 : LCD_W;
}

function drawMain(frame: LcdFrame, input: ComposeInput) {
  const { state, view, now } = input;
  const f = frameNo(now) % 2;

  if (view.dead) {
    // 묘비 + 그 위를 천천히 오르내리는 혼
    blit(frame, GRAVE, 5, LCD_H - spriteHeight(GRAVE));
    const bob = frameNo(now, 900) % 2;
    blit(frame, SPIRIT[frameNo(now, 450) % 2], 20, 3 + bob);
    return;
  }

  if (view.stage === 'egg') {
    const fast = view.hatchProgress > 0.6;
    const wobble = frameNo(now, fast ? 220 : 600) % 2 === 0 ? 0 : 1;
    const sprite = view.hatchProgress > 0.8 && wobble ? EGG_CRACK : EGG[wobble];
    blit(frame, sprite, 9 + (wobble ? 1 : 0), 1);
    return;
  }

  const chr = characterOf(view.stage);

  if (view.asleep && !view.lightsOn) {
    fill(frame);
    blit(frame, ZZ[f], 22, 1, { invert: true });
    return;
  }
  if (view.asleep) {
    const sprite = chr.sleep;
    blit(frame, sprite, Math.floor((LCD_W - 8 - spriteWidth(sprite)) / 2), LCD_H - spriteHeight(sprite));
    blit(frame, ZZ[f], 23, 0);
    drawPoops(frame, Math.min(view.poop, 1), now);
    return;
  }

  if (view.inClass) {
    // 책상 앞에 앉아 수업을 듣는다 — 펫은 살짝 몸을 들썩이고, 아무것도 줄지 않는다
    const idle = chr.idle[frameNo(now, 900) % 2];
    const w = spriteWidth(idle);
    const px = Math.floor((LCD_W - w) / 2);
    blit(frame, idle, px, LCD_H - spriteHeight(idle) - 3);
    const dx = Math.floor((LCD_W - spriteWidth(DESK)) / 2);
    // 책상 뒤를 비우고 책상을 그린다
    for (let y = LCD_H - spriteHeight(DESK); y < LCD_H; y += 1) {
      for (let x = dx; x < dx + spriteWidth(DESK); x += 1) frame.dots[y * LCD_W + x] = 0;
    }
    blit(frame, DESK, dx, LCD_H - spriteHeight(DESK));
    return;
  }

  const area = petArea(view.poop);
  const sprite = chr.idle[f];
  const sad = view.hungerHearts === 0 || view.happyHearts === 0 || view.sick;
  const { x, flip } = sad ? { x: Math.floor((area - spriteWidth(sprite)) / 2), flip: false } : walkX(now, area, spriteWidth(sprite), state.seed);
  blit(frame, sad ? chr.idle[0] : sprite, x, LCD_H - spriteHeight(sprite), { flip });
  if (sad && f === 0) blit(frame, SWEAT, Math.min(area - 3, x + spriteWidth(sprite)), 1);
  const skull = view.sick && f === 0;
  drawPoops(frame, view.poop, now, -99, skull);
  if (skull) blit(frame, SKULL, 25, 1);
}

function drawHearts(frame: LcdFrame, hearts: number, y: number) {
  for (let i = 0; i < 4; i += 1) blit(frame, i < hearts ? HEART_FULL : HEART_EMPTY, i * 8 + 1, y);
}

function centerText(frame: LcdFrame, value: string, y: number) {
  text(frame, value, Math.floor((LCD_W - textWidth(value)) / 2), y);
}

function drawAnim(frame: LcdFrame, input: ComposeInput, s: Extract<Screen, { kind: 'anim' }>) {
  const { view, now } = input;
  const elapsed = now - s.at;
  const chr = characterOf(view.stage === 'egg' ? 'baby' : view.stage);
  const center = (sprite: Sprite, dx = 0) => blit(frame, sprite, Math.floor((LCD_W - spriteWidth(sprite)) / 2) + dx, LCD_H - spriteHeight(sprite));

  switch (s.anim) {
    case 'eat-meal':
    case 'eat-snack': {
      const bites = s.anim === 'eat-meal' ? MEAL_BITES : SNACK_BITES;
      const bite = Math.min(bites.length - 1, Math.floor(elapsed / 650));
      blit(frame, bites[bite], 3, LCD_H - 7);
      const mouth = frameNo(elapsed, 325) % 2 === 0 && bite < bites.length - 1;
      const sprite = mouth ? chr.eat : chr.idle[0];
      blit(frame, sprite, 13, LCD_H - spriteHeight(sprite));
      return;
    }
    case 'refuse': {
      const left = frameNo(elapsed, 260) % 2 === 0;
      center(chr.no, left ? -2 : 2);
      if (left) blit(frame, EXCLAIM, 27, 2);
      return;
    }
    case 'medicine': {
      const travel = Math.min(1, elapsed / 900);
      const sprite = elapsed > 1100 && s.healed ? chr.happy : chr.idle[frameNo(elapsed) % 2];
      const px = 14;
      blit(frame, sprite, px, LCD_H - spriteHeight(sprite));
      if (elapsed < 1100) blit(frame, SYRINGE, Math.round(-10 + travel * (px - 1)), 6);
      if (elapsed > 1100 && s.healed && frameNo(elapsed, 300) % 2 === 0) blit(frame, NOTE, 2, 1);
      return;
    }
    case 'clean': {
      // 물결이 오른쪽에서 왼쪽으로 쓸고 지나간다 — 지나간 자리의 똥은 사라져 있다
      const waveX = Math.round(LCD_W - (elapsed / ANIM_MS.clean) * (LCD_W + 6));
      const sprite = view.asleep ? chr.sleep : chr.idle[frameNo(now) % 2]; // 자는 펫은 깨우지 않고 치운다(2026-11-05)
      const x = Math.floor((petArea(s.poop ?? 0) - spriteWidth(sprite)) / 2);
      blit(frame, sprite, x, LCD_H - spriteHeight(sprite));
      drawPoops(frame, s.poop ?? 0, now, waveX + 4);
      for (let y = 0; y < LCD_H; y += 1) {
        for (let xx = Math.max(0, waveX); xx < Math.min(LCD_W, waveX + 4); xx += 1) frame.dots[y * LCD_W + xx] = 0;
      }
      blit(frame, WAVE, waveX, 0);
      return;
    }
    case 'walk': {
      // 나무가 오른쪽에서 왼쪽으로 지나간다(펫이 걷는다) — 끝에는 기뻐서 음표
      if (elapsed > 2200) {
        const up = frameNo(elapsed, 300) % 2 === 0;
        center(up ? chr.happy : chr.idle[0], 0);
        if (up) blit(frame, NOTE, 26, 1);
        return;
      }
      // 점 화면에는 앞뒤가 없어 나무가 펫을 지나가면 한 덩어리가 된다 — 펫은 왼쪽, 나무는 오른쪽 구역에서만 두 번 지나간다
      const sprite = chr.idle[frameNo(elapsed, 250) % 2];
      const px = 5;
      const lane = px + spriteWidth(sprite) + 2;
      const frac = ((elapsed / 1100) % 1);
      const treeX = Math.round(LCD_W - frac * (LCD_W - lane));
      if (treeX + spriteWidth(TREE) <= LCD_W + spriteWidth(TREE) && treeX >= lane) blit(frame, TREE, treeX, LCD_H - spriteHeight(TREE));
      blit(frame, sprite, px, LCD_H - spriteHeight(sprite) - (frameNo(elapsed, 250) % 2));
      blit(frame, STEPS, 0, LCD_H - spriteHeight(STEPS));
      return;
    }
    case 'happy': {
      const up = frameNo(elapsed, 300) % 2 === 0;
      center(up ? chr.happy : chr.idle[0], 0);
      if (up) blit(frame, NOTE, 26, 1);
      return;
    }
    case 'lights': {
      drawMain(frame, input);
      return;
    }
    case 'hatch': {
      if (elapsed < 1300) {
        const shake = frameNo(elapsed, 120) % 2;
        blit(frame, shake ? EGG_CRACK : EGG[0], 9 + shake, 1);
      } else if (elapsed < 1700) {
        fill(frame);
      } else {
        center(CHARACTERS.baby.happy);
        if (frameNo(elapsed, 300) % 2 === 0) blit(frame, NOTE, 25, 1);
      }
      return;
    }
    case 'evolve': {
      const from = characterOf(s.fromStage ?? 'baby');
      if (elapsed < 2100) {
        const flip = frameNo(elapsed, 260) % 2 === 0;
        center((flip ? from : chr).idle[0]);
        if (frameNo(elapsed, 130) % 3 === 0) invert(frame);
      } else {
        center(chr.happy);
        if (frameNo(elapsed, 300) % 2 === 0) blit(frame, NOTE, 26, 1);
      }
      return;
    }
    case 'game-end': {
      if (elapsed < 1000) {
        centerText(frame, `${s.wins ?? 0}/${GAME_ROUNDS}`, 5);
      } else {
        // 져도 놀아서 기분은 좋아졌다 — 고개 젓기 대신 가만히 서서 음표 한 번(이기면 깡충 + 음표 깜빡)
        center(s.won ? chr.happy : chr.idle[0], 0);
        if (s.won ? frameNo(elapsed, 300) % 2 === 0 : elapsed > 1400) blit(frame, NOTE, 26, 1);
      }
    }
  }
}

export function composeFrame(input: ComposeInput): LcdFrame {
  const frame = emptyFrame();
  const { ui, view, now } = input;
  const s = ui.screen;

  switch (s.kind) {
    case 'main':
      drawMain(frame, input);
      break;
    case 'clock': {
      const { minutes } = kstParts(now);
      const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mm = String(minutes % 60).padStart(2, '0');
      const colon = frameNo(now) % 2 === 0 ? ':' : ' ';
      centerText(frame, `${hh}${colon}${mm}`, 5);
      break;
    }
    case 'food':
      text(frame, 'MEAL', 9, 2);
      text(frame, 'SNACK', 9, 9);
      blit(frame, ARROW_RIGHT, 3, s.cursor === 0 ? 2 : 9);
      break;
    case 'light':
      text(frame, 'ON', 11, 2);
      text(frame, 'OFF', 11, 9);
      blit(frame, ARROW_RIGHT, 5, s.cursor === 0 ? 2 : 9);
      break;
    case 'status': {
      if (s.page === 0) {
        text(frame, 'AGE', 1, 1);
        const age = `${view.ageYears}`;
        text(frame, age, LCD_W - textWidth(age) - 1, 1);
        const wt = `${view.weight}g`;
        text(frame, 'WT', 1, 9);
        text(frame, wt, LCD_W - textWidth(wt) - 1, 9);
      } else {
        centerText(frame, s.page === 1 ? 'HUNGRY' : 'HAPPY', 0);
        drawHearts(frame, s.page === 1 ? view.hungerHearts : view.happyHearts, 8);
      }
      break;
    }
    case 'messages':
    case 'detail': {
      const kinds = input.messageKinds;
      if (kinds.length === 0) {
        centerText(frame, '- -', 5);
      } else {
        const kind = kinds[s.index % kinds.length];
        blit(frame, MESSAGE_GLYPHS[kind], 3, 4);
        text(frame, `${(s.index % kinds.length) + 1}/${kinds.length}`, 16, 6);
        // 고른 알림은 테두리로 — 자세한 내용은 기기 옆 쪽지가 보여 준다
        if (s.kind === 'detail') {
          for (let x = 0; x < LCD_W; x += 1) { frame.dots[x] = 1; frame.dots[(LCD_H - 1) * LCD_W + x] = 1; }
          for (let y = 0; y < LCD_H; y += 1) { frame.dots[y * LCD_W] = 1; frame.dots[y * LCD_W + LCD_W - 1] = 1; }
        }
      }
      break;
    }
    case 'gamePick': {
      // 넷(2026-10-19 산책 추가 — 8칸씩) — 좌우(화살표 둘) · 높낮이(숫자) · 순서 기억(물음표) · 산책(나무). 고른 쪽을 반전 칸으로.
      const boxes: [number, number][] = [[0, 8], [8, 8], [16, 8], [24, 8]];
      boxes.forEach(([x0, w], i) => {
        if (s.cursor !== i) return;
        for (let y = 1; y < LCD_H - 1; y += 1) for (let x = x0; x < x0 + w; x += 1) frame.dots[y * LCD_W + x] = 1;
      });
      const inv = (i: number) => ({ invert: s.cursor === i });
      // 8칸에 좌우 화살표를 나란히 두면 마름모 하나로 보인다 — 위아래로(숫자 칸과 같은 짜임)
      blit(frame, ARROW_RIGHT, 2, 2, { flip: true, ...inv(0) });
      blit(frame, ARROW_RIGHT, 2, 9, inv(0));
      text(frame, '1', 9, 2, inv(1));
      text(frame, '9', 12, 9, inv(1));
      text(frame, '?', 17, 2, inv(2));
      text(frame, '?', 20, 9, inv(2));
      blit(frame, TREE, 24, 4, inv(3));
      break;
    }
    case 'game': {
      const chr = characterOf(view.stage);
      const sprite = chr.idle[0];
      const baseX = Math.floor((LCD_W - spriteWidth(sprite)) / 2);
      // 라운드 점
      for (let r = 0; r < GAME_ROUNDS; r += 1) {
        if (r < s.round || (r === s.round && s.phase === 'reveal')) frame.dots[0 * LCD_W + 11 + r * 2] = 1;
      }
      if (s.game === 'memo') {
        // 보여 주기 = 가운데 큰 화살표 하나씩 · 따라 하기 = 맞게 누른 수만큼 점 · 끝나면 기쁨/아쉬움
        const seq = s.seq ?? [];
        if (s.phase === 'show') {
          const i = Math.min(seq.length - 1, Math.floor((now - s.at) / MEMO_STEP_MS));
          const gap = (now - s.at) % MEMO_STEP_MS > MEMO_STEP_MS - 150;
          if (!gap && i >= 0) blit(frame, ARROW_RIGHT, 14, 5, { flip: seq[i] === 'L' });
          for (let k = 0; k < seq.length; k += 1) if (k <= i) frame.dots[(LCD_H - 1) * LCD_W + 12 + k * 2] = 1;
        } else if (s.phase === 'ask') {
          blit(frame, QUESTION, 13, 3);
          for (let k = 0; k < seq.length; k += 1) if (k < (s.pos ?? 0)) frame.dots[(LCD_H - 1) * LCD_W + 12 + k * 2] = 1;
        } else {
          const hit = s.guess === s.answer;
          const shown = hit ? chr.happy : chr.no;
          blit(frame, shown, baseX, LCD_H - spriteHeight(shown));
        }
        break;
      }
      if (s.game === 'hilo') {
        // 왼쪽 = 펫, 오른쪽 = 숫자. 드러나면 «지금>다음» 둘을 나란히.
        const small = chr.idle[0];
        if (s.phase === 'ask') {
          blit(frame, small, 0, LCD_H - spriteHeight(small));
          text(frame, String(s.shown ?? 5), 22, 5);
          if (frameNo(now) % 2 === 0) blit(frame, QUESTION, LCD_W - 6, 1);
        } else {
          const hit = s.guess === s.answer;
          const shown = hit ? chr.happy : chr.no;
          blit(frame, shown, 0, LCD_H - spriteHeight(shown));
          text(frame, `${s.shown ?? 5}${(s.next ?? 0) > (s.shown ?? 0) ? '<' : '>'}${s.next ?? 0}`, 17, 5);
        }
        break;
      }
      if (s.phase === 'ask') {
        blit(frame, sprite, baseX, LCD_H - spriteHeight(sprite));
        if (frameNo(now) % 2 === 0) {
          blit(frame, ARROW_RIGHT, 1, 6, { flip: true });
          blit(frame, ARROW_RIGHT, LCD_W - 5, 6);
        }
        blit(frame, QUESTION, LCD_W - 9 - 5, 1);
      } else {
        const right = s.answer === 'R';
        const hit = s.guess === s.answer;
        const shown = hit ? chr.happy : chr.no;
        blit(frame, shown, baseX + (right ? 3 : -3), LCD_H - spriteHeight(shown), { flip: right });
      }
      break;
    }
    case 'anim':
      drawAnim(frame, input, s);
      break;
  }

  // 아이콘 줄
  if (ui.cursor !== null && (s.kind === 'main' || s.kind === 'clock')) frame.icons[ui.cursor] = true;
  if (s.kind === 'food') frame.icons[MENU.food] = true;
  if (s.kind === 'light') frame.icons[MENU.light] = true;
  if (s.kind === 'game' || s.kind === 'gamePick') frame.icons[MENU.game] = true;
  if (s.kind === 'status') frame.icons[MENU.status] = true;
  if (s.kind === 'messages' || s.kind === 'detail') frame.icons[MENU.messages] = true;
  if (view.attention) frame.icons[MENU.attention] = true;
  if (input.unread && ui.cursor !== MENU.messages && s.kind === 'main' && frameNo(now, 700) % 2 === 0) frame.icons[MENU.messages] = true;
  return frame;
}

export { HEART };
