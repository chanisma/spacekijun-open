import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { drawLineProps } from '@/lib/chartAnimation';
import { TimelinePoint } from '../../../utils/weaknessScore';
import { DIFFICULTY_COLOR } from '../../../utils/difficulty';

interface Props {
  timeline: TimelinePoint[];
  title: string;
}

interface DifficultyRow {
  key: 'overallRate' | 'hardRate' | 'midRate' | 'easyRate';
  label: string;
  color: string;
  rateField: 'overallRate' | 'hardRate' | 'midRate' | 'easyRate';
  wrongField: 'overallWrong' | 'hardWrong' | 'midWrong' | 'easyWrong';
  totalField: 'overallTotal' | 'hardTotal' | 'midTotal' | 'easyTotal';
}

const DIFFICULTY_ROWS: DifficultyRow[] = [
  { key: 'overallRate', label: '전체', color: '#ef4444',
    rateField: 'overallRate', wrongField: 'overallWrong', totalField: 'overallTotal' },
  { key: 'hardRate', label: '상', color: DIFFICULTY_COLOR['상'],
    rateField: 'hardRate', wrongField: 'hardWrong', totalField: 'hardTotal' },
  { key: 'midRate', label: '중', color: DIFFICULTY_COLOR['중'],
    rateField: 'midRate', wrongField: 'midWrong', totalField: 'midTotal' },
  { key: 'easyRate', label: '하', color: DIFFICULTY_COLOR['하'],
    rateField: 'easyRate', wrongField: 'easyWrong', totalField: 'easyTotal' },
];

const DifficultyTimelineTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as Record<string, number | null>;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {DIFFICULTY_ROWS.map((r) => {
        const rate = row[r.rateField];
        const wrong = row[r.wrongField];
        const total = row[r.totalField];
        return (
          <p key={r.key} className="text-slate-500 leading-tight">
            <span style={{ color: r.color }}>■</span> {r.label}:{' '}
            {rate == null ? <span className="text-slate-300">—</span> : (
              <>{rate}% <span className="text-slate-400">({wrong}/{total})</span></>
            )}
          </p>
        );
      })}
    </div>
  );
};

const DifficultyTimelineChart: React.FC<Props> = ({ timeline, title }) => {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggleHidden = (key: string) =>
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));

  const chartData = useMemo(() => {
    return timeline.map((p) => ({
      examLabel: p.examLabel,
      overallRate: p.wrongRate,
      hardRate: p.byDifficulty['상'].wrongRate,
      midRate: p.byDifficulty['중'].wrongRate,
      easyRate: p.byDifficulty['하'].wrongRate,
      overallWrong: p.wrongCount, overallTotal: p.totalCount,
      hardWrong: p.byDifficulty['상'].wrongCount, hardTotal: p.byDifficulty['상'].totalCount,
      midWrong: p.byDifficulty['중'].wrongCount, midTotal: p.byDifficulty['중'].totalCount,
      easyWrong: p.byDifficulty['하'].wrongCount, easyTotal: p.byDifficulty['하'].totalCount,
    }));
  }, [timeline]);

  return (
    <div className="mb-3 bg-white rounded-lg p-2 border border-gray-100">
      <h5 className="text-[10px] font-medium text-slate-500 mb-1">
        {title}
        <span className="text-[9px] text-slate-400 ml-1 font-normal">범례 클릭으로 라인 토글</span>
      </h5>
      {timeline.length < 2 ? (
        <p className="text-[10px] text-slate-400 py-4 text-center">
          시계열 비교는 2회차 이상의 시험이 필요합니다 (현재 {timeline.length}회차)
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="examLabel" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              width={32}
            />
            <Tooltip content={<DifficultyTimelineTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              onClick={(e) => toggleHidden(String(e.dataKey))}
            />
            <Line
              {...drawLineProps}
              dataKey="overallRate" name="전체"
              stroke="#ef4444" strokeWidth={2.5}
              hide={hidden.overallRate} connectNulls={false}
              dot={{ r: 2.5, fill: '#ef4444' }} activeDot={{ r: 5 }}
            />
            <Line
              {...drawLineProps}
              dataKey="hardRate" name="상"
              stroke={DIFFICULTY_COLOR['상']} strokeWidth={1.5}
              hide={hidden.hardRate} connectNulls={false}
              dot={{ r: 2.5, fill: DIFFICULTY_COLOR['상'] }} activeDot={{ r: 4 }}
            />
            <Line
              {...drawLineProps}
              dataKey="midRate" name="중"
              stroke={DIFFICULTY_COLOR['중']} strokeWidth={1.5}
              hide={hidden.midRate} connectNulls={false}
              dot={{ r: 2.5, fill: DIFFICULTY_COLOR['중'] }} activeDot={{ r: 4 }}
            />
            <Line
              {...drawLineProps}
              dataKey="easyRate" name="하"
              stroke={DIFFICULTY_COLOR['하']} strokeWidth={1.5}
              hide={hidden.easyRate} connectNulls={false}
              dot={{ r: 2.5, fill: DIFFICULTY_COLOR['하'] }} activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default DifficultyTimelineChart;
