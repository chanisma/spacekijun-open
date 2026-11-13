// 사업·줄의 «예산 한 막대» (2026-11-10)
// 왼쪽부터 원인행위(진한 파랑) · 남은 계획(연한 파랑) · 미배정(회색) — 계획이 예산을 넘으면 넘은 만큼 로즈.
// 세로 눈금 = 회계연도 진도(오늘). 원인행위가 눈금보다 한참 뒤면 «늦은 집행»으로 읽힌다.
// 색은 의미를 갖는다(CLAUDE.md §3) — 장식으로 다른 데 쓰지 말 것.
import { cn } from '@/lib/utils';
import { percent, won } from '../model/budgetMath';
import { BAR_COLORS } from '../model/tones';

interface Props {
  budget: number;
  wonin: number;
  remainingPlan: number;
  progress?: number | null; // 0~1
  className?: string;
  height?: 'sm' | 'md';
}

export function BudgetBar({ budget, wonin, remainingPlan, progress, className, height = 'md' }: Props) {
  const base = Math.max(budget, wonin + remainingPlan, 1);
  const w = (n: number) => `${Math.max(0, (n / base) * 100)}%`;
  const over = Math.max(0, wonin + remainingPlan - budget);
  const planWithin = Math.max(0, remainingPlan - over);
  const unassigned = Math.max(0, budget - wonin - remainingPlan);
  const label = `예산 ${won(budget)} · 원인행위 ${won(wonin)} · 남은 계획 ${won(remainingPlan)} · ${over > 0 ? `계획 초과 ${won(over)}` : `미배정 ${won(unassigned)}`}`;
  return (
    <div className={cn('relative w-full', className)} role="img" aria-label={label} title={label}>
      <div className={cn('flex w-full overflow-hidden rounded-full bg-slate-100', height === 'sm' ? 'h-1.5' : 'h-2.5')}>
        <div className={BAR_COLORS.wonin} style={{ width: w(Math.min(wonin, base)) }} />
        <div className={BAR_COLORS.plan} style={{ width: w(planWithin) }} />
        {over > 0 && <div className={BAR_COLORS.over} style={{ width: w(over) }} />}
        <div className={BAR_COLORS.unassigned} style={{ width: w(unassigned) }} />
      </div>
      {progress != null && progress > 0 && progress < 1 && (
        <div
          className="pointer-events-none absolute -top-1 bottom-[-4px] w-px bg-slate-700/70"
          style={{ left: `${(budget / base) * progress * 100}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}

export function BudgetLegend({ progressLabel }: { progressLabel?: string }) {
  const item = (cls: string, text: string) => (
    <span className="inline-flex items-center gap-1"><span className={cn('h-2 w-3 rounded-sm', cls)} />{text}</span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {item(BAR_COLORS.wonin, '원인행위')}
      {item(BAR_COLORS.plan, '남은 계획')}
      {item(BAR_COLORS.unassigned, '미배정')}
      {item(BAR_COLORS.over, '계획 초과')}
      {progressLabel && (
        <span className="inline-flex items-center gap-1"><span className="h-3 w-px bg-slate-700/70" />{progressLabel}</span>
      )}
    </div>
  );
}

export function RateText({ rate }: { rate: number }) {
  return <span className="tabular-nums">{percent(rate)}</span>;
}
