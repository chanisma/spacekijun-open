import { CalendarRange, CheckSquare2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWeeklySchedule } from '@/hooks/useWeeklySchedule';
import type { MyTasksResponse, Task } from '@/types/tasks';
import { toLocalDateKey } from '../utils/seatReservationOverview';
import { DashboardCardShell, DashboardCardSkeleton } from './DashboardCardShell';
import { getTaskDeadlines } from '@/lib/taskDeadlines';
import { isMyTaskCompleted } from '@/lib/taskStatus';

interface WeeklyMeetingRecord {
  id: string;
  starts_at: string;
  kind: string | null;
  meta: unknown;
}

interface WeekAgendaEntry {
  id: string;
  date: Date;
  title: string;
  kind: string;
  isTask: boolean;
  dateOnly: boolean;
}

interface WeekTask extends Task {
  event_name?: string;
}

const dayNames = ['월', '화', '수', '목', '금', '토', '일'];

function getKindLabel(kind: string, isTask: boolean): string | null {
  if (isTask) return '업무 마감';
  if (kind === 'training') return '연수';
  if (kind === 'duty') return null; // duty는 시간만 표시(별도 유형 라벨 불필요 — 2026-08-12 사용자 결정)
  if (kind === 'schedule') return '학사 일정';
  return '일정';
}

export function TeacherWeekAgendaCard({
  myTasksData,
  currentResourceId,
}: {
  myTasksData: MyTasksResponse | null | undefined;
  currentResourceId: string | undefined;
}) {
  const navigate = useNavigate();
  const { data: weeklySchedule = [], isLoading } = useWeeklySchedule(currentResourceId ?? null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 7);

  const meetings = weeklySchedule as WeeklyMeetingRecord[];
  const meetingEntries: WeekAgendaEntry[] = meetings.flatMap((meeting) => {
    const meta = meeting.meta as { title?: string; section_name?: string; date_only?: boolean } | null;
    const date = new Date(meeting.starts_at);
    const title = meta?.title || meta?.section_name || meeting.kind || '일정';
    const saturdayHoliday = date.getDay() === 6 && /(토요휴업일|휴업일|토요일 휴업|토요 휴업)/.test(title);
    if (date < today || date >= weekEnd || saturdayHoliday) return [];
    return [{
      id: meeting.id,
      date,
      title,
      kind: meeting.kind || 'schedule',
      isTask: false,
      dateOnly: Boolean(meta?.date_only),
    }];
  });
  const taskEntries: WeekAgendaEntry[] = ((myTasksData?.assigned_tasks ?? []) as WeekTask[]).flatMap((task) => {
    const assignee = task.meta?.assignees?.find((item) => item.id === currentResourceId);
    if (!assignee || isMyTaskCompleted(task, currentResourceId)) return [];
    // 다중 마감(반복 업무)은 이번 주에 든 회차마다 아젠다에 표시
    return getTaskDeadlines(task).flatMap((deadline) => {
      const date = new Date(deadline);
      if (date < today || date >= weekEnd) return [];
      return [{
        id: `task-${task.id}-${deadline}`,
        date,
        title: task.title,
        kind: 'task' as const,
        isTask: true,
        dateOnly: true,
      }];
    });
  });
  const entries = [...meetingEntries, ...taskEntries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const countsByDate = entries.reduce<Record<string, number>>((counts, entry) => {
    const key = toLocalDateKey(entry.date);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <DashboardCardShell
      title="이번 주"
      icon={CalendarRange}
      accent="indigo"
      description="남은 일정과 업무 마감을 날짜순으로 정리했습니다."
      badge={entries.length > 0 ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{entries.length}</span>
      ) : null}
      onAction={() => navigate('/schedule')}
      actionLabel="전체 일정 보기"
    >
      {isLoading ? (
        <DashboardCardSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 rounded-2xl bg-slate-50 p-2">
            {weekDays.map((date, index) => {
              const key = toLocalDateKey(date);
              const isToday = key === toLocalDateKey();
              const count = countsByDate[key] ?? 0;
              return (
                <div key={key} className={`flex min-w-0 flex-col items-center rounded-xl py-2 ${isToday ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}>
                  <span className="text-[10px] font-semibold">{dayNames[index]}</span>
                  <span className="mt-1 text-sm font-bold">{date.getDate()}</span>
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full ${count > 0 ? isToday ? 'bg-sky-300' : 'bg-indigo-400' : 'bg-transparent'}`} />
                </div>
              );
            })}
          </div>

          {entries.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <CalendarRange className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">이번 주 남은 일정이 없습니다.</p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {entries.slice(0, 5).map((entry) => (
                <div key={entry.id} className="teacher-dashboard-row flex items-center gap-3 rounded-lg px-1 py-3">
                  <div className="w-10 flex-shrink-0 text-center">
                    <p className="text-[10px] font-semibold text-slate-400">
                      {entry.date.toLocaleDateString('ko-KR', { weekday: 'short' })}
                    </p>
                    <p className="text-base font-bold text-slate-800">{entry.date.getDate()}</p>
                  </div>
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${entry.isTask ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>
                    {entry.isTask ? <CheckSquare2 className="h-4 w-4" /> : <CalendarRange className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{entry.title}</p>
                    {(() => {
                      const subtitle = [
                        !entry.dateOnly
                          ? entry.date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                          : null,
                        getKindLabel(entry.kind, entry.isTask),
                      ].filter(Boolean).join(' · ');
                      return subtitle
                        ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
                        : null;
                    })()}
                  </div>
                </div>
              ))}
              {entries.length > 5 && (
                <p className="pt-3 text-center text-xs text-slate-400">그 외 {entries.length - 5}개 일정</p>
              )}
            </div>
          )}
        </>
      )}
    </DashboardCardShell>
  );
}
