import { useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Calendar, CheckSquare, ArrowRight } from 'lucide-react';
import { getDashboardEventColor } from '@/lib/scheduleUtils';
import { isMyTaskCompleted } from '@/lib/taskStatus';
import { useWeeklySchedule } from '@/hooks/useWeeklySchedule';
import { ScheduleDetailDialog } from '@/components/schedule/ScheduleDetailDialog';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

interface TeacherWeeklyScheduleCardProps {
  myTasksData: any;
  currentResourceId: string | undefined;
}

export const TeacherWeeklyScheduleCard = ({
  myTasksData,
  currentResourceId,
}: TeacherWeeklyScheduleCardProps) => {
  const navigate = useNavigate();
  const { data: weeklySchedule = [], isLoading: loadingWeekly } = useWeeklySchedule(currentResourceId as any);

  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handleEventClick = useCallback((event: any) => {
    const hasPlugin = event.plugin_instance_id || event.meta?.plugin_instance_id;
    if ((event.kind === 'training' && event.type === 'meeting') || hasPlugin) {
      setSelectedEvent(event);
      setDetailDialogOpen(true);
    }
  }, []);

  const weekDays = useMemo(() => {
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay() + 1);
    return Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      return day;
    });
  }, []);

  const groupedEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allEvents: any[] = [];

    weekDays.forEach((day, dayIndex) => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      if (dayStart < today) return;
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);

      const meetingEvents = (weeklySchedule || [])
        .filter((event: any) => {
          const eventDate = new Date(event.starts_at);
          if (!(eventDate >= dayStart && eventDate <= dayEnd)) return false;
          const isSaturday = day.getDay() === 6;
          const title = event.meta?.title || event.title || event.kind || '';
          const isSaturdayHoliday = isSaturday && (
            title.includes('토요휴업일') || title.includes('휴업일') ||
            title.includes('토요일 휴업') || title.includes('토요 휴업')
          );
          return !isSaturdayHoliday;
        })
        .map((event: any) => ({
          ...event,
          type: 'meeting' as const,
          title: event.meta?.title || event.title || event.kind,
        }));

      const taskEvents = (myTasksData?.assigned_tasks || [])
        .filter((task: any) => {
          if (!task.due_date) return false;
          const userAssignee = task.meta?.assignees?.find((a: any) => a.id === currentResourceId);
          if (!userAssignee) return false;
          if (isMyTaskCompleted(task, currentResourceId)) return false;
          const dueDate = new Date(task.due_date);
          return dueDate >= dayStart && dueDate <= dayEnd;
        })
        .map((task: any) => ({
          id: `task-${task.id}`,
          starts_at: task.due_date,
          ends_at: task.due_date,
          kind: 'task',
          status: task.status,
          meta: { title: task.title, description: task.description, event_name: task.event_name },
          type: 'task' as const,
        }));

      [...meetingEvents, ...taskEvents].forEach((event) => allEvents.push({ ...event, dayIndex, date: day }));
    });

    const groups: Record<string, any[]> = {};
    allEvents.forEach((event) => {
      const title = event.meta?.title || event.title || event.kind;
      const kind = event.kind || event.type;
      const key = `${title}_${kind}`;
      groups[key] = groups[key] || [];
      groups[key].push(event);
    });

    return Object.values(groups).map((events) => {
      const dayIndices = Array.from(new Set(events.map((e) => e.dayIndex))).sort((a, b) => a - b);
      const representative = events[0];
      return {
        ...representative,
        title: representative.meta?.title || representative.title || representative.kind,
        dayIndices,
        dates: dayIndices.map((i) => weekDays[i]),
        startDayIndex: Math.min(...dayIndices),
        endDayIndex: Math.max(...dayIndices),
        eventCount: events.length,
      };
    });
  }, [weeklySchedule, weekDays, myTasksData, currentResourceId]);

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
    <>
      <ImprovedCard>
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
                <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-purple-600 to-purple-700 bg-clip-text text-transparent hover:from-purple-500 hover:to-purple-600 transition-all duration-200 truncate">
                  이번 주 일정
                </span>
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/schedule')}
              className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-purple-100 hover:text-purple-600 transition-all duration-200 hover:scale-105"
            >
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingWeekly ? (
            <div className="animate-pulse">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-24 bg-gray-100 rounded"></div>
                ))}
              </div>
            </div>
          ) : groupedEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>이번 주 일정이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedEvents.map((event, index) => {
                const todayStr = new Date().toDateString();
                const isTodayIncluded = event.dates.some((d: Date) => d.toDateString() === todayStr);
                const isTask = event.type === 'task';
                const hasPlugin = event.plugin_instance_id || event.meta?.plugin_instance_id;
                const isClickable = (event.kind === 'training' && event.type === 'meeting') || hasPlugin;
                const startTime = new Date(event.starts_at);
                const meta = event.meta as any;

                return (
                  <div
                    key={`grouped-${index}`}
                    className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all duration-200 ${getDashboardEventColor(event.kind, 'background', isTodayIncluded, isTask)} ${
                      isClickable
                        ? 'cursor-pointer shadow-md border-2 hover:shadow-lg hover:scale-[1.02] hover:border-pink-400 active:scale-[0.98] group ring-1 ring-pink-200/50'
                        : 'hover:shadow-md'
                    }`}
                    onClick={() => handleEventClick(event)}
                  >
                    <div className="flex flex-col items-center min-w-[44px] sm:min-w-[60px] flex-shrink-0">
                      <div className={`text-xs sm:text-sm font-bold text-center whitespace-pre-line leading-tight ${getDashboardEventColor(event.kind, 'text', isTodayIncluded, isTask)}`}>
                        {formatDateRange(event.dates)}
                      </div>
                    </div>
                    <div className={`w-px h-6 sm:h-8 flex-shrink-0 ${getDashboardEventColor(event.kind, 'border', isTodayIncluded, isTask)}`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 sm:gap-2">
                        {isTask ? (
                          <CheckSquare className={`h-3 w-3 sm:h-4 sm:w-4 ${getDashboardEventColor(event.kind, 'text', isTodayIncluded, true)}`} />
                        ) : (
                          <Calendar className={`h-3 w-3 sm:h-4 sm:w-4 ${getDashboardEventColor(event.kind, 'text', isTodayIncluded, false)}`} />
                        )}
                        {!meta?.date_only && !isTask && (
                          <span className={`text-xs font-semibold hidden sm:inline ${getDashboardEventColor(event.kind, 'text', isTodayIncluded, false)}`}>
                            {startTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {isTask && (
                          <span className={`text-xs font-semibold hidden sm:inline ${getDashboardEventColor(event.kind, 'text', isTodayIncluded, true)}`}>
                            마감
                          </span>
                        )}
                        <span className={`text-xs sm:text-sm font-medium truncate ${getDashboardEventColor(event.kind, 'textLight', isTodayIncluded, isTask)}`}>
                          {event.title}
                        </span>
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getDashboardEventColor(event.kind, 'dot', isTodayIncluded, isTask)}`}></div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </ImprovedCard>

      <ScheduleDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        event={selectedEvent}
      />
    </>
  );
};
