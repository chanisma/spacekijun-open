// ========================================
// 작업 순서(action flow) — 할 일 안에서 작업을 어떤 순서로 하는지 (2026-09-23)
//
// **권장 순서일 뿐 강제하지 않는다**(사용자 결정). 담당자는 번호를 보고 따라가지만, 앞 작업을
// 마치지 않아도 뒤 작업을 열 수 있다.
//
// 저장 = `task.meta.actionFlow: string[]` — 항목 키의 순서. 키는 작업 연결 id, 그리고 제출
// 받기는 행이 없으므로(`task.meta.submission`) 고정 키 `'submission'`.
// task_action 쪽에 순서를 두지 않은 이유: 그 표는 수정이 작성자 전용이라 공동 매니저가 남의
// 작업 순서를 못 바꾸고, 제출 받기에는 행 자체가 없다.
//
// 목록에 없는 항목(순서를 정한 뒤 새로 붙은 작업)은 뒤에 원래 순서로 붙고, 목록에 있지만
// 사라진 키(해제된 연결)는 무시한다 — 순서 설정 때문에 작업이 사라지는 일은 없다.
// ========================================

export const SUBMISSION_FLOW_KEY = 'submission';
export const ACTION_FLOW_MAX = 50;

export function readActionFlow(meta: unknown): string[] {
  const raw = (meta && typeof meta === 'object' ? (meta as { actionFlow?: unknown }).actionFlow : null);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of raw) {
    if (typeof key !== 'string' || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= ACTION_FLOW_MAX) break;
  }
  return out;
}

/** 순서 목록대로 정렬 — 목록에 있는 것 먼저(그 순서), 나머지는 원래 순서로 뒤에 */
export function orderByFlow<T>(items: T[], flow: string[], keyOf: (item: T) => string): T[] {
  const rank = new Map(flow.map((key, index) => [key, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(keyOf(item)) }))
    .sort((a, b) => {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (a.rank !== undefined) return -1;
      if (b.rank !== undefined) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/** 화면에 보이는 순서에서 한 칸 위·아래로 — 끝이면 그대로 */
export function moveKey(keys: string[], key: string, direction: -1 | 1): string[] {
  const index = keys.indexOf(key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= keys.length) return keys;
  const next = [...keys];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function sameFlow(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/**
 * 저장할 순서 — 임시 키(아직 저장 안 된 작업)는 새 id 로 바꾸고, 대응이 없는 임시 키
 * (연결 실패)와 빠진 항목은 버린다.
 */
export function resolveFlowKeys(keys: string[], tempToId: Record<string, string>, alive: Set<string>): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const real = tempToId[key] ?? key;
    if (alive.has(real) && !out.includes(real)) out.push(real);
  }
  return out;
}
