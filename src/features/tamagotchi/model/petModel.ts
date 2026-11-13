/**
 * 다마고찌 생명 모델 — 순수 함수, 단일 출처.
 *
 * ── 왜 «틱을 돌리지 않는가» ──────────────────────────────────────────
 * 서버가 매분 모든 펫을 갱신하지 않는다. 펫은 «마지막으로 계산한 칸(tick) + 그때의 상태»만
 * 저장하고, 화면을 열 때 `advancePet` 이 지금 칸까지 따라잡는다. 칸 번호가 절대 시각이므로
 * 한 번에 따라잡든 나눠서 따라잡든 결과가 같다(회귀가 검사하는 성질).
 *
 * ── 원작에서 가져온 것 ───────────────────────────────────────────────
 * 배고픔·행복 하트 4칸, 몸무게(g), 나이(하루 = 1살), 똥과 씻기, 병과 주사(1~2번),
 * 잠과 불 끄기, 부를 때 15분 안에 안 돌보면 «돌봄 실수», 알 → 아기 → 어린이 → 청소년 → 어른.
 *
 * ── 학교에 맞춰 바꾼 것 ──────────────────────────────────────────────
 * - **수업 중에는 펫도 수업을 듣는다**: 그 칸은 아무것도 줄지 않고 부르지도 않는다. 돌보기도 거절한다
 *   (수업 중에 휴대폰을 꺼내게 만드는 앱이 되지 않게).
 * - **죽음은 기본으로 없다**(2026-10-06 사용자 결정): 오래 방치하면 아프고, 주사를 맞으면 낫는다.
 * - **죽음 옵션**(2026-10-19 사용자 요청 «너무 쉽게 죽는 건 안 된다»): 펫마다 켤 수 있다(`mortal`). 켜면
 *   «아픈 채로 깨어 있는 시간»이 쌓여 하루(24시간)면 위독, 이틀(48시간)이면 별이 된다. 수업·잠 칸은 세지 않으므로
 *   주말 이틀을 비워도(깨어 있는 ~38시간) 위독까지만 간다. 주사를 다 맞으면 처음부터 다시 센다.
 * - **모드 셋**(2026-10-19 같은 날 — 위 옵션을 «노멀»로 흡수): 이지(죽지 않음) · 노멀(위 규칙) · 하드(개복치 —
 *   밥·산책·놀이·잠·가만히 있기 같은 «일»마다 작은 확률로 의외의 이유가 뽑혀 별이 된다 · `hardFate`). 표·문구 = `petModes.ts`.
 *   2026-10-26 배고픈 채로 · 심심한 채로 · 똥을 안 치운 채로 방치된 깨어 있는 칸도 «일»이다.
 *   하드의 난수도 칸·씨앗으로 정해지므로 «나눠 따라잡기 = 한 번에»가 그대로 지켜진다. 수업 칸은 하드에서도 멈춘다.
 * - **산책**(2026-10-19 같은 날): 놀이 메뉴의 넷째 칸. 행복 +2칸 · 배고픔 −½칸 · 몸무게 −1g, 한 시간에 한 번.
 *   같은 날 놀이도 산책처럼 — 끝까지 하면 지더라도 행복 +1칸, 이기면 +2칸.
 */
import { activityOfTick, tickOf, type SchoolSchedule } from './clock';
import type { BranchOrBasic } from './branch';
import { HARD_EVENTS, isDeathCause, isPetMode, type DeathCause, type HardEvent, type PetMode } from './petModes';
import { isSpecies, lookOf, speciesOf, type LookKey, type PetBranch, type Species } from './species';

export type { DeathCause, PetMode } from './petModes';

export type Stage = 'egg' | 'baby' | 'child' | 'teen' | 'adult';
export const STAGE_LABEL: Record<Stage, string> = { egg: '알', baby: '아기', child: '어린이', teen: '청소년', adult: '어른' };
export type AttentionReason = 'hungry' | 'unhappy' | 'sick' | 'lights';
export type PetEventKind = 'hatch' | 'evolve' | 'poop' | 'sick' | 'healed' | 'sleep' | 'wake' | 'careMiss' | 'critical' | 'death';

export interface PetEvent {
  tick: number;
  kind: PetEventKind;
  stage?: Stage;
  /** death 일 때 — 왜 별이 됐는가(앨범 note 로 간다) */
  cause?: DeathCause;
}

export interface PetAttention {
  reason: AttentionReason;
  since: number;
  /** 이 부름으로 이미 «돌봄 실수»가 한 번 기록됐는가 */
  missed: boolean;
}

