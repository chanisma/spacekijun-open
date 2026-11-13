import React from 'react';
import { AlertTriangle, Shield } from 'lucide-react';
import { CategoryStat } from '../../../hooks/useWeaknessData';
import { DIFFICULTY_COLOR } from '../../../utils/difficulty';
import { cn } from '@/lib/utils';

interface Props {
  weakTop3: CategoryStat[];
  strongTop3: CategoryStat[];
  onCardClick: (major: string, sub: string) => void;
}

function scoreColor(score: number): string {
  if (score >= 5) return 'text-red-600';
  if (score >= 3) return 'text-amber-600';
  return 'text-slate-500';
}

function MiniDifficultyDots({ stat }: { stat: CategoryStat }) {
  const parts = (['상', '중', '하'] as const)
    .map((band) => ({ band, wrong: stat.byDifficulty[band].wrong }))
    .filter((p) => p.wrong > 0);
  if (parts.length === 0) return null;
  return (
    <span className="text-[10px] text-slate-500 ml-1">
      {parts.map((p, i) => (
        <span key={p.band}>
          <span style={{ color: DIFFICULTY_COLOR[p.band] }}>●</span>
          {p.band} {p.wrong}
          {i < parts.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </span>
  );
}

const WeaknessSummaryCards: React.FC<Props> = ({ weakTop3, strongTop3, onCardClick }) => {
  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="rounded-xl border border-red-100 bg-red-50/50 p-3">
        <h4 className="text-[11px] font-semibold text-red-600 flex items-center gap-1 mb-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          취약 영역 TOP 3 <span className="text-[9px] text-red-400 font-normal">(시급도 순)</span>
        </h4>
        {weakTop3.length === 0 ? (
          <p className="text-xs text-slate-400">오답 없음</p>
        ) : (
          <ul className="space-y-1.5">
            {weakTop3.map((c) => (
              <li
                key={`${c.majorCategory}|${c.subCategory}`}
                className="text-xs cursor-pointer hover:bg-white/60 rounded px-1 py-0.5 transition-colors"
                onClick={() => onCardClick(c.majorCategory, c.subCategory)}
              >
                <div className="flex justify-between items-baseline">
                  <span className="truncate mr-2 text-slate-700">{c.subCategory}</span>
                  <span className={cn('font-semibold shrink-0', scoreColor(c.score))}>
                    {c.score.toFixed(1)}
                  </span>
                </div>
                <MiniDifficultyDots stat={c} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
        <h4 className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mb-2">
          <Shield className="h-3.5 w-3.5" />
          강점 영역 TOP 3 <span className="text-[9px] text-emerald-400 font-normal">(오답률 순)</span>
        </h4>
        {strongTop3.length === 0 ? (
          <p className="text-xs text-slate-400">데이터 없음</p>
        ) : (
          <ul className="space-y-1">
            {strongTop3.map((c) => (
              <li
                key={`${c.majorCategory}|${c.subCategory}`}
                className="text-xs text-slate-700 flex justify-between cursor-pointer hover:bg-white/60 rounded px-1 py-0.5 transition-colors"
                onClick={() => onCardClick(c.majorCategory, c.subCategory)}
              >
                <span className="truncate mr-2">{c.subCategory}</span>
                <span className="font-semibold text-emerald-600 shrink-0">{c.rate}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default WeaknessSummaryCards;
