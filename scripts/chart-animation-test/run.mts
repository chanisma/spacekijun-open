/**
 * 차트 등장 애니메이션 회귀 테스트 — `npx tsx scripts/chart-animation-test/run.mts`
 *
 * `src/lib/chartAnimation.ts` + `src/index.css`의 "점 먼저, 선 나중" 연출은
 * **recharts 내부 구현 3가지에 의존**한다. recharts를 올릴 때 조용히 깨질 수 있어
 * 여기서 실제 렌더 결과(SSR 마크업)로 못 박아 둔다.
 *
 *   1. `<Line className>`이 감싸는 <g>로 전달된다      → CSS 스코프(.chart-line-draw)가 성립
 *   2. `pathLength`가 SVG 속성 허용목록에 있어 곡선 <path>까지 전달된다
 *                                                      → stroke-dasharray: 1 정규화가 성립
 *   3. 곡선/점 레이어 클래스가 `recharts-line-curve` / `recharts-line-dots`다
 *                                                      → CSS 선택자가 성립
 *
 * 하나라도 깨지면 선이 통째로 안 보이거나(dasharray만 남고 dashoffset 정규화 실패)
 * 애니메이션이 사라진다. 둘 다 조용한 실패라 눈으로는 늦게 발견된다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LineChart, Line } from 'recharts';
import { drawLineProps, fadeLineProps, staticLineProps } from '../../src/lib/chartAnimation';

const data = [
  { x: 'a', v: 1 },
  { x: 'b', v: 3 },
  { x: 'c', v: 2 },
];

const render = (lineProps: Record<string, unknown>) =>
  renderToStaticMarkup(
    h(
      LineChart as never,
      { width: 400, height: 200, data },
      h(Line as never, { type: 'monotone', dataKey: 'v', dot: { r: 4 }, ...lineProps }),
    ),
  );

const solid = render({ ...drawLineProps });
const dashed = render({ ...fadeLineProps, strokeDasharray: '5 3' });
const staticLine = render({ ...staticLineProps });

/** 곡선 <path> 태그만 잘라낸다 (점 <circle>과 구분해서 검사하기 위함) */
const curveTag = (html: string) => html.match(/<path[^>]*recharts-line-curve[^>]*>/)?.[0] ?? '';

const checks: Array<[string, boolean]> = [
  // 1) CSS 스코프용 클래스가 감싸는 <g>에 실린다
  ['[draw] 래퍼 <g>에 chart-line-draw 클래스', /<g class="[^"]*\brecharts-line\b[^"]*\bchart-line-draw\b/.test(solid)],
  ['[fade] 래퍼 <g>에 chart-line-fade 클래스', /<g class="[^"]*\brecharts-line\b[^"]*\bchart-line-fade\b/.test(dashed)],

  // 2) pathLength가 곡선 path까지 도달한다 (CSS dasharray:1 정규화의 전제)
  ['[draw] 곡선 path에 pathLength="1" 도달', curveTag(solid).includes('pathLength="1"')],

  // 3) 레이어 클래스명이 CSS 선택자와 일치한다
  ['[draw] 곡선 클래스 = recharts-line-curve', curveTag(solid) !== ''],
  ['[draw] 점 레이어 = recharts-line-dots', /<g class="[^"]*\brecharts-line-dots\b/.test(solid)],

  // 4) 핵심 목적: 애니메이션을 기다리지 않고 점이 즉시 렌더된다
  ['[draw] 점 3개가 즉시 렌더', (solid.match(/recharts-line-dot\b/g) ?? []).length === 3],
  ['[fade] 점 3개가 즉시 렌더', (dashed.match(/recharts-line-dot\b/g) ?? []).length === 3],
  ['[static] 점 3개가 즉시 렌더', (staticLine.match(/recharts-line-dot\b/g) ?? []).length === 3],

  // 5) 점선 Line은 dasharray를 뺏기지 않는다 (fadeLineProps를 따로 둔 이유)
  ['[fade] 점선 stroke-dasharray="5 3" 보존', curveTag(dashed).includes('stroke-dasharray="5 3"')],
  ['[fade] 곡선에 pathLength 미부여', !curveTag(dashed).includes('pathLength')],

  // 6) 그리기용 dasharray는 CSS가 준다 — 인라인으로 새어 나오면 CSS가 덮이거나 중복된다
  ['[draw] 곡선에 인라인 stroke-dasharray 없음', !curveTag(solid).includes('stroke-dasharray')],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}

if (failed) {
  console.log('\n--- solid ---\n' + solid);
  console.log('\n--- dashed ---\n' + dashed);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