export interface PetState {
  v: 1;
  name: string;
  seed: number;
  /** 마지막으로 반영한 칸 */
  tick: number;
  bornTick: number;
  hatchTick: number;
  stage: Stage;
  stageTick: number;
  /** 0..400 — 하트 하나 = 100 */
  hunger: number;
  happy: number;
  weight: number;
  /** 화면에 놓인 똥 (0..4) */
  poop: number;
  /** 다음 똥까지 남은 «깨어 있는» 칸 */
  poopClock: number;
  /** 똥이 치워지지 않은 채 지난 깨어 있는 칸 */
  dirtyTicks: number;
  /** 배고픔 0 으로 지난 깨어 있는 칸 */
  starvingTicks: number;
  sick: boolean;
  dosesLeft: number;
  lightsOn: boolean;
  asleep: boolean;
  attention: PetAttention | null;
  careMisses: number;
  lastPatTick: number;
  events: PetEvent[];
  /** 진화 가지(Phase 3) — 어른이 된 뒤 한 번 정해진다. 없으면 아직 안 정함. 새 종은 어른 모습(basic·courier — species.ts) */
  branch?: PetBranch;
  /** 종(2026-10-26) — 없음 = 별 가족(옛 펫 그대로). 읽을 때는 `speciesOf`. 알을 받을 때 정하고 바뀌지 않는다(서버 tama_pet_keep_species) */
  species?: Exclude<Species, 'star'>;
  /** 모드(2026-10-19) — 없음 = 이지(옛 펫 그대로). 읽을 때는 `modeOf`. **알을 받을 때 정하고 바꾸지 않는다**(같은 날 사용자 결정 —
   *  순위가 모드별이라 옮겨 다니면 안 된다. 서버 트리거 tama_pet_keep_mode 가 저장으로 바꾸는 것을 막는다) */
  mode?: Exclude<PetMode, 'easy'>;
  /** 옛 «죽음 옵션» 키 — 읽을 때 mode 'normal' 로 바뀐다(parsePetState). 새로 쓰지 않는다 */
  mortal?: boolean;
  /** 노멀·하드에서 «아픈 채로 깨어 있던» 칸 — 나으면·모드를 바꾸면 0 */
  sickTicks?: number;
  /** 마지막 산책 칸(없으면 산책한 적 없음) */
  lastWalkTick?: number;
  /** 돌본 시간(칸, 2026-10-26 — 이지·노멀·하드 순위 값). 부화 뒤 «돌봄을 기다리지 않는»(`neglected` 아님) 칸만 센다.
   *  이 키가 생기기 전 펫은 처음 따라잡을 때 «그때까지 함께한 칸»에서 이어 센다(사용자 결정) */
  caredTicks?: number;
  /** 하드만(2026-10-26) — 무사히 넘긴 돌보기 횟수(순위 줄에 보인다). 이 키가 생기기 전 펫은 다음 돌봄부터 센다 */
  careCount?: number;
  /** 하드만(2026-10-26) — «버텨 낸 위험»: 무사히 넘긴 운마다 −ln(1−p)를 더한다. 하드 순위 값(`survivedRisk`) */
  riskScore?: number;
  /** 똥을 싸지 않는 스킨을 입었다(`skinStopsPoop`, 2026-10-31) — 입힌 뒤의 똥만 막는다. 이미 놓인 똥은 그대로. 벗으면 키가 없어진다 */
  noPoop?: boolean;
  /** 별이 됐다(되돌릴 수 없다 — 새 알로 다시 시작) */
  dead?: boolean;
  deadTick?: number;
  deathCause?: DeathCause;
}

// ── 상수 ──────────────────────────────────────────────────────────────

export const HEART = 100;
export const MAX_METER = 4 * HEART;
const TICKS_PER_HOUR = 12;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;

/** 배고픔 4칸이 깨어 있는 8시간에 바닥난다(하루 두어 번 밥) */
const HUNGER_PER_TICK = MAX_METER / (8 * TICKS_PER_HOUR);
/** 행복 4칸은 10시간 */
const HAPPY_PER_TICK = MAX_METER / (10 * TICKS_PER_HOUR);
/** 똥 간격: 깨어 있는 2.5~3.5시간 */
const POOP_MIN = 30;
const POOP_SPAN = 12;
/** 똥을 3시간 두면 병 */
const DIRTY_SICK_TICKS = 3 * TICKS_PER_HOUR;
/** 배고픔 0 으로 2시간이면 병 */
const STARVING_SICK_TICKS = 2 * TICKS_PER_HOUR;
/** 죽음 옵션 — 아픈 채로 깨어 있는 시간이 하루면 위독, 이틀이면 별이 된다(수업·잠 칸은 세지 않는다) */
export const CRITICAL_SICK_TICKS = 24 * TICKS_PER_HOUR;
export const DEATH_SICK_TICKS = 48 * TICKS_PER_HOUR;
/** 놀이 — 끝까지 하면 지더라도 행복 +1칸, 이기면 +2칸(산책과 같다) */
export const GAME_PLAY_HAPPY = HEART;
export const GAME_WIN_HAPPY = 2 * HEART;
/** 산책 — 한 시간에 한 번 */
export const WALK_COOLDOWN_TICKS = 1 * TICKS_PER_HOUR;
/** 부름을 15분 놓치면 돌봄 실수 */
const ATTENTION_GRACE_TICKS = 3;
/** 한 번에 따라잡는 최대 기간 — 넘으면 앞부분은 건너뛴다(어차피 상태는 바닥·포화에 머문다) */
const MAX_CATCHUP_TICKS = 120 * TICKS_PER_DAY;
const MAX_EVENTS = 16;

/** 부화 후 단계가 바뀌는 시점(칸) — 원작: 아기 약 1시간, 어린이 하루, 청소년 사흘 */
export const STAGE_AT: Record<Exclude<Stage, 'egg'>, number> = {
  baby: 0,
  child: 1 * TICKS_PER_HOUR,
  teen: 1 * TICKS_PER_DAY,
  adult: 3 * TICKS_PER_DAY,
};
const STAGE_ORDER: Stage[] = ['egg', 'baby', 'child', 'teen', 'adult'];
export const BASE_WEIGHT: Record<Stage, number> = { egg: 0, baby: 5, child: 10, teen: 20, adult: 30 };
const STAGE_HUNGER_RATE: Record<Stage, number> = { egg: 0, baby: 1.5, child: 1.15, teen: 1, adult: 0.85 };

