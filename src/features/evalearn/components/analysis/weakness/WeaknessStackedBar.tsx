import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { CategoryStat } from '../../../hooks/useWeaknessData';
import { DIFFICULTY_COLOR } from '../../../utils/difficulty';

interface Props {
  categories: CategoryStat[];
  selectedCategory: string | null;
  onBarClick: (sub: string, major: string) => void;
}

interface ChartRow {
  majorCategory: string;
  subCategory: string;
  hard: number;
  mid: number;
  easy: number;
  unknown: number;
  correct: number;
  total: number;
  wrong: number;
  rate: number;
}

const CORRECT_COLOR = '#e2e8f0'; // slate-200, 옅은 회색 — 정답 부분

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload as ChartRow;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700">
        {row.majorCategory} &gt; {row.subCategory}
      </p>
      <p className="text-slate-500 mt-1">
        오답 {row.wrong} / 출제 {row.total} ({row.rate}%)
      </p>
      <p className="text-slate-400 mt-0.5 text-[10px]">
        {row.wrong > 0 ? (
          <>
            상 {row.hard} · 중 {row.mid} · 하 {row.easy}
            {row.unknown > 0 ? ` · 미분류 ${row.unknown}` : ''}
            {row.correct > 0 ? ` · 정답 ${row.correct}` : ''}
          </>
        ) : (
          <>전부 정답</>
        )}
      </p>
    </div>
  );
};

const WeaknessStackedBar: React.FC<Props> = ({ categories, selectedCategory, onBarClick }) => {
  const chartData: ChartRow[] = useMemo(() => {
    return [...categories]
      .sort((a, b) => b.rate - a.rate)
      .map((c) => ({
        majorCategory: c.majorCategory,
        subCategory: c.subCategory,
        hard: c.byDifficulty['상'].wrong,
        mid: c.byDifficulty['중'].wrong,
        easy: c.byDifficulty['하'].wrong,
        unknown: c.byDifficulty['미분류'].wrong,
        correct: Math.max(0, c.totalCount - c.wrongCount),
        total: c.totalCount,
        wrong: c.wrongCount,
        rate: c.rate,
      }))
      .reverse(); // recharts vertical layout: 위에 오답률 높음
  }, [categories]);

  const [selMajor, selSub] = selectedCategory ? selectedCategory.split('|') : [null, null];

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <h4 className="text-[11px] font-semibold text-slate-500 mb-1">
        소영역별 오답 구성 <span className="text-[9px] text-slate-400 font-normal">(오답률 순, 난이도 분할)</span>
      </h4>
      <p className="text-[10px] text-slate-400 mb-3">막대를 클릭하면 해당 영역의 시계열과 문항을 볼 수 있습니다</p>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32 + 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 80, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis type="category" dataKey="subCategory" width={100} tick={{ fontSize: 10, fill: '#475569' }} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Bar dataKey="hard" stackId="a" cursor="pointer" onClick={(d: any) => onBarClick(d.subCategory, d.majorCategory)}>
            {chartData.map((row, i) => {
              const isSel = row.majorCategory === selMajor && row.subCategory === selSub;
              return <Cell key={i} fill={DIFFICULTY_COLOR['상']} opacity={selectedCategory && !isSel ? 0.3 : 1} />;
            })}
          </Bar>
          <Bar dataKey="mid" stackId="a" cursor="pointer" onClick={(d: any) => onBarClick(d.subCategory, d.majorCategory)}>
            {chartData.map((row, i) => {
              const isSel = row.majorCategory === selMajor && row.subCategory === selSub;
              return <Cell key={i} fill={DIFFICULTY_COLOR['중']} opacity={selectedCategory && !isSel ? 0.3 : 1} />;
            })}
          </Bar>
          <Bar dataKey="easy" stackId="a" cursor="pointer" onClick={(d: any) => onBarClick(d.subCategory, d.majorCategory)}>
            {chartData.map((row, i) => {
              const isSel = row.majorCategory === selMajor && row.subCategory === selSub;
              return <Cell key={i} fill={DIFFICULTY_COLOR['하']} opacity={selectedCategory && !isSel ? 0.3 : 1} />;
            })}
          </Bar>
          <Bar
            dataKey="unknown"
            stackId="a"
            cursor="pointer"
            onClick={(d: any) => onBarClick(d.subCategory, d.majorCategory)}
          >
            {chartData.map((row, i) => {
              const isSel = row.majorCategory === selMajor && row.subCategory === selSub;
              return <Cell key={i} fill={DIFFICULTY_COLOR['미분류']} opacity={selectedCategory && !isSel ? 0.3 : 1} />;
            })}
          </Bar>
          <Bar
            dataKey="correct"
            stackId="a"
            cursor="pointer"
            onClick={(d: any) => onBarClick(d.subCategory, d.majorCategory)}
            label={({ x, y, width, index }: any) => {
              const row = chartData[index];
              if (!row) return null;
              return (
                <text x={(x ?? 0) + (width ?? 0) + 4} y={(y ?? 0) + 13} fontSize={10} fill="#64748b">
                  {row.wrong}/{row.total} ({row.rate}%)
                </text>
              );
            }}
          >
            {chartData.map((row, i) => {
              const isSel = row.majorCategory === selMajor && row.subCategory === selSub;
              return <Cell key={i} fill={CORRECT_COLOR} opacity={selectedCategory && !isSel ? 0.3 : 1} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex gap-3 mt-2 justify-center text-[10px] text-slate-500 flex-wrap">
        <span><span style={{ color: DIFFICULTY_COLOR['상'] }}>■</span> 상 (≤40%)</span>
        <span><span style={{ color: DIFFICULTY_COLOR['중'] }}>■</span> 중 (40~70%)</span>
        <span><span style={{ color: DIFFICULTY_COLOR['하'] }}>■</span> 하 (≥70%)</span>
        <span><span style={{ color: DIFFICULTY_COLOR['미분류'] }}>■</span> 미분류</span>
        <span><span style={{ color: CORRECT_COLOR }}>■</span> 정답</span>
      </div>
    </div>
  );
};

export default WeaknessStackedBar;
