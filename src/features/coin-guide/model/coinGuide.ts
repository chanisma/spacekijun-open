/**
 * 코인 얻는 법(`/coins`, 2026-10-27 사용자 요청) — 통합 지갑에 코인이 들어오고 나가는 길을 세계(게임)별로 모은다.
 *
 * ⚠️ 숫자를 여기에 적지 않는다 — 전부 코인 경제 설정(`coin_economy_setting`, 관리자 «코인 경제»)에서 읽는다.
 *    키가 없으면(옛 서버·지운 설정) 그 줄을 감춘다 — 틀린 숫자를 보여 주느니 안 보여 준다.
 * ⚠️ 코인을 «주는» 설정 키가 새로 생기면 여기 어느 세계엔가 적을 것 — 회귀 `scripts/coin-guide-test` 가
 *    마이그레이션의 earn 키 전부가 이 안내에 실렸는지 본다(안 실으면 학생이 모르는 보상이 된다).
 */
import type { CoinEconomyValues } from '@/lib/coinEconomy';

export type WorldId = 'study' | 'academy' | 'planner' | 'tamagotchi' | 'star-tower' | 'world-today' | 'interview' | 'isekai3d';

export interface EarnRow {
  /** 무엇을 하면 */
  label: string;
  /** 받는 코인 — «+10» «1개당 10코인» */
  amount: string;
  /** 조건·상한 한 줄 */
  detail?: string;
  /** 이 줄이 하루에 줄 수 있는 최대 코인(하루 단위가 아니면 없음) */
  dailyMax?: number;
}

export interface SpendRow {
  label: string;
  amount: string;
  detail?: string;
}

export interface World {
  id: WorldId;
  name: string;
  /** 메뉴 경로 — 이 세계로 가는 곳(학생 메뉴에서 꺼져 있으면 화면이 링크를 감춘다) */
  href?: string;
  earn: EarnRow[];
  spend: SpendRow[];
  /** 업적 — 한 번씩 받는 보상 묶음 */
  achievements?: { count: number; total: number; repeat?: number };
}

const num = (v: CoinEconomyValues, key: string): number | null => (Number.isInteger(v[key]) ? v[key] : null);

/** 키가 다 있을 때만 줄을 만든다 */
function row(v: CoinEconomyValues, keys: string[], make: (...n: number[]) => EarnRow | SpendRow): EarnRow | SpendRow | null {
  const ns = keys.map((k) => num(v, k));
  return ns.every((n): n is number => n !== null) ? make(...ns) : null;
}

const earn = (v: CoinEconomyValues, keys: string[], make: (...n: number[]) => EarnRow) => row(v, keys, make) as EarnRow | null;
const spend = (v: CoinEconomyValues, keys: string[], make: (...n: number[]) => SpendRow) => row(v, keys, make) as SpendRow | null;
const present = <T,>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);

function achievementSum(v: CoinEconomyValues, prefix: string) {
  const keys = Object.keys(v).filter((k) => k.startsWith(prefix));
  return { count: keys.length, total: keys.reduce((s, k) => s + (num(v, k) ?? 0), 0) };
}

/** 범위 «30~120» — 값 하나면 그 값 */
function range(ns: number[]): string {
  if (!ns.length) return '';
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return lo === hi ? `${lo}` : `${lo}~${hi}`;
}

const valuesWith = (v: CoinEconomyValues, re: RegExp) => Object.keys(v).filter((k) => re.test(k)).map((k) => v[k]);