// ── 난수 (칸·씨앗으로 결정) ─────────────────────────────────────────

export function hashInts(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const rand01 = (seed: number, t: number) => hashInts(seed, t) / 0x100000000;

// ── 만들기 ────────────────────────────────────────────────────────────

/** 알 받기. 부화는 받은 시각 1분 뒤의 다음 칸 경계 — 1~6분 사이에 깬다. */
export function createEgg(name: string, nowMs: number, seed: number, opts: { mode?: PetMode; species?: Species } = {}): PetState {
  const tick = tickOf(nowMs);
  const egg: PetState = {
    v: 1,
    name,
    seed: seed >>> 0,
    tick,
    bornTick: tick,
    hatchTick: tickOf(nowMs + 60_000) + 1,
    stage: 'egg',
    stageTick: tick,
    hunger: MAX_METER,
    happy: MAX_METER,
    weight: 0,
    poop: 0,
    poopClock: POOP_MIN,
    dirtyTicks: 0,
    starvingTicks: 0,
    sick: false,
    dosesLeft: 0,
    lightsOn: true,
    asleep: false,
    attention: null,
    careMisses: 0,
    lastPatTick: -1,
    events: [],
  };
  // 별이 된 펫의 새 알은 모드를 이어받는다(이지는 키가 없다 — 옛 알과 모양이 같게)
  if (opts.mode && opts.mode !== 'easy') egg.mode = opts.mode;
  if (opts.mode === 'hard') { egg.careCount = 0; egg.riskScore = 0; }
  // 종 — 별 가족은 키가 없다(옛 알과 모양이 같게)
  if (opts.species && opts.species !== 'star') egg.species = opts.species;
  return egg;
}

/** 이 펫의 모드 — 키가 없으면 이지, 옛 «죽음 옵션»은 노멀 */
export const modeOf = (state: Pick<PetState, 'mode' | 'mortal'>): PetMode => state.mode ?? (state.mortal ? 'normal' : 'easy');

const pushEvent = (state: PetState, event: PetEvent) => {
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
};

function die(state: PetState, t: number, cause: DeathCause) {
  state.dead = true;
  state.deadTick = t;
  state.deathCause = cause;
  state.attention = null;
  state.asleep = false;
  pushEvent(state, { tick: t, kind: 'death', stage: state.stage, cause });
}

/** 일마다 다른 씨앗 — 같은 칸에 두 일이 겹쳐도 운이 서로 묶이지 않게 */
const HARD_SALT: Record<HardEvent, number> = {
  meal: 0x1b873593, snack: 0xcc9e2d51, walk: 0x5be0cd19, gameWin: 0x9b05688c, gameLose: 0x1f83d9ab, pat: 0x510e527f,
  clean: 0xa54ff53a, medicine: 0x3c6ef372, lights: 0xbb67ae85, sleep: 0x6a09e667, wake: 0x7f4a7c15, poop: 0x85ebca77,
  evolve: 0xc2b2ae3d, idle: 0x27d4eb2f, hungry: 0x2f6b8c1d, bored: 0x632be5ab, dirty: 0xd1b54a35,
};

/**
 * 하드(개복치) — 이 칸에 이 일이 일어났을 때 별이 되는가. 되면 이유 id, 아니면 null(하드가 아니어도 null).
 * 칸·씨앗 난수라 같은 칸·같은 일이면 언제나 같은 답이다(다시 눌러도 운이 바뀌지 않는다 · 나눠 따라잡기 = 한 번에).
 */
export function hardFate(state: Pick<PetState, 'mode' | 'seed'>, event: HardEvent, t: number): DeathCause | null {
  if (state.mode !== 'hard') return null;
  const def = HARD_EVENTS[event];
  if (rand01(state.seed ^ HARD_SALT[event], t) >= def.p) return null;
  return def.causes[hashInts(state.seed ^ HARD_SALT[event] ^ 0x2545f491, t) % def.causes.length].id;
}

/**
 * 하드 순위 값 «버텨 낸 위험»(2026-10-26 사용자 요청 «개복치는 돌봄의 횟수도 시간만큼이나 중요한 변수 — 랭킹에 넣어야 함»).
 * 시간만 세면 돌보기마다 운을 보는 하드에서는 «덜 돌볼수록 유리»해진다. 그래서 무사히 넘긴 운마다 그 일의 위험 −ln(1−p)를 더한다 —
 * 산책 한 번 ≈ 깨어 있는 10시간. 방치(배고픔·심심함·똥)로 생긴 위험은 넣지 않는다(방치는 손해만 본다).
 * 같은 날 사용자 «방치하는 동안은 시간으로 카운트하면 안 됨 — 가만히 두고만 있는다고 랭킹이 올라가는 게 아님»:
 * 펫이 돌봄을 기다리는 동안(배고픔 0 · 행복 0 · 똥 · 아픔 — `neglected`)은 저절로 지나는 칸·일(가만히·잠·깨기·똥·진화)도 점수가 되지 않는다.
 * 돌보기는 언제나 점수가 된다 — 시간 점수는 돌봐 둔 상태가 이어지는 동안에만 쌓인다.
 * 점수는 운의 합이라 쓰다듬기를 연타하면 오르지만 그만큼 별이 될 확률도 같이 쌓인다.
 */
const NEGLECT_EVENTS: ReadonlySet<HardEvent> = new Set<HardEvent>(['hungry', 'bored', 'dirty']);
export const hazardOf = (event: HardEvent) => -Math.log(1 - HARD_EVENTS[event].p);
/** 하드 순위 값 — 점수 키가 없는 옛 펫은 0 */
export const survivedRisk = (state: Pick<PetState, 'riskScore'>) => state.riskScore ?? 0;

/** 돌봄을 기다리는 상태 — 이 동안 저절로 지나는 시간은 점수가 되지 않는다 */
export const neglected = (state: Pick<PetState, 'sick' | 'hunger' | 'happy' | 'poop'>) =>
  state.sick || state.hunger <= 0 || state.happy <= 0 || state.poop > 0;

function survived(state: PetState, event: HardEvent, passive: boolean) {
  if (state.mode !== 'hard' || NEGLECT_EVENTS.has(event)) return;
  if (passive && neglected(state)) return;
  state.riskScore = Math.round(((state.riskScore ?? 0) + hazardOf(event)) * 1e6) / 1e6;
}

/** 저절로 일어난 일 — 하드면 운을 보고, 걸리면 별이 된다(true) */
function hardStep(state: PetState, event: HardEvent, t: number): boolean {
  const cause = hardFate(state, event, t);
  if (!cause) { survived(state, event, true); return false; }
  die(state, t, cause);
  return true;
}

const clampMeter = (v: number) => Math.max(0, Math.min(MAX_METER, v));
/** 부동소수 누적 오차가 «나눠 따라잡기 = 한 번에 따라잡기»를 깨지 않게 칸마다 고정 소수로 자른다 */
const fix = (v: number) => Math.round(v * 1000) / 1000;

export const heartsOf = (meter: number) => Math.ceil(meter / HEART - 1e-9);

function stageForAge(ageTicks: number): Stage {
  if (ageTicks >= STAGE_AT.adult) return 'adult';
  if (ageTicks >= STAGE_AT.teen) return 'teen';
  if (ageTicks >= STAGE_AT.child) return 'child';
  return 'baby';
}

function neededAttention(state: PetState): AttentionReason | null {
  if (state.sick) return 'sick';
  if (state.hunger <= 0) return 'hungry';
  if (state.happy <= 0) return 'unhappy';
  return null;
}

function updateAttention(state: PetState, reason: AttentionReason | null, t: number) {
  if (!reason) {
    state.attention = null;
    return;
  }
  if (!state.attention || state.attention.reason !== reason) {
    state.attention = { reason, since: t, missed: false };
    return;
  }
  if (!state.attention.missed && t - state.attention.since >= ATTENTION_GRACE_TICKS) {
    state.attention.missed = true;
    state.careMisses += 1;
    pushEvent(state, { tick: t, kind: 'careMiss' });
    if (reason === 'lights') state.happy = fix(clampMeter(state.happy - HEART));
  }
}

/**
 * 한 칸 + 돌본 시간 세기(2026-10-26 사용자 «방치하는 동안은 이지·노멀·하드 모두 시간으로 카운트되지 않음»).
 * 칸을 다 반영한 뒤 살아 있고 돌봄을 기다리지 않으면(`neglected` 아님) +1 — 잠·수업 칸도 같은 기준(상태가 멈춰 있을 뿐).
 * 부화하는 칸은 세지 않는다(예전 값 «칸 − 부화 칸»과 같은 자).
 */
function step(state: PetState, t: number, schedule: SchoolSchedule) {
  const hatched = state.stage !== 'egg';
  stepCore(state, t, schedule);
  if (state.stage === 'egg' || state.dead) return;
  if (!hatched) { state.caredTicks = 0; return; }
  if (!neglected(state)) state.caredTicks = (state.caredTicks ?? 0) + 1;
}

function stepCore(state: PetState, t: number, schedule: SchoolSchedule) {
  // 별이 된 펫은 그대로 멈춘다(배고픔·똥·부름 모두 없다)
  if (state.dead) return;
  if (state.stage === 'egg') {
    if (t >= state.hatchTick) {
      state.stage = 'baby';
      state.stageTick = t;
      state.weight = BASE_WEIGHT.baby;
      pushEvent(state, { tick: t, kind: 'hatch', stage: 'baby' });
    }
    return;
  }

  const activity = activityOfTick(t, schedule);

  if (activity === 'class') {
    // 수업 중 — 시간이 멈춘다. 잠도 깨어 있는 것으로 둔다(수업은 낮에만 있다).
    return;
  }

  if (activity === 'sleep') {
    if (!state.asleep) {
      state.asleep = true;
      pushEvent(state, { tick: t, kind: 'sleep' });
      if (hardStep(state, 'sleep', t)) return;
    }
    // 자는 동안은 줄지 않는다. 불만 꺼 주면 된다.
    updateAttention(state, state.lightsOn ? 'lights' : state.sick ? 'sick' : null, t);
    return;
  }

  // ── 깨어 있음 ──
  if (state.asleep) {
    state.asleep = false;
    state.lightsOn = true;
    pushEvent(state, { tick: t, kind: 'wake' });
    if (hardStep(state, 'wake', t)) return;
  }

  // 단계 — 원작처럼 깨어 있을 때만 바뀐다(자다가 모습이 바뀌지 않는다)
  const next = stageForAge(t - state.hatchTick);
  if (STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(state.stage)) {
    state.stage = next;
    state.stageTick = t;
    state.weight = Math.max(state.weight, BASE_WEIGHT[next]);
    pushEvent(state, { tick: t, kind: 'evolve', stage: next });
    if (hardStep(state, 'evolve', t)) return;
  }

  const sickRate = state.sick ? 1.5 : 1;
  state.hunger = fix(clampMeter(state.hunger - HUNGER_PER_TICK * STAGE_HUNGER_RATE[state.stage] * sickRate));
  state.happy = fix(clampMeter(state.happy - HAPPY_PER_TICK * sickRate));

  state.poopClock -= 1;
  if (state.poopClock <= 0) {
    if (state.poop < 4 && !state.noPoop) {
      state.poop += 1;
      pushEvent(state, { tick: t, kind: 'poop' });
      if (hardStep(state, 'poop', t)) return;
    }
    state.poopClock = POOP_MIN + Math.floor(rand01(state.seed, t) * POOP_SPAN);
  }

  state.dirtyTicks = state.poop > 0 ? state.dirtyTicks + 1 : 0;
  state.starvingTicks = state.hunger <= 0 ? state.starvingTicks + 1 : 0;
  if (!state.sick && (state.dirtyTicks >= DIRTY_SICK_TICKS || state.starvingTicks >= STARVING_SICK_TICKS)) {
    state.sick = true;
    state.dosesLeft = rand01(state.seed ^ 0x51ed, t) < 0.5 ? 1 : 2;
    state.dirtyTicks = 0;
    state.starvingTicks = 0;
    pushEvent(state, { tick: t, kind: 'sick' });
  }

  // 노멀·하드 — 아픈 채로 «깨어 있는» 칸만 센다(여기까지 온 칸은 수업·잠이 아니다)
  const mode = modeOf(state);
  if (mode !== 'easy' && state.sick) {
    state.sickTicks = (state.sickTicks ?? 0) + 1;
    if (state.sickTicks === CRITICAL_SICK_TICKS) pushEvent(state, { tick: t, kind: 'critical' });
    if (state.sickTicks >= DEATH_SICK_TICKS) { die(state, t, 'sick'); return; }
  }

  // 하드(개복치) — 방치(2026-10-26): 배고픈 채로 · 심심한 채로 · 똥을 안 치운 채로 지나는 깨어 있는 칸마다 운을 본다.
  // 이 칸의 상태로 판정하므로 앱을 언제 열어 따라잡든 같은 칸에서 같은 결과다(나눠 따라잡기 = 한 번에)
  if (state.hunger <= 0 && hardStep(state, 'hungry', t)) return;
  if (state.happy <= 0 && hardStep(state, 'bored', t)) return;
  if (state.poop > 0 && hardStep(state, 'dirty', t)) return;

  // 하드(개복치) — 가만히 있어도 일은 생긴다(깨어 있는 칸마다 아주 작은 확률)
  if (hardStep(state, 'idle', t)) return;

  updateAttention(state, neededAttention(state), t);
}

/**
 * 지금 시각까지 따라잡는다. 원본은 건드리지 않는다.
 * 처리하는 칸 = (state.tick, tickOf(nowMs)] — 지금 진행 중인 칸도 시작 시점에 반영된다.
 */
export function advancePet(state: PetState, nowMs: number, schedule: SchoolSchedule): PetState {
  const target = tickOf(nowMs);
  if (target <= state.tick) return state;
  const next: PetState = structuredCloneState(state);
  // 돌본 시간 키가 생기기 전 펫 — 그때까지 함께한 칸에서 이어 센다(사용자 결정 · 지난 방치는 알 수 없다).
  // 저장된 칸에서 정하므로 나눠 따라잡아도 한 번에와 같다
  if (next.caredTicks === undefined && next.stage !== 'egg') {
    next.caredTicks = Math.max(0, (next.dead && next.deadTick !== undefined ? next.deadTick : next.tick) - next.hatchTick);
  }
  let from = next.tick + 1;
  if (target - from > MAX_CATCHUP_TICKS) from = target - MAX_CATCHUP_TICKS;
  for (let t = from; t <= target; t += 1) step(next, t, schedule);
  next.tick = target;
  return next;
}

/**
 * 쉬던 펫이 돌아왔을 때 잠·깸을 지금 시각에 맞춘다(2026-11-06 사용자 «잘 시간에 펫 집에서 펫을 교체하면 깨어 있는 상태로 유지»).
 * restPetState 는 시계만 지금으로 옮겨(쉬는 동안 시간이 멈춘다) 잠드는 칸을 지나지 않으므로, 낮에 쉬러 간 펫은 밤에 돌아와도
 * 깨어 있었다. 여기서는 잠·깸만 바꾼다 — 배고픔·행복·나이는 그대로(멈춘 시간), 하드의 «잠들 때 운»은 굴리지 않는다(지금이 그 순간이 아니다).
 */
export function settleArrivedPet(state: PetState, schedule: SchoolSchedule): PetState {
  if (state.dead || state.stage === 'egg') return state;
  const t = state.tick;
  const activity = activityOfTick(t, schedule);
  if (activity === 'sleep' && !state.asleep) {
    const next = structuredCloneState(state);
    next.asleep = true;
    pushEvent(next, { tick: t, kind: 'sleep' });
    updateAttention(next, next.lightsOn ? 'lights' : next.sick ? 'sick' : null, t);
    return next;
  }
  if (activity === 'awake' && state.asleep) {
    const next = structuredCloneState(state);
    next.asleep = false;
    next.lightsOn = true;
    pushEvent(next, { tick: t, kind: 'wake' });
    updateAttention(next, neededAttention(next), t);
    return next;
  }
  return state;
}

function structuredCloneState(state: PetState): PetState {
  return {
    ...state,
    attention: state.attention ? { ...state.attention } : null,
    events: state.events.map((e) => ({ ...e })),
  };
}

// ── 돌보기 ────────────────────────────────────────────────────────────

export type PetAction =
  | { type: 'meal' }
  | { type: 'snack' }
  | { type: 'lights'; on: boolean }
  | { type: 'medicine' }
  | { type: 'clean' }
  | { type: 'game'; wins: number; rounds: number }
  | { type: 'pat' }
  /** 산책(2026-10-19) — 놀이 메뉴의 넷째 칸. 한 시간에 한 번 */
  | { type: 'walk' }
  /** 좋은 습관으로 코인을 받았다는 소식(Phase 2) — 한 건에 하트 반 칸. 수업·잠 중에도 전해진다(돌보기가 아니라 소식이다). */
  | { type: 'cheer'; count: number };

export type RefuseReason = 'egg' | 'asleep' | 'class' | 'full' | 'happyFull' | 'notSick' | 'nothing' | 'tooSoon' | 'sick' | 'dead' | 'walked';

export type ActionResult =
  /** died = 하드에서 돌보다가 별이 됐다(의외의 이유 — hardFate) */
  | { ok: true; state: PetState; detail?: 'healed' | 'dose' | 'win' | 'lose' | 'died' }
  | { ok: false; state: PetState; reason: RefuseReason };

/** 지금 돌볼 수 없는 이유(없으면 null). 놀이처럼 화면을 먼저 여는 메뉴가 미리 묻는다. */
export function careBlock(state: PetState, activityNow: 'sleep' | 'class' | 'awake'): RefuseReason | null {
  if (state.dead) return 'dead';
  if (state.stage === 'egg') return 'egg';
  if (activityNow === 'class') return 'class';
  if (state.asleep) return 'asleep';
  return null;
}

/**
 * 돌보기 한 번. `state` 는 이미 지금 칸까지 따라잡은 상태여야 한다(`advancePet` 먼저).
 * `activityNow` 는 지금 칸의 활동 — 수업·잠을 판정한다.
 */
export function applyAction(
  state: PetState,
  action: PetAction,
  activityNow: 'sleep' | 'class' | 'awake',
): ActionResult {
  const refuse = (reason: RefuseReason): ActionResult => ({ ok: false, state, reason });
  if (state.dead) return refuse('dead');
  if (state.stage === 'egg') return refuse('egg');
  if (action.type === 'cheer') {
    const next = structuredCloneState(state);
    next.happy = fix(clampMeter(next.happy + (HEART / 2) * Math.max(0, Math.min(8, action.count))));
    updateAttention(next, next.asleep ? (next.lightsOn ? 'lights' : null) : neededAttention(next), next.tick);
    return { ok: true, state: next };
  }
  // 불 끄기·켜기는 언제나 된다(자는 펫의 불을 꺼 주는 것이 돌봄이다).
  // 똥 치우기도 자는 동안 된다(2026-11-05 사용자 «자고 있을 때 똥은 치워줄 수 있도록» — 깨우지 않고 치운다). 수업 중은 그대로 막는다.
  if (action.type !== 'lights') {
    if (activityNow === 'class') return refuse('class');
    if (state.asleep && action.type !== 'clean') return refuse('asleep');
  }

  const next = structuredCloneState(state);
  const t = next.tick;
  const settle = () => updateAttention(next, next.asleep ? (next.lightsOn ? 'lights' : null) : neededAttention(next), t);
  // 하드(개복치) — 돌보기도 가끔 의외의 일이 된다. 같은 칸·같은 일이면 같은 운(다시 눌러도 바뀌지 않는다)
  const fate = (event: HardEvent): ActionResult | null => {
    const cause = hardFate(state, event, t);
    if (!cause) {
      survived(next, event, false);
      if (next.mode === 'hard') next.careCount = (next.careCount ?? 0) + 1;
      return null;
    }
    die(next, t, cause);
    return { ok: true, state: next, detail: 'died' };
  };

  switch (action.type) {
    case 'meal': {
      // 원작처럼 하트 4칸이 다 차 있으면 거절한다(미터가 조금 줄었어도 하트는 그대로 4칸)
      if (heartsOf(next.hunger) >= 4) return refuse('full');
      next.hunger = fix(clampMeter(next.hunger + HEART));
      next.weight += 1;
      next.starvingTicks = 0;
      { const d = fate('meal'); if (d) return d; }
      settle();
      return { ok: true, state: next };
    }
    case 'snack': {
      // 밥과 같이 하트 4칸(행복)이 다 차 있으면 거절한다(2026-11-06 사용자 — 행복이 가득해도 계속 먹일 수 있었다)
      if (heartsOf(next.happy) >= 4) return refuse('happyFull');
      next.happy = fix(clampMeter(next.happy + HEART));
      next.weight += 2;
      { const d = fate('snack'); if (d) return d; }
      settle();
      return { ok: true, state: next };
    }
    case 'lights': {
      next.lightsOn = action.on;
      { const d = fate('lights'); if (d) return d; }
      settle();
      return { ok: true, state: next };
    }
    case 'medicine': {
      if (!next.sick) return refuse('notSick');
      next.dosesLeft = Math.max(0, next.dosesLeft - 1);
      { const d = fate('medicine'); if (d) return d; }
      if (next.dosesLeft === 0) {
        next.sick = false;
        next.sickTicks = 0;
        pushEvent(next, { tick: t, kind: 'healed' });
        settle();
        return { ok: true, state: next, detail: 'healed' };
      }
      return { ok: true, state: next, detail: 'dose' };
    }
    case 'clean': {
      if (next.poop === 0) return refuse('nothing');
      next.poop = 0;
      next.dirtyTicks = 0;
      { const d = fate('clean'); if (d) return d; }
      settle();
      return { ok: true, state: next };
    }
    case 'game': {
      if (next.sick) return refuse('sick');
      // 2026-10-19 «다른 게임을 해도 행복이 올라가야 할 듯 산책처럼» — 놀면 지더라도 행복 +1칸, 이기면 산책과 같은 +2칸
      const won = action.wins * 2 > action.rounds;
      next.happy = fix(clampMeter(next.happy + (won ? GAME_WIN_HAPPY : GAME_PLAY_HAPPY)));
      if (won) next.weight = Math.max(BASE_WEIGHT[next.stage], next.weight - 1);
      { const d = fate(won ? 'gameWin' : 'gameLose'); if (d) return d; }
      settle();
      return { ok: true, state: next, detail: won ? 'win' : 'lose' };
    }
    case 'pat': {
      if (next.lastPatTick === t) return refuse('tooSoon');
      next.lastPatTick = t;
      next.happy = fix(clampMeter(next.happy + HEART / 4));
      { const d = fate('pat'); if (d) return d; }
      settle();
      return { ok: true, state: next };
    }
    case 'walk': {
      // 산책은 기본적으로 기분이 좋아진다 — 걸으면 배가 조금 고프고 몸이 가벼워진다
      if (next.sick) return refuse('sick');
      if (next.lastWalkTick !== undefined && t - next.lastWalkTick < WALK_COOLDOWN_TICKS) return refuse('walked');
      next.lastWalkTick = t;
      next.happy = fix(clampMeter(next.happy + 2 * HEART));
      next.hunger = fix(clampMeter(next.hunger - HEART / 2));
      next.weight = Math.max(BASE_WEIGHT[next.stage], next.weight - 1);
      { const d = fate('walk'); if (d) return d; }
      settle();
      return { ok: true, state: next };
    }
  }
}

/** 산책까지 남은 분(지금 갈 수 있으면 0) */
export function walkWaitMinutes(state: PetState): number {
  if (state.lastWalkTick === undefined) return 0;
  return Math.max(0, (WALK_COOLDOWN_TICKS - (state.tick - state.lastWalkTick)) * 5);
}

// ── 읽기 ──────────────────────────────────────────────────────────────

export interface PetView {
  stage: Stage;
  hungerHearts: number;
  happyHearts: number;
  ageYears: number;
  weight: number;
  poop: number;
  sick: boolean;
  asleep: boolean;
  lightsOn: boolean;
  inClass: boolean;
  attention: AttentionReason | null;
  careMisses: number;
  /** 부화까지 남은 비율 0..1 (알일 때) */
  hatchProgress: number;
  /** 진화 가지(어른) — 새 종은 어른 모습 */
  branch?: PetBranch;
  /** 종 · 그림 고르기 열쇠(그림 함수의 branch 자리 — 새 종은 모든 단계가 그 종의 그림) */
  species: Species;
  look?: LookKey;
  /** 모드(이지·노멀·하드) */
  mode: PetMode;
  /** 죽을 수 있는 모드인가(노멀·하드) */
  mortal: boolean;
  /** 위독 — 노멀·하드에서 하루 넘게 아프다 */
  critical: boolean;
  /** 아파서 별이 될 때까지 남은 «깨어 있는» 시간(시간 단위, 올림). 아프지 않거나 이지면 null */
  hoursLeft: number | null;
  /** 별이 됐다 */
  dead: boolean;
  /** 왜 별이 됐는가(별이 됐을 때만 — 옛 펫은 'sick') */
  deathCause: DeathCause | null;
}

export function viewPet(state: PetState, schedule: SchoolSchedule, nowMs: number): PetView {
  const t = tickOf(nowMs);
  const inClass = !state.dead && state.stage !== 'egg' && activityOfTick(t, schedule) === 'class';
  const mode = modeOf(state);
  const dying = !state.dead && mode !== 'easy' && state.sick;
  const sickTicks = state.sickTicks ?? 0;
  const span = Math.max(1, state.hatchTick - state.bornTick);
  return {
    branch: state.stage === 'adult' ? state.branch : undefined,
    species: speciesOf(state),
    look: lookOf(speciesOf(state), state.stage === 'adult' ? state.branch : undefined),
    stage: state.stage,
    hungerHearts: heartsOf(state.hunger),
    happyHearts: heartsOf(state.happy),
    ageYears: state.stage === 'egg' ? 0 : Math.max(0, Math.floor((state.tick - state.hatchTick) / TICKS_PER_DAY)),
    weight: state.weight,
    poop: state.poop,
    sick: state.sick,
    asleep: state.asleep,
    lightsOn: state.lightsOn,
    inClass,
    attention: state.attention?.reason ?? null,
    careMisses: state.careMisses,
    hatchProgress: state.stage === 'egg' ? Math.min(1, Math.max(0, (nowMs / 300000 - state.bornTick) / span)) : 1,
    mode,
    mortal: mode !== 'easy',
    critical: dying && sickTicks >= CRITICAL_SICK_TICKS,
    hoursLeft: dying ? Math.max(1, Math.ceil((DEATH_SICK_TICKS - sickTicks) / TICKS_PER_HOUR)) : null,
    dead: !!state.dead,
    deathCause: state.dead ? state.deathCause ?? 'sick' : null,
  };
}

// ── 스킨 특수 효과 ────────────────────────────────────────────────────

/**
 * «듀원땜» 스킨(가챠 물건 · 의뢰자가 받은 나만의 캐릭터)을 입은 펫은 똥을 싸지 않는다(2026-10-31 사용자 지시).
 * ⚠️ 사용자 결정으로 화면에 설명하지 않는다 — 물건 설명·안내에 적지 말 것.
 */
export function skinStopsPoop(itemId: string | null | undefined, orderId: string | null | undefined): boolean {
  return itemId === 'char_duwon' || orderId === '81262744-aba7-4eca-a90b-4a44536f9335';
}

// ── 저장값 검사 ───────────────────────────────────────────────────────

const STAGES = new Set<Stage>(STAGE_ORDER);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 서버·저장소에서 읽은 값이 펫 상태 모양인지. 아니면 null(깨진 값으로 화면을 그리지 않는다). */
export function parsePetState(raw: unknown): PetState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s.v !== 1 || typeof s.name !== 'string' || !STAGES.has(s.stage as Stage)) return null;
  const nums = ['seed', 'tick', 'bornTick', 'hatchTick', 'stageTick', 'hunger', 'happy', 'weight', 'poop', 'poopClock',
    'dirtyTicks', 'starvingTicks', 'dosesLeft', 'careMisses', 'lastPatTick'];
  if (!nums.every((k) => isNum(s[k]))) return null;
  if (typeof s.sick !== 'boolean' || typeof s.lightsOn !== 'boolean' || typeof s.asleep !== 'boolean') return null;
  if (!Array.isArray(s.events)) return null;
  const attention = s.attention as PetAttention | null;
  if (attention !== null && (typeof attention !== 'object' || !isNum(attention.since))) return null;
  const out: PetState = {
    ...(s as unknown as PetState),
    attention: attention ? { ...attention } : null,
    events: (s.events as PetEvent[]).filter((e) => e && isNum(e.tick) && typeof e.kind === 'string').slice(-MAX_EVENTS),
  };
  // 죽음 옵션 칸(2026-10-19)은 옛 펫에 없다 — 있을 때만 검사하고(모양을 그대로 두어 옛 펫의 저장값이 바뀌지 않게),
  // 모양이 틀리면 꺼짐 쪽으로 고친다(깨진 값으로 펫을 죽이지 않는다)
  // 모드(2026-10-19) — 옛 «죽음 옵션»(mortal: true)은 노멀로 옮긴다. 모르는 값은 이지(깨진 값으로 펫을 죽이지 않는다)
  // 키 순서를 바꾸지 않게 지우기만 한다(저장값 비교·회귀가 JSON 그대로 본다)
  if ('mode' in out && !(isPetMode(s.mode) && s.mode !== 'easy')) delete out.mode;
  if ('mortal' in out) {
    if (!('mode' in s) && s.mortal === true) out.mode = 'normal';
    delete out.mortal;
  }
  if ('sickTicks' in s) out.sickTicks = isNum(s.sickTicks) && s.sickTicks >= 0 ? s.sickTicks : 0;
  // 종(2026-10-26) — 있을 때만 검사, 모르는 값·star 는 지운다(별 가족 = 키 없음)
  if ('species' in out && !(isSpecies(s.species) && s.species !== 'star')) delete out.species;
  // 하드 순위 칸(2026-10-26) — 있을 때만 검사, 틀린 모양은 0
  for (const k of ['careCount', 'riskScore', 'caredTicks'] as const) if (k in s) out[k] = isNum(s[k]) && (s[k] as number) >= 0 ? (s[k] as number) : 0;
  if ('noPoop' in out && s.noPoop !== true) delete out.noPoop;
  if ('lastWalkTick' in s) { if (isNum(s.lastWalkTick)) out.lastWalkTick = s.lastWalkTick; else delete out.lastWalkTick; }
  // 같은 날 첫 하드(조건형)가 쓰던 칸 — 새 하드는 안 쓴다. 지우기만(키 순서 유지)
  const o = out as unknown as Record<string, unknown>;
  for (const k of ['lonelyTicks', 'messTicks', 'glareTicks', 'snackTicks']) delete o[k];
  if ('dead' in s || 'deadTick' in s) {
    if (s.dead === true && isNum(s.deadTick)) { out.dead = true; out.deadTick = s.deadTick; }
    else { delete out.dead; delete out.deadTick; }
  }
  if (!out.dead || !isDeathCause(s.deathCause)) delete out.deathCause;
  return out;
}
