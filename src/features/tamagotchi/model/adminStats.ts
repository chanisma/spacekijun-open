/**
 * 다마고찌 관리자 통계(2026-10-14 개선) — 서버 `tama_admin_metrics()` 의 모양과 화면이 쓰는 파생값.
 *
 * 집계는 서버가 한다(펫·일기·가챠 표가 «본인 것만»이라 화면에서 세면 관리자에게도 자기 것만 보인다). 여기서는 이름 붙이기·비율만 —
 * 순수 함수라 회귀가 그대로 부른다. ⚠️ 관리자 계정은 서버가 이미 뺐다(전부 열림·무료 뽑기라 학생과 같은 뜻이 아니다).
 */
import { BRANCH_INFO, type BranchOrBasic } from './branch';
import { STAGE_LABEL, type Stage } from './petModel';
import { DIARY_KINDS } from './credit';
import { GACHA_MACHINES } from './gachaMachines';

export interface TamaAdminStats {
  generated_at?: string;
  admins_excluded?: number;
  owners: Record<string, number>;
  pets: number;
  resting?: number;
  sick_now?: number;
  active_7d?: number;
  active_today?: number;
  students_cared_3days: number;
  care_days_hist?: { d1: number; d2: number; d3_6: number; d7_13: number; d14: number; never: number };
  stages?: Record<Stage, number>;
  branches?: Record<string, number>;
  daily: { day: string; owners: number; adopted?: number }[];
  habits: { n: number; plan_before: number; plan_after: number; reflect_before: number; reflect_after: number; plan_up: number; reflect_up: number };
  economy: {
    credits_30d: Record<string, number>;
    gacha_pulls_30d: number;
    gacha_30d?: { by_machine: Record<string, number>; spent: number; refunded: number; new_items: number; pity: number; people: number };
    trades_accepted_30d: number;
    diary_30d: number;
    diary_kinds_30d?: Record<string, number>;
    focus_30d?: Record<string, number>;
    debt?: { people: number; coins: number };
    bought_slots?: number;
    characters: Record<string, number>;
    decor?: Record<string, number>;
  };
  social?: { trades: Record<string, number>; visits: number; visitors: number; push_people: number };
  top_items?: { id: string; name: string; slot: string; rarity: string; people: number }[];
  list?: TamaAdminPerson[];
}

export interface TamaAdminPerson {
  name: string;
  role: string | null;
  pets: number;
  pet: { name: string; stage: string; branch: string | null; sick: boolean } | null;
  care_days: number;
  last_care: string | null;
  first_pet: string | null;
  diary: number;
  gacha: number;
  items: number;
  coins: number | null;
}

/** 돌본 날 수 → 다시 온 사람. «한 번 열고 끝»(1일)과 «다시 왔다»(2일 이상)를 가른다 */
export const CARE_BANDS = [
  { key: 'd1', label: '1일' }, { key: 'd2', label: '2일' }, { key: 'd3_6', label: '3~6일' },
  { key: 'd7_13', label: '7~13일' }, { key: 'd14', label: '14일 이상' },
] as const;

export function careBands(h: TamaAdminStats['care_days_hist']) {
  return CARE_BANDS.map((b) => ({ label: b.label, n: h?.[b.key] ?? 0 }));
}

/** 다시 온 비율 = 2일 이상 / 하루라도 돌본 사람. 아무도 없으면 null */
export function returnRate(h: TamaAdminStats['care_days_hist']): number | null {
  if (!h) return null;
  const any = h.d1 + h.d2 + h.d3_6 + h.d7_13 + h.d14;
  return any === 0 ? null : (any - h.d1) / any;
}

const STAGE_ORDER: Stage[] = ['egg', 'baby', 'child', 'teen', 'adult'];

/** 단계 깔때기(그 단계 «이상»인 펫) — 맨 앞은 알을 받은 펫 전부 */
export function stageFunnel(stages: TamaAdminStats['stages']) {
  return STAGE_ORDER.map((s) => ({ stage: s, label: s === 'egg' ? '알을 받음' : `${STAGE_LABEL[s]}까지`, n: stages?.[s] ?? 0 }));
}

/** 어른 모습 — 기본 + 가지 넷, 아무도 없는 가지도 줄로 */
export function branchRows(branches: TamaAdminStats['branches']) {
  return (['basic', 'planner', 'thinker', 'focus', 'heart'] as BranchOrBasic[]).map((b) => ({
    key: b, name: BRANCH_INFO[b].name, habit: BRANCH_INFO[b].habit || '습관이 적을 때', n: branches?.[b] ?? 0,
  }));
}

export function diaryRows(kinds: Record<string, number> | undefined) {
  return DIARY_KINDS.map((d) => ({ key: d.kind, label: d.label, n: kinds?.[d.kind] ?? 0 }));
}

export function machineRows(byMachine: Record<string, number> | undefined) {
  return GACHA_MACHINES.map((m) => ({ id: m.id, name: m.name, n: byMachine?.[m.id] ?? 0 }));
}

/** 함께 집중 — 끝까지 채움 / (채움 + 그만둠 + 시간 지남). 열린 것은 아직 모른다 */
export function focusRate(f: Record<string, number> | undefined): number | null {
  if (!f) return null;
  const done = (f.completed ?? 0) + (f.gave_up ?? 0) + (f.expired ?? 0);
  return done === 0 ? null : (f.completed ?? 0) / done;
}

export function percentLabel(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function stageLabel(stage: string | null | undefined, branch?: string | null): string {
  if (!stage || !(stage in STAGE_LABEL)) return '—';
  if (stage === 'adult' && branch && branch !== 'basic' && branch in BRANCH_INFO) return BRANCH_INFO[branch as BranchOrBasic].name;
  return STAGE_LABEL[stage as Stage];
}
