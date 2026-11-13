/**
 * 그래프 배치의 **타입별 힘** — fcose 에 넘길 가중치 표.
 *
 * 종전엔 `nodeRepulsion`·`idealEdgeLength` 가 스칼라라 **모든 노드·엣지가 같은 힘**을 받았다.
 * 그런데 라이브 v8 그래프(학생별 최신, 노드 2,601 · 엣지 4,945)를 재보니 구조가 한쪽으로 크게 쏠려 있다:
 *
 *   · 노드의 **약 65%가 활동 하나에만 매달린 펜던트**다
 *     (Competency 27.7% · Achievement 6.4% · Attitude/Person/Role 5.2% 는 **실제 차수가 정확히 1**,
 *      Concept 17.8% · Book 7.5% 도 1.01). 골격은 Activity 31.6%(차수 3.23)·Thread 2.9%·Interest 0.8%(최대 21)뿐이다.
 *   · 엣지의 **52.6% 가 학생 허브** → 전 노드. 정작 이 파이프라인을 만든 이유인
 *     활동↔활동 서사 엣지는 **6.1%** 라 8:1 로 묻힌다.
 *
 * 그래서 밀집의 주범은 노드 수보다 이 구조다. 잎이 골격과 같은 힘으로 온 세상을 밀고,
 * 절반이 넘는 엣지가 한 점을 당긴다.
 *
 * **반발력은 "이 노드가 자리를 주장할 권리"** 로 본다 — 골격은 자리를 주장하고, 잎은 부모에게서 빌린다.
 *
 * ## 왜 노드마다 값 하나면 충분한가
 * fcose 의 반발 식이 **두 노드 값의 산술평균**이다(`layout-base` 의 `calcRepulsionForce`:
 * `(A.nodeRepulsion/2 + B.nodeRepulsion/2) × … / d²`). 그래서 노드별 값만 정하면
 * 쌍별 거동이 공짜로 따라온다 — 골격↔골격 1.5(벌어짐) · 골격↔잎 1.0 · 잎↔잎 0.5(뭉침).
 *
 * ## 겹침은 이 값과 무관하다
 * 같은 함수가 **겹쳤을 때는 `nodeRepulsion` 을 쓰지 않고** 순수 기하 분리(`calcSeparationAmount`)로 간다.
 * 게다가 `nodeDimensionsIncludeLabels: true` 라 최소 간격이 이미 라벨 상자 크기다 —
 * 잎의 반발을 낮춰도 **글자가 겹치지는 않고** 라벨 바깥의 여분 공기만 사라진다.
 */

/** 자유 배치(fcose)에서만 쓴다. 동심원은 `minNodeSpacing` 이 지배하므로 무관하다. */
export const NODE_REPULSION_WEIGHT: Record<string, number> = {
  Student: 2.2,     // 전 노드와 연결된다 — 가운데를 비워야 고리가 생긴다
  Thread: 1.8,
  Interest: 1.6,    // 차수 최대 21 의 숨은 허브. 비중 0.8% 라 올려도 전체엔 거의 무해
  Activity: 1.5,    // 그래프의 본체
  Concept: 0.9,
  Book: 0.6,
  Person: 0.6,
  Competency: 0.5,  // ↓ 여기부터 펜던트(실제 차수 1)
  Achievement: 0.5,
  Attitude: 0.5,
  Role: 0.5,
};

/**
 * 표에 없는 타입은 **반드시 1.0** 으로 떨어져야 한다.
 * `undefined` 가 들어가면 힘이 NaN → 좌표가 NaN 이 되는데 **예외가 나지 않고**
 * 노드가 조용히 사라지거나 배치가 통째로 무너진다. 새 엔티티 타입은 언제든 생긴다.
 */
export function nodeRepulsionWeight(type: unknown): number {
  const w = NODE_REPULSION_WEIGHT[String(type ?? '')];
  return Number.isFinite(w) ? w : 1;
}

/**
 * 위 표의 **사용량 가중 평균 = 0.943** (라이브 타입 분포 기준).
 * 1.0 에서 크게 벗어나면 슬라이더 1.0 의 뜻과 `adaptiveSpacing` 의 기본값이 **조용히 어긋난다**.
 * 가중치를 손볼 때마다 이 값을 다시 계산할 것(0.94 는 슬라이더 한 칸 0.1 안이라 그대로 쓴다).
 */
export const REPULSION_WEIGHTED_MEAN = 0.943;