export function buildWorlds(v: CoinEconomyValues): World[] {
  const tamaAch = achievementSum(v, 'tama.achievement.');
  const tamaRepeat = Object.keys(v).filter((k) => k.startsWith('tama.repeat.')).length;
  const towerAch = achievementSum(v, 'tower.achievement.');
  const dwellersAch = achievementSum(v, 'isekai3d.achievement.');
  const gacha = valuesWith(v, /^tama\.gacha\.[a-z]+\.price$/);
  const decor = valuesWith(v, /^tama\.decor\./);
  const slots = valuesWith(v, /^tama\.pet_slot\./);

  return [
    {
      id: 'study',
      name: '자습실 · 집중의 숲',
      earn: present([
        earn(v, ['study.attendance_reward', 'study.daily_receipts'], (a, n) => ({
          label: '자습실 출석', amount: `+${a}`, detail: `출석이 확인되면 저절로 · 하루 ${n}번까지`, dailyMax: a * n })),
        earn(v, ['study.review_reward'], (a) => ({ label: '자습 피드백(별점)', amount: `+${a}`, detail: '출석한 자습에 · 하루 1번', dailyMax: a })),
        earn(v, ['tama.focus.amount', 'tama.focus.cap'], (a, n) => ({
          label: '집중의 숲 완주', amount: `+${a}`, detail: `다마고찌 «함께 집중»과 합쳐 하루 ${n}번` })),
      ]),
      spend: present([
        spend(v, ['study.puzzle_points_per_coin'], (p) => ({ label: '퍼즐 조각 — 모자란 포인트', amount: `${p}P = 1코인` })),
      ]),
    },
    {
      id: 'academy',
      name: '별빛 탐구 아카데미',
      href: '/academy',
      earn: present([
        earn(v, ['academy.chapter_reward'], (a) => ({ label: '이야기 한 장 끝내기', amount: `+${a}`, detail: '장마다 한 번' })),
        earn(v, ['academy.workshop_commission'], (a) => ({ label: '내 공방 작품이 팔릴 때', amount: `+${a}`, detail: '팔릴 때마다' })),
      ]),
      spend: present([
        spend(v, ['academy.workshop_order_cost'], (a) => ({ label: '공방 맞춤 제작 의뢰', amount: `${a}코인`, detail: '거절·취소되면 돌려받아요' })),
        spend(v, ['academy.workshop_sale_price'], (a) => ({ label: '공방 작품 사기', amount: `${a}코인` })),
      ]),
    },
    {
      id: 'planner',
      name: '플래너',
      href: '/planner',
      earn: present([
        earn(v, ['academy.planning_reward'], (a) => ({ label: '오늘 계획 «완료»', amount: `+${a}`, detail: '하루 1번', dailyMax: a })),
        earn(v, ['planner.ahead_reward', 'planner.ahead_cap'], (a, n) => ({
          label: '전날 미리 적은 계획 완료', amount: `+${a}`, detail: `계획마다 · 하루 ${n}개까지`, dailyMax: a * n })),
        earn(v, ['planner.week_reward', 'planner.week_days'], (a, d) => ({
          label: '한 주 꾸준함', amount: `+${a}`, detail: `월~일 중 ${d}일 «오늘 완료» · 주마다 한 번` })),
      ]),
      spend: [],
    },
    {
      id: 'tamagotchi',
      name: '다마고찌',
      href: '/tamagotchi',
      earn: present([
        earn(v, ['tama.plan.amount', 'tama.plan.cap'], (a, n) => ({ label: '계획 세우기', amount: `+${a}`, detail: `하루 ${n}번`, dailyMax: a * n })),
        earn(v, ['tama.focus.amount', 'tama.focus.cap'], (a, n) => ({ label: '함께 집중 완주', amount: `+${a}`, detail: `하루 ${n}번(집중의 숲 포함)`, dailyMax: a * n })),
        earn(v, ['tama.reflect.amount', 'tama.reflect.cap'], (a, n) => ({ label: '돌아보기 한 줄', amount: `+${a}`, detail: `하루 ${n}번`, dailyMax: a * n })),
        earn(v, ['tama.diary.amount', 'tama.diary.cap'], (a, n) => ({ label: '펫 일기', amount: `+${a}`, detail: `하루 ${n}번`, dailyMax: a * n })),
        earn(v, ['tama.royalty.percent', 'tama.royalty.max'], (p, m) => ({
          label: '내 의뢰 작품을 친구가 뽑으면', amount: `${p}%`, detail: `뽑기 값의 ${p}% · 한 번에 ${m}코인까지` })),
      ]),
      spend: present([
        gacha.length ? { label: '가챠 한 번', amount: `${range(gacha)}코인`, detail: '겹치면 일부 돌려받아요' } : null,
        decor.length ? { label: '꾸미기 의뢰', amount: `${range(decor)}코인` } : null,
        slots.length ? { label: '펫 자리 늘리기', amount: `${range(slots)}코인` } : null,
        spend(v, ['tama.character_order'], (a) => ({ label: '캐릭터 의뢰', amount: `${a}코인` })),
      ]),
      achievements: { ...tamaAch, repeat: tamaRepeat },
    },
    {
      id: 'star-tower',
      name: '별까지 쌓기',
      href: '/star-tower',
      earn: present([
        earn(v, ['tower.star_rate', 'tower.star_daily_cap'], (r, cap) => ({
          label: '별 조각 팔기', amount: `1개당 ${r}코인`, detail: `7층 비공정 상인 · 하루 ${cap}코인까지`, dailyMax: cap })),
        earn(v, ['tower.bottle_rate', 'tower.bottle_daily_cap'], (r, cap) => ({
          label: '남는 유리병 팔기', amount: `1병당 ${r}코인`, detail: `편지를 다 모은 뒤의 병 · 하루 ${cap}코인까지`, dailyMax: cap })),
      ]),
      spend: [],
      achievements: towerAch,
    },
    {
      id: 'world-today',
      name: '요즘 세상',
      href: '/world-today',
      earn: present([
        earn(v, ['world.inquiry_reward', 'world.inquiry_cap'], (a, n) => ({
          label: '탐구 질문 쓰기', amount: `+${a}`, detail: `기사마다 한 번 · 10자 이상 · 하루 ${n}번`, dailyMax: a * n })),
        earn(v, ['world.reflection_reward', 'world.reflection_cap'], (a, n) => ({
          label: '돌아보기 쓰기', amount: `+${a}`, detail: `기사마다 한 번 · 20자 이상 · 하루 ${n}번`, dailyMax: a * n })),
      ]),
      spend: [],
    },
    {
      id: 'interview',
      name: '면접 준비',
      href: '/interview-prep',
      earn: present([
        earn(v, ['interview.answer_reward', 'interview.answer_cap'], (a, n) => ({
          label: '답하고 평가 받기', amount: `+${a}`, detail: `질문마다 한 번 · 하루 ${n}번`, dailyMax: a * n })),
      ]),
      spend: [],
    },
    {
      id: 'isekai3d',
      name: '고등학생이었던 내가 이세계에서는 사회인?',
      href: '/isekai',
      earn: [],
      spend: present([
        spend(v, ['isekai3d.coin_price', 'isekai3d.max_coins'], (p, n) => ({
          label: '오락기 동전', amount: `첫 개 무료 · 그다음 ${p}코인`, detail: `하루 ${n}개까지` })),
      ]),
      achievements: dwellersAch,
    },
  ];
}

