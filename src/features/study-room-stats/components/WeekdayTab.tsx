import { useState } from 'react';
import { cn } from '@/lib/utils';
import { studentNo } from '../utils/statsFormat';
import type { WeekdayResult } from '../types';

const DOW: Array<[string, string]> = [['1', '월'], ['2', '화'], ['3', '수'], ['4', '목'], ['5', '금'], ['6', '토'], ['7', '일']];

export function WeekdayTab({ data }: { data: WeekdayResult }) {
  const [day, setDay] = useState('1');
  const hasWeekend = data.crosstab.some((r) => (r.by_day['6'] ?? 0) + (r.by_day['7'] ?? 0) > 0);
  const days = hasWeekend ? DOW : DOW.slice(0, 5);
  const sumOf = (k: string) => data.crosstab.reduce((n, r) => n + (r.by_day[k] ?? 0), 0);
  const applicants = data.applicants[day] ?? [];

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-sm font-semibold text-slate-800">요일별 신청</h3>
          <span className="text-[11px] text-slate-400">같은 날·같은 열람실은 교시가 여럿이어도 1건 · 인원 = 월~금 고유 학생</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-2 text-left font-medium">열람실</th>
                {days.map(([k, l]) => <th key={k} className="py-2 pr-2 text-right font-medium">{l}</th>)}
                <th className="py-2 pr-2 text-right font-medium">합계</th>
                <th className="py-2 text-right font-medium">인원</th>
              </tr>
            </thead>
            <tbody>
              {data.crosstab.map((r) => (
                <tr key={r.room_id} className="border-b border-slate-100 last:border-0">
                  <td className="max-w-[14rem] truncate py-1.5 pr-2 font-medium text-slate-700" title={r.name}>{r.name}</td>
                  {days.map(([k]) => (
                    <td key={k} className={cn('py-1.5 pr-2 text-right tabular-nums', r.by_day[k] ? 'text-slate-700' : 'text-slate-300')}>
                      {r.by_day[k] ?? 0}
                    </td>
                  ))}
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{hasWeekend ? r.total : r.weekday_total}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.unique_students}</td>
                </tr>
              ))}
              {data.crosstab.length > 1 && (
                <tr className="border-t font-semibold text-slate-700">
                  <td className="py-1.5 pr-2">합계</td>
                  {days.map(([k]) => <td key={k} className="py-1.5 pr-2 text-right tabular-nums">{sumOf(k)}</td>)}
                  <td className="py-1.5 pr-2 text-right tabular-nums">{days.reduce((n, [k]) => n + sumOf(k), 0)}</td>
                  <td />
                </tr>
              )}
              {data.crosstab.length === 0 && (
                <tr><td colSpan={days.length + 3} className="py-6 text-center text-slate-400">이 기간에 신청이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">요일별 신청자</h3>
          <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
            {DOW.slice(0, 5).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setDay(k)}
                className={cn('h-6 rounded-md px-2.5 text-xs font-medium', day === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">기간 안에 그 요일에 한 번이라도 신청한 학생</span>
        </div>
        {applicants.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">신청자가 없습니다</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {applicants.map((room) => (
              <div key={room.room_id} className="min-w-0 rounded-xl border border-slate-200 p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-700" title={room.name}>{room.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{room.students.length}명</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {room.students.map((s) => (
                    <span key={s.id} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                      <span className="mr-0.5 tabular-nums text-slate-400">{studentNo(s)}</span>{s.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
