import { CalendarDays, Clock3, StickyNote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTodayMeetings } from '@/hooks/useTodayMeetings';
import { useTodayTimetable } from '@/hooks/useTodayTimetable';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { findMemoForSlot, useTeacherMemos } from '@/hooks/useTeacherMemo';
import { isUserAssignee, type AssigneeData } from '@/lib/assigneeUtils';
import { getPeriodFromDate, getPeriodStartTime, getPeriodTimeStatus } from '@/lib/timeUtils';
import { DashboardCardShell, DashboardCardSkeleton } from './DashboardCardShell';
import { useSchoolDay } from '@/hooks/useSchoolCalendar';
import { SchoolDayNotice } from '@/components/dashboard/SchoolDayNotice';
import { gradeOfSectionName, isClosedForGrade } from '@/lib/schoolDay';

interface TodayScheduleEntry {
  id: string;
  period: number;
  title: string;
  kind: string;
  isCurrent: boolean;
  isPast: boolean;
  startsAt?: string;
  /** 하루 중 분 단위 시각 — 수업(교시 시작)과 일정(실제 starts_at)을 한 축에서 정렬하기 위한 키 */
  sortMinutes: number;
  /** 시험일의 수업 — 흐리게, 진행 표시 없이 */
  dimmed?: boolean;
}

