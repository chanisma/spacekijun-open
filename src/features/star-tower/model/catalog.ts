/**
 * 별까지 쌓기 — 낚이는 것 · 자원 · 층 · 값 (docs/features/star-tower.md)
 *
 * ⚠️ 판정의 정본은 서버(`supabase/migrations/*_star_tower.sql` 의 `tower_private.*`)다. 이 파일은 화면이
 * 미리 보여 주려고 같은 숫자를 한 벌 더 들고 있을 뿐이다 — 숫자를 바꾸면 SQL 도 함께 고칠 것.
 * 회귀(`scripts/star-tower-test/run.mts`)가 SQL 의 값과 이 파일의 값을 대조한다(어긋나도 빌드는 통과한다).
 */

export type Resource = 'fish' | 'wood' | 'scrap' | 'bottle' | 'star';
export type Inventory = Record<Resource, number>;

export const RESOURCES: { key: Resource; label: string; icon: string }[] = [
  { key: 'fish', label: '물고기', icon: 'fish-sardine' },
  { key: 'wood', label: '나무', icon: 'wood' },
  { key: 'scrap', label: '고철', icon: 'scrap' },
  { key: 'star', label: '별 조각', icon: 'star' },
  { key: 'bottle', label: '병 편지', icon: 'bottle' },
];

export const EMPTY_INVENTORY: Inventory = { fish: 0, wood: 0, scrap: 0, bottle: 0, star: 0 };

/** 한 번 «걸리는» 것. weight 는 100 을 나눠 갖는다(서버 `tower_private.catch_of` 와 같은 순서·같은 값). */
export interface CatchKind {
  key: string;
  label: string;
  icon: string;
  weight: number;
  gives: Partial<Inventory>;
  rare?: boolean;
}

export const CATCHES: CatchKind[] = [
  { key: 'sardine', label: '정어리', icon: 'fish-sardine', weight: 30, gives: { fish: 1 } },
  { key: 'mackerel', label: '고등어', icon: 'fish-mackerel', weight: 18, gives: { fish: 2 } },
  { key: 'flounder', label: '가자미', icon: 'fish-flounder', weight: 10, gives: { fish: 3 } },
  { key: 'driftwood', label: '떠내려온 나무', icon: 'wood', weight: 22, gives: { wood: 2 } },
  { key: 'gear', label: '녹슨 톱니', icon: 'scrap', weight: 12, gives: { scrap: 1 } },
  { key: 'bottle', label: '병 편지', icon: 'bottle', weight: 5, gives: { bottle: 1 }, rare: true },
  { key: 'starfish', label: '별빛 물고기', icon: 'fish-star', weight: 3, gives: { fish: 2, star: 1 }, rare: true },
];

/**
 * 희귀 물고기(물고기 도감) — 굴림의 «그 순간»의 한국 시각·날씨·달이 조건에 맞으면 8% 로 걸린다(서버 tower_private.rare_*).
 * 둘 이상 맞으면 시드로 하나. 경제는 거의 그대로(물고기 3) — 값어치는 «도감 한 칸»이다.
 */
export type RareCond = 'night' | 'dusk' | 'dawn' | 'rain' | 'spring' | 'summer' | 'autumn' | 'winter';
export interface RareCatch extends CatchKind { cond: RareCond; hint: string }
export const RARE_CHANCE = 8;
export const RARE_CATCHES: RareCatch[] = [
  { key: 'moon', label: '달빛 은어', icon: 'fish-moon', weight: 0, gives: { fish: 3 }, rare: true, cond: 'night', hint: '밤 8시 ~ 새벽 4시' },
  { key: 'koi', label: '노을 잉어', icon: 'fish-koi', weight: 0, gives: { fish: 3 }, rare: true, cond: 'dusk', hint: '저녁 5시 ~ 8시' },
  { key: 'dawn', label: '새벽 송어', icon: 'fish-dawn', weight: 0, gives: { fish: 3 }, rare: true, cond: 'dawn', hint: '새벽 5시 ~ 8시' },
  { key: 'eel', label: '비 장어', icon: 'fish-eel', weight: 0, gives: { fish: 3 }, rare: true, cond: 'rain', hint: '비 오는 날' },
  { key: 'blossom', label: '벚꽃 송사리', icon: 'fish-blossom', weight: 0, gives: { fish: 3 }, rare: true, cond: 'spring', hint: '봄(3~5월)' },
  { key: 'flying', label: '여름 날치', icon: 'fish-flying', weight: 0, gives: { fish: 3 }, rare: true, cond: 'summer', hint: '여름(6~8월)' },
  { key: 'maple', label: '단풍 쏘가리', icon: 'fish-maple', weight: 0, gives: { fish: 3 }, rare: true, cond: 'autumn', hint: '가을(9~11월)' },
  { key: 'ice', label: '얼음 빙어', icon: 'fish-ice', weight: 0, gives: { fish: 3 }, rare: true, cond: 'winter', hint: '겨울(12~2월)' },
];

