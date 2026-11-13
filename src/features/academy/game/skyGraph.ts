import type { DormGoal, SkyPlan } from './dormitoryService';

/**
 * 창가의 하늘 — **노력의 지식그래프** (2026-10-02 개편, 2026-10-03 연결 규칙 정리).
 *
 * 망원경의 지식그래프가 탐구 방향을 연구하는 도구라면, 이 하늘은 학생의 **노력**을 그린다.
 * 하늘은 하나다. 장기 목표가 가장 큰 별, 단기 목표가 큰 별, 계획이 작은 별이고, 실천을 남기면 별이 켜지며
 * 같은 계획을 되풀이하면 더 밝아진다.
 *
 * **선은 구조만 긋는다 (2026-10-03 사용자 결정)**: 계획 → 그 계획의 목표(`belongs`), 단기 목표 → 묶인 장기 목표(`part`).
 * 종전엔 제목을 임베딩해 뜻이 비슷한 별끼리도 이었는데(`kin`) «의미가 없어 보인다» — 학생이 직접 정한 연결(어느 목표의
 * 계획인가)이 아니라 글자·벡터의 우연이 별무리를 만들었다. 임베딩 호출·글자 겹침 대역·«비슷한 뜻 잇기» 단추를 함께 걷었다.
 *
 * 이 파일은 그래프의 **모양**만 정한다(노드·엣지·크기·색). 물리는 `useSkySimulation`, 그리기는 `GameSky` 가 맡는다.
 */
export type SkyNodeKind = 'goal' | 'plan';
export interface SkyNode {
  /** `goal:<id>` / `plan:<id>` — 같은 uuid 가 두 표에 있어도 섞이지 않는다. */
  id: string;
  kind: SkyNodeKind;
  ref: string;
  title: string;
  /** 계획 → 소속 목표 id, 목표 → 자기 id. 목표 없는 자유 계획은 null. */
  goalId: string | null;
  goalTitle: string | null;
  /** 목표의 층(계획은 'short' 로 둔다 — 쓰지 않는다). */
  horizon: 'long' | 'short';
  /** 단기 목표가 묶인 장기 목표 id. */
  parentGoalId: string | null;
  /** 실천이 한 번이라도 있는가(목표는 켜진 계획이 하나라도 있는가). */
  lit: boolean;
  practiceCount: number;
  /** 1 + log2(실천 횟수). 0 = 아직 켜지지 않음. */
  brightness: number;
  radius: number;
  hue: number;
  priority: 'high' | 'medium' | 'low';
  archived: boolean;
  completed: boolean;
  constellationName: string | null;
}
export interface SkyEdge {
  id: string;
  source: string;
  target: string;
  /** belongs = 계획 → 목표, part = 단기 목표 → 장기 목표. 둘 다 학생이 정한 구조다. */
  kind: 'belongs' | 'part';
  weight: number;
}
export interface SkyFilter { showArchived: boolean; showUnlit: boolean }
export const DEFAULT_SKY_FILTER: SkyFilter = { showArchived: false, showUnlit: true };

export const starBrightness = (count: number) => (count > 0 ? 1 + Math.log2(count) : 0);
const clampPriority = (value: string | null | undefined): SkyNode['priority'] => (value === 'high' || value === 'low' ? value : 'medium');
const horizonOf = (goal: DormGoal) => (goal.horizon === 'long' ? 'long' : 'short') as 'long' | 'short';

/** 목표마다 결정적인 색상(0~360). 같은 목표의 별은 같은 색이다. */
export function hueOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
}

/**
 * 목표·계획 → 노드. 반지름은 밝기로, 색은 **갈래**(장기 목표가 있으면 그 장기 목표, 없으면 자기 목표)로 정한다 —
 * 한 장기 목표 아래의 단기 목표·계획은 한 색이라 하늘에서 한 무리로 읽힌다.
 * 장기 목표의 밝기 = 자기에게 바로 묶인 계획 + 단기 목표들의 계획.
 * 보관한 것과 아직 안 켜진 별은 필터로 뺀다(빼도 **다른 노드의 자리는 흔들리지 않게** 호출자가 시뮬레이션을 이어 간다).
 */
