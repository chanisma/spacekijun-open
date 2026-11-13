// ========================================
// 활동 계보 — 순수 로직 (React 비의존)
//
// 계보는 동아리가 아니라 **활동**에 붙는다. 이어지고 깊어지는 것은
// "융합과학 동아리"가 아니라 그 동아리가 해마다 발전시킨 "혈액형 판별 실험"이다.
//
// 카드의 "3년째" 배지, 상세 모달의 계보 타임라인, 인사이트의 지속성 지표가
// 전부 이 모듈에서 나온다.
//
// 서버 트리거(activity_lineage_guard)가 순환을 막지만, 여기서도 방문 집합으로
// 다시 막는다 — 클라이언트가 부분 데이터만 들고 있을 때(필터된 목록 등)
// 부모가 없는 노드를 만나는 것은 정상이고, 그때 무한 순회로 화면이 멈추면 안 된다.
// ========================================

/** 계보 계산에 필요한 최소 형태. Activity 전체를 요구하지 않는다. */
export interface LineageNode {
  id: string;
  name: string;
  academic_year: number;
  lineage_parent_id: string | null;
}

export interface LineageIndex<T extends LineageNode> {
  byId: Map<string, T>;
  /** 부모 id → 자식 노드들 (연도 오름차순) */
  childrenOf: Map<string, T[]>;
}

const MAX_DEPTH = 64;

/** 계보 조회용 인덱스를 만든다. 목록을 한 번 훑고 재사용한다. */
export function buildLineageIndex<T extends LineageNode>(nodes: T[]): LineageIndex<T> {
  const byId = new Map<string, T>();
  const childrenOf = new Map<string, T[]>();

  for (const n of nodes) byId.set(n.id, n);

  for (const n of nodes) {
    const parentId = n.lineage_parent_id;
    if (!parentId) continue;
    // 부모가 이 목록에 없으면(필터된 화면 등) 그 노드는 여기서 루트처럼 취급된다.
    if (!byId.has(parentId)) continue;
    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push(n);
    else childrenOf.set(parentId, [n]);
  }

  for (const bucket of childrenOf.values()) {
    bucket.sort((a, b) => a.academic_year - b.academic_year || a.name.localeCompare(b.name, 'ko'));
  }

  return { byId, childrenOf };
}

/**
 * 조상 사슬(루트 → 자기 자신). 인덱스에 없는 부모를 만나면 거기서 끊는다.
 *
 * 부분 목록에서도 안전하다 — 끊긴 지점이 그 화면에서의 루트다.
 */
export function getLineageChain<T extends LineageNode>(
  id: string,
  index: LineageIndex<T>
): T[] {
  const chain: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = id;

  while (cursor && chain.length < MAX_DEPTH) {
    if (seen.has(cursor)) break;         // 순환 방어
    seen.add(cursor);
    const node = index.byId.get(cursor);
    if (!node) break;
    chain.push(node);
    cursor = node.lineage_parent_id;
  }

  return chain.reverse();
}

/**
 * 계보 연차. 첫 해 활동이면 1, 그 활동을 이어받았으면 2 …
 *
 * 카드의 "3년째" 배지가 이 값이다. 계보가 없으면 1을 반환한다 —
 * "1년째"는 배지를 띄우지 않는다(§ getLineageBadge).
 */
export function getLineageGeneration<T extends LineageNode>(
  id: string,
  index: LineageIndex<T>
): number {
  const chain = getLineageChain(id, index);
  return chain.length || 1;
}

/**
 * 카드에 찍을 계보 배지 문구. 2년째부터만 의미가 있다.
 *
 * 1년째에 "1년째"를 찍으면 모든 카드에 배지가 붙어 정보가 사라진다.
 */
export function getLineageBadge<T extends LineageNode>(
  id: string,
  index: LineageIndex<T>
): string | null {
  const gen = getLineageGeneration(id, index);
  return gen >= 2 ? `${gen}년째` : null;
}

/** 이 화면에서의 계보 루트 */
export function findLineageRoot<T extends LineageNode>(
  id: string,
  index: LineageIndex<T>
): T | null {
  const chain = getLineageChain(id, index);
  return chain[0] ?? null;
}

export interface LineageTreeNode<T extends LineageNode> {
  node: T;
  /** 루트를 1로 하는 깊이 */
  generation: number;
  children: LineageTreeNode<T>[];
}

/**
 * 한 계보의 전체 트리(루트에서 아래로). 상세 모달의 계보 탭이 그린다.
 *
 * 분기(한 활동에서 둘로 갈라짐)를 그대로 표현한다 — 실제로 동아리 활동은
 * 갈라지면서 발전한다.
 */
export function buildLineageTree<T extends LineageNode>(
  rootId: string,
  index: LineageIndex<T>,
  generation = 1,
  seen: Set<string> = new Set()
): LineageTreeNode<T> | null {
  if (seen.has(rootId) || generation > MAX_DEPTH) return null;
  seen.add(rootId);

  const node = index.byId.get(rootId);
  if (!node) return null;

  const children = (index.childrenOf.get(rootId) ?? [])
    .map((child) => buildLineageTree(child.id, index, generation + 1, seen))
    .filter((n): n is LineageTreeNode<T> => n !== null);

  return { node, generation, children };
}

/**
 * 목록을 계보 단위로 묶는다. 인사이트의 "지속성" 지표와
 * 탐색 화면의 "이어지는 활동만 보기" 필터가 쓴다.
 */
export function groupByLineage<T extends LineageNode>(
  nodes: T[]
): { root: T; members: T[]; span: number }[] {
  const index = buildLineageIndex(nodes);
  const groups = new Map<string, T[]>();

  for (const n of nodes) {
    const root = findLineageRoot(n.id, index) ?? n;
    const bucket = groups.get(root.id);
    if (bucket) bucket.push(n);
    else groups.set(root.id, [n]);
  }

  return [...groups.entries()]
    .map(([rootId, members]) => {
      const root = index.byId.get(rootId)!;
      const years = new Set(members.map((m) => m.academic_year));
      return {
        root,
        members: members.sort((a, b) => a.academic_year - b.academic_year),
        span: years.size,
      };
    })
    .sort((a, b) => b.span - a.span || a.root.name.localeCompare(b.root.name, 'ko'));
}

/**
 * 계보 부모 후보 — 이 활동을 이어받을 대상으로 고를 수 있는 활동들.
 *
 * 자기 자신과 자기 자손은 제외한다(순환 방지). 서버 트리거가 최종 방어선이지만
 * 애초에 고를 수 없게 하는 편이 낫다.
 */
export function getLineageParentCandidates<T extends LineageNode>(
  selfId: string | null,
  nodes: T[]
): T[] {
  if (!selfId) return nodes;

  const index = buildLineageIndex(nodes);
  const blocked = new Set<string>([selfId]);

  const walk = (id: string) => {
    for (const child of index.childrenOf.get(id) ?? []) {
      if (blocked.has(child.id)) continue;
      blocked.add(child.id);
      walk(child.id);
    }
  };
  walk(selfId);

  return nodes.filter((n) => !blocked.has(n.id));
}
