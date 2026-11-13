import { useNavigate } from 'react-router-dom';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import { getPeriodFromDate, getPeriodStartTime, getPeriodTimeStatus } from '@/lib/timeUtils';
import { useTodayTimetable } from '@/hooks/useTodayTimetable';
import { useTodayMeetings } from '@/hooks/useTodayMeetings';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { useAuth } from '@/components/auth/AuthProvider';
import { isUserAssignee, type AssigneeData } from '@/lib/assigneeUtils';

interface TeacherTodayTimetableCardProps {
  currentResourceId: string | undefined;
}

export const TeacherTodayTimetableCard = ({ currentResourceId }: TeacherTodayTimetableCardProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userName = profile?.name ?? null;
  const { data: todayTimetable = [], isLoading: loadingTimetable } = useTodayTimetable(currentResourceId ?? null);
  const { data: todayMeetings = [], isLoading: loadingMeetings } = useTodayMeetings(currentResourceId ?? null);
  const now = useCurrentTime();

  const combinedSchedule = [
    ...todayTimetable.map((entry) => {
      const status = getPeriodTimeStatus(Number(entry.period), now);
      return {
        ...entry,
        ...status,
      };
    }),
    ...todayMeetings
      .filter((meeting) => !(meeting.meta as { date_only?: boolean } | null)?.date_only)
      .filter((meeting) => {
        // duty: 본인이 assignee인 일정만 표시
        if (meeting.kind !== 'duty') return true;
        const meta = meeting.meta as { assignee?: AssigneeData } | null;
        return !!userName && isUserAssignee(meta?.assignee, userName);
      })
      .map((meeting) => {
        const meta = meeting.meta as { title?: string; section_name?: string } | null;
        const startTime = new Date(meeting.starts_at);
        const endTime = new Date(meeting.ends_at);
        return {
          id: meeting.id,
          period: getPeriodFromDate(startTime) || 1,
          subject: meta?.title || meta?.section_name || meeting.kind,
          section_name: meta?.section_name || meta?.title || meeting.kind,
          type: 'meeting' as const,
          isCurrent: now >= startTime && now <= endTime,
          isPast: endTime < now,
          isFuture: startTime > now,
          starts_at: meeting.starts_at,
          ends_at: meeting.ends_at,
          status: meeting.status,
          kind: meeting.kind,
        };
      }),
  ].sort((a, b) => a.period - b.period);

  const isLoading = loadingTimetable || loadingMeetings;

  return (
    <ImprovedCard>
      <CardHeader className="pb-3 sm:pb-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
              <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent hover:from-blue-500 hover:to-blue-600 transition-all duration-200 truncate">
                오늘의 시간표
              </span>
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/timetable')}
            className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full hover:bg-blue-100 hover:text-blue-600 transition-all duration-200 hover:scale-105"
          >
            <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border animate-pulse">
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : combinedSchedule.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>오늘 일정이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {combinedSchedule.slice(0, 4).map((entry, index) => {
              const isCurrentClass = entry.isCurrent;
              const isPeriodPast = entry.isPast;

              return (
                <div
                  key={entry.id || index}
                  className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-all duration-200 hover:shadow-md ${
                    isCurrentClass
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-sm'
                      : isPeriodPast
                        ? 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 opacity-70'
                        : 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex flex-col items-center min-w-[44px] sm:min-w-[50px] flex-shrink-0">
                    <div className={`text-xs sm:text-sm font-bold text-center ${
                      isCurrentClass ? 'text-green-600' : isPeriodPast ? 'text-gray-500' : 'text-gray-600'
                    }`}>
                      {entry.period}교시
                    </div>
                    {getPeriodStartTime(entry.period) && (
                      <div className={`text-xs mt-0.5 ${
                        isCurrentClass ? 'text-green-500' : isPeriodPast ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {getPeriodStartTime(entry.period)}
                      </div>
                    )}
                  </div>
                  <div className={`w-px h-6 sm:h-8 flex-shrink-0 ${
                    isCurrentClass ? 'bg-green-200' : 'bg-gray-200'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Clock className={`h-3 w-3 sm:h-4 sm:w-4 ${
                        isCurrentClass ? 'text-green-600' : isPeriodPast ? 'text-gray-400' : 'text-gray-500'
                      }`} />
                      <span className={`text-xs sm:text-sm font-medium truncate ${
                        isCurrentClass ? 'text-green-800' : isPeriodPast ? 'text-gray-600' : 'text-gray-800'
                      }`}>
                        {entry.subject || entry.section_name}
                      </span>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isCurrentClass ? 'bg-green-500' : 'bg-gray-400'
                  }`}></div>
                </div>
              );
            })}
            {combinedSchedule.length > 4 && (
              <div className="text-center text-sm text-muted-foreground pt-2">
                총 {combinedSchedule.length}개 일정 중 4개 표시
              </div>
            )}
          </div>
        )}
      </CardContent>
    </ImprovedCard>
  );
};
