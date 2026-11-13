/**
 * 학년·학급 분석 차트 회귀 — `npx tsx scripts/cohort-charts-test/run.mts`
 *
 * 여기 담긴 네 그림은 전부 **비어도 오류가 나지 않는다**. recharts 는 축 조합이 어긋나면
 * 예외 대신 마크를 0개 그리므로, "차트가 나오긴 하는데 아무것도 없다"가 조용한 실패다.
 * 특히 ②(세로 레이아웃 + Scatter)와 ③(누적 가로 막대)은 이 파일에서만 쓰는 조합이라
 * recharts 버전을 올릴 때 먼저 깨질 자리다. 실제 SSR 마크업으로 못 박아 둔다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BarChart, Bar, ComposedChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, LineChart, Line,
} from 'recharts';
import { drawLineProps } from '../../src/lib/chartAnimation';

const rows = [
  { subject: '국어', scoreRate: 62.1, meanGrade: 4.2, 상: 20, 중상: 30, 중하: 30, 하: 20 },
  { subject: '수학', scoreRate: 48.9, meanGrade: 5.1, 상: 10, 중상: 25, 중하: 35, 하: 30 },
];

// ① 가로 막대(득점률)
const bar = renderToStaticMarkup(
  h(BarChart as never, { width: 500, height: 200, data: rows, layout: 'vertical' },
    h(XAxis as never, { type: 'number', domain: [0, 100] }),
    h(YAxis as never, { type: 'category', dataKey: 'subject' }),
    h(Bar as never, { dataKey: 'scoreRate', fill: '#6366f1' }),
  ),
);

// ② 세로 레이아웃 Scatter(평균 등급) — 여기가 조용히 빌 수 있는 곳
const scatter = renderToStaticMarkup(
  h(ComposedChart as never, { width: 500, height: 200, data: rows, layout: 'vertical' },
    h(XAxis as never, { type: 'number', dataKey: 'meanGrade', domain: [1, 9] }),
    h(YAxis as never, { type: 'category', dataKey: 'subject' }),
    h(ZAxis as never, { range: [90, 90] }),
    h(ReferenceLine as never, { x: 5, stroke: '#94a3b8' }),
    h(Scatter as never, { dataKey: 'meanGrade', fill: '#6366f1' }),
  ),
);

// ③ 100% 누적 가로 막대(등급 그룹 비율)
const stacked = renderToStaticMarkup(
  h(BarChart as never, { width: 500, height: 200, data: rows, layout: 'vertical' },
    h(XAxis as never, { type: 'number', domain: [0, 100] }),
    h(YAxis as never, { type: 'category', dataKey: 'subject' }),
    ...['상', '중상', '중하', '하'].map((g) =>
      h(Bar as never, { key: g, dataKey: g, stackId: 'r', fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 })),
  ),
);

// ④ 5라인 문항순 정답률
const line = renderToStaticMarkup(
  h(LineChart as never, { width: 500, height: 200, data: [{ n: 1, 학교전체: 50, 상: 80 }, { n: 2, 학교전체: 60, 상: 90 }] },
    h(Line as never, { dataKey: '학교전체', stroke: '#334155', ...drawLineProps }),
    h(Line as never, { dataKey: '상', stroke: '#4f46e5', ...drawLineProps }),
  ),
);

const checks: [string, boolean][] = [
  ['① 득점률 막대가 그려진다', (bar.match(/recharts-rectangle/g) ?? []).length >= 2],
  ['① y축에 과목명이 있다', bar.includes('국어') && bar.includes('수학')],
  ['② 평균등급 점이 그려진다', (scatter.match(/recharts-symbols/g) ?? []).length >= 2],
  ['② 기준선(5등급)이 있다', scatter.includes('recharts-reference-line')],
  ['③ 누적 4구간 × 2과목 = 8칸', (stacked.match(/recharts-rectangle/g) ?? []).length >= 8],
  ['③ 구간 사이 흰 테두리', stacked.includes('stroke="#fff"')],
  ['④ 라인 2개가 그려진다', (line.match(/recharts-line-curve/g) ?? []).length === 2],
  ['④ 점이 선과 함께 즉시 렌더', line.includes('recharts-line-dots')],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) fail += 1;
}
console.log(fail === 0 ? 'OK' : `FAILED ${fail}`);
process.exit(fail === 0 ? 0 : 1);
