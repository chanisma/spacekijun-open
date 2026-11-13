// ========================================
// 업무 흐름 복사 — 업무(WORK) 노드와 함께 선택될 노드 (2026-09-23)
//
// 기준은 **그래프의 선(edge)** 이다. 종전엔 노드에 새겨진 `metadata.containerNodeId` 로만 판단해,
// 업무를 올릴 때 자동으로 생긴 할 일 노드만 함께 빠지고 **따로 추가해 직접 연결한 노드는 따라오지
// 않았다**(사용자 보고). 포함·흐름·인계·연관 어느 선이든 업무에 이어져 있으면 그 업무에 딸린 것이다.
//
// 노드마다 **어느 업무에 딸렸는지 먼저 정하고**(assignWorkOwners) 그 업무의 노드만 고른다.
//   · 다른 업무 노드는 지나가지 않는다 — A → B 흐름 선이 있다고 A 를 고를 때 B 까지 딸려 오면 안 된다
//   · 인계·연관 선은 업무 사이의 연결 — A 의 할 일 → B 의 할 일 인계 선이 있어도 서로의 것이 넘어가지 않는다
// 방향은 보지 않는다 — 사용자가 선을 어느 쪽에서 그었는지는 "이어져 있다"는 사실과 무관하다.
// ========================================

export interface CopyGraphNode {
  id: string;
  data: { kind: string; metadata: Record<string, unknown> };
}
export interface CopyGraphEdge {
  source: string;
  target: string;
  data?: { relationType?: string };
}

/** 업무 안의 연결 — 소속을 먼저 퍼뜨린다. 인계·연관은 업무 **사이**의 연결이라 나중에 */
const WEAK_RELATIONS = new Set(['handoff', 'related']);

/**
 * 노드마다 어느 업무에 딸렸는지. 단계 셋:
 *   ① 확정 — 업무를 올릴 때 자동 생성된 표시(containerNodeId), 업무에서 나온 '포함' 선
 *   ② 업무 안의 선(포함·흐름·선행)으로 퍼뜨린다 — 모든 업무에서 **동시에**(가까운 업무가 이긴다)
 *   ③ 그래도 주인이 없는 노드만 업무 사이의 선(인계·연관)으로 잇는다
 * 업무 노드는 지나가지 않는다(업무 A → 업무 B 흐름 선으로 B 의 것이 A 로 넘어오지 않게).
 * 한 규칙("다른 업무에 포함된 노드에서 멈춘다")만으로는 부족했다 — A 에 흐름 선으로 이어진 할 일은
 * '포함'이 아니라서, B 에서 인계 선을 타고 들어오면 B 의 것으로 끌려갔다(2026-09-23 회귀에서 발견).
 */
export function assignWorkOwners(nodes: CopyGraphNode[], edges: CopyGraphEdge[]): Map<string, string> {
  const kind = new Map(nodes.map((node) => [node.id, node.data.kind]));
  const owner = new Map<string, string>();
  for (const node of nodes) {
    const container = node.data.metadata.containerNodeId;
    if (typeof container === 'string' && kind.get(container) === 'event') owner.set(node.id, container);
  }
  for (const edge of edges) {
    if (edge.data?.relationType === 'contains' && kind.get(edge.source) === 'event' && kind.get(edge.target) !== 'event' && !owner.has(edge.target)) {
      owner.set(edge.target, edge.source);
    }
  }

  const spread = (includeEdge: (edge: CopyGraphEdge) => boolean) => {
    const neighbors = new Map<string, string[]>();
    const link = (a: string, b: string) => {
      if (!kind.has(a) || !kind.has(b)) return;
      neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    };
    for (const edge of edges) {
      if (!includeEdge(edge)) continue;
      link(edge.source, edge.target);
      link(edge.target, edge.source);
    }
    // 시작점 = 업무 노드 + 이미 주인이 정해진 노드(원래 순서 — 결과가 결정적이어야 한다)
    const queue: string[] = [
      ...nodes.filter((node) => node.data.kind === 'event').map((node) => node.id),
      ...nodes.filter((node) => owner.has(node.id)).map((node) => node.id),
    ];
    const ownerOf = (id: string) => (kind.get(id) === 'event' ? id : owner.get(id));
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentOwner = ownerOf(current);
      if (!currentOwner) continue;
      for (const next of neighbors.get(current) ?? []) {
        if (kind.get(next) === 'event' || owner.has(next)) continue;
        owner.set(next, currentOwner);
        queue.push(next);
      }
    }
  };
  spread((edge) => !WEAK_RELATIONS.has(edge.data?.relationType ?? 'flow'));
  spread(() => true);
  return owner;
}

/** 업무 노드 `rootId` 와 함께 선택될 노드 id(루트 제외) — 그 업무에 딸린 노드 */
export function collectAttachedNodeIds(
  rootId: string,
  nodes: CopyGraphNode[],
  edges: CopyGraphEdge[],
): string[] {
  if (!nodes.some((node) => node.id === rootId && node.data.kind === 'event')) return [];
  const owner = assignWorkOwners(nodes, edges);
  return nodes.filter((node) => owner.get(node.id) === rootId).map((node) => node.id);
}

/**
 * 복사 제외 토글 — 업무 노드는 딸린 노드를 함께 넣고 뺀다(대칭). 그 밖의 노드는 자기만.
 * 딸린 노드를 따로 다시 넣거나 뺄 수 있다(업무를 뺀 뒤 할 일 하나만 넣기 등).
 */
export function toggleCopyExcluded(
  excluded: ReadonlySet<string>,
  nodeId: string,
  nodes: CopyGraphNode[],
  edges: CopyGraphEdge[],
): Set<string> {
  const next = new Set(excluded);
  const cascade = collectAttachedNodeIds(nodeId, nodes, edges);
  const exclude = !next.has(nodeId);
  for (const id of [nodeId, ...cascade]) {
    if (exclude) next.add(id);
    else next.delete(id);
  }
  return next;
}
