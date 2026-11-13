/**
 * 다마고찌 업적 · 개복치 사망 도감(2026-10-19 사용자 요청 «사망 조건을 모두 해금하는 것도 재미있을 듯. 이 외에도 이런 업적 시스템을
 * 만들면 재미있을 것. 일단 기능만 만들고 해금은 하지 않음» · 같은 날 «업적을 달성하면 코인을 1회에 한하여 받을 수 있도록»).
 *
 * - **진행도는 서버가 센다**(`tama_private.achievement_progress` — 앨범 전체 + 내 펫 행). 코인이 걸리므로 화면 계산을 믿지 않고,
 *   화면도 서버 값을 그대로 그린다(두 벌 계산이면 «달성인데 못 받음»이 생긴다). 여기에는 이름·설명·목표·보상만 둔다.
 * - 보상 = 업적마다 한 번(통합 지갑 원장 유일 키 · kind 'tama_achievement'). 목표·보상·사망 도감 칸은 SQL 과 두 벌 — 회귀가 대조한다.
 * - 2026-10-21 학생·교사에게 열었다. 업적 보상 값은 관리자 «코인 경제» 설정(서버 rewards)이 이긴다.
 */
import { HARD_EVENTS, type HardEvent } from './petModes';
import { DEX } from './album';

/** 사망 도감 칸 = 하드 이벤트의 이유 전부 + 오래 아파서(노멀·하드). 같은 날 첫 하드의 옛 id(starve·lonely)는 세지 않는다 — SQL death_dex() 와 같다 */
export const DEATH_DEX: { id: string; event: HardEvent | 'sick' }[] = [
  { id: 'sick', event: 'sick' },
  ...(Object.keys(HARD_EVENTS) as HardEvent[]).flatMap((event) => HARD_EVENTS[event].causes.map((c) => ({ id: c.id, event }))),
];

/** 도감 묶음 이름 — 못 모은 칸은 «산책하다가 …???»처럼 어디서 일어나는지만 보여 준다 */
export const EVENT_LABEL: Record<HardEvent | 'sick', string> = {
  sick: '오래 아파서', meal: '밥 먹다가', snack: '간식 먹다가', walk: '산책하다가', gameWin: '놀이에서 이기고', gameLose: '놀이에서 지고',
  pat: '쓰다듬다가', clean: '씻다가', medicine: '주사 맞다가', lights: '불 켜고 끄다가', sleep: '잠들다가', wake: '깨어나다가',
  poop: '똥 싸다가', evolve: '자라다가', idle: '가만히 있다가',
  hungry: '배고픈 채로', bored: '심심한 채로', dirty: '똥을 안 치운 채로',
};

export interface AchievementDef {
  id: string;
  title: string;
  /** 달성 조건 — 잠긴 업적에도 보여 준다(무엇을 하면 되는지) */
  desc: string;
  goal: number;
  /** 달성하고 받는 코인(한 번) */
  reward: number;
}

/** 순서 = 화면 순서. goal·reward 는 SQL tama_private.achievement_rule 과 같아야 한다 */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_egg', title: '첫 만남', desc: '알을 받아요.', goal: 1, reward: 5 },
  { id: 'first_hatch', title: '톡, 톡', desc: '알이 깨어나요.', goal: 1, reward: 5 },
  { id: 'grown', title: '다 컸다!', desc: '펫을 어른까지 키워요.', goal: 1, reward: 20 },
  { id: 'week', title: '일주일 친구', desc: '한 펫과 7일 함께해요.', goal: 7, reward: 20 },
  { id: 'month', title: '한 달 친구', desc: '한 펫과 30일 함께해요.', goal: 30, reward: 50 },
  { id: 'healer', title: '꼬마 의사', desc: '아픈 펫을 10번 낫게 해요.', goal: 10, reward: 15 },
  { id: 'branches', title: '네 갈래 길', desc: '습관으로 자라는 어른 모습 넷을 모두 만나요.', goal: 4, reward: 40 },
  { id: 'dex', title: '도감 완성', desc: '펫 집 도감의 모든 모습을 만나요.', goal: DEX.length, reward: 50 },
  { id: 'character', title: '새 옷', desc: '의뢰한 캐릭터를 받아요.', goal: 1, reward: 10 },
  { id: 'first_star', title: '첫 별', desc: '펫이 별이 되는 걸 지켜봐요(노멀·하드).', goal: 1, reward: 10 },
  { id: 'sunfish_adult', title: '살아남은 개복치', desc: '하드 모드 펫을 어른까지 키워요.', goal: 1, reward: 50 },
  { id: 'dex_death_10', title: '개복치 연구가', desc: '서로 다른 이유로 별이 된 기록 10가지를 모아요.', goal: 10, reward: 20 },
  { id: 'dex_death_30', title: '개복치 박사', desc: '서로 다른 이유로 별이 된 기록 30가지를 모아요.', goal: 30, reward: 50 },
  { id: 'dex_death_all', title: '개복치의 모든 것', desc: `별이 되는 이유 ${DEATH_DEX.length}가지를 모두 모아요.`, goal: DEATH_DEX.length, reward: 150 },
];

