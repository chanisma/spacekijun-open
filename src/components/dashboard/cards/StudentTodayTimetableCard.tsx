import { useNavigate } from 'react-router-dom';
import { Calendar, Clock } from 'lucide-react';
import { DashboardCardShell, DashboardCardSkeleton } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { formatPeriodTime, getPeriodTimeStatus } from '@/lib/timeUtils';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { useStudentTodayTimetable } from '@/hooks/useStudentTodayTimetable';
import { cn } from '@/lib/utils';
import { useSchoolDay } from '@/hooks/useSchoolCalendar';
import { SchoolDayNotice } from '@/components/dashboard/SchoolDayNotice';

export const StudentTodayTimetableCard = () => {
  const navigate = useNavigate();
  const { data: entries, isLoading, studentGrade } = useStudentTodayTimetable();
  const now = useCurrentTime();
  // 쉬는 날(휴일·방학·주말)은 수업을 감추고, 시험일은 흐리게 남긴다(사용자 결정 2026-10-11)
  // 학년을 넘긴다 — 손으로 넣은 «2학년 수업 없음» 같은 날은 그 학년에게만 쉬는 날
  const schoolDay = useSchoolDay(now, studentGrade);
  const closed = schoolDay?.isClosed ?? false;
  const dimmed = schoolDay?.kind === 'exam';
  const statusOf = (period: number) => (dimmed
    ? { isCurrent: false, isPast: false, isFuture: false }
    : getPeriodTimeStatus(period, now));
  const current = entries.find((entry) => statusOf(entry.period).isCurrent);
  const next = entries.find((entry) => statusOf(entry.period).isFuture);
  const featured = current ?? next;

  return (
    <DashboardCardShell title="오늘의 시간표" icon={Clock} accent="blue"
      description="오늘 수업과 다음 교시를 확인하세요."
      onAction={() => navigate('/timetable')} actionLabel="전체 시간표 보기">
      {isLoading ? <DashboardCardSkeleton rows={5} /> : closed ? (
        <SchoolDayNotice day={schoolDay} className="py-3" />
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <Calendar className="mx-auto mb-3 h-7 w-7 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-600">오늘 등록된 수업이 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">전체 시간표에서 다른 요일을 확인할 수 있어요.</p>
        </div>
      ) : (
        <div>
          {dimmed && <SchoolDayNotice day={schoolDay} className="mb-3" />}
          {!dimmed && <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3">
            <p className="text-xs font-semibold text-sky-700">{current ? '지금 수업 중' : next ? '다음 수업' : '오늘의 수업을 마쳤어요'}</p>
            {featured ? (
              <p className="mt-1 break-words text-sm font-bold text-slate-900">
                {featured.period}교시 · {featured.subject || featured.section_name}
                <span className="ml-2 inline-block text-xs font-normal text-slate-500">{formatPeriodTime(featured.period)}</span>
              </p>
            ) : <p className="mt-1 text-xs text-slate-500">남은 학교 일정도 확인해 보세요.</p>}
          </div>}
          <ol className={cn('space-y-1.5', dimmed && 'opacity-60')}>
            {entries.map((entry) => {
              const status = statusOf(entry.period);
              return (
                <li key={entry.id} aria-current={status.isCurrent ? 'true' : undefined}
                  className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5',
                    status.isCurrent ? 'border-emerald-200 bg-emerald-50' : 'border-transparent bg-slate-50/70')}>
                  <span className={cn('shrink-0 text-xs font-bold', status.isCurrent ? 'text-emerald-700' : 'text-slate-500')}>{entry.period}교시</span>
                  <div className="min-w-0 flex-1 border-l border-slate-200 pl-3">
                    <p className={cn('break-words text-sm font-semibold', status.isPast ? 'text-slate-500' : 'text-slate-800')}>{entry.subject || entry.section_name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{formatPeriodTime(entry.period)}{entry.teacher_name && ` · ${entry.teacher_name}`}</p>
                  </div>
                  {status.isCurrent && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">수업 중</span>}
                  {status.isPast && <span className="shrink-0 text-[10px] text-slate-400">종료</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </DashboardCardShell>
  );
};