export function buildSkyNodes(goals: DormGoal[], plans: SkyPlan[], filter: SkyFilter = DEFAULT_SKY_FILTER): SkyNode[] {
  const goalById = new Map(goals.map(g => [g.id, g]));
  const longParent = (g: DormGoal | undefined) => { const p = g && horizonOf(g) === 'short' && g.parent_goal_id ? goalById.get(g.parent_goal_id) : undefined; return p && horizonOf(p) === 'long' ? p : undefined; };
  const branchId = (g: DormGoal) => longParent(g)?.id ?? g.id;
  const litPlansOf = new Map<string, number>();
  const practiceOf = new Map<string, number>();
  const add = (id: string, count: number) => { practiceOf.set(id, (practiceOf.get(id) ?? 0) + count); if (count > 0) litPlansOf.set(id, (litPlansOf.get(id) ?? 0) + 1); };
  for (const p of plans) {
    if (!p.goal_id || p.is_archived) continue;
    add(p.goal_id, p.practice_count);
    const parent = longParent(goalById.get(p.goal_id));
    if (parent) add(parent.id, p.practice_count);
  }
  const nodes: SkyNode[] = [];
  for (const g of goals) {
    if (g.is_archived && !filter.showArchived) continue;
    const horizon = horizonOf(g);
    const litPlans = litPlansOf.get(g.id) ?? 0;
    const count = practiceOf.get(g.id) ?? 0;
    nodes.push({
      id: `goal:${g.id}`, kind: 'goal', ref: g.id, title: g.constellation_name || g.title, goalId: g.id, goalTitle: g.title,
      horizon, parentGoalId: longParent(g)?.id ?? null,
      lit: litPlans > 0, practiceCount: count, brightness: starBrightness(count),
      radius: horizon === 'long' ? 20 + Math.min(16, Math.sqrt(litPlans) * 4) : 13 + Math.min(14, Math.sqrt(litPlans) * 4),
      hue: hueOf(branchId(g)), priority: 'medium', archived: g.is_archived, completed: g.is_completed,
      constellationName: g.constellation_name ?? null,
    });
  }
  for (const p of plans) {
    const goal = p.goal_id ? goalById.get(p.goal_id) : undefined;
    const archived = p.is_archived || !!goal?.is_archived;
    if (archived && !filter.showArchived) continue;
    if (!p.practice_count && !filter.showUnlit) continue;
    const brightness = starBrightness(p.practice_count);
    nodes.push({
      id: `plan:${p.id}`, kind: 'plan', ref: p.id, title: p.title, goalId: goal?.id ?? null, goalTitle: goal?.title ?? null,
      horizon: 'short', parentGoalId: null,
      lit: p.practice_count > 0, practiceCount: p.practice_count, brightness,
      radius: p.practice_count > 0 ? 5 + Math.min(9, brightness * 1.6) + (p.priority === 'high' ? 1.5 : 0) : 3.5,
      hue: goal ? hueOf(branchId(goal)) : 40, priority: clampPriority(p.priority), archived, completed: false,
      constellationName: null,
    });
  }
  return nodes;
}

/**
 * 구조 선 — 계획 → 소속 목표(`belongs`), 단기 목표 → 묶인 장기 목표(`part`).
 * 양 끝이 모두 화면에 있을 때만 긋는다(필터로 빠진 목표에 매달린 선은 그릴 곳이 없다).
 */
export function belongsEdges(nodes: SkyNode[]): SkyEdge[] {
  const ids = new Set(nodes.map(n => n.id));
  const belongs = nodes
    .filter(n => n.kind === 'plan' && n.goalId && ids.has(`goal:${n.goalId}`))
    .map(n => ({ id: `belongs:${n.id}`, source: n.id, target: `goal:${n.goalId}`, kind: 'belongs' as const, weight: 1 }));
  const parts = nodes
    .filter(n => n.kind === 'goal' && n.parentGoalId && ids.has(`goal:${n.parentGoalId}`))
    .map(n => ({ id: `part:${n.id}`, source: n.id, target: `goal:${n.parentGoalId}`, kind: 'part' as const, weight: 1 }));
  return [...belongs, ...parts];
}

/** 연결 성분 — 「별무리」 개수와 소속(구조 선으로 이어진 것끼리 한 무리). */
export function clusters(nodes: SkyNode[], edges: SkyEdge[]): Map<string, number> {
  const parent = new Map(nodes.map(n => [n.id, n.id]));
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let c = x; while (parent.get(c) !== r) { const next = parent.get(c)!; parent.set(c, r); c = next; } return r; };
  for (const e of edges) { if (!parent.has(e.source) || !parent.has(e.target)) continue; const a = find(e.source), b = find(e.target); if (a !== b) parent.set(a, b); }
  const index = new Map<string, number>();
  const out = new Map<string, number>();
  for (const n of nodes) { const root = find(n.id); if (!index.has(root)) index.set(root, index.size); out.set(n.id, index.get(root)!); }
  return out;
}

/** 첫 자리 — id 해시로 결정적인 나선. 무작위면 열 때마다 하늘이 달라 보인다. */
export function seedPosition(id: string, index: number, width: number, height: number): { x: number; y: number } {
  const angle = index * 2.399963 + (hueOf(id) / 360) * 0.5; // 황금각 + 작은 결정적 흔들림
  const r = Math.min(width, height) * 0.08 * Math.sqrt(index + 1);
  return { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r };
}

/** 하늘 안 좌표 → 0~1 (제5장 책갈피가 저장하는 값). 하늘 밖이면 가장자리로 모은다. */
export function normalizePosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
  return { x: clamp(width > 0 ? x / width : 0.5), y: clamp(height > 0 ? y / height : 0.5) };
}
