import React from 'react';
import { AlertTriangle, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DIFFICULTY_COLOR, type DifficultyBand } from '../../../utils/difficulty';
import type { SchoolExamSummary as Summary } from '../../../utils/schoolExamAnalysis';

interface Props {
  summary: Summary;
  difficultyBreakdown: Array<{ band: DifficultyBand; wrong: number; total: number; wrongRate: number }>;
  /**
   * 학년 내 위치(석차·상위%)를 감춘다 — **학생 본인 화면**에서 켠다.
   * (2026-09-04 사용자 결정: 학생에게 상대적 석차 분석을 제공하지 않는다)
   * 학년 평균 타일은 남긴다 — 평균 하나로는 등수를 알 수 없고, "내가 어디쯤인지"가 아니라
   * "이 시험이 어려웠는지"를 읽는 기준이라 학습 피드백에 필요하다.
   */
  hideRanking?: boolean;
}

function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'good' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5 min-w-0">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          'text-lg font-semibold tabular-nums leading-tight mt-0.5',
          tone === 'good' && 'text-emerald-600',
          tone === 'bad' && 'text-red-600',
          tone === 'default' && 'text-slate-800'
        )}
      >
        {value}
      </p>
      {sub != null && <p className="text-[10px] text-slate-500 mt-0.5 break-words">{sub}</p>}
    </div>
  );
}

const SchoolExamSummary: React.FC<Props> = ({ summary, difficultyBreakdown, hideRanking = false }) => {
  const {
    totalScore, maxScore, selectiveScore, descriptiveScore,
    cohortAvg, cohortCount, percentile, rank, diffFromAvg,
    correctCount, itemCount, missedEasyCount, derivedScoring,
  } = summary;

  return (
    <div className="space-y-2.5">
      <div className={cn('grid grid-cols-2 gap-2.5', hideRanking ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
        <Stat
          label="지필 총점"
          value={totalScore != null ? totalScore.toFixed(1) : '—'}
          sub={
            totalScore == null
              ? '채점 전'
              : `선택형 ${selectiveScore?.toFixed(1) ?? '—'} + 서답형 ${descriptiveScore?.toFixed(1) ?? '—'}${maxScore ? ` / ${maxScore}점 만점` : ''}`
          }
        />
        <Stat
          label="학년 평균"
          value={cohortAvg != null ? cohortAvg.toFixed(1) : '—'}
          sub={
            diffFromAvg == null ? (
              `응시 ${cohortCount}명`
            ) : (
              <span className={diffFromAvg >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {diffFromAvg >= 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
                {' '}
                {diffFromAvg >= 0 ? '+' : ''}{diffFromAvg.toFixed(1)}점 · 응시 {cohortCount}명
              </span>
            )
          }
        />
        {!hideRanking && (
          <Stat
            label="학년 내 위치"
            value={percentile != null ? `상위 ${percentile.toFixed(0)}%` : '—'}
            // 선택과목은 응시자가 12명까지 작아진다. 분모를 함께 보여주지 않으면
            // "상위 25%"가 4명 중 1등인지 200명 중 50등인지 구분되지 않는다.
            sub={rank != null ? `${cohortCount}명 중 ${rank}위` : null}
            tone={percentile == null ? 'default' : percentile <= 30 ? 'good' : percentile >= 70 ? 'bad' : 'default'}
          />
        )}
        <Stat
          label="선택형 정답"
          value={itemCount > 0 ? `${correctCount}/${itemCount}` : '—'}
          sub={itemCount > 0 ? `정답률 ${Math.round((correctCount / itemCount) * 100)}%` : null}
        />
      </div>

      {difficultyBreakdown.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
            난이도별 오답 <span className="normal-case tracking-normal">(학교 정답률 기준)</span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {difficultyBreakdown.map((entry) => (
              <span key={entry.band} className="text-xs text-slate-600 tabular-nums">
                <span style={{ color: DIFFICULTY_COLOR[entry.band] }}>●</span>{' '}
                {entry.band}{' '}
                <span className="font-semibold">{entry.wrong}</span>
                <span className="text-slate-400">/{entry.total}</span>{' '}
                <span className="text-slate-400">({entry.wrongRate}%)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {missedEasyCount > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            학년 정답률 80% 이상인 문항을 <span className="font-semibold">{missedEasyCount}개</span> 틀렸습니다.
            <span className="text-amber-600"> 개념 구멍이나 실수를 먼저 확인해 보세요.</span>
          </p>
        </div>
      )}

      {derivedScoring && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">
            NEIS 채점이 아직 확정되지 않아 <span className="font-semibold">문항 정답과 대조해 계산한 결과</span>입니다.
            서답형 점수는 반영되지 않아 총점이 비어 있을 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default SchoolExamSummary;
