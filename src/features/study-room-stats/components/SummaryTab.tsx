import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { drawLineProps } from '@/lib/chartAnimation';
import { cn } from '@/lib/utils';
import {
  GRADE_COLOR,
  STATUS_COLOR,
  STATUS_LABEL,
  formatRate,
  monthLabel,
  weekLabel,
} from '../utils/statsFormat';
import type { AttendanceStatus, SummaryResult } from '../types';

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={cn('mt-1 text-xl font-bold tabular-nums text-slate-800', tone)}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Panel({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-3 shadow-sm sm:p-4', className)}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {note && <span className="text-[11px] text-slate-400">{note}</span>}
      </div>
      {children}
    </section>
  );
}

const STATUS_ORDER: AttendanceStatus[] = ['attended', 'excused', 'supplement', 'absent', 'pending'];

export function SummaryTab({ data }: { data: SummaryResult }) {
  const [trend, setTrend] = useState<'monthly' | 'weekly'>('monthly');
  const c = data.cards;

  const gradeBars = data.by_grade
    .filter((g) => g.grade != null)
    .map((g) => ({ name: `${g.grade}학년`, 신청: g.total, 출석: g.attended, 결석: g.absent, rate: g.rate }));
  const unknownGrade = data.by_grade.find((g) => g.grade == null);

  const donut = STATUS_ORDER.map((s) => ({ key: s, name: STATUS_LABEL[s], value: data.status[s] ?? 0 })).filter((d) => d.value > 0);

  const series = (trend === 'monthly' ? data.monthly : data.weekly).map((p) => ({
    label: 'month' in p ? monthLabel(p.month) : weekLabel(p.week_start),
    전체: p.rate,
    '1학년': p.grades['1']?.rate ?? null,
    '2학년': p.grades['2']?.rate ?? null,
    '3학년': p.grades['3']?.rate ?? null,
    신청: p.total,
  }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="총 신청" value={c.total.toLocaleString()} hint={c.pending ? `대기 ${c.pending.toLocaleString()}건 포함` : undefined} />
        <Tile label="출석" value={c.attended.toLocaleString()} tone="text-emerald-700" hint="인정·보완 포함" />
        <Tile label="결석" value={c.absent.toLocaleString()} tone="text-rose-600" hint="지난 예약 · 오늘은 23시 이후" />
        <Tile label="출석률" value={formatRate(c.rate)} hint="출석 ÷ (출석 + 결석)" />
        <Tile label="이용 학생" value={`${c.students.toLocaleString()}명`} />
        <Tile label="이용 열람실" value={`${c.rooms}곳`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="학년별 이용" note={unknownGrade ? `학년 미상 ${unknownGrade.total}건 제외` : undefined} className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeBars} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(v: number, n: string) => [v.toLocaleString(), n]}
                  labelFormatter={(l: string) => {
                    const g = gradeBars.find((x) => x.name === l);
                    return `${l} · 출석률 ${formatRate(g?.rate ?? null)}`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="신청" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="출석" fill={STATUS_COLOR.attended} radius={[4, 4, 0, 0]} />
                <Bar dataKey="결석" fill={STATUS_COLOR.absent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="출결 구성" note="신청 전체 기준">
          {donut.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-xs text-slate-400">기록이 없습니다</div>
          ) : (
            <div>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={1} stroke="#fff">
                      {donut.map((d) => <Cell key={d.key} fill={STATUS_COLOR[d.key]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, n: string) => [`${v.toLocaleString()}건 (${((v / Math.max(c.total, 1)) * 100).toFixed(1)}%)`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-lg font-bold tabular-nums text-slate-800">{formatRate(c.rate)}</div>
                  <div className="text-[10px] text-slate-400">출석률</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
                {donut.map((d) => (
                  <span key={d.key} className="flex items-center gap-1 text-[11px] text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[d.key] }} />
                    {d.name} {d.value.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="출석률 추이"
        note={`기간 필터와 별개로 ${data.range.end} 기준 최근 ${trend === 'monthly' ? '6개월' : '12주'}`}
      >
        <div className="mb-2 flex rounded-lg border border-slate-100 bg-slate-100/50 p-1 w-fit">
          {([['monthly', '월별'], ['weekly', '주별']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTrend(v)}
              className={cn(
                'h-6 rounded-md px-2.5 text-xs font-medium',
                trend === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
              <Tooltip
                formatter={(v: number | null, n: string) => [v == null ? '—' : `${v.toFixed(1)}%`, n]}
                labelFormatter={(l: string) => {
                  const p = series.find((x) => x.label === l);
                  return `${l} · 신청 ${p?.신청.toLocaleString() ?? 0}건`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line {...drawLineProps} type="monotone" dataKey="전체" stroke="#475569" strokeWidth={2.5} connectNulls />
              {(['1', '2', '3'] as const).map((g) => (
                <Line key={g} {...drawLineProps} type="monotone" dataKey={`${g}학년`} stroke={GRADE_COLOR[g]} strokeWidth={1.5} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="열람실별" note="출석률 = 출석 ÷ (출석 + 결석)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-2 font-medium">열람실</th>
                <th className="py-2 pr-2 font-medium">대상 학년</th>
                <th className="py-2 pr-2 text-right font-medium">신청</th>
                <th className="py-2 pr-2 text-right font-medium">출석</th>
                <th className="py-2 pr-2 text-right font-medium">결석</th>
                <th className="py-2 pr-2 text-right font-medium">학생</th>
                <th className="py-2 text-right font-medium">출석률</th>
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((r) => (
                <tr key={r.room_id} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-[14rem] truncate py-1.5 pr-2 font-medium text-slate-700" title={r.name}>{r.name}</td>
                  <td className="py-1.5 pr-2 text-slate-500">
                    {(r.room_grades && r.room_grades.length ? r.room_grades : r.room_grade ? [r.room_grade] : []).map((g) => `${g}학년`).join('·') || '—'}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.total.toLocaleString()}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-emerald-700">{r.attended.toLocaleString()}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-rose-600">{r.absent.toLocaleString()}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.students}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{formatRate(r.rate)}</td>
                </tr>
              ))}
              {data.rooms.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-slate-400">이 기간에 신청이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
