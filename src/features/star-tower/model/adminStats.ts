/**
 * 별까지 쌓기 관리자 통계(2026-10-14) — 서버 `tower_admin_stats()` 의 모양과 화면이 쓰는 파생값.
 *
 * 집계는 서버가 한다(표가 «본인 행만»이라 화면에서 세면 관리자에게도 자기 한 줄뿐이다). 여기서는 이름 붙이기·비율만 —
 * 순수 함수라 회귀가 그대로 부른다. 관리자 계정은 서버가 이미 뺐다(재화 무한이라 층 숫자가 같은 뜻이 아니다).
 */
import { CATCHES, DEEP_CATCHES, FLOORS, RARE_CATCHES } from './catalog';
import { VISITORS } from './visitors';
import { CONSTELLATIONS, RANK_CONSTELLATIONS } from './constellations';
import { LETTERS, LETTER_KINDS } from './letters';
import { TOWER_ACHIEVEMENTS } from './achievements';
import { magnitudeLabel, magnitudeOf } from './rank';

export interface TowerAdminStats {
  generated_at: string;
  admins_excluded: number;
  players: { total: number; by_role: Record<string, number>; focused_ever: number; active_7d: number; active_today: number };
  focus: { completed: number; gave_up: number; running: number; open_stale: number; seconds: number };
  by_minutes: { minutes: number; n: number; completed: number }[];
  by_hour: number[];
  daily: { day: string; people: number; sessions: number; minutes: number }[];
  floors_hist: number[];
  /** 별자리를 «본» 높이(탑을 완성했으면 16) — 20261015 부터. 옛 응답엔 없다 */
  reach_hist?: number[];
  /** 완성한 탑 수 0~8(마지막 칸 = 그 이상 — 2026-10-23 부터 8, 종전 7) — 등성 랭크 */
  towers_hist?: number[];
  floor_built: Record<string, number>;
  first_floor: Record<string, number>;
  catches: Record<string, number>;
  caught_by: Record<string, number>;
  visitors_by: Record<string, number>;
  /** 받은 편지 수 분포 0~36(2026-10-23 부터 «편지 수». 종전 «주운 병 수» 0~12) */
  letters_hist: number[];
  /** 편지마다 받은 사람 수(2026-10-23) — 무작위가 고르게 도는지 */
  letters_by?: Record<string, number>;
  /** 남는 병(편지를 다 모은 뒤의 병) · 병 판매(2026-10-23) */
  bottles?: { spare: number; spare_people: number; sold_coins: number; sold_people: number };
  /** 업적마다 달성한 사람 · 받은 사람 · 나간 코인(2026-10-23) */
  achievements?: Record<string, { done: number; claimed: number; coins: number }>;
  list: TowerAdminPlayer[];
}

export interface TowerAdminPlayer {
  name: string;
  role: string | null;
  floors: number;
  /** 완성한 탑(등성 = 7 − towers) */
  towers?: number;
  seconds: number;
  completed: number;
  gave_up: number;
  caught: number;
  visitors: number;
  /** 받은 편지 수 · 남는 병 · 받은 업적 수(2026-10-23) */
  letters?: number;
  bottles?: number;
  achievements?: number;
  last_focus: string | null;
  joined: string;
}

/** 0~1, 끝난 집중이 없으면 null(«0%»로 보이면 «모두 그만뒀다»로 읽힌다) */
export function completionRate(completed: number, gaveUp: number): number | null {
  const n = completed + gaveUp;
  return n === 0 ? null : completed / n;
}