/** 서버 tama_achievements() 의 답 */
export interface AchievementsData {
  progress: Record<string, number>;
  claimed: string[];
  deaths: string[];
  /** 업적 보상(관리자 코인 설정 — 서버 값). 없으면 정의의 reward */
  rewards: Record<string, number>;
  /** 반복 업적 — 진행도·단계·받은 횟수·보상 모두 서버 값 */
  repeat: Record<string, RepeatState>;
}

export interface RepeatState { progress: number; step: number; claimed: number; reward: number }

/**
 * 반복 업적(2026-10-21 사용자 요청 «반복해서 받을 수 있는 업적») — 단계마다 한 번씩 계속 받는다.
 * 진행도는 줄지 않는 값만(서버 tama_private.repeat_progress): 펫을 다시 키워도 줄지 않게 «함께한 날»은 펫 원장의 서로 다른 날짜로 센다.
 * 단계(step)는 서버 tama_private.repeat_step 이 정본 — 여기 있는 step 은 서버 값이 없을 때만 쓴다.
 */
export interface RepeatDef { id: string; title: string; desc: string; step: number }
export const REPEAT_ACHIEVEMENTS: RepeatDef[] = [
  { id: 'focus', title: '집중 친구', desc: '함께 집중을 끝까지 5번 할 때마다(집중의 숲 포함).', step: 5 },
  { id: 'diary', title: '일기장', desc: '펫 일기 보상을 7번(하루 한 번) 받을 때마다.', step: 7 },
  { id: 'heal', title: '단골 의사', desc: '아픈 펫을 10번 낫게 할 때마다.', step: 10 },
  { id: 'days', title: '함께한 날들', desc: '계획·돌아보기·집중·일기 중 하나라도 한 날이 10일 쌓일 때마다.', step: 10 },
  { id: 'plan', title: '계획쟁이', desc: '계획 세우기 보상을 10번 받을 때마다.', step: 10 },
];

export interface RepeatRow extends RepeatDef, RepeatState {
  /** 지금 받을 수 있는 단계 수 */
  ready: number;
  /** 다음 단계까지 남은 진행(이번 단계 안의 진행) */
  inStep: number;
}

export function repeatRows(data: AchievementsData): RepeatRow[] {
  return REPEAT_ACHIEVEMENTS.map((d) => {
    const r = data.repeat[d.id];
    const step = r && r.step > 0 ? r.step : d.step;
    const progress = Math.max(0, r?.progress ?? 0);
    const claimed = Math.max(0, r?.claimed ?? 0);
    const reward = r?.reward ?? 0;
    const ready = reward > 0 ? Math.max(0, Math.floor(progress / step) - claimed) : 0;
    // 받은 단계보다 진행도가 낮을 수 있다(2026-10-28 일기 셈 기준 변경 — 이미 받은 코인은 그대로) → 따라잡을 때까지 0
    return { ...d, step, progress, claimed, reward, ready, inStep: ready > 0 ? step : Math.min(step - 1, Math.max(0, progress - claimed * step)) };
  });
}

export interface AchievementRow extends AchievementDef {
  progress: number;
  done: boolean;
  claimed: boolean;
  /** 받을 수 있다 = 달성 ∧ 아직 안 받음 */
  claimable: boolean;
}

/** 서버 값이 모양이 틀려도 화면은 그린다(진행 0 · 받은 것 없음) */
export function parseAchievements(raw: unknown): AchievementsData {
  const r = (raw ?? {}) as Partial<AchievementsData>;
  const progress: Record<string, number> = {};
  if (r.progress && typeof r.progress === 'object') for (const [k, v] of Object.entries(r.progress)) if (typeof v === 'number') progress[k] = v;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const nums = (v: unknown) => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (typeof x === 'number') out[k] = x;
    return out;
  };
  const repeat: Record<string, RepeatState> = {};
  const rr = (raw as { repeat?: unknown } | null)?.repeat;
  if (rr && typeof rr === 'object') {
    for (const [k, v] of Object.entries(rr as Record<string, Partial<RepeatState>>)) {
      if (v && typeof v.progress === 'number' && typeof v.step === 'number') {
        repeat[k] = { progress: v.progress, step: v.step, claimed: typeof v.claimed === 'number' ? v.claimed : 0, reward: typeof v.reward === 'number' ? v.reward : 0 };
      }
    }
  }
  return { progress, claimed: strs(r.claimed), deaths: strs(r.deaths), rewards: nums((raw as { rewards?: unknown } | null)?.rewards), repeat };
}

export function achievementRows(data: AchievementsData): AchievementRow[] {
  const claimed = new Set(data.claimed);
  return ACHIEVEMENTS.map((a) => {
    const progress = Math.max(0, data.progress[a.id] ?? 0);
    const done = progress >= a.goal;
    const got = claimed.has(a.id);
    return { ...a, reward: data.rewards[a.id] ?? a.reward, progress, done, claimed: got, claimable: done && !got };
  });
}
