// 사업 상세 › 일정 (2026-11-10) — 3월~2월 12달
// 막대 = 그 달의 계획 금액(계획·품의 중), 선 = 누적 원인행위(카드 업로드 기록에서 — 손 입력 없이 생긴다),
// 점선 = 지금 원인행위 + 앞으로의 계획 누적, 회색 점선 = 진도 기준선(예산 × 경과 비율).
// 차트 규약: 새 <Line> 에는 drawLineProps/fadeLineProps (docs/features/chart-animation.md).
import { useMemo } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { drawLineProps, fadeLineProps } from '@/lib/chartAnimation';
import { fiscalEnd, fiscalMonths, monthKey, planTiming, remainingPlanOf, won } from '../model/budgetMath';
import type { BudgetProjectDetail } from '../types';

const COLORS = {
  plan: '#93c5fd', // blue-300 — 운영 탭 막대의 «남은 계획»과 같은 색
  wonin: '#2563eb', // blue-600 — «원인행위»
  forecast: '#2563eb',
  pace: '#94a3b8', // slate-400
};

function shortMonth(key: string) {
  return `${Number(key.slice(5, 7))}월`;
}

export function ScheduleTab({ detail, today }: { detail: BudgetProjectDetail; today: Date }) {
  const { project, lines, plans, imports } = detail;
  const months = useMemo(() => fiscalMonths(project.fiscal_year), [project.fiscal_year]);
  const budget = lines.reduce((s, l) => s + l.budget_amount, 0);
  const wonin = lines.reduce((s, l) => s + l.wonin, 0);
  const closedIds = new Set(lines.filter((l) => l.closed).map((l) => l.id));
  const openPlans = plans.filter((p) => !closedIds.has(p.line_id) && (p.status === 'planned' || p.status === 'in_order'));
  const nowKey = monthKey(today);

  const data = useMemo(() => {
    // 카드 업로드 기록 → 그 달의 마지막 원인행위 합
    const woninByMonth = new Map<string, number>();
    for (const imp of [...imports].reverse()) {
      const key = (imp.card_date ?? imp.imported_at).slice(0, 7) + '-01';
      const total = (imp.snapshot?.lines ?? []).reduce((s, l) => s + (l.wonin || 0), 0);
      woninByMonth.set(key, total);
    }
    let lastWonin: number | null = null;
    let forecast = wonin;
    const start = new Date(project.fiscal_year, 2, 1).getTime();
    const end = fiscalEnd(project.fiscal_year).getTime();
    return months.map((m) => {
      const planned = openPlans.filter((p) => p.planned_month === m).reduce((s, p) => s + p.amount, 0);
      if (woninByMonth.has(m)) lastWonin = woninByMonth.get(m)!;
      const isPastOrNow = m <= nowKey;
      if (m >= nowKey) forecast += planned;
      const monthEnd = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getTime();
      const pace = budget * Math.min(1, Math.max(0, (monthEnd - start) / (end - start)));
      return {
        month: shortMonth(m),
        key: m,
        planned,
        wonin: isPastOrNow ? lastWonin : null,
        forecast: m >= nowKey ? forecast : null,
        pace: Math.round(pace),
      };
    });
  }, [months, openPlans, imports, wonin, budget, nowKey, project.fiscal_year]);

  const unscheduled = openPlans.filter((p) => !p.planned_month);
  const overdue = openPlans.filter((p) => planTiming(p, project.fiscal_year, today) === 'overdue');
  const outOfYear = openPlans.filter((p) => planTiming(p, project.fiscal_year, today) === 'outOfYear');
  const lastTwo = openPlans.filter((p) => p.planned_month && p.planned_month >= months[10]).reduce((s, p) => s + p.amount, 0);
  const remaining = remainingPlanOf(openPlans);

  return (
    <div className="space-y-3">
      <div className="h-72 w-full rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => (v >= 1e6 ? `${Math.round(v / 1e5) / 10}백만` : won(v))}
            />
            <Tooltip
              formatter={(value: number, name: string) => [value === null ? '—' : `${won(value)}원`, name]}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="planned" name="그 달 계획" fill={COLORS.plan} radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line dataKey="wonin" name="누적 원인행위(카드)" stroke={COLORS.wonin} strokeWidth={2} dot={{ r: 3 }} connectNulls {...drawLineProps} />
            <Line dataKey="forecast" name="지금 + 남은 계획" stroke={COLORS.forecast} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls {...fadeLineProps} />
            <Line dataKey="pace" name="진도 기준선" stroke={COLORS.pace} strokeWidth={1.5} strokeDasharray="2 4" dot={false} {...fadeLineProps} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="남은 계획" value={`${won(remaining)}원`} hint={`${openPlans.length}건`} />
        <Fact
          label="1~2월에 몰린 계획"
          value={`${won(lastTwo)}원`}
          hint={remaining > 0 ? `남은 계획의 ${Math.round((lastTwo / remaining) * 100)}%` : ''}
          warn={remaining > 0 && lastTwo / remaining >= 0.5}
        />
        <Fact label="지난 달인데 아직 «계획»" value={`${overdue.length}건`} warn={overdue.length > 0} hint={overdue.slice(0, 2).map((p) => p.title).join(', ')} />
        <Fact label="월 미정" value={`${unscheduled.length}건`} hint={unscheduled.slice(0, 2).map((p) => p.title).join(', ')} />
      </div>
      {outOfYear.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          회계연도({project.fiscal_year}.3 ~ {project.fiscal_year + 1}.2) 밖으로 잡힌 계획 {outOfYear.length}건 — {outOfYear.map((p) => p.title).join(', ')}
        </p>
      )}
      {!imports.length && (
        <p className="text-[11px] text-slate-500">누적 원인행위 선은 사업관리카드를 올릴 때마다 한 점씩 생깁니다.</p>
      )}
    </div>
  );
}

function Fact({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${warn ? 'text-amber-800' : 'text-slate-800'}`}>{value}</div>
      {hint && <div className="truncate text-[11px] text-slate-400" title={hint}>{hint}</div>}
    </div>
  );
}
