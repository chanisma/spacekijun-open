import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Props { studentCode: string; }

interface TimetableRow {
  day_of_week: number;
  period: number;
  subject: string;
  teacher_name: string;
}

const DAY_LABELS = ['월', '화', '수', '목', '금'];
const DAYS = [1, 2, 3, 4, 5];

function useStudentTimetableByCode(studentCode: string) {
  return useQuery({
    queryKey: ['rescue-note', 'timetable', studentCode],
    queryFn: async (): Promise<TimetableRow[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('meta')
        .eq('type', 'student')
        .eq('meta->>id', studentCode)
        .maybeSingle();
      if (error) throw error;
      const timetable = (data?.meta as Record<string, any> | null)?.timetable ?? [];
      return (timetable as any[]).map((e: any) => ({
        day_of_week: Number(e.day_of_week),
        period: Number(e.period),
        subject: e.subject ?? '',
        teacher_name: e.teacher_name ?? '',
      }));
    },
    enabled: !!studentCode,
    staleTime: 30 * 60 * 1000,
  });
}

export function TimetableTab({ studentCode }: Props) {
  const { data: entries = [], isLoading } = useStudentTimetableByCode(studentCode);

  if (isLoading) {
    return <div className="p-5 text-sm text-slate-400">시간표 불러오는 중...</div>;
  }

  // Build cell map: day -> period -> subject
  const cellMap = new Map<string, TimetableRow>();
  entries.forEach((e) => cellMap.set(`${e.day_of_week}-${e.period}`, e));

  const maxPeriod = entries.length > 0 ? Math.max(...entries.map((e) => e.period)) : 7;
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  if (entries.length === 0) {
    return (
      <div className="p-5 text-sm text-slate-400">
        시간표 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
            시간표
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/90 backdrop-blur">
                <th className="px-3 py-2 text-center font-semibold text-slate-500 w-10 rounded-tl-lg border-b border-slate-100">교시</th>
                {DAYS.map((d, i) => (
                  <th key={d} className={`px-3 py-2 text-center font-semibold text-slate-600 border-b border-slate-100 ${i === DAYS.length - 1 ? 'rounded-tr-lg' : ''}`}>
                    {DAY_LABELS[d - 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p, pi) => (
                <tr key={p} className={pi % 2 === 0 ? 'bg-white/40' : 'bg-white/20'}>
                  <td className="px-3 py-2 text-center font-mono font-medium text-slate-400">{p}</td>
                  {DAYS.map((d) => {
                    const cell = cellMap.get(`${d}-${p}`);
                    return (
                      <td key={d} className="px-3 py-2 text-center align-middle">
                        {cell ? (
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-slate-700 font-medium">{cell.subject}</span>
                            {cell.teacher_name && (
                              <span className="text-[10px] text-slate-400 mt-0.5">{cell.teacher_name}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
