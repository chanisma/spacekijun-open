/**
 * Admin «코인 경제» 판정(2026-10-21) — 화면(`components/admin/CoinEconomyAdmin.tsx`)은 그리기만 한다.
 * 회귀 = `scripts/coin-economy-test/run.mts`.
 */
import type { CoinEconomyApp, CoinEconomyDirection, CoinEconomySetting } from './coinEconomy';

export const APP_LABEL: Record<CoinEconomyApp, string> = {
  study: '자습실 · 자습 보상',
  academy: '별빛 아카데미',
  planner: '플래너',
  tamagotchi: '다마고찌',
  'star-tower': '별까지 쌓기',
  'world-today': '요즘 세상',
  interview: '면접 준비',
  isekai3d: '이세계 3D',
  ranch: '별사이 목장',
};
export const APP_ORDER: CoinEconomyApp[] = ['study', 'academy', 'planner', 'tamagotchi', 'star-tower', 'world-today', 'interview', 'isekai3d', 'ranch'];

export const DIRECTION_LABEL: Record<CoinEconomyDirection, string> = { earn: '얻기', spend: '쓰기', limit: '횟수·상한' };

export interface CoinWallet {
  user_id: string;
  name: string;
  email: string | null;
  role: 'student' | 'teacher' | 'staff' | 'admin' | string;
  grade: string | null;
  class: string | null;
  number: string | null;
  status: string | null;
  /** null = 아직 지갑이 없다(처음 쓰면 100 으로 시작) */
  coins: number | null;
  updated_at: string | null;
  /** 스스로 쓴 코인 합(낸 값 − 돌려받은 값, 회수 제외) — 서버 economy_private.spend_rows */
  spent?: number;
  /** 값이 남지 않는 출처(아카데미 상점 구매·펫 자리)를 «지금 값»으로 셌는가 */
  spent_approx?: boolean;
  last_spent?: CoinMove | null;
  /** 마지막으로 얻은 코인(사유 = kind 이름표 + note) — 서버 economy_private.earn_rows (2026-10-26) */
  last_earned?: CoinMove | null;
}

/** 코인 한 번의 들고 남 — 사유는 kind(이름표)와 note(메모, 관리자 부여는 관리자가 적은 사유) */
export interface CoinMove { at: string; amount: number; kind: string; note: string }

export const ROLE_LABEL: Record<string, string> = { student: '학생', teacher: '교사', staff: '직원', admin: '관리자' };

export type WalletRoleFilter = 'student' | 'faculty' | 'all';

export interface WalletFilter {
  role: WalletRoleFilter;
  /** 재학생만(학생일 때) */
  activeOnly: boolean;
  grade: string; // '' = 전체
  klass: string; // '' = 전체
  search: string;
  /** 지갑이 있는 사람만 */
  withWallet: boolean;
}

export const DEFAULT_WALLET_FILTER: WalletFilter = { role: 'student', activeOnly: true, grade: '', klass: '', search: '', withWallet: false };

