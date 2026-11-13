/**
 * 증분으로 추가되는 노드(새 별 찾기 미리보기·복원되지 않은 소수 노드)의 **빈자리 찾기**.
 *
 * 왜 따로 있는가 (2026-09-14) — 이 캔버스는 미리보기마다 전체 레이아웃을 다시 돌리지 않는다
 * (`InquiryGraphCanvas` 의 증분 갱신 불변식). 그 대가로 새 노드를 놓을 **힘이 없다** —
 * force 레이아웃은 겹침을 스스로 풀지만 증분 배치는 코드가 빈자리를 직접 찾아야 한다.
 * 종전 규칙은 ①이웃들의 **무게중심**에 놓고 ②이웃이 없으면 학생 허브 위에 놓고 ③반지름
 * 110~182px 고정에 ④충돌 검사가 없었다. 무게중심은 "이웃들 사이"가 아니라 대개 그래프
 * **한가운데**이고 허브형 그래프의 가운데가 가장 빽빽하다. 그래서 새 별이 기존 별 위에 겹쳐
 * 점선 테두리·페이드인이 무의미해졌다.
 *
 * 규칙 세 가지:
 *  1. **앵커는 하나** — 이미 자리가 있는 이웃 중 **주변이 가장 한산한** 것. 평균을 내지 않는다.
 *  2. **바깥 방향부터 훑는다** — 그래프 무게중심에서 앵커를 향하는 방향이 첫 후보. 빈자리는
 *     바깥에 있고, "새 별은 하늘 가장자리에 뜬다"는 읽힘과도 맞는다.
 *  3. **실측 크기로 충돌을 판정한다** — 라벨이 노드 밖으로 번지므로 지름이 아니라 라벨 포함
 *     상자로 잰다(`placeIsolatedNodes` 와 같은 원칙). 간격은 간격 배수(`spacing`)를 따른다.
 *
 * React·cytoscape 비의존 순수 함수 — 회귀 `scripts/inquiry-new-node-placement-test/run.mts`.
 */

export interface Point { x: number; y: number }

export interface PlacementInput {
  /** 자리를 정할 노드들. 삽입 순서대로 놓으며, 앞서 놓인 것은 뒤의 앵커가 된다. */
  newIds: string[];
  /** 그 노드의 이웃 전부(자리 유무 불문). 자리 있는 것만 앵커 후보가 된다. */
  neighborsOf: (id: string) => string[];
  /** 라벨을 포함한 실측 상자 크기. 원으로 근사하므로 큰 쪽을 지름으로 쓴다. */
  sizeOf: (id: string) => { w: number; h: number };
  /** 이미 자리가 있는 노드. **호출자의 맵을 그대로 갱신**한다(새 노드가 놓이는 대로 추가). */
  occupied: Map<string, Point>;
  /** 앵커가 하나도 없을 때의 기준점(학생 허브). 없으면 원점. */
  fallback?: Point;
  /** 간격 배수(캔버스 슬라이더 값). 1.0 이 기본. */
  spacing?: number;
}

export interface PlacementResult {
  positions: Map<string, Point>;
  /** 상한까지 훑고도 빈자리를 못 찾은 노드. 마지막 후보에 놓였다 — 화면은 이걸로 경고할 수 있다. */
  unresolved: string[];
}

/** 황금각 — 같은 링의 후보가 직선으로 늘어서지 않게 한다. */
export const GOLDEN_ANGLE = 2.399963229728653;
/** 노드 상자 사이에 두는 최소 공기(px, 간격 배수 1.0 기준). */
export const PLACEMENT_GAP = 18;
/** 링 하나당 후보 수·최대 링 수. 12×24 = 288 후보면 196노드 그래프에서도 충분히 남는다. */
const CANDIDATES_PER_RING = 12;
const MAX_RINGS = 24;
/** 앵커 후보의 "한산함"을 재는 반경 — 자기 지름의 배수. */
const DENSITY_PROBE_FACTOR = 2.5;