/**
 * 엣지의 **기하학적 종류**. `properties.layer` 문자열이 아니라 **양 끝점의 타입**으로 가른다 —
 * 구 파이프라인(`solar-pro3`, 라이브 412명) KG 에는 layer 가 아예 없고 설계·미리보기 엣지도
 * 마찬가지다. 끝점 타입은 어느 출처에나 있으므로 이 분류는 모든 그래프에서 동작한다.
 *
 * 판정 순서가 규칙의 일부다 — Thread 를 Activity↔Activity 보다 먼저 봐야
 * 활동↔흐름이 서사로 잘못 분류되지 않는다.
 */
export type EdgeClass = 'student' | 'thread' | 'narrative' | 'conceptAnchor' | 'concept' | 'leaf' | 'other';

const HUB_TYPES = new Set(['Activity', 'Thread', 'Interest']);

export function classifyEdge(sourceType: unknown, targetType: unknown): EdgeClass {
  const a = String(sourceType ?? '');
  const b = String(targetType ?? '');
  if (a === 'Student' || b === 'Student') return 'student';
  if (a === 'Thread' || b === 'Thread') return 'thread';
  if (a === 'Activity' && b === 'Activity') return 'narrative';
  // 개념 ↔ 그 개념이 나온 활동. `concept` 보다 먼저 봐야 한다 — 뒤에 두면 전부 `concept` 에 먹힌다.
  if ((a === 'Activity' && b === 'Concept') || (a === 'Concept' && b === 'Activity')) return 'conceptAnchor';
  if (a === 'Concept' || b === 'Concept') return 'concept';
  if (HUB_TYPES.has(a) !== HUB_TYPES.has(b)) return 'leaf'; // 허브 ↔ 잎
  return 'other';
}

/**
 * 엣지 종류별 [길이 배수, 탄성].
 *
 * **펜던트는 스프링 하나로 붙잡혀 있으므로 길이가 곧 부모와의 거리다** — 이쪽이 반발력보다 강한 레버다.
 * `student` 가 가장 큰 단일 손잡이다(엣지의 52.6%). 길고 아주 물렁하게 만들되 **끊지는 않는다** —
 * 중력과 함께 학생 노드를 가운데 잡아 두는 유일한 힘이고, 구 스타일의 허브 표현 그 자체다.
 *
 * 탄성 기본값은 fcose 의 0.45.
 */
export const EDGE_FORCE: Record<EdgeClass, { length: number; elasticity: number }> = {
  student: { length: 2.5, elasticity: 0.08 },   // 절반이 넘는 엣지가 한 점을 당긴다 — 물렁하게
  narrative: { length: 1.6, elasticity: 0.60 }, // 서사는 6.1% 뿐이라 안 키우면 묻힌다
  thread: { length: 1.2, elasticity: 0.50 },
  conceptAnchor: { length: 0.65, elasticity: 0.55 }, // 활동 하나에만 속한 개념 — 부모 곁에 붙인다
  concept: { length: 1.0, elasticity: 0.45 },
  leaf: { length: 0.55, elasticity: 0.55 },     // 잎은 부모에 바싹 — 짧고 약간 빳빳하게
  other: { length: 1.0, elasticity: 0.45 },
};

/**
 * 개념이 **활동 둘 이상에 걸려 있는가** — 걸려 있으면 개념↔활동 엣지를 짧게 하지 않는다 (2026-10-02).
 *
 * 공유된 개념은 두 활동을 잇는 **숨은 스프링**이다(활동 A ─ 개념 ─ 활동 B, 거리 상한 ≈ 2 × 길이).
 * 길이를 줄이면 개념만 붙는 게 아니라 **두 활동이 함께 끌려온다** — 단어가 겹쳤을 뿐인 활동이
 * 학생이 실제로 이어 간 서사(narrative 1.6)보다 바싹 붙어 서사를 덮는다.
 * 그래서 공유 개념은 종전 `concept` 힘을 그대로 쓴다(당김이 지금보다 세지지 않는다).
 *
 * 라이브 실측(학생별 최신 KG, 2026-10-02): v8 개념 10,255개 중 **0.3%** 만 공유(최대 활동 6개).
 * 드물지만 걸리는 곳에서는 활동 두 개가 눈에 띄게 붙어 보인다.
 *
 * 차수는 **활동 이웃 수**로 센다 — `degree()` 는 개념↔도서·숨긴 엣지까지 세어 잘못 판정한다.
 */
export function isSharedConcept(activityNeighborCount: number): boolean {
  return activityNeighborCount >= 2;
}

export function edgeForce(sourceType: unknown, targetType: unknown, opts?: { sharedConcept?: boolean }) {
  const cls = classifyEdge(sourceType, targetType);
  if (cls === 'conceptAnchor' && opts?.sharedConcept) return EDGE_FORCE.concept;
  return EDGE_FORCE[cls];
}