export function filterWallets(rows: CoinWallet[], f: WalletFilter): CoinWallet[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.role === 'student' && r.role !== 'student') return false;
    if (f.role === 'faculty' && r.role === 'student') return false;
    // 학생인데 명단(resource)에 없거나 재학이 아니면 뺀다 — 졸업생·전출생·체험 계정
    if (f.activeOnly && r.role === 'student' && r.status !== 'active') return false;
    if (f.grade && r.grade !== f.grade) return false;
    if (f.klass && r.class !== f.klass) return false;
    if (f.withWallet && r.coins === null) return false;
    if (q) {
      const hay = `${r.name} ${r.email ?? ''} ${studentNumberOf(r) ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** 학반번호(10926) — 학년·반·번호가 다 있을 때만 */
export function studentNumberOf(r: Pick<CoinWallet, 'grade' | 'class' | 'number'>): string | null {
  const g = Number(r.grade), c = Number(r.class), n = Number(r.number);
  if (!Number.isInteger(g) || !Number.isInteger(c) || !Number.isInteger(n) || g < 1 || c < 1 || n < 1) return null;
  return `${g}${String(c).padStart(2, '0')}${String(n).padStart(2, '0')}`;
}

export type WalletSort = 'recent' | 'earned_recent' | 'coins_desc' | 'coins_asc' | 'spent_desc' | 'number' | 'name';

export function sortWallets(rows: CoinWallet[], sort: WalletSort): CoinWallet[] {
  const out = [...rows];
  const coins = (r: CoinWallet) => r.coins ?? -1; // 지갑 없음은 맨 끝(내림차순)
  const byName = (a: CoinWallet, b: CoinWallet) => a.name.localeCompare(b.name, 'ko');
  // 최근 변동 순(2026-10-23) — academy_user_stats.updated_at 은 코인을 바꾸는 서버 경로만 함께 갱신한다(= 마지막 코인 변동). 지갑 없음은 맨 끝
  const changed = (r: CoinWallet) => (r.updated_at ? Date.parse(r.updated_at) || 0 : -1);
  // 최근 획득 순(2026-10-26) — 얻은 적 없는 사람은 맨 끝
  const earned = (r: CoinWallet) => (r.last_earned?.at ? Date.parse(r.last_earned.at) || 0 : -1);
  if (sort === 'recent') out.sort((a, b) => changed(b) - changed(a) || byName(a, b));
  else if (sort === 'earned_recent') out.sort((a, b) => earned(b) - earned(a) || byName(a, b));
  else if (sort === 'coins_desc') out.sort((a, b) => coins(b) - coins(a) || byName(a, b));
  else if (sort === 'coins_asc') out.sort((a, b) => coins(a) - coins(b) || byName(a, b));
  else if (sort === 'spent_desc') out.sort((a, b) => (b.spent ?? 0) - (a.spent ?? 0) || coins(b) - coins(a) || byName(a, b));
  else if (sort === 'number') out.sort((a, b) => (studentNumberOf(a) ?? '~').localeCompare(studentNumberOf(b) ?? '~') || byName(a, b));
  else out.sort(byName);
  return out;
}

export const WALLET_PAGE_SIZES = [50, 100, 200] as const;

export interface Page<T> {
  /** 1부터 — 범위를 넘으면 끝 쪽으로 당긴다(거르기로 줄어든 목록에서 빈 쪽이 뜨지 않게) */
  page: number;
  pages: number;
  items: T[];
  /** 화면 표기 «from–to / total» — 비었으면 0 */
  from: number;
  to: number;
}

export function paginate<T>(rows: T[], page: number, size: number): Page<T> {
  const s = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(rows.length / s));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * s;
  return { page: p, pages, items: rows.slice(start, start + s), from: rows.length ? start + 1 : 0, to: Math.min(start + s, rows.length) };
}

/** 쪽 번호 단추 — 처음·끝·지금 주변 2칸, 사이가 비면 null(…) */
export function pageButtons(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push(null); out.push(n); });
  return out;
}

export interface WalletSummary {
  people: number;
  withWallet: number;
  total: number;
  mean: number | null;
  median: number | null;
  max: number | null;
  /** 보이는 사람이 쓴 코인 합 · 한 번이라도 쓴 사람 수 */
  spentTotal: number;
  spenders: number;
}

/** 지갑이 있는 사람만으로 센다 — 없는 사람을 0 으로 넣으면 중앙값이 거짓으로 내려간다 */
export function summarizeWallets(rows: CoinWallet[]): WalletSummary {
  const coins = rows.map((r) => r.coins).filter((c): c is number => c !== null).sort((a, b) => a - b);
  const total = coins.reduce((s, c) => s + c, 0);
  const n = coins.length;
  const median = n === 0 ? null : n % 2 ? coins[(n - 1) / 2] : Math.round((coins[n / 2 - 1] + coins[n / 2]) / 2);
  const spentTotal = rows.reduce((t, r) => t + (r.spent ?? 0), 0);
  const spenders = rows.filter((r) => (r.spent ?? 0) > 0).length;
  return { people: rows.length, withWallet: n, total, mean: n ? Math.round(total / n) : null, median, max: n ? coins[n - 1] : null, spentTotal, spenders };
}

// ── 설정 ───────────────────────────────────────────────────────────

export type SettingDraft = Record<string, string>;

/** 바뀐 값만 { key: number } 로 — 빈칸·잘못된 값은 problems 로 */
export function settingChanges(settings: CoinEconomySetting[], draft: SettingDraft): { changes: Record<string, number>; problems: Record<string, string> } {
  const changes: Record<string, number> = {};
  const problems: Record<string, string> = {};
  const next: Record<string, number> = {};
  for (const s of settings) {
    const raw = draft[s.key];
    let v = s.value;
    if (raw !== undefined) {
      const t = raw.trim();
      if (!/^-?\d+$/.test(t)) { problems[s.key] = '정수로 적어 주세요'; next[s.key] = s.value; continue; }
      v = Number(t);
      if (v < s.min_value || v > s.max_value) { problems[s.key] = `${s.min_value}~${s.max_value}`; next[s.key] = s.value; continue; }
      if (v !== s.value) changes[s.key] = v;
    }
    next[s.key] = v;
  }
  // 서버와 같은 검사: 가챠 겹침 환급 ≤ 한 번 값(어기면 뽑을수록 코인이 는다)
  for (const s of settings) {
    const m = /^tama\.gacha\.([a-z]+)\.refund$/.exec(s.key);
    if (!m) continue;
    const price = next[`tama.gacha.${m[1]}.price`];
    if (price !== undefined && next[s.key] > price && !problems[s.key]) problems[s.key] = `한 번 값(${price})보다 클 수 없어요`;
  }
  return { changes, problems };
}

/**
 * 한 칸 고치기(2026-10-21 — «가챠 가격 수정이 안 된다» 제보). 가챠 값을 겹침 환급보다 낮추면 저장이 막혔는데,
 * 이유가 다른 줄(환급) 아래에만 떠서 «수정이 안 되는» 것으로 보였다. 이제 값을 낮추면 환급을 기본 비율로 함께 낮춘다.
 */
export function applySettingEdit(settings: CoinEconomySetting[], draft: SettingDraft, key: string, raw: string): { draft: SettingDraft; adjusted: { key: string; value: number } | null } {
  const byKey = new Map(settings.map((x) => [x.key, x]));
  const next = { ...draft };
  const s = byKey.get(key);
  if (s && raw === String(s.value)) delete next[key]; else next[key] = raw;
  const m = /^tama\.gacha\.([a-z]+)\.price$/.exec(key);
  const price = Number(raw.trim());
  if (!m || !/^\d+$/.test(raw.trim())) return { draft: next, adjusted: null };
  const refundKey = `tama.gacha.${m[1]}.refund`;
  const rs = byKey.get(refundKey);
  if (!rs || !s) return { draft: next, adjusted: null };
  const refundRaw = next[refundKey] ?? String(rs.value);
  const refund = /^\d+$/.test(refundRaw.trim()) ? Number(refundRaw.trim()) : rs.value;
  if (refund <= price) return { draft: next, adjusted: null };
  const ratio = s.default_value > 0 ? rs.default_value / s.default_value : 0;
  const value = Math.min(price, Math.max(rs.min_value, Math.floor(price * ratio)));
  if (value === rs.value) delete next[refundKey]; else next[refundKey] = String(value);
  return { draft: next, adjusted: { key: refundKey, value } };
}

export interface SettingGroup {
  app: CoinEconomyApp;
  direction: CoinEconomyDirection;
  rows: CoinEconomySetting[];
}

export function groupSettings(settings: CoinEconomySetting[]): SettingGroup[] {
  const groups: SettingGroup[] = [];
  for (const app of APP_ORDER) {
    for (const direction of ['earn', 'spend', 'limit'] as CoinEconomyDirection[]) {
      const rows = settings.filter((s) => s.app === app && s.direction === direction).sort((a, b) => a.sort - b.sort);
      if (rows.length) groups.push({ app, direction, rows });
    }
  }
  // 모르는 app 이 시드에 생기면 버리지 않고 끝에 둔다
  const known = new Set(groups.flatMap((g) => g.rows.map((r) => r.key)));
  const rest = settings.filter((s) => !known.has(s.key));
  if (rest.length) groups.push({ app: rest[0].app, direction: rest[0].direction, rows: rest });
  return groups;
}

// ── 코인 기록 ──────────────────────────────────────────────────────

export interface CoinHistoryRow {
  at: string;
  delta: number;
  app: string;
  kind: string;
  note: string;
}

const KIND_LABEL: Record<string, string> = {
  seaton_attendance: '자습실 출석',
  seaton_attendance_reversal: '출석 취소 회수',
  seaton_review: '자습실 피드백',
  seaton_focus: '집중의 숲',
  puzzle_unlock: '퍼즐 조각',
  tower_star_sale: '별 조각 판매',
  tower_bottle_sale: '남는 병 판매',
  tower_achievement: '별까지 쌓기 업적',
  tama_achievement: '다마고찌 업적',
  isekai3d_coin: '이세계 3D 동전',
  isekai3d_achievement: '이세계 사회인 업적',
  ranch_shard_sale: '별사이 목장 조각 교환',
  admin_grant: '관리자 부여',
  admin_revoke: '관리자 회수',
  tama_plan: '펫: 계획 세우기',
  tama_reflect: '펫: 돌아보기',
  tama_focus: '펫: 함께 집중',
  tama_diary: '펫 일기',
  chapter: '이야기 장 완료',
  study_claim: '자습 보상 받기',
  gacha: '가챠',
  character_order: '캐릭터 의뢰',
  decor_order: '꾸미기 의뢰',
  workshop_order: '공방 의뢰',
  workshop_commission: '공방 판매 수수료',
  workshop_purchase: '공방 작품 구매',
  shop_purchase: '아카데미 상점 구매',
  pet_slot: '펫 자리 사기',
  tama_repeat: '다마고찌 반복 업적',
  planner_ahead: '미리 세운 계획 완료',
  planner_week: '플래너 한 주 꾸준함',
  world_inquiry: '요즘 세상 탐구 질문',
  world_reflection: '요즘 세상 돌아보기',
  interview_answer: '면접 준비 답',
  tama_royalty: '의뢰 작품 수익',
};

export const historyKindLabel = (kind: string): string => KIND_LABEL[kind] ?? kind;

/**
 * 표에 적을 사유 — 메모가 이름표를 되풀이하면(«자습실 출석 2026-10-26») 메모만, 다른 말이면 «이름표 · 메모».
 * 메모가 없으면 이름표.
 */
export function moveReason(m: Pick<CoinMove, 'kind' | 'note'>): string {
  const label = historyKindLabel(m.kind);
  const note = m.note.trim();
  if (!note) return label;
  return note.startsWith(label) ? note : `${label} · ${note}`;
}

// ── 경제 통계(2026-10-26) — 서버 admin_coin_economy_stats ────────────────

export interface EconomyKindRow { kind: string; amount: number; times: number; people: number; week: number | null; approx?: boolean }

export interface EconomyStats {
  start_per_wallet: number;
  wallets: number;
  /** 지금 모든 지갑에 있는 코인 합 */
  circulating: number;
  /** 지갑을 처음 만들 때 준 코인 합(지갑 수 × 시작값) */
  started: number;
  /** 활동으로 얻은 코인 합 — economy_private.earn_rows(관리자 부여·의뢰 작품 수익 포함) */
  earned: number;
  /** 스스로 쓴 코인 합 — spend_rows(환급·환불을 뺀 값) */
  spent: number;
  spent_approx: boolean;
  /** 출석 취소·관리자 회수 */
  revoked: number;
  /** 의뢰 작품 수익 합 */
  royalty: number;
  royalty_people: number;
  earn_by_kind: EconomyKindRow[];
  spend_by_kind: EconomyKindRow[];
  daily: { day: string; earned: number; spent: number }[];
  royalty_items: { id: string; name: string; slot: string; rarity: string; creator: string | null; draws: number; paid: number }[];
}

export interface EconomySummary {
  /** 발행 = 시작 지급 + 얻은 코인 */
  issued: number;
  /** 기록대로라면 지갑에 남아 있어야 할 코인 = 발행 − 사용 − 회수 */
  expected: number;
  /** 시중 − 기대값 — 원장이 생기기 전의 지급처럼 기록 밖에서 움직인 코인(+ 는 기록보다 많다) */
  unexplained: number;
  /** 발행된 코인 중 쓰인 비율(%) — 0~100 반올림, 발행이 0 이면 null */
  spendRate: number | null;
}

export function summarizeEconomy(s: Pick<EconomyStats, 'started' | 'earned' | 'spent' | 'revoked' | 'circulating'>): EconomySummary {
  const issued = s.started + s.earned;
  const expected = issued - s.spent - s.revoked;
  return { issued, expected, unexplained: s.circulating - expected, spendRate: issued > 0 ? Math.round((s.spent / issued) * 100) : null };
}