const radiusOf = (size: { w: number; h: number }) => Math.max(size.w, size.h, 1) / 2;

function centroid(points: Iterable<Point>): Point | null {
  let sx = 0; let sy = 0; let n = 0;
  for (const p of points) { sx += p.x; sy += p.y; n += 1; }
  return n === 0 ? null : { x: sx / n, y: sy / n };
}

/** 두 원이 `gap` 이상 떨어져 있는가. */
function clear(a: Point, ra: number, b: Point, rb: number, gap: number): boolean {
  const dx = a.x - b.x; const dy = a.y - b.y;
  const min = ra + rb + gap;
  return dx * dx + dy * dy >= min * min;
}

export function placeNewNodes(input: PlacementInput): PlacementResult {
  const spacing = Number.isFinite(input.spacing) && (input.spacing as number) > 0 ? (input.spacing as number) : 1;
  const gap = PLACEMENT_GAP * spacing;
  const occupied = input.occupied;
  const positions = new Map<string, Point>();
  const unresolved: string[] = [];
  const radii = new Map<string, number>();
  const rOf = (id: string) => {
    let r = radii.get(id);
    if (r === undefined) { r = radiusOf(input.sizeOf(id)); radii.set(id, r); }
    return r;
  };

  for (const id of input.newIds) {
    if (occupied.has(id)) continue;
    const rNew = rOf(id);

    // ① 앵커 — 자리 있는 이웃 중 주변이 가장 한산한 것.
    const anchors = input.neighborsOf(id).filter((n) => occupied.has(n));
    let anchorId: string | null = null;
    let bestDensity = Infinity;
    for (const a of anchors) {
      const p = occupied.get(a)!;
      const probe = rOf(a) * DENSITY_PROBE_FACTOR + gap;
      let density = 0;
      for (const [oid, q] of occupied) {
        if (oid === a) continue;
        if (!clear(p, 0, q, 0, probe)) density += 1;
      }
      if (density < bestDensity) { bestDensity = density; anchorId = a; }
    }
    const anchor = anchorId ? occupied.get(anchorId)! : (input.fallback ?? { x: 0, y: 0 });
    const rAnchor = anchorId ? rOf(anchorId) : 0;

    // ② 훑기 시작 각 — 그래프 무게중심 → 앵커 방향(바깥). 중심이 곧 앵커면 0.
    const mass = centroid(occupied.values());
    let startAngle = 0;
    if (mass) {
      const dx = anchor.x - mass.x; const dy = anchor.y - mass.y;
      if (dx * dx + dy * dy > 1) startAngle = Math.atan2(dy, dx);
    }

    // ③ 링을 넓혀 가며 첫 빈자리.
    const baseRadius = rAnchor + rNew + gap;
    const ringStep = Math.max(rNew * 2 + gap, 24);
    let chosen: Point | null = null;
    let last: Point = { x: anchor.x + baseRadius, y: anchor.y };
    outer: for (let ring = 0; ring < MAX_RINGS; ring += 1) {
      const radius = baseRadius + ring * ringStep;
      for (let k = 0; k < CANDIDATES_PER_RING; k += 1) {
        // 링마다 황금각만큼 위상을 돌려 후보가 방사선 위에 늘어서지 않게 한다.
        const angle = startAngle + ring * GOLDEN_ANGLE + (k / CANDIDATES_PER_RING) * Math.PI * 2;
        const cand = { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius };
        last = cand;
        let ok = true;
        for (const [oid, q] of occupied) {
          if (!clear(cand, rNew, q, rOf(oid), gap)) { ok = false; break; }
        }
        if (ok) { chosen = cand; break outer; }
      }
    }
    if (!chosen) { chosen = last; unresolved.push(id); }
    const rounded = { x: Math.round(chosen.x), y: Math.round(chosen.y) };
    positions.set(id, rounded);
    occupied.set(id, rounded);
  }

  return { positions, unresolved };
}