/**
 * 깊은 바다 물고기(2026-10-23 사용자 요청 «등성으로 길어진 플레이에 맞게 도감을 조금씩 더») — **탑을 완성할수록** 걸린다.
 * 굴림마다 완성한 탑이 towersAt 이상인 것 중에서 5% 로(희귀 물고기보다 먼저 본다 — 서버 tower_private.deep_roll).
 * 둘 이상 자격이면 시드로 하나. ⚠️ key·towersAt·확률은 SQL deep_table/deep_roll 과 두 벌(회귀가 대조).
 */
export interface DeepCatch extends CatchKind { towersAt: number; hint: string }
export const DEEP_CHANCE = 5;
export const DEEP_CATCHES: DeepCatch[] = [
  { key: 'seahorse', label: '별 해마', icon: 'fish-seahorse', weight: 0, gives: { fish: 4 }, rare: true, towersAt: 1, hint: '탑 1개를 완성하면 깊은 바다에서' },
  { key: 'angler', label: '등불 아귀', icon: 'fish-angler', weight: 0, gives: { fish: 4 }, rare: true, towersAt: 2, hint: '탑 2개를 완성하면 깊은 바다에서' },
  { key: 'manta', label: '은하 가오리', icon: 'fish-manta', weight: 0, gives: { fish: 4 }, rare: true, towersAt: 4, hint: '탑 4개를 완성하면 깊은 바다에서' },
  { key: 'marlin', label: '혜성 청새치', icon: 'fish-marlin', weight: 0, gives: { fish: 4 }, rare: true, towersAt: 6, hint: '탑 6개를 완성하면 깊은 바다에서' },
];

/** 도감 «낚시»의 모든 칸 — 기본 · 희귀 · 깊은 바다 */
export const ALL_CATCHES: CatchKind[] = [...CATCHES, ...RARE_CATCHES, ...DEEP_CATCHES];

export const CATCH_BY_KEY: Record<string, CatchKind> = Object.fromEntries(ALL_CATCHES.map((c) => [c.key, c]));

/** 희귀 물고기 조건 — 서버 tower_private.rare_ok 와 같은 규칙(한국 시각) */
export function rareCondOk(cond: RareCond, hourKst: number, monthKst: number, raining: boolean): boolean {
  switch (cond) {
    case 'night': return hourKst >= 20 || hourKst < 4;
    case 'dusk': return hourKst >= 17 && hourKst < 20;
    case 'dawn': return hourKst >= 5 && hourKst < 8;
    case 'rain': return raining;
    case 'spring': return monthKst >= 3 && monthKst <= 5;
    case 'summer': return monthKst >= 6 && monthKst <= 8;
    case 'autumn': return monthKst >= 9 && monthKst <= 11;
    case 'winter': return monthKst === 12 || monthKst <= 2;
  }
}

/** 집중 길이(분). 5분마다 한 번 걸린다. 끝까지 채우면 한 번 더 + 별 조각(15분마다 하나 — completionStars). */
export const FOCUS_MINUTES = [15, 25, 45, 60] as const;
export type FocusMinutes = (typeof FOCUS_MINUTES)[number];
export const ROLL_SECONDS = 300;
export const COMPLETION_BONUS: Partial<Inventory> = { star: 1 };

/**
 * 끝까지 채웠을 때 받는 별 조각 — 15분마다 하나, 반올림(15분 1 · 25분 2 · 45분 3 · 60분 4). 2026-11-06 사용자 «집중 시간에 비례».
 * ⚠️ 서버 tower_private.close_focus 의 `greatest(1, round(planned_seconds / 900.0))` 와 두 벌(회귀가 대조).
 */
export function completionStars(minutes: number): number {
  return Math.max(1, Math.round(minutes / 15));
}

/** 끝까지 채웠을 때 걸리는 횟수(보너스 한 번 포함) */
export function rollsForCompleted(minutes: number): number {
  return Math.floor((minutes * 60) / ROLL_SECONDS) + 1;
}

/** 중간에 그만뒀을 때 — 그때까지 다 찬 5분 칸만 */
export function rollsForElapsed(elapsedSeconds: number, plannedSeconds: number): number {
  return Math.floor(Math.max(0, Math.min(elapsedSeconds, plannedSeconds)) / ROLL_SECONDS);
}

