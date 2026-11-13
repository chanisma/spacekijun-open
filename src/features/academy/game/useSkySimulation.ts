import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { seedPosition, type SkyEdge, type SkyNode } from './skyGraph';

/**
 * d3-force 시뮬레이션을 React 에 묶는다 — 옵시디언처럼 **별을 끌면 이어진 별이 따라오고**
 * 놓으면 자리를 다시 찾는다.
 *
 * 위치는 state 가 아니라 **시뮬레이션 노드 객체**에 산다(매 틱 상태 갱신은 노드 200개에 초당
 * 60번 렌더가 되어 느리다). 틱마다 `version` 만 올려 다시 그리게 하고, 그리는 쪽은 `positions()`
 * 로 그 순간의 좌표를 읽는다. 노드 목록이 바뀌어도 **있던 별의 자리는 지킨다**(필터를 켜고 끌
 * 때마다 하늘이 통째로 다시 흩어지면 무엇이 바뀌었는지 알 수 없다).
 *
 * 동작 줄이기(`reduced`)에서는 애니메이션 없이 **끝까지 계산한 자리**를 한 번에 그린다 — 끌기도
 * 놓는 순간 정착한 자리로 뛴다.
 */
export interface SimNode extends SimulationNodeDatum { id: string; node: SkyNode }
type SimLink = SimulationLinkDatum<SimNode> & { edge: SkyEdge };
const SETTLE_TICKS = 300;

export function useSkySimulation(nodes: SkyNode[], edges: SkyEdge[], size: { width: number; height: number }, reduced: boolean) {
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<Map<string, SimNode>>(new Map());
  const [version, setVersion] = useState(0);
  const frame = useRef<number | null>(null);
  const bump = useCallback(() => {
    if (frame.current != null) return;
    frame.current = window.requestAnimationFrame(() => { frame.current = null; setVersion(v => v + 1); });
  }, []);
  const nodeKey = useMemo(() => nodes.map(n => n.id).join('|'), [nodes]);
  const edgeKey = useMemo(() => edges.map(e => `${e.id}:${e.weight}`).join('|'), [edges]);

  useEffect(() => {
    const sim = forceSimulation<SimNode, SimLink>().stop();
    sim.on('tick', bump);
    simRef.current = sim;
    return () => { sim.stop(); simRef.current = null; if (frame.current != null) window.cancelAnimationFrame(frame.current); };
  }, [bump]);

  // 노드·엣지·크기가 바뀔 때 힘을 다시 세운다. 있던 노드는 좌표를 지키고 새 노드만 자리를 받는다.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const previous = nodesRef.current;
    const next = new Map<string, SimNode>();
    nodes.forEach((node, index) => {
      const kept = previous.get(node.id);
      if (kept) { kept.node = node; next.set(node.id, kept); return; }
      const seed = seedPosition(node.id, index, size.width, size.height);
      next.set(node.id, { id: node.id, node, x: seed.x, y: seed.y });
    });
    nodesRef.current = next;
    const simNodes = [...next.values()];
    const links: SimLink[] = edges.filter(e => next.has(e.source) && next.has(e.target)).map(e => ({ source: e.source, target: e.target, edge: e }));
    sim.nodes(simNodes);
    sim.force('link', forceLink<SimNode, SimLink>(links).id(d => d.id)
      // 구조선은 짧고 단단히, 끌림선은 비슷할수록 짧고 세게 — 유사도가 곧 스프링이다.
      // belongs = 계획 → 목표(짧게), part = 단기 → 장기 목표(조금 멀리 — 단기 목표마다 제 계획 무리를 거느릴 자리)
      .distance(l => (l.edge.kind === 'belongs' ? 46 : 110) + (l.target as SimNode).node.radius + (l.source as SimNode).node.radius)
      .strength(l => l.edge.kind === 'belongs' ? 0.7 : 0.55));
    // 큰 별(목표)끼리는 더 세게 밀어 무리가 서로 떨어지고, 작은 별은 가볍게.
    sim.force('charge', forceManyBody<SimNode>().strength(d => d.node.kind === 'goal' ? -260 : -55).distanceMax(420));
    sim.force('collide', forceCollide<SimNode>().radius(d => d.node.radius + (d.node.kind === 'goal' ? 18 : 10)).strength(0.9));
    sim.force('center', forceCenter(size.width / 2, size.height / 2).strength(0.04));
    sim.force('x', forceX<SimNode>(size.width / 2).strength(0.025));
    sim.force('y', forceY<SimNode>(size.height / 2).strength(0.03));
    if (reduced) { sim.alpha(1).stop(); for (let i = 0; i < SETTLE_TICKS; i++) sim.tick(); bump(); }
    else sim.alpha(simNodes.length === previous.size ? 0.5 : 1).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, edgeKey, size.width, size.height, reduced, bump]);

  const positions = useCallback(() => nodesRef.current, []);
  /** 끌기 시작 — 그 별을 손에 고정하고 물리를 다시 데운다. */
  const dragStart = useCallback((id: string, x: number, y: number) => {
    const n = nodesRef.current.get(id); const sim = simRef.current;
    if (!n || !sim) return;
    n.fx = x; n.fy = y;
    if (!reduced) sim.alphaTarget(0.3).restart();
  }, [reduced]);
  const dragMove = useCallback((id: string, x: number, y: number) => {
    const n = nodesRef.current.get(id);
    if (!n) return;
    n.fx = x; n.fy = y;
    if (reduced) { const sim = simRef.current; if (sim) { for (let i = 0; i < 12; i++) sim.tick(); } bump(); }
  }, [reduced, bump]);
  const dragEnd = useCallback((id: string) => {
    const n = nodesRef.current.get(id); const sim = simRef.current;
    if (!n || !sim) return;
    n.fx = null; n.fy = null;
    if (reduced) { for (let i = 0; i < 120; i++) sim.tick(); bump(); }
    else sim.alphaTarget(0);
  }, [reduced, bump]);
  /** 다시 흩어 모으기 — 자리를 잊고 처음부터 배치한다. */
  const reheat = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    let index = 0;
    for (const n of nodesRef.current.values()) { const seed = seedPosition(n.id, index++, size.width, size.height); n.x = seed.x; n.y = seed.y; n.vx = 0; n.vy = 0; }
    if (reduced) { sim.alpha(1).stop(); for (let i = 0; i < SETTLE_TICKS; i++) sim.tick(); bump(); }
    else sim.alpha(1).restart();
  }, [reduced, size.width, size.height, bump]);

  return { version, positions, dragStart, dragMove, dragEnd, reheat };
}
