import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, addWeeks, format, isSameDay, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Coffee } from 'lucide-react';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { fetchEffectiveTeacherTimetable } from '@/services/timetableOverrideService';
import { effectiveSlotLabel, type EffectiveTeacherSlot } from '@/lib/timetableOverride';
import { TIME_CONFIG, getPeriodFromDate } from '@/lib/timeUtils';
import { cn } from '@/lib/utils';
import { MobileLoading } from '../MobileShell';

const DAY_NAMES = ['월', '화', '수', '목', '금'];

/**
 * 요일별 내 시간표 — 운영 시간표(시험·행사 주간)를 덮은 실제 수업(`teacher_timetable_effective`).
 * 한 주를 한 번에 받고 요일을 눌러 바꾼다. 주말이면 다음 주 월요일을 보인다.
 */
export default function TodayPage() {
  const today = new Date();
  const weekend = today.getDay() === 0 || today.getDay() === 6;
  const [week, setWeek] = useState(() => startOfWeek(weekend ? addDays(today, 2) : today, { weekStartsOn: 1 }));
  const [picked, setPicked] = useState(() => (weekend ? 0 : today.getDay() - 1));
  const { resourceId } = useCurrentResourceId();
  const { term, isLoading: termLoading } = useTimetableTerm();

  const { data: slots, isLoading, error } = useQuery({
    queryKey: ['m-week-timetable', resourceId, term?.year, term?.semester, format(week, 'yyyy-MM-dd')],
    enabled: !!resourceId && !!term,
    staleTime: 10 * 60 * 1000,
    queryFn: () => fetchEffectiveTeacherTimetable({
      year: term!.year, semester: term!.semester, from: week, to: addDays(week, 4), teacherResourceId: resourceId }),
  });

  const day = addDays(week, picked);
  const daySlots = useMemo(() => (slots ?? [])
    .filter((slot: EffectiveTeacherSlot) => slot.lesson_date === format(day, 'yyyy-MM-dd') && slot.period >= 1 && slot.period <= 8)
    .sort((a, b) => a.period - b.period), [slots, day]);
  const isToday = isSameDay(day, today);
  const nowPeriod = isToday ? getPeriodFromDate(today) : null;
  const override = daySlots.find((slot) => slot.override_title)?.override_title;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-white p-2 shadow-sm">
        <button className="rounded-full p-2 text-slate-500" aria-label="지난 주" onClick={() => setWeek(addWeeks(week, -1))}><ChevronLeft className="h-5 w-5" /></button>
        <div className="grid flex-1 grid-cols-5 gap-1">
          {DAY_NAMES.map((name, index) => {
            const date = addDays(week, index);
            return (
              <button key={name} onClick={() => setPicked(index)}
                      className={cn('rounded-xl py-1.5 text-center', index === picked ? 'bg-blue-600 text-white' : 'text-slate-600',
                                    isSameDay(date, today) && index !== picked && 'ring-1 ring-blue-300')}>
                <div className="text-[11px]">{name}</div>
                <div className="text-sm font-semibold">{format(date, 'd')}</div>
              </button>
            );
          })}
        </div>
        <button className="rounded-full p-2 text-slate-500" aria-label="다음 주" onClick={() => setWeek(addWeeks(week, 1))}><ChevronRight className="h-5 w-5" /></button>
      </div>

      <p className="px-1 text-xs text-slate-500">
        {format(day, 'M월 d일')} ({DAY_NAMES[picked]}){isToday ? ' · 오늘' : ''}
        {term ? ` · ${term.year}학년도 ${term.semester}학기` : ''}{override ? ` · ${override}` : ''}
      </p>

      {termLoading || isLoading ? <MobileLoading label="시간표를 불러오는 중…" /> : error ? (
        <p className="rounded-2xl bg-white p-5 text-center text-sm text-rose-600 shadow-sm">시간표를 불러오지 못했습니다.</p>
      ) : !daySlots.length ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          <Coffee className="h-6 w-6 text-slate-400" />이 날은 수업이 없습니다.
        </div>
      ) : (
        <ol className="space-y-2">
          {daySlots.map((slot) => {
            const time = TIME_CONFIG.PERIOD_TIMES[slot.period as keyof typeof TIME_CONFIG.PERIOD_TIMES];
            const now = nowPeriod === slot.period;
            const past = nowPeriod !== null && slot.period < nowPeriod;
            return (
              <li key={`${slot.id}-${slot.period}`}
                  className={cn('flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm', now && 'ring-2 ring-blue-500', past && 'opacity-50')}>
                <div className="w-12 text-center">
                  <div className="text-lg font-bold text-slate-900">{slot.period}</div>
                  <div className="text-[10px] text-slate-500">교시</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-900">{effectiveSlotLabel(slot)}</div>
                  <div className="text-xs text-slate-500">
                    {time ? `${time.start}–${time.end}` : ''}{slot.override_title ? ` · ${slot.override_title}` : ''}
                  </div>
                </div>
                {now && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">지금</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
