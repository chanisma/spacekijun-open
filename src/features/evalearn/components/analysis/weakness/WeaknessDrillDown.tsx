import React from 'react';
import { X } from 'lucide-react';
import { CategoryStat, ProblemDetail } from '../../../hooks/useWeaknessData';
import DifficultyTimelineChart from './DifficultyTimelineChart';
import { cn } from '@/lib/utils';

interface Props {
  selected: CategoryStat | null;
  problems: ProblemDetail[];
  onClose: () => void;
}

function formatCorrectRate(rate: string | null): string | null {
  if (rate == null) return null;
  const num = rate.replace(/[^0-9.]/g, '');
  return num || null;
}

const WeaknessDrillDown: React.FC<Props> = ({ selected, problems, onClose }) => {
  if (!selected) return null;

  return (
    <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold text-brand-700">
          {selected.majorCategory} &gt; {selected.subCategory} — {problems.length}문항
        </h4>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <DifficultyTimelineChart
        timeline={selected.timeline}
        title="회차별 오답률 추이 (난이도별)"
      />

      {/* 문항 리스트 */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-brand-100">
            <th className="p-1.5 text-left font-medium text-slate-500">시험</th>
            <th className="p-1.5 text-center font-medium text-slate-500 w-12">번호</th>
            <th className="p-1.5 text-center font-medium text-slate-500 w-12">답안</th>
            <th className="p-1.5 text-center font-medium text-slate-500 w-12">정오</th>
            <th className="p-1.5 text-center font-medium text-slate-500 w-16">정답률</th>
            <th className="p-1.5 text-left font-medium text-slate-500">출제의도</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((p, idx) => {
            const rateNum = formatCorrectRate(p.correctRate);
            return (
              <tr
                key={idx}
                className={cn('border-b border-brand-50', p.isCorrect ? 'bg-green-50/30' : 'bg-red-50/50')}
              >
                <td className="p-1.5 text-slate-600">{p.examLabel}</td>
                <td className="p-1.5 text-center font-medium text-slate-700">{p.problemNumber}</td>
                <td className="p-1.5 text-center font-medium text-slate-700">{p.studentAnswer ?? '-'}</td>
                <td className="p-1.5 text-center">
                  {p.isCorrect
                    ? <span className="text-green-600 font-bold">O</span>
                    : <span className="text-red-500 font-bold">X</span>}
                </td>
                <td className="p-1.5 text-center">
                  {rateNum != null ? (
                    <span className={cn(
                      'font-medium',
                      parseFloat(rateNum) < 30 ? 'text-red-500'
                        : parseFloat(rateNum) < 60 ? 'text-amber-600'
                        : 'text-green-600'
                    )}>
                      {rateNum}%
                    </span>
                  ) : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-1.5 text-left text-slate-600 max-w-xs truncate" title={p.intention ?? ''}>
                  {p.intention ?? <span className="text-slate-300">-</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default WeaknessDrillDown;
