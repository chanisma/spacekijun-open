// 새 노드 빈자리 배치 회귀 — 2026-09-14 신설.
//
// 왜 못 박는가: 겹침은 오류를 내지 않는다. 새 별이 기존 별 위에 올라가도 렌더는 성공하고
// 타입 검사도 통과한다. 종전 규칙(이웃 무게중심 + 고정 반지름 + 충돌 검사 없음)이 정확히
// 그렇게 조용히 틀렸다. 그래서 "놓인 뒤 어떤 노드와도 겹치지 않는다"를 여기서 직접 잰다.
//
// 실행: npx tsx scripts/inquiry-new-node-placement-test/run.mts
import { readFileSync } from 'node:fs';
import { placeNewNodes, PLACEMENT_GAP, type Point } from '../../src/features/inquiry-design/utils/newNodePlacement';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

const SIZE = { w: 60, h: 40 }; // 라벨 포함 상자. 원 근사 반지름 30.
const R = 30;

/** 모든 쌍이 (r+r+gap) 이상 떨어져 있는가. */
function noOverlap(all: Map<string, Point>, ids: Iterable<string>, gap: number, rOf: (id: string) => number) {
  const bad: string[] = [];
  for (const id of ids) {
    const p = all.get(id)!;
    for (const [oid, q] of all) {
      if (oid === id) continue;
      const min = rOf(id) + rOf(oid) + gap;
      if (Math.hypot(p.x - q.x, p.y - q.y) < min - 1e-6) bad.push(`${id}↔${oid}`);
    }
  }
  return bad;
}

/** 촘촘한 격자 그래프 — 허브 'student' 가 가운데. */
function denseGraph(n: number, pitch: number) {
  const occupied = new Map<string, Point>();
  const side = Math.ceil(Math.sqrt(n));
  let i = 0;
  for (let r = 0; r < side && i < n; r += 1) {
    for (let c = 0; c < side && i < n; c += 1, i += 1) {
      occupied.set(i === Math.floor(n / 2) ? 'student' : `a${i}`, { x: c * pitch, y: r * pitch });
    }
  }
  return occupied;
}

console.log('── 1. 빽빽한 그래프 안의 앵커에 붙여도 겹치지 않는다 ──');
{
  const occupied = denseGraph(196, 70); // 3학년 파일럿 규모. pitch 70 < 2R+gap 이라 링 0 은 전부 막힌다.
  const before = new Map(occupied);
  const res = placeNewNodes({
    newIds: ['p1', 'p2', 'p3'],
    neighborsOf: (id) => (id === 'p1' ? ['a95', 'a96'] : id === 'p2' ? ['p1', 'student'] : ['a0']),
    sizeOf: () => SIZE,
    occupied,
  });
  const bad = noOverlap(occupied, ['p1', 'p2', 'p3'], PLACEMENT_GAP, () => R);
  check('세 노드 모두 자리를 받았다', res.positions.size === 3);
  check('미해결 없음', res.unresolved.length === 0, JSON.stringify(res.unresolved));
  check('기존·신규 어느 노드와도 겹치지 않는다', bad.length === 0, bad.slice(0, 5).join(', '));
  check('기존 노드는 움직이지 않았다', [...before].every(([id, p]) => occupied.get(id)!.x === p.x && occupied.get(id)!.y === p.y));
  check('호출자의 occupied 맵이 갱신됐다(체인 앵커용)', occupied.has('p1') && occupied.has('p2') && occupied.has('p3'));
}

console.log('── 2. 이웃이 없으면 fallback(학생 허브) 근처, 그래도 겹치지 않는다 ──');
{
  const occupied = denseGraph(49, 70);
  const student = occupied.get('student')!;
  const res = placeNewNodes({ newIds: ['lone'], neighborsOf: () => [], sizeOf: () => SIZE, occupied, fallback: student });
  const p = res.positions.get('lone')!;
  const dist = Math.hypot(p.x - student.x, p.y - student.y);
  check('자리를 받았다', !!p);
  check('겹치지 않는다', noOverlap(occupied, ['lone'], PLACEMENT_GAP, () => R).length === 0);
  // 7×7 격자는 빈틈이 없어 가장 가까운 빈자리가 격자 가장자리 바깥(반폭 210 + 상자 + 공기)이다.
  // 그 너머로 튀지 않았는지만 본다.
  check('격자 가장자리 바로 바깥에 있다(멀리 도망가지 않았다)', dist < 210 + 2 * R + PLACEMENT_GAP + 100, `${dist}`);
}