/** 이 세계에서 하루에 모을 수 있는 최대 코인(하루 단위 보상만) */
export const worldDailyMax = (w: World): number => w.earn.reduce((s, r) => s + (r.dailyMax ?? 0), 0);

/** 오락기 동전 하나로 노는 시간 — 게임 분 → «게임 N일/시간» */
export function isekai3dCoinTime(v: CoinEconomyValues): string | null {
  const m = num(v, 'isekai3d.per_coin');
  if (m === null) return null;
  if (m % 1440 === 0) return `게임 ${m / 1440}일`;
  return m % 60 === 0 ? `게임 ${m / 60}시간` : `게임 ${m}분`;
}

/**
 * 이 안내가 다루는 «코인을 주는» 설정 키(회귀가 마이그레이션의 earn 키와 대조).
 * 업적 키는 접두어로 묶여 합계로 실린다.
 */
export const COVERED_EARN_KEYS = [
  'study.attendance_reward', 'study.review_reward', 'academy.chapter_reward', 'academy.workshop_commission', 'academy.planning_reward',
  'planner.ahead_reward', 'planner.week_reward', 'tama.plan.amount', 'tama.focus.amount', 'tama.reflect.amount', 'tama.diary.amount',
  'tama.royalty.percent', 'tama.royalty.max', 'tower.star_rate', 'tower.bottle_rate', 'world.inquiry_reward', 'world.reflection_reward',
  'interview.answer_reward',
] as const;
export const COVERED_EARN_PREFIXES = ['tama.achievement.', 'tama.repeat.', 'tower.achievement.', 'isekai3d.achievement.'] as const;

export const isCoveredEarnKey = (key: string) =>
  (COVERED_EARN_KEYS as readonly string[]).includes(key) || COVERED_EARN_PREFIXES.some((p) => key.startsWith(p));
