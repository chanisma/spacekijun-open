import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatSigned, studentNo } from '../utils/statsFormat';
import type { TemperatureResult } from '../types';

/** 온도 색 — 기준 28도에서 멀어질수록 진하게. 의미 색(로즈=하락)만 쓴다 */
function tempTone(t: number, base: number): string {
  if (t >= base + 40) return 'text-orange-700';
  if (t >= base + 20) return 'text-orange-600';
  if (t >= base) return 'text-amber-700';
  return 'text-rose-600';
}

export function TemperatureTab({ data }: { data: TemperatureResult }) {
  const [mode, setMode] = useState<'cumulative' | 'monthly'>('cumulative');
  const [q, setQ] = useState('');
  const r = data.rule;

  const match = useMemo(() => {
    const needle = q.trim();
    return (p: { name: string | null; grade: number | null; class: number | null; number: number | null }) =>
      !needle || (p.name ?? '').includes(needle) || studentNo(p).includes(needle);
  }, [q]);
  const cumulative = useMemo(() => data.cumulative.filter(match), [data.cumulative, match]);
  const monthly = useMemo(() => data.monthly.filter(match), [data.monthly, match]);
  const count = mode === 'cumulative' ? cumulative.length : monthly.length;

  const [y, m] = data.month.split('-');

  return (
    <section className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
          {([['cumulative', '누적'], ['monthly', `${Number(m)}월`]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              className={cn('h-6 rounded-md px-2.5 text-xs font-medium', mode === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·학번" className="h-8 pl-8 text-xs md:text-xs" />
        </div>
        <span className="text-[11px] text-slate-400">
          기준 {r.base}° · 출석 +{r.attend} · 결석 −{r.absent}(그날 예약 수로 나눔) · 피드백 +{r.feedback} · {data.today} 기준 실시간
        </span>
      </div>

      {count === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400">
          {q ? '조건에 맞는 학생이 없습니다' : mode === 'monthly' ? `${y}년 ${Number(m)}월에 신청한 학생이 없습니다` : '기록이 없습니다'}
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-slate-500">
                <th className="w-12 py-2 pr-2 font-medium">순위</th>
                <th className="py-2 pr-2 font-medium">학번</th>
                <th className="py-2 pr-2 font-medium">이름</th>
                {mode === 'cumulative' ? (
                  <>
                    <th className="py-2 pr-2 text-right font-medium">온도</th>
                    <th className="py-2 text-right font-medium">{Number(m)}월 변화</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 pr-2 text-right font-medium">변화</th>
                    <th className="py-2 text-right font-medium">출석일</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {mode === 'cumulative'
                ? cumulative.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-0">
                        <td className={cn('py-1.5 pr-2 font-semibold tabular-nums', s.rank <= 3 ? 'text-orange-600' : 'text-slate-500')}>{s.rank}</td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-500">{studentNo(s)}</td>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">{s.name}</td>
                        <td className={cn('py-1.5 pr-2 text-right font-bold tabular-nums', tempTone(s.temperature, r.base))}>{s.temperature.toFixed(1)}°</td>
                        <td className={cn('py-1.5 text-right tabular-nums', s.month_change > 0 ? 'text-emerald-700' : s.month_change < 0 ? 'text-rose-600' : 'text-slate-400')}>
                          {formatSigned(s.month_change)}
                        </td>
                      </tr>
                    ))
                : monthly.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-0">
                        <td className={cn('py-1.5 pr-2 font-semibold tabular-nums', s.rank <= 3 ? 'text-orange-600' : 'text-slate-500')}>{s.rank}</td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-500">{studentNo(s)}</td>
                        <td className="py-1.5 pr-2 font-medium text-slate-700">{s.name}</td>
                        <td className={cn('py-1.5 pr-2 text-right font-bold tabular-nums', s.change > 0 ? 'text-emerald-700' : s.change < 0 ? 'text-rose-600' : 'text-slate-400')}>
                          {formatSigned(s.change)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{s.attended_days}일</td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