console.log('── 3. 새 노드끼리만 이어진 체인은 서로 앵커가 된다 ──');
{
  const occupied = new Map<string, Point>([['student', { x: 0, y: 0 }], ['a1', { x: 200, y: 0 }]]);
  const res = placeNewNodes({
    newIds: ['q1', 'q2', 'q3'],
    neighborsOf: (id) => ({ q1: ['a1'], q2: ['q1'], q3: ['q2'] } as Record<string, string[]>)[id] ?? [],
    sizeOf: () => SIZE,
    occupied,
  });
  const q1 = res.positions.get('q1')!;
  const q2 = res.positions.get('q2')!;
  const d12 = Math.hypot(q1.x - q2.x, q1.y - q2.y);
  const d1a = Math.hypot(q1.x - 200, q1.y);
  check('q1 은 a1 옆(한 링 안)', d1a <= 2 * R + PLACEMENT_GAP + 1, `${d1a}`);
  check('q2 는 q1 옆(허브가 아니라 앞 노드에 붙는다)', d12 <= 2 * R + PLACEMENT_GAP + 1, `${d12}`);
  check('q3 도 겹치지 않는다', noOverlap(occupied, ['q1', 'q2', 'q3'], PLACEMENT_GAP, () => R).length === 0);
  check('바깥 방향 우선 — q1 이 허브 반대편(x > a1)', q1.x > 200, `${q1.x}`);
}

console.log('── 4. 간격 배수가 공기를 키운다 ──');
{
  const mk = (spacing: number) => {
    const occupied = new Map<string, Point>([['a1', { x: 0, y: 0 }]]);
    const r = placeNewNodes({ newIds: ['n'], neighborsOf: () => ['a1'], sizeOf: () => SIZE, occupied, spacing });
    const p = r.positions.get('n')!;
    return Math.hypot(p.x, p.y);
  };
  check('spacing 2 가 1 보다 멀다', mk(2) > mk(1), `${mk(1)} vs ${mk(2)}`);
  check('spacing 1 = 2R + GAP', Math.abs(mk(1) - (2 * R + PLACEMENT_GAP)) < 1, `${mk(1)}`);
}

console.log('── 5. 앵커는 무게중심이 아니라 가장 한산한 이웃 하나 ──');
{
  // a_left 는 빽빽한 무리 안, a_right 는 홀로. 무게중심 규칙이면 둘 사이(무리 쪽)로 갔다.
  const occupied = new Map<string, Point>([['a_left', { x: 0, y: 0 }], ['a_right', { x: 600, y: 0 }]]);
  for (let i = 0; i < 12; i += 1) {
    occupied.set(`c${i}`, { x: Math.cos((i / 12) * Math.PI * 2) * 75, y: Math.sin((i / 12) * Math.PI * 2) * 75 });
  }
  const r = placeNewNodes({ newIds: ['n'], neighborsOf: () => ['a_left', 'a_right'], sizeOf: () => SIZE, occupied });
  const p = r.positions.get('n')!;
  check('한산한 a_right 옆에 놓였다', Math.hypot(p.x - 600, p.y) < Math.hypot(p.x, p.y), JSON.stringify(p));
  check('겹치지 않는다', noOverlap(occupied, ['n'], PLACEMENT_GAP, () => R).length === 0);
}

console.log('── 6. 결정적 — 같은 입력이면 같은 출력 ──');
{
  const run = () => {
    const occupied = denseGraph(64, 70);
    const r = placeNewNodes({ newIds: ['p', 'q'], neighborsOf: (id) => (id === 'p' ? ['a10'] : ['p']), sizeOf: () => SIZE, occupied });
    return JSON.stringify([...r.positions]);
  };
  check('두 번 실행이 같다', run() === run());
}

console.log('── 7. 크기가 다른 노드도 실측으로 판정한다 ──');
{
  const occupied = new Map<string, Point>([['big', { x: 0, y: 0 }]]);
  const sizeOf = (id: string) => (id === 'big' ? { w: 200, h: 200 } : SIZE);
  const r = placeNewNodes({ newIds: ['n'], neighborsOf: () => ['big'], sizeOf, occupied });
  const p = r.positions.get('n')!;
  check('큰 앵커의 반지름만큼 더 멀다', Math.hypot(p.x, p.y) >= 100 + R + PLACEMENT_GAP - 1, `${Math.hypot(p.x, p.y)}`);
}

