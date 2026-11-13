import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  STATUS_CELL,
  STATUS_LABEL,
  dateColumns,
  dayStatus,
  formatRate,
  formatSigned,
  studentNo,
  weekdayOf,
  weekdaySessions,
} from '../utils/statsFormat';
import type { AttendanceStatus, StudentRow, StudentsResult } from '../types';

type SortKey = 'no' | 'name' | 'total' | 'attended' | 'absent' | 'rate' | 'temp';

const COLUMNS: Array<[SortKey, string, string]> = [
  ['no', '학번', 'text-left'],
  ['name', '이름', 'text-left'],
  ['total', '신청', 'text-right'],
  ['attended', '출석', 'text-right'],
  ['absent', '결석', 'text-right'],
  ['rate', '출석률', 'text-right'],
  ['temp', '온도 변화', 'text-right'],
];

const DAYS = ['월', '화', '수', '목', '금'];
const LEGEND: AttendanceStatus[] = ['attended', 'excused', 'supplement', 'absent', 'pending'];

function sortValue(s: StudentRow, key: SortKey): number | string {
  switch (key) {
    case 'no': return studentNo(s);
    case 'name': return s.name ?? '';
    case 'rate': return s.rate ?? -1;
    default: return s[key];
  }
}

export function StudentsTab({ data }: { data: StudentsResult }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'no', desc: false });
  const [view, setView] = useState<'table' | 'matrix'>('table');

  const rows = useMemo(() => {
    const needle = q.trim();
    const list = needle
      ? data.students.filter((s) => (s.name ?? '').includes(needle) || studentNo(s).includes(needle))
      : data.students.slice();
    list.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko');
      return sort.desc ? -cmp : cmp;
    });
    return list;
  }, [data.students, q, sort]);

  const dates = useMemo(() => {
    const used = new Set<string>();
    for (const s of data.students) for (const d of Object.keys(s.att)) used.add(d);
    return dateColumns(data.range.start, data.range.end, used);
  }, [data]);

  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: key !== 'no' && key !== 'name' }));

  return (
    <section className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
          {([['table', '학생별 이용'], ['matrix', '일별 출석']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn('h-6 rounded-md px-2.5 text-xs font-medium', view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·학번" className="h-8 pl-8 text-xs md:text-xs" />
        </div>
        <span className="text-[11px] text-slate-400">{rows.length}명 · {data.range.start} ~ {data.range.end}</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400">{q ? '조건에 맞는 학생이 없습니다' : '이 기간에 신청한 학생이 없습니다'}</div>
      ) : view === 'table' ? (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-slate-500">
                {COLUMNS.map(([key, label, align]) => (
                  <th key={key} className={cn('py-2 pr-2 font-medium', align)}>
                    <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-0.5 hover:text-slate-800">
                      {label}
                      {sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
                {DAYS.map((d) => <th key={d} className="py-2 pr-1 text-center font-medium">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="py-1.5 pr-2 tabular-nums text-slate-500">{studentNo(s)}</td>
                  <td className="py-1.5 pr-2 font-medium text-slate-700">{s.name ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{s.total}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-emerald-700">{s.attended}</td>
                  <td className={cn('py-1.5 pr-2 text-right tabular-nums', s.absent ? 'text-rose-600' : 'text-slate-400')}>{s.absent}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{formatRate(s.rate)}</td>
                  <td className={cn('py-1.5 pr-2 text-right tabular-nums', s.temp > 0 ? 'text-emerald-700' : s.temp < 0 ? 'text-rose-600' : 'text-slate-400')}>
                    {formatSigned(s.temp)}
                  </td>
                  {DAYS.map((_, i) => {
                    const { morning, evening } = weekdaySessions(s.wr[String(i + 1)], data.rooms);
                    return (
                      <td key={i} className="py-1.5 pr-1 text-center">
                        <div className="inline-flex gap-0.5">
                          <span className={cn('rounded px-1 text-[10px]', morning ? 'bg-amber-100 text-amber-800' : 'text-slate-200')}>아</span>
                          <span className={cn('rounded px-1 text-[10px]', evening ? 'bg-indigo-100 text-indigo-800' : 'text-slate-200')}>야</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-400">
            요일 칸 = 그 요일에 신청한 열람실(아 = 이름에 «아침»이 든 열람실, 야 = 그 밖). 온도 변화 = 기간 안에서 «온도 랭킹» 탭에 적힌 규칙으로 더하고 뺀 값.
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
            {LEGEND.map((s) => (
              <span key={s} className="flex items-center gap-1 text-[11px] text-slate-600">
                <span className={cn('h-3 w-3 rounded-sm', STATUS_CELL[s])} /> {STATUS_LABEL[s]}
              </span>
            ))}
            <span className="text-[11px] text-slate-400">· 하루에 교시가 여럿이면 결석 &gt; 대기 &gt; 인정 &gt; 보완 &gt; 출석 순으로 대표 상태를 보입니다</span>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="border-separate border-spacing-0 text-[10px]">
              <thead className="sticky top-0 z-20 bg-card">
                <tr>
                  <th className="sticky left-0 z-30 min-w-[7.5rem] bg-card py-1 pr-2 text-left font-medium text-slate-500">학생</th>
                  {dates.map((d) => (
                    <th key={d} className="min-w-[1.6rem] px-0.5 py-1 text-center font-normal text-slate-500">
                      <div>{Number(d.slice(8))}</div>
                      <div className={cn(weekdayOf(d) === '토' || weekdayOf(d) === '일' ? 'text-rose-400' : 'text-slate-400')}>{weekdayOf(d)}</div>
                    </th>
                  ))}
                  <th className="px-1 py-1 text-right font-medium text-slate-500">결석일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  let absentDays = 0;
                  return (
                    <tr key={s.id}>
                      <td className="sticky left-0 z-10 truncate border-b border-slate-100 bg-card py-0.5 pr-2 text-xs text-slate-700" title={`${studentNo(s)} ${s.name ?? ''}`}>
                        <span className="mr-1 tabular-nums text-slate-400">{studentNo(s)}</span>{s.name}
                      </td>
                      {dates.map((d) => {
                        const entries = s.att[d];
                        const st = dayStatus(entries);
                        if (st === 'absent') absentDays += 1;
                        const title = entries
                          ? `${d}\n${entries.map((e) => `${e[0] === 0 ? '종일' : `${e[0]}교시`} ${data.rooms[e[3]]?.[1] ?? ''} · ${STATUS_LABEL[e[1]]}${e[2] ? ` (${e[2]})` : ''}`).join('\n')}`
                          : undefined;
                        return (
                          <td key={d} className="border-b border-slate-100 px-0.5 py-0.5 text-center">
                            {st ? (
                              <span title={title} className={cn('inline-flex h-4 w-4 items-center justify-center rounded-sm', STATUS_CELL[st])}>
                                {entries && entries.length > 1 ? entries.length : ''}
                              </span>
                            ) : (
                              <span className="inline-block h-4 w-4" />
                            )}
                          </td>
                        );
                      })}
                      <td className={cn('border-b border-slate-100 px-1 text-right text-xs tabular-nums', absentDays ? 'text-rose-600' : 'text-slate-300')}>{absentDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
