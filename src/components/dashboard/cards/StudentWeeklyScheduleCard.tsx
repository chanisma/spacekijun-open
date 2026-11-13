import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardCardShell } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { Calendar } from 'lucide-react';
import { getDashboardEventColor } from '@/lib/scheduleUtils';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { useStudentWeeklySchedule } from '@/hooks/useStudentWeeklySchedule';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export const StudentWeeklyScheduleCard = () => {
  const navigate = useNavigate();
  const now = useCurrentTime();
  const todayKey = now.toDateString();
  const { data: weeklySchedule = [], isLoading, isError, refetch } = useStudentWeeklySchedule();

  const weekDays = useMemo(() => {
    const today = new Date(todayKey);
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      return day;
    });
  }, [todayKey]);

  const groupedEvents = useMemo(() => {
    const today = new Date(todayKey);
    today.setHours(0, 0, 0, 0);
    const schedule = weeklySchedule.map((event) => {
      const meta = event.meta;
      const metaTitle = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta.title : null;
      return { ...event, title: typeof metaTitle === 'string' && metaTitle ? metaTitle : event.kind };
    });
    type DatedEvent = (typeof schedule)[number] & { type: 'meeting'; dayIndex: number; date: Date };
    const allEvents: DatedEvent[] = [];

    weekDays.forEach((day, dayIndex) => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      if (dayStart < today) return;
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);

      const dayEvents = schedule
        .filter((event) => {
          const eventDate = new Date(event.starts_at);
          if (!(eventDate <= dayEnd && new Date(event.ends_at) >= dayStart)) return false;
          const isSaturday = day.getDay() === 6;
          const title = event.title || event.kind || '';
          const isSaturdayHoliday = isSaturday && (
            title.includes('토요휴업일') || title.includes('휴업일') ||
            title.includes('토요일 휴업') || title.includes('토요 휴업')
          );
          return !isSaturdayHoliday;
        })
        .map((event) => ({
          ...event,
          type: 'meeting' as const,
          title: event.title || event.kind,
        }));

      dayEvents.forEach((event) => allEvents.push({ ...event, dayIndex, date: day }));
    });

    const groups: Record<string, DatedEvent[]> = {};
    allEvents.forEach((event) => {
      const title = event.title || event.kind;
      const kind = event.kind || event.type;
      const key = `${event.id}_${title}_${kind}`;
      groups[key] = groups[key] || [];
      groups[key].push(event);
    });

    return Object.values(groups).map((events) => {
      const dayIndices = Array.from(new Set(events.map((e) => e.dayIndex))).sort((a, b) => a - b);
      const representative = events[0];
      return {
        ...representative,
        title: representative.title || representative.kind,
        dayIndices,
        dates: dayIndices.map((i) => weekDays[i]),
        startDayIndex: Math.min(...dayIndices),
        endDayIndex: Math.max(...dayIndices),
        eventCount: events.length,
      };
    });
  }, [weeklySchedule, weekDays, todayKey]);

  const formatDateRange = (dates: Date[]) => {
    if (dates.length === 1) {
      const d = dates[0];
      return `${DAY_NAMES[d.getDay()]}\n${d.getDate()}일`;
    }
    const start = dates[0];
    const end = dates[dates.length - 1];
    return `${DAY_NAMES[start.getDay()]} ${start.getDate()}일\n${DAY_NAMES[end.getDay()]} ${end.getDate()}일`;
  };

  return (
    <DashboardCardShell title="이번 주 일정" icon={Calendar} accent="violet"
      description="오늘부터 이번 주 남은 일정을 확인하세요."
      onAction={() => navigate('/schedule')} actionLabel="전체 학교 일정 보기">
        {isLoading ? (
          <div className="animate-pulse">
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded"></div>
              ))}
            </div>
          </div>
        ) : isError ? (
          <p role="status" className="py-6 text-sm text-slate-500">일정을 불러오지 못했습니다. <button type="button" onClick={() => void refetch()} className="text-sky-700 underline">다시 시도</button></p>
        ) : groupedEvents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>이번 주 남은 일정이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupedEvents.map((event, index) => {
              const todayStr = new Date().toDateString();
              const isTodayIncluded = event.dates.some((d: Date) => d.toDateString() === todayStr);
              return (
                <div
                  key={`grouped-${index}`}
                  className={`flex items-center gap-2 sm:gap-3 p-3 rounded-xl border border-slate-100 ${getDashboardEventColor(event.kind, 'background', isTodayIncluded, false)}`}
                >
                  <div className="flex flex-col items-center min-w-[44px] sm:min-w-[60px] flex-shrink-0">
                    <div className={`text-xs sm:text-sm font-bold text-center whitespace-pre-line leading-tight ${getDashboardEventColor(event.kind, 'text', isTodayIncluded, false)}`}>
                      {formatDateRange(event.dates)}
                    </div>
                  </div>
                  <div className={`w-px h-6 sm:h-8 flex-shrink-0 ${getDashboardEventColor(event.kind, 'border', isTodayIncluded, false)}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Calendar className={`h-3 w-3 sm:h-4 sm:w-4 ${getDashboardEventColor(event.kind, 'text', isTodayIncluded, false)}`} />
                      <span className={`text-xs sm:text-sm font-medium break-words ${getDashboardEventColor(event.kind, 'textLight', isTodayIncluded, false)}`}>
                        {event.title}
                      </span>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getDashboardEventColor(event.kind, 'dot', isTodayIncluded, false)}`}></div>
                </div>
              );
            })}
          </div>
        )}
    </DashboardCardShell>
  );
};