console.log('── 8. 정적 검사 — 캔버스가 이 규칙을 실제로 쓴다 ──');
{
  const src = readFileSync('src/features/inquiry-design/components/InquiryGraphCanvas.tsx', 'utf8');
  check('placeNewNodes import', src.includes("from '../utils/newNodePlacement'"));
  check('seedNewNodePositions 가 placeNewNodes 를 호출', /function seedNewNodePositions[\s\S]*?placeNewNodes\(/.test(src));
  check('무게중심 규칙이 사라졌다', !/anchors\.forEach\(\(anchor\) => \{\s*const p = anchor\.position\(\)/.test(src));
  check('간격 배수를 넘긴다', /seedNewNodePositions\(cy, [^)]*spacingRef\.current\)/.test(src));
  const emphasisCalls = (src.match(/applyPreviewEmphasis\(cy\)/g) ?? []).length;
  check('미리보기 강조 함수가 있고 3곳 이상에서 호출된다', src.includes('function applyPreviewEmphasis') && emphasisCalls >= 3, `${emphasisCalls}`);
  check('preview-backdrop 스타일 2종', src.includes("selector: 'node.preview-backdrop'") && src.includes("selector: 'edge.preview-backdrop'"));
  const backdropIdx = src.indexOf("selector: 'node.preview-backdrop'");
  const dimmedIdx = src.indexOf("selector: 'node.dimmed'");
  check('backdrop 규칙이 dimmed 보다 앞(겹치면 hover 가 이긴다)', backdropIdx > 0 && backdropIdx < dimmedIdx);
  const previewStart = src.indexOf(`selector: 'node[scope = "preview"]'`);
  const previewRule = src.slice(previewStart, previewStart + 600);
  check('미리보기 노드는 z-index + 후광', previewRule.includes("'z-index'") && previewRule.includes("'underlay-color'"));
  // 정착 패스 — 빈자리 배치 **뒤에** 무작위 없는 재배치 한 번, 전체 보기 점프 없이.
  const incStart = src.indexOf('// Incremental update');
  const inc = src.slice(incStart);
  const seedIdx = inc.indexOf('seedNewNodePositions(cy, added.nodes()');
  const settleIdx = inc.indexOf('startLayout(presetRef.current, { randomize: false, animate: true, fit: false');
  check('정착 패스가 빈자리 배치 뒤에 온다', seedIdx > 0 && settleIdx > seedIdx, `${seedIdx}/${settleIdx}`);
  check('정착 패스는 randomize:false + fit:false', settleIdx > 0);
  check('정착 뒤 새 노드로 카메라를 모은다(onStop → focusOnAdded)', /onStop: \(\) => focusOnAdded\(cy, added\)/.test(inc));
  check('buildLayout 이 fit 옵션을 받는다', src.includes('fit: opts.fit ?? true'));
  check('layoutstop 의 fit(60) 도 fit:false 를 존중한다', src.includes('if (opts.fit !== false) cy.fit(undefined, 60)'));
}

console.log('── 9. 정적 검사 — Academy 설계 의뢰 현황은 연구대 오른쪽 작성란 밑에만 (2026-09-14) ──');
{
  const obs = readFileSync('src/features/academy/game/GameObservatory.tsx', 'utf8');
  const briefIdx = obs.indexOf('<GenerationBrief ');
  const designSectionStart = obs.indexOf("{view === 'design' && <div className={styles.deskWorkspace}");
  const historyStart = obs.indexOf("{view === 'history' && <section>");
  check('GenerationBrief 가 연구대 블록 안에 있다', briefIdx > designSectionStart && briefIdx < historyStart, `${briefIdx}/${designSectionStart}/${historyStart}`);
  check('연구 수첩 블록에는 현황이 없다', !obs.slice(historyStart).includes('GenerationBrief') && !obs.slice(historyStart).includes('GenerationStatus'));
  check('종전 하단 섹션(design||history 조건)이 사라졌다', !obs.includes("(view === 'design' || view === 'history') && !readOnly && <section>"));
  const gs = readFileSync('src/features/academy/game/GenerationStatus.tsx', 'utf8');
  check('현황은 간추린 행(ResearchProgress 단계 목록을 되풀이하지 않는다)', !gs.includes("from './ResearchProgress'") && gs.includes('generationBriefRow'));
  check('보일 것이 없으면 그리지 않는다', gs.includes('if (!jobs.length && !error) return null'));
  const css = readFileSync('src/features/academy/game/game.module.css', 'utf8');
  check('행 스타일이 버튼 자리를 따로 둔다(다른 버튼과 충돌 방지)', css.includes('.generationBriefRow > .textButton { grid-column: 3'));
  // 오버레이 + 접기 (2026-09-14 2차 지시)
  check('현황은 오른쪽 아래 오버레이', /\.generationBrief \{ position: absolute; z-index: \d+; right: 20px; bottom: 20px/.test(css));
  check('오버레이는 접을 수 있다', gs.includes('data-collapsed={collapsed}') && gs.includes('aria-expanded={!collapsed}'));
  check('펼친 설계도는 접을 수 있다(의뢰 행 · 작성란 양쪽)', gs.includes("'설계도 접기'") === false && gs.includes('설계도 접기') && obs.includes('closeGeneration') && obs.includes('설계도 접기 · 나중에 다시 펼치기'));
  check('어느 의뢰가 펼쳐져 있는지 넘긴다', obs.includes('openedDraftId={analysis ? draftId : null}'));
  check('대기 화면과 겹치지 않는다(localBusy 면 숨김)', obs.includes('!readOnly && !localBusy && <GenerationBrief'));
}

console.log(fails === 0 ? '\n모두 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