export function percentLabel(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** 초 → «12시간 30분» · «45분» */
export function durationLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}분`;
  return m % 60 === 0 ? `${h}시간` : `${h}시간 ${m % 60}분`;
}

/**
 * 층 수 분포(0~16 칸) → 진행 구간. 2층마다 별자리 하나라 «별자리 몇 개까지 갔나»와 같은 말이다.
 * 0층은 따로 둔다 — 게임을 열기만 하고 아직 아무것도 안 지은 사람.
 */
export const FLOOR_BANDS = [
  { label: '0층', from: 0, to: 0 },
  { label: '1~3층', from: 1, to: 3 },
  { label: '4~7층', from: 4, to: 7 },
  { label: '8~11층', from: 8, to: 11 },
  { label: '12~15층', from: 12, to: 15 },
  { label: '16층 완성', from: 16, to: 16 },
] as const;

export function floorBands(hist: number[]): { label: string; n: number }[] {
  return FLOOR_BANDS.map((b) => ({ label: b.label, n: hist.slice(b.from, b.to + 1).reduce((a, x) => a + (x ?? 0), 0) }));
}

/** 별자리마다 «그 별자리를 연 사람 수»(층 수 ≥ 문턱) */
export function constellationReach(hist: number[]): { name: string; n: number }[] {
  return CONSTELLATIONS.map((c) => ({ name: c.name, n: hist.slice(c.unlockAt).reduce((a, x) => a + (x ?? 0), 0) }));
}

/** 등성 분포 — 완성한 탑 수 칸(마지막 칸 = 그 이상)을 «7등성 · 6등성 …»으로. 0명인 칸도 남긴다 */
export function rankRows(hist: number[] | undefined): { label: string; n: number }[] {
  const h = hist ?? [];
  return h.map((n, t) => ({ label: `${magnitudeLabel(magnitudeOf(t))}${t === h.length - 1 && t > 0 ? ' 이상' : ''}`, n: n ?? 0 }));
}

/** 병 편지 몇 통까지 읽었나 — 문턱(1·6·12·18·24·30·전부)마다 «N통 이상» 누적. 편지가 36통이라 한 통씩 줄을 세우지 않는다 */
export const LETTER_THRESHOLDS = [1, 6, 12, 18, 24, 30, LETTERS.length] as const;
export function letterReach(hist: number[]): { count: number; n: number; all: boolean }[] {
  return LETTER_THRESHOLDS.map((t) => ({ count: t, all: t === LETTERS.length, n: hist.slice(t).reduce((a, x) => a + (x ?? 0), 0) }));
}

/** 편지마다 받은 사람 — 종류별로 묶어 아무도 못 받은 편지도 줄로(무작위가 고르게 도는지 본다) */
export function letterRows(by: Record<string, number> | undefined) {
  const b = by ?? {};
  return LETTER_KINDS.map((k) => {
    const rows = LETTERS.filter((l) => l.kind === k.kind).map((l) => ({ key: l.key, title: l.title, n: b[l.key] ?? 0 }));
    return { kind: k.kind, label: k.label, rows, total: rows.reduce((a, r) => a + r.n, 0) };
  });
}

/** 등성 별자리를 연 사람(완성한 탑 ≥ 문턱) — towers_hist 마지막 칸은 «그 이상» */
export function rankConstellationReach(hist: number[] | undefined): { name: string; towersAt: number; n: number }[] {
  const h = hist ?? [];
  return RANK_CONSTELLATIONS.map((c) => ({ name: c.name, towersAt: c.towersAt, n: h.slice(c.towersAt).reduce((a, x) => a + (x ?? 0), 0) }));
}

/** 업적 — 전부 줄로(달성 0명도). 달성했는데 안 받은 사람 = done − claimed */
export function achievementRows(a: TowerAdminStats['achievements']) {
  return TOWER_ACHIEVEMENTS.map((d) => {
    const x = a?.[d.id] ?? { done: 0, claimed: 0, coins: 0 };
    return { id: d.id, title: d.title, goal: d.goal, done: x.done, claimed: x.claimed, coins: x.coins, unclaimed: Math.max(0, x.done - x.claimed) };
  });
}

/**
 * 걸린 것 — 기본 일곱은 «희귀를 뺀 것 중» 실제 비율과 기대 비율(weight)을 나란히 둔다.
 * 희귀 물고기는 자격이 될 때 8% 로 기본 굴림을 «대신»하므로, 섞어서 나누면 기본 비율이 모두 조금씩 낮아 보인다.
 */
export function catchRows(catches: Record<string, number>) {
  const baseTotal = CATCHES.reduce((a, c) => a + (catches[c.key] ?? 0), 0);
  const weightTotal = CATCHES.reduce((a, c) => a + c.weight, 0);
  const base = CATCHES.map((c) => ({
    key: c.key, label: c.label, n: catches[c.key] ?? 0,
    share: baseTotal ? (catches[c.key] ?? 0) / baseTotal : null, expected: c.weight / weightTotal,
  }));
  const rare = RARE_CATCHES.map((r) => ({ key: r.key, label: r.label, hint: r.hint, n: catches[r.key] ?? 0 }));
  const rareTotal = rare.reduce((a, r) => a + r.n, 0);
  // 깊은 바다(탑 완성 수로 열림, 2026-10-23) — 희귀와 같은 표에 «탑 N개~»로
  const deep = DEEP_CATCHES.map((r) => ({ key: r.key, label: r.label, hint: `탑 ${r.towersAt}개~`, n: catches[r.key] ?? 0 }));
  return { base, baseTotal, rare, rareTotal, deep, deepTotal: deep.reduce((a, r) => a + r.n, 0) };
}

/** 층별 «지은 사람 수» — 아무도 안 지은 층까지 전부(빈 줄이 사라지면 «다 지었다»로 읽힌다) */
export function floorRows(built: Record<string, number>, first: Record<string, number>) {
  return FLOORS.map((f) => ({ key: f.key, name: f.name, n: built[f.key] ?? 0, first: first[f.key] ?? 0 }))
    .sort((a, b) => b.n - a.n || FLOORS.findIndex((x) => x.key === a.key) - FLOORS.findIndex((x) => x.key === b.key));
}

export function visitorRows(met: Record<string, number>) {
  return VISITORS.map((v) => ({ key: v.key, name: v.name, unlockAt: v.unlockAt, towersAt: v.towersAt ?? 0, n: met[v.key] ?? 0 }));
}
