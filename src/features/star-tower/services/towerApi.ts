/**
 * 별까지 쌓기 — 서버 RPC(`tower_*`) 와 그 응답 모양. 화면은 `TowerApi` 만 안다(브라우저 확인 하네스는 모의 구현을 꽂는다).
 */
import { supabase } from '@/integrations/supabase/client';
import { EMPTY_INVENTORY, type Inventory, type TradeKind } from '../model/catalog';
import type { PastTower } from '../model/rank';
import { parseRanking, type RankingData } from '../model/ranking';
import { parseTowerAchievements, type TowerAchievementsData } from '../model/achievements';

export interface OpenFocus {
  id: string;
  plannedSeconds: number;
  /** 서버 시각 ms */
  startedAt: number;
}

export interface TowerSnapshot {
  inventory: Inventory;
  floors: string[];
  /** 완성한 탑의 수 — 등성 랭크의 정본(등성 = 7 − towers, model/rank.ts). 16층째를 지은 순간 오른다 */
  towers: number;
  /** 새 탑을 쌓으며 물러난 지난 탑들(수평선 실루엣) */
  pastTowers: PastTower[];
  /** 처음 만난(누른) 하늘의 방문자 */
  visitors: string[];
  /** 한 번이라도 걸린 것(물고기 도감) */
  caught: string[];
  /** 받은 병 편지 key(받은 순서 — 무작위로 온다, 2026-10-23). inventory.bottle 은 «남는 병»(편지를 다 모은 뒤의 병) */
  letters: string[];
  /** 관리자 — 재화 무한(테스트용). 서버가 9999 로 보여 주고 짓기·교환에서 빼지 않는다(저장값은 그대로) */
  unlimited: boolean;
  focusSeconds: number;
  sessions: number;
  focus: OpenFocus | null;
  /** 통합 지갑 코인(아카데미·다마고찌와 같은 지갑). 서버가 안 주면 null */
  coins: number | null;
  /** 오늘(한국 날짜) 별 조각을 팔아 받은 코인 — 하루 상한(STAR_COIN.dailyCap)에 대 본다 */
  starCoinsToday: number;
  /** 오늘 남는 병을 팔아 받은 코인 — 하루 상한(BOTTLE_COIN.dailyCap)에 대 본다 */
  bottleCoinsToday: number;
  /** 응답 시점의 서버 시각 ms — 화면 시계를 서버에 맞추는 데 쓴다 */
  serverNow: number;
}

export type FinishOutcome = 'completed' | 'gave_up' | 'running' | 'replaced';

export interface FinishResult {
  outcome: FinishOutcome;
  catches: string[];
  remaining: number | null;
  bonusStar: boolean;
  /** 완주 별 조각 개수(2026-11-06 — 집중 시간 비례). 옛 서버면 bonusStar 일 때 1 */
  bonusStars: number;
  /** 이번에 새로 받은 병 편지 key — 병이 걸렸는데 비었으면 «남는 병»이 된 것 */
  letters: string[];
  state: TowerSnapshot | null;
}

export interface TowerApi {
  read(): Promise<TowerSnapshot>;
  start(minutes: number): Promise<TowerSnapshot>;
  finish(id: string, giveUp: boolean): Promise<FinishResult>;
  trade(kind: TradeKind, times: number): Promise<TowerSnapshot>;
  build(key: string): Promise<TowerSnapshot>;
  meet(key: string): Promise<TowerSnapshot>;
  /** 층 순서 바꾸기(아래 → 위, 지금 층들의 다른 순서만) */
  reorder(floors: string[]): Promise<TowerSnapshot>;
  /** 비공정 상인에게 별 조각을 코인으로 판다(받은 코인 = coinsGot) */
  sellStars(times: number): Promise<TowerSnapshot & { coinsGot: number }>;
  /** 비공정 상인에게 남는 병(편지를 다 모은 뒤의 병)을 코인으로 판다 */
  sellBottles(times: number): Promise<TowerSnapshot & { coinsGot: number }>;
  /** 업적 — 진행도·받은 것·보상(서버가 센다) */
  achievements(): Promise<TowerAchievementsData>;
  /** 업적 코인 받기(업적마다 한 번 — 서버가 다시 센다) */
  claimAchievement(id: string): Promise<{ granted: boolean; amount: number }>;
  /** 다 지은 탑을 수평선으로 물리고 1층부터 새 탑(재료·도감·편지는 그대로) */
  newTower(): Promise<TowerSnapshot>;
  /** 학교 전체 «별을 쌓은 사람들» 순위(20위 + 내 자리) — 관리자는 빠진다 */
  ranking(): Promise<RankingData>;
}