/**
 * 교환 — 뗏목(처음부터) · 비공정 상인(구름층 7층부터, model/visitors.ts MERCHANT_AT).
 * 상인이 후반 병목(고철·나무)을 풀어 준다 — 별 조각은 기댓값상 남는다(55번 집중에 약 66개 · 필요 24개).
 */
export interface TradeDef {
  label: string;
  give: Partial<Inventory>;
  get: Partial<Inventory>;
  who: 'raft' | 'merchant';
}
export const TRADES = {
  wood: { label: '나무 1', give: { fish: 3 }, get: { wood: 1 }, who: 'raft' },
  scrap: { label: '고철 1', give: { fish: 5 }, get: { scrap: 1 }, who: 'raft' },
  merchant_scrap: { label: '고철 1', give: { fish: 4 }, get: { scrap: 1 }, who: 'merchant' },
  star_bundle: { label: '나무 4 · 고철 2', give: { star: 1 }, get: { wood: 4, scrap: 2 }, who: 'merchant' },
} satisfies Record<string, TradeDef>;
export type TradeKind = keyof typeof TRADES;

/**
 * 별 조각 → 코인(통합 지갑 = 아카데미·다마고찌가 함께 쓰는 코인, 2026-10-14 사용자 결정).
 * 반대 방향은 없다. 비공정 상인(7층)에서만 · 하루 상한은 «받은 코인» 기준(한국 날짜).
 * ⚠️ 서버 `tower_private.star_coin_rule()` 과 같은 값이어야 한다 — 회귀가 대조한다.
 */
/** rate·dailyCap 은 관리자 코인 설정(`tower.star_rate` · `tower.star_daily_cap`)이 그 자리에서 바꾼다(model/economySync) */
export const STAR_COIN: { rate: number; dailyCap: number; readonly minFloors: 7 } = { rate: 2, dailyCap: 10, minFloors: 7 };

/** 지금 몇 개까지 팔 수 있나 — 가진 별 · 오늘 남은 상한 · 한 번에 50 중 가장 작은 것 */
export function starSaleMax(stars: number, coinsToday: number): number {
  const left = Math.max(0, STAR_COIN.dailyCap - coinsToday);
  return Math.max(0, Math.min(50, stars, Math.floor(left / STAR_COIN.rate)));
}

/**
 * 남는 병 → 코인(2026-10-23 사용자 요청 «병 편지를 다 모았다면 추가로 모이는 병은 비공정 상인과 코인으로 교환»).
 * 편지를 다 모은 뒤에 걸린 병만 «남는 병»(inventory.bottle)이 된다 — 그전의 병은 걸리는 즉시 편지가 된다.
 * 별 조각과 같은 상인·같은 층(7층)이지만 하루 상한은 따로 센다(원장 종류 'tower_bottle_sale').
 * rate·dailyCap 은 관리자 코인 설정(`tower.bottle_rate` · `tower.bottle_daily_cap`)이 바꾼다(model/economySync). 기본값 = 시드(회귀가 대조).
 * 상한 20 → 25(2026-10-27) — 20 이면 하루 4병이라 상인의 «5개» 버튼이 늘 꺼져 있었다.
 */
export const BOTTLE_COIN: { rate: number; dailyCap: number; readonly minFloors: 7 } = { rate: 5, dailyCap: 25, minFloors: 7 };

/** 남는 병을 몇 개까지 팔 수 있나 — 가진 병 · 오늘 남은 상한 · 한 번에 50 */
export function bottleSaleMax(bottles: number, coinsToday: number): number {
  const left = Math.max(0, BOTTLE_COIN.dailyCap - coinsToday);
  return Math.max(0, Math.min(50, bottles, Math.floor(left / BOTTLE_COIN.rate)));
}

/** 지금 가진 것으로 몇 번까지 바꿀 수 있나(최대 50 — 서버와 같다) */
export function maxTrades(inv: Inventory, kind: TradeKind): number {
  const give = TRADES[kind].give as Partial<Inventory>;
  let n = 50;
  for (const k of Object.keys(give) as Resource[]) n = Math.min(n, Math.floor((inv[k] ?? 0) / (give[k] ?? 1)));
  return n;
}

/** 쌓을 수 있는 층. 맨 아래(낚시 갑판)와 맨 위(관측 돔)는 늘 있고, 그 사이에 쌓는다. */
export interface FloorDef {
  key: string;
  name: string;
  blurb: string;
  base: { wood: number; scrap: number; fish: number };
}

export const BASE_FLOOR = 'base';
export const ROOF_FLOOR = 'observatory';