export function TeacherTodayScheduleCard({ currentResourceId }: { currentResourceId: string | undefined }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: timetable = [], isLoading: loadingTimetable } = useTodayTimetable(currentResourceId ?? null);
  const { data: meetings = [], isLoading: loadingMeetings } = useTodayMeetings(currentResourceId ?? null);
  const now = useCurrentTime();
  const { data: memos = [] } = useTeacherMemos(currentResourceId, now);
  // 쉬는 날(휴일·방학·주말)은 수업을 빼고 일정만, 시험일은 수업을 흐리게(사용자 결정 2026-10-11)
  const schoolDay = useSchoolDay(now);
  const lessonsClosed = schoolDay?.isClosed ?? false;
  const lessonsDimmed = schoolDay?.kind === 'exam';

  // 일부 학년만 수업이 없는 날 — 수업 이름(`과목 2-3`)의 학년으로 수업마다 거른다
  const openLessons = lessonsClosed
    ? []
    : timetable.filter((entry) => !isClosedForGrade(schoolDay, gradeOfSectionName(String(entry.section_name ?? entry.subject ?? ''))));
  const timetableEntries: TodayScheduleEntry[] = openLessons.map((entry) => {
    const period = Number(entry.period);
    const status = lessonsDimmed ? { isCurrent: false, isPast: false } : getPeriodTimeStatus(period, now);
    const startTime = getPeriodStartTime(period);
    const [startHour = 0, startMinute = 0] = startTime ? startTime.split(':').map(Number) : [];

    return {
      id: String(entry.id),
      period,
      title: String(entry.subject || entry.section_name || '수업'),
      kind: 'class',
      isCurrent: status.isCurrent,
      isPast: status.isPast,
      sortMinutes: startHour * 60 + startMinute,
      dimmed: lessonsDimmed,
    };
  });
  const meetingEntries: TodayScheduleEntry[] = meetings
    .filter((meeting) => {
      const meta = meeting.meta as { date_only?: boolean; assignee?: AssigneeData } | null;
      if (meta?.date_only) return false;
      if (meeting.kind !== 'duty') return true;
      return Boolean(profile?.name) && isUserAssignee(meta?.assignee, profile?.name ?? '');
    })
    .map((meeting) => {
      const meta = meeting.meta as { title?: string; section_name?: string } | null;
      const startsAt = new Date(meeting.starts_at);
      const endsAt = new Date(meeting.ends_at);
      return {
        id: meeting.id,
        period: getPeriodFromDate(startsAt) ?? 0,
        title: meta?.title || meta?.section_name || meeting.kind || '일정',
        kind: meeting.kind || 'schedule',
        isCurrent: now >= startsAt && now <= endsAt,
        isPast: endsAt < now,
        startsAt: meeting.starts_at,
        sortMinutes: startsAt.getHours() * 60 + startsAt.getMinutes(),
      };
    });
  const allEntries = [...timetableEntries, ...meetingEntries]
    .sort((a, b) => a.sortMinutes - b.sortMinutes);
  const nextEntryId = allEntries.find((entry) => !entry.dimmed && !entry.isPast && !entry.isCurrent)?.id;
  const currentEntry = allEntries.find((entry) => entry.isCurrent);
  const anchorIndex = currentEntry
    ? allEntries.findIndex((entry) => entry.id === currentEntry.id)
    : allEntries.findIndex((entry) => entry.id === nextEntryId);
  const visibleStartIndex = allEntries.length > 6 && anchorIndex >= 0
    ? Math.min(Math.max(anchorIndex - 2, 0), allEntries.length - 6)
    : 0;
  const entries = allEntries.slice(visibleStartIndex, visibleStartIndex + 6);
  const isLoading = loadingTimetable || loadingMeetings;

  return (
    <DashboardCardShell
      title="오늘의 흐름"
      icon={Clock3}
      accent="blue"
      description={currentEntry ? `${currentEntry.title} 진행 중` : `${allEntries.length}개의 수업과 일정`}
      badge={currentEntry ? (
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">LIVE</span>
      ) : null}
      onAction={() => navigate('/timetable')}
      actionLabel="시간표 전체 보기"
    >
      {!isLoading && <SchoolDayNotice day={schoolDay} className="mb-3" showPartial={openLessons.length < timetable.length} />}
      {isLoading ? (
        <DashboardCardSkeleton rows={5} />
      ) : entries.length === 0 ? (
        lessonsClosed ? null : <div className="flex min-h-56 flex-col items-center justify-center text-center">
          <CalendarDays className="h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">오늘 등록된 수업이나 일정이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">여유 있는 하루를 시작해 보세요.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute bottom-5 left-[27px] top-5 w-px bg-slate-100" />
          {entries.map((entry) => {
            const memo = entry.period > 0 ? findMemoForSlot(memos, now, entry.period) : undefined;
            const isNext = entry.id === nextEntryId;
            const state = entry.dimmed ? 'dimmed' : entry.isCurrent ? 'current' : entry.isPast ? 'past' : isNext ? 'next' : 'future';
            const timeLabel = entry.startsAt
              ? new Date(entry.startsAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              : getPeriodStartTime(entry.period) || '';

            return (
              <div key={entry.id} className={`teacher-dashboard-row relative flex items-center gap-3 rounded-xl px-1 py-2.5 sm:gap-4 ${state === 'dimmed' ? 'opacity-60' : ''}`}>
                <div className={`relative z-10 flex h-[54px] w-[54px] flex-shrink-0 flex-col items-center justify-center rounded-2xl border ${
                  state === 'current'
                    ? 'border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-200/60'
                    : state === 'next'
                      ? 'border-slate-300 bg-white text-slate-800'
                      : 'border-slate-100 bg-slate-50 text-slate-400'
                }`}>
                  <span className="text-sm font-bold">{entry.period > 0 ? `${entry.period}교시` : '일정'}</span>
                  {timeLabel && <span className="mt-0.5 text-[10px] opacity-80">{timeLabel}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${state === 'past' ? 'text-slate-400' : 'text-slate-800'}`}>
                    {entry.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {entry.kind === 'class' ? '수업' : entry.kind === 'duty' ? '업무' : '학교 일정'}
                  </p>
                  {memo?.content.trim() && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-900">
                      <StickyNote aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                      <p className="min-w-0 whitespace-pre-wrap break-words">
                        <span className="sr-only">메모: </span>
                        {memo.content}
                      </p>
                    </div>
                  )}
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                  state === 'current'
                    ? 'bg-sky-50 text-sky-700'
                    : state === 'next'
                      ? 'bg-slate-900 text-white'
                      : state === 'past'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                }`}>
                  {state === 'current' ? '진행 중' : state === 'next' ? '다음' : state === 'past' ? '완료' : state === 'dimmed' ? '시험 기간' : '예정'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCardShell>
  );
}