type Json = Record<string, unknown>;

export function parseSnapshot(raw: unknown): TowerSnapshot {
  const j = (raw ?? {}) as Json;
  const inv = (j.inventory ?? {}) as Json;
  const f = j.focus as Json | null | undefined;
  return {
    inventory: {
      ...EMPTY_INVENTORY,
      fish: Number(inv.fish ?? 0), wood: Number(inv.wood ?? 0), scrap: Number(inv.scrap ?? 0),
      bottle: Number(inv.bottle ?? 0), star: Number(inv.star ?? 0),
    },
    floors: Array.isArray(j.floors) ? (j.floors as unknown[]).map(String) : [],
    towers: Number(j.towers ?? 0),
    pastTowers: Array.isArray(j.past_towers)
      ? (j.past_towers as Json[]).map((p) => ({
        floors: Array.isArray(p?.floors) ? (p.floors as unknown[]).map(String) : [],
        doneAt: p?.done_at ? String(p.done_at) : null,
      }))
      : [],
    visitors: Array.isArray(j.visitors) ? (j.visitors as unknown[]).map(String) : [],
    unlimited: j.unlimited === true,
    caught: Array.isArray(j.caught) ? (j.caught as unknown[]).map(String) : [],
    letters: Array.isArray(j.letters) ? (j.letters as unknown[]).map(String) : [],
    focusSeconds: Number(j.focus_seconds ?? 0),
    sessions: Number(j.sessions ?? 0),
    focus: f && f.id ? { id: String(f.id), plannedSeconds: Number(f.planned_seconds), startedAt: Date.parse(String(f.started_at)) } : null,
    coins: j.coins == null ? null : Number(j.coins),
    starCoinsToday: Number(j.star_coins_today ?? 0),
    bottleCoinsToday: Number(j.bottle_coins_today ?? 0),
    serverNow: Number(j.server_now ?? Date.now()),
  };
}

export function parseFinish(raw: unknown): FinishResult {
  const j = (raw ?? {}) as Json;
  return {
    outcome: String(j.outcome ?? 'running') as FinishOutcome,
    catches: Array.isArray(j.catches) ? (j.catches as unknown[]).map(String) : [],
    remaining: j.remaining == null ? null : Number(j.remaining),
    bonusStar: j.bonus_star === true,
    bonusStars: typeof j.bonus_stars === 'number' ? j.bonus_stars : j.bonus_star === true ? 1 : 0,
    letters: Array.isArray(j.letters) ? (j.letters as unknown[]).map(String) : [],
    state: j.state ? parseSnapshot(j.state) : null,
  };
}

async function call(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export const serverTowerApi: TowerApi = {
  read: async () => parseSnapshot(await call('tower_read')),
  start: async (minutes) => parseSnapshot(await call('tower_focus_start', { p_minutes: minutes })),
  finish: async (id, giveUp) => parseFinish(await call('tower_focus_finish', { p_id: id, p_give_up: giveUp })),
  trade: async (kind, times) => parseSnapshot(await call('tower_trade', { p_kind: kind, p_times: times })),
  build: async (key) => parseSnapshot(await call('tower_build', { p_floor: key })),
  meet: async (key) => parseSnapshot(await call('tower_meet', { p_key: key })),
  reorder: async (floors) => parseSnapshot(await call('tower_reorder', { p_floors: floors })),
  sellStars: async (times) => {
    const raw = await call('tower_sell_stars', { p_times: times });
    return { ...parseSnapshot(raw), coinsGot: Number((raw as Json | null)?.coins_got ?? 0) };
  },
  sellBottles: async (times) => {
    const raw = await call('tower_sell_bottles', { p_times: times });
    return { ...parseSnapshot(raw), coinsGot: Number((raw as Json | null)?.coins_got ?? 0) };
  },
  achievements: async () => parseTowerAchievements(await call('tower_achievements')),
  claimAchievement: async (id) => {
    const raw = (await call('tower_achievement_claim', { p_id: id })) as Json | null;
    return { granted: raw?.granted === true, amount: Number(raw?.amount ?? 0) };
  },
  newTower: async () => parseSnapshot(await call('tower_new_tower')),
  ranking: async () => parseRanking(await call('tower_ranking')),
};
