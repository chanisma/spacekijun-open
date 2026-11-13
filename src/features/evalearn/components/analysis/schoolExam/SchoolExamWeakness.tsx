import React from 'react';
import { cn } from '@/lib/utils';
import type { SchoolExamGroupStat } from '../../../utils/schoolExamAnalysis';

interface Props {
  title: string;
  hint: string;
  stats: SchoolExamGroupStat[];
  /** 성취기준처럼 설명 문장이 있는 목록이면 함께 보여준다 */
  showDescription?: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  emptyText: string;
}

/** 내 오답률과 학년 오답률을 한 줄에 겹쳐 그린다 — 막대 두 개보다 격차가 눈에 빨리 들어온다. */
function CompareBar({ mine, cohort }: { mine: number; cohort: number | null }) {
  return (
    <div className="relative h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          cohort != null && mine > cohort ? 'bg-red-400' : 'bg-slate-400'
        )}
        style={{ width: `${Math.min(100, mine)}%` }}
      />
      {cohort != null && (
        // 학년 평균 위치 표식. 내 막대가 이 선을 넘으면 그 영역이 남들보다 약하다.
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-700"
          style={{ left: `calc(${Math.min(100, cohort)}% - 1px)` }}
        />
      )}
    </div>
  );
}

const SchoolExamWeakness: React.FC<Props> = ({
  title, hint, stats, showDescription, selectedKey, onSelect, emptyText,
}) => {
  if (stats.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-4">
        <p className="text-[11px] font-semibold text-slate-500 mb-1">{title}</p>
        <p className="text-xs text-slate-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <p className="text-[11px] font-semibold text-slate-500">{title}</p>
        <p className="text-[10px] text-slate-400 shrink-0">{hint}</p>
      </div>
      <ul className="space-y-1.5">
        {stats.map((stat) => {
          const isSelected = selectedKey === stat.key;
          return (
            <li key={stat.key}>
              <button
                type="button"
                onClick={() => onSelect(stat.key)}
                className={cn(
                  'w-full text-left rounded-lg px-2 py-1.5 transition-colors min-w-0',
                  isSelected ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'
                )}
              >
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                  <span className="text-xs text-slate-700 truncate" title={stat.label}>
                    {stat.label}
                  </span>
                  <span className="text-[11px] tabular-nums shrink-0">
                    <span className={cn('font-semibold', stat.wrongRate >= 50 ? 'text-red-600' : 'text-slate-600')}>
                      {stat.wrongRate}%
                    </span>
                    {stat.cohortWrongRate != null && (
                      <span className="text-slate-400"> / 학년 {Math.round(stat.cohortWrongRate)}%</span>
                    )}
                  </span>
                </div>
                <div className="mt-1">
                  <CompareBar mine={stat.wrongRate} cohort={stat.cohortWrongRate} />
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1 min-w-0">
                  <span className="text-[10px] text-slate-400 truncate">
                    {showDescription && stat.description
                      ? stat.description
                      : `오답 ${stat.wrongCount}/${stat.totalCount}문항`}
                  </span>
                  {stat.gap != null && stat.gap !== 0 && (
                    <span
                      className={cn(
                        'text-[10px] font-medium shrink-0 tabular-nums',
                        stat.gap > 0 ? 'text-red-500' : 'text-emerald-600'
                      )}
                    >
                      {stat.gap > 0 ? '▲' : '▼'} {Math.abs(stat.gap).toFixed(0)}%p
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SchoolExamWeakness;
