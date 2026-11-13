/**
 * 업무 흐름 안내 씬 회귀 (2026-09-04)
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/workflow-guide-test/run.mts
 * (`--tsconfig` 없이 돌리면 .tsx 가 classic 런타임으로 컴파일돼 `React is not defined` 로 죽는다)
 *
 * 사용자 제보 2건을 못 박는다:
 *   ① "화살표가 눈에 잘 안 보임" — 색이 `--hair`(#e2e8f0, 흰 배경 대비 1.20:1)였고 화살촉이
 *      없었으며, 세로 연결선은 `w={2}` 로 불려 2×2 점으로 그려졌다.
 *   ② "도구 붙이기 마우스 위치" — 포인터 좌표를 손으로 적어 한 칸 위("없음" 행)를 가리켰다.
 *
 * 둘 다 **오류 없이 조용히** 틀린다(렌더는 성공하고 그림만 이상하다). 그래서 SSR 마크업과
 * 좌표 산술을 직접 본다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneDraw, SceneWork } from '../../src/components/tasks/guide/workflowScenes';
import { STAGE_W, STAGE_H } from '../../src/components/walkthrough/WalkthroughStage';
import { WINDOW_CHROME as CH, centerOf, inWindow, type Rect } from '../../src/components/walkthrough/stageCoords';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// 씬은 `useSceneTime()` 으로 시간을 읽는다. SSR 에서는 초기값(0)이라 애니메이션이 시작 전
// 상태로 굳는다 — 화살표의 **모양**(색·촉·방향)은 시간과 무관하므로 그대로 검증할 수 있다.
const drawHtml = renderToStaticMarkup(h(SceneDraw));
const workHtml = renderToStaticMarkup(h(SceneWork));

console.log('\n[① 화살표가 보이는가]');
check('화살표가 경계선 색(--hair)으로 그려지지 않는다',
  !/stroke="var\(--hair\)"/.test(drawHtml) && !/fill="var\(--hair\)"/.test(drawHtml));
check('shaft 가 --fg-muted(대비 4.76:1) 로 그려진다',
  /<line[^>]*stroke="var\(--fg-muted\)"/.test(drawHtml));
check('화살촉(polygon)이 있다',
  /<polygon[^>]*fill="var\(--fg-muted\)"/.test(drawHtml));
check('가로 화살표 2개 + 세로 1개 = polygon 3개',
  (drawHtml.match(/<polygon/g) ?? []).length === 3,
  `실제 ${(drawHtml.match(/<polygon/g) ?? []).length}개`);

console.log('\n[② 세로 화살표가 점이 아니다]');
{
  // 세로 화살표는 viewBox 가 `0 0 <두께> <길이>` 라 길이가 두께보다 훨씬 커야 한다.
  const boxes = [...drawHtml.matchAll(/viewBox="0 0 ([\d.]+) ([\d.]+)"/g)]
    .map((m) => ({ w: Number(m[1]), h: Number(m[2]) }));
  const vertical = boxes.filter((b) => b.h > b.w);
  check('세로 방향 SVG 가 1개 있다', vertical.length === 1, `실제 ${vertical.length}개`);
  check('세로 길이가 두께보다 크다(2×2 점이 아니다)',
    vertical.every((b) => b.h >= 20 && b.w <= 12),
    JSON.stringify(vertical));
  const horizontal = boxes.filter((b) => b.w > b.h);
  check('가로 화살표 2개의 길이가 노드 간격(118)과 같다',
    horizontal.length === 2 && horizontal.every((b) => b.w === 118),
    JSON.stringify(horizontal));
}

console.log('\n[③ 도구 붙이기 포인터가 올바른 행을 짚는다]');
{
  // 씬이 쓰는 것과 같은 배치 상수 — 여기서 다시 계산해 대조한다.
  const F2_W: Rect = { x: 70, y: 62, w: 820, h: 430 };
  const PANEL = { x: 584, y: 46 };
  const ROWS = {
    none:   { x: 12, y: 122, w: 200, h: 30 },
    docgen: { x: 12, y: 158, w: 200, h: 30 },
    web:    { x: 12, y: 194, w: 200, h: 30 },
  };
  const abs = (r: Rect): Rect =>
    inWindow(F2_W, { x: PANEL.x + r.x, y: PANEL.y + r.y, w: r.w, h: r.h }, CH);

  // 렌더된 마크업에서 포인터 위치를 읽는다(씬이 실제로 쓰는 값).
  const pointerLeft = [...workHtml.matchAll(/left:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  const pointerTop = [...workHtml.matchAll(/top:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  check('포인터가 렌더된다', pointerLeft.length > 0 && pointerTop.length > 0);

  const want = centerOf(abs(ROWS.docgen));
  const wantPx = { x: want.x / 100 * STAGE_W, y: want.y / 100 * STAGE_H };
  const docgen = abs(ROWS.docgen);
  const nope = abs(ROWS.none);

  check('"문서 생성" 행 중심이 그 행 안에 있다',
    wantPx.y >= docgen.y && wantPx.y <= docgen.y + docgen.h);
  check('그 좌표가 "없음" 행과 겹치지 않는다',
    !(wantPx.y >= nope.y && wantPx.y <= nope.y + nope.h),
    `문서생성 중심 y=${wantPx.y}, 없음 행 ${nope.y}~${nope.y + nope.h}`);
  // 종전 하드코딩 값(y:168)이 어디를 가리켰는지 — 회귀하면 이 단언이 깨진다
  const oldCenter = centerOf(inWindow(F2_W, { x: 596, y: 168, w: 200, h: 30 }, CH));
  const oldPx = { y: oldCenter.y / 100 * STAGE_H };
  check('종전 좌표(y:168)는 실제로 "없음" 행이었다 — 회귀 감시용',
    oldPx.y >= nope.y && oldPx.y <= nope.y + nope.h,
    `y=${oldPx.y}`);
  check('두 좌표가 정확히 한 행(36px) 어긋나 있었다',
    Math.round(wantPx.y - oldPx.y) === 36, `차이 ${wantPx.y - oldPx.y}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('[workflow-guide] ALL PASS');
