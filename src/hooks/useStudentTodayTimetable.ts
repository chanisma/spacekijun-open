import { useMemo } from 'react';
import { useStudentTimetable } from './useStudentTimetable';
import { getPeriodFromDate } from '@/lib/timeUtils';

export interface StudentTodayEntry {
  id: string;
  period: number;
  weekday: number;
  subject: string;
  section_name: string;
  teacher_name: string;
  type: 'pattern';
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
}

export function useStudentTodayTimetable() {
  const { timetable, loading, studentGrade } = useStudentTimetable();

  const data = useMemo<StudentTodayEntry[]>(() => {
    const today = new Date();
    const todayWeekday = today.getDay() === 0 ? 7 : today.getDay();
    const currentPeriod = getPeriodFromDate(today);

    return timetable
      .filter((entry) => entry.day_of_week === todayWeekday)
      .map((entry) => ({
        id: `student-${entry.day_of_week}-${entry.period}`,
        period: entry.period,
        weekday: entry.day_of_week,
        subject: entry.subject,
        section_name: entry.subject,
        teacher_name: entry.teacher_name,
        type: 'pattern' as const,
        isCurrent: currentPeriod !== null && entry.period === currentPeriod,
        isPast: currentPeriod !== null && entry.period < currentPeriod,
        isFuture: currentPeriod === null || entry.period > currentPeriod,
      }))
      .sort((a, b) => a.period - b.period);
  }, [timetable]);

  return { data, isLoading: loading, studentGrade: studentGrade ?? null };
}