export const FLOORS: FloorDef[] = [
  { key: 'cabin', name: '오두막', blurb: '처음 지은 방. 둥근 문 위에 문패를 걸었다.', base: { wood: 4, scrap: 0, fish: 0 } },
  { key: 'kitchen', name: '부엌', blurb: '양철 굴뚝에서 생선 굽는 냄새가 난다.', base: { wood: 3, scrap: 1, fish: 2 } },
  { key: 'library', name: '서재', blurb: '둥근 창 너머로 젖지 않은 책들이 보인다.', base: { wood: 3, scrap: 1, fish: 0 } },
  { key: 'garden', name: '정원 발코니', blurb: '해먹과 빨래줄. 화분에서 귤이 열렸다.', base: { wood: 4, scrap: 0, fish: 2 } },
  { key: 'workshop', name: '작업실', blurb: '톱밥 냄새. 다음 층을 여기서 다듬는다.', base: { wood: 3, scrap: 2, fish: 0 } },
  { key: 'bedroom', name: '침실', blurb: '조각 이불을 덮은 이층 침대.', base: { wood: 4, scrap: 0, fish: 1 } },
  { key: 'greenhouse', name: '온실', blurb: '유리 너머로 토마토 덩굴이 자란다.', base: { wood: 2, scrap: 2, fish: 0 } },
  { key: 'radio', name: '무전실', blurb: '가끔 먼 곳에서 누군가의 목소리가 들린다.', base: { wood: 2, scrap: 3, fish: 0 } },
  { key: 'smokehouse', name: '훈제실', blurb: '줄줄이 걸린 훈제 생선. 겨울 준비.', base: { wood: 3, scrap: 0, fish: 4 } },
  { key: 'tearoom', name: '찻방', blurb: '종이 등불 아래 찻주전자가 김을 낸다.', base: { wood: 3, scrap: 1, fish: 1 } },
  { key: 'music', name: '음악실', blurb: '축음기가 물결 소리에 맞춰 돈다.', base: { wood: 3, scrap: 2, fish: 0 } },
  { key: 'maproom', name: '지도실', blurb: '물에 잠기기 전의 해안선이 그려져 있다.', base: { wood: 3, scrap: 1, fish: 1 } },
  { key: 'aquarium', name: '수조실', blurb: '낚았다가 차마 못 먹은 친구들.', base: { wood: 2, scrap: 2, fish: 3 } },
  { key: 'bathhouse', name: '목욕탕', blurb: '구리 욕조. 동그란 창으로 김이 샌다.', base: { wood: 2, scrap: 3, fish: 0 } },
  { key: 'bell', name: '종탑', blurb: '바람이 불면 종이 혼자 운다.', base: { wood: 3, scrap: 3, fish: 0 } },
  { key: 'study', name: '별지기 연구실', blurb: '칠판 가득 별자리 선. 돔이 바로 위다.', base: { wood: 3, scrap: 2, fish: 1 } },
];

export const FLOOR_BY_KEY: Record<string, FloorDef> = Object.fromEntries(FLOORS.map((f) => [f.key, f]));

/**
 * 쌓을수록 비싸진다: ceil(base × (1 + 0.3 × 쌓은 수)). 별 조각은 4층마다 하나씩 더(«몇 번째 층인가»에 걸린다).
 * ⚠️ 정수로만 계산한다 — `Math.ceil(base * (1 + 0.3 * n))` 은 12.000…2 를 13 으로 올려 서버(numeric)와 조용히 어긋난다.
 */
export function scaledCost(base: number, builtCount: number): number {
  return Math.floor((base * (10 + 3 * builtCount) + 9) / 10);
}

export function floorCost(key: string, builtCount: number): Inventory {
  const f = FLOOR_BY_KEY[key];
  if (!f) throw new Error(`모르는 층: ${key}`);
  return {
    wood: scaledCost(f.base.wood, builtCount),
    scrap: scaledCost(f.base.scrap, builtCount),
    fish: scaledCost(f.base.fish, builtCount),
    star: Math.floor(builtCount / 4),
    bottle: 0,
  };
}

export function canAfford(inv: Inventory, cost: Partial<Inventory>): boolean {
  return (Object.keys(cost) as Resource[]).every((k) => (inv[k] ?? 0) >= (cost[k] ?? 0));
}

/** 자원 합치기(빼기는 음수) — 화면의 낙관적 갱신·미리보기용 */
export function addInventory(a: Inventory, b: Partial<Inventory>, sign = 1): Inventory {
  const out = { ...a };
  for (const k of Object.keys(b) as Resource[]) out[k] = (out[k] ?? 0) + sign * (b[k] ?? 0);
  return out;
}
