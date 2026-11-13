/**
 * 그래프 배치 힘 회귀 — `src/features/inquiry-design/utils/graphLayoutForces.ts`
 *
 *   npx tsx scripts/graph-layout-forces-test/run.mts
 *
 * 배치가 틀려도 오류는 나지 않는다(그림만 달라진다). 그래서 분류 규칙과 공유 개념 판정을 직접 못 박는다.
 * 마지막 묶음은 진짜 cytoscape(headless)로 캔버스가 쓰는 선택자가 활동 이웃만 세는지 확인한다.
 */
import cytoscape from 'cytoscape';
import {
  EDGE_FORCE,
  classifyEdge,
  edgeForce,
  isSharedConcept,
  nodeRepulsionWeight,
} from '../../src/features/inquiry-design/utils/graphLayoutForces';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`, detail ?? '');
  }
}

// ① 분류 — 판정 순서가 규칙의 일부다
check('활동↔개념 = conceptAnchor', classifyEdge('Activity', 'Concept') === 'conceptAnchor');
check('개념↔활동(역방향) = conceptAnchor', classifyEdge('Concept', 'Activity') === 'conceptAnchor');
check('개념↔도서 = concept 유지', classifyEdge('Concept', 'Book') === 'concept');
check('개념↔개념 = concept 유지', classifyEdge('Concept', 'Concept') === 'concept');
check('흐름↔개념 = thread (흐름이 먼저)', classifyEdge('Thread', 'Concept') === 'thread');
check('학생↔개념 = student (학생이 먼저)', classifyEdge('Student', 'Concept') === 'student');
check('활동↔활동 = narrative', classifyEdge('Activity', 'Activity') === 'narrative');
check('활동↔역량 = leaf', classifyEdge('Activity', 'Competency') === 'leaf');

// ② 공유 판정
check('활동 0개 = 공유 아님', !isSharedConcept(0));
check('활동 1개 = 공유 아님', !isSharedConcept(1));
check('활동 2개 = 공유', isSharedConcept(2));

// ③ 힘 — 혼자 속한 개념은 짧게, 공유 개념은 종전 그대로
const lone = edgeForce('Activity', 'Concept');
const shared = edgeForce('Activity', 'Concept', { sharedConcept: true });
check('혼자 속한 개념 = conceptAnchor 힘', lone === EDGE_FORCE.conceptAnchor);
check('공유 개념 = 종전 concept 힘', shared === EDGE_FORCE.concept);
check('혼자 속한 개념이 더 짧다', lone.length < shared.length, { lone, shared });
check('공유 플래그는 개념 엣지 밖에서 무시', edgeForce('Activity', 'Competency', { sharedConcept: true }) === EDGE_FORCE.leaf);
check('개념↔도서는 공유 플래그와 무관', edgeForce('Concept', 'Book', { sharedConcept: true }) === EDGE_FORCE.concept);
check(
  '공유 개념 당김이 서사보다 세지지 않는다(직렬 2 × 길이 ≥ 서사 길이)',
  2 * shared.length >= EDGE_FORCE.narrative.length,
);
for (const [cls, f] of Object.entries(EDGE_FORCE)) {
  check(`${cls} 값이 유한`, Number.isFinite(f.length) && f.length > 0 && Number.isFinite(f.elasticity) && f.elasticity > 0, f);
}
check('모르는 타입의 반발력 = 1', nodeRepulsionWeight('Unknown') === 1);

// ④ 진짜 cytoscape — 캔버스와 같은 선택자로 활동 이웃만 센다
const cy = cytoscape({
  headless: true,
  elements: [
    { data: { id: 'a1', type: 'Activity' } },
    { data: { id: 'a2', type: 'Activity' } },
    { data: { id: 'c1', type: 'Concept' } }, // a1·a2 공유
    { data: { id: 'c2', type: 'Concept' } }, // a1 하나 + 도서 + 다른 개념
    { data: { id: 'b1', type: 'Book' } },
    { data: { id: 'e1', source: 'a1', target: 'c1' } },
    { data: { id: 'e2', source: 'c1', target: 'a2' } },
    { data: { id: 'e3', source: 'a1', target: 'c2' } },
    { data: { id: 'e4', source: 'c2', target: 'b1' } },
    { data: { id: 'e5', source: 'c2', target: 'c1' } },
  ],
});
const activityCount = (id: string) => cy.getElementById(id).neighborhood('node[type = "Activity"]').length;
check('공유 개념 c1 의 활동 이웃 = 2', activityCount('c1') === 2, activityCount('c1'));
check('c2 의 활동 이웃 = 1 (도서·개념 이웃은 안 셈)', activityCount('c2') === 1, activityCount('c2'));
check('c2 의 degree 는 3 — degree 로 셌다면 오판', cy.getElementById('c2').degree(false) === 3);

console.log(`graph-layout-forces: ${pass} 통과 · ${fail} 실패`);
if (fail > 0) process.exit(1);
