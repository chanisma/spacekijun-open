/**
 * 펫이 사는 학교 일정 — 내 시간표(요일 패턴) · 교시 시각 · 학기 기간 · 이번 주 휴업일.
 *
 * 누구의 시간표인가(2026-10-07 선생님도 키우게 되며):
 *  · 학생 = 내가 듣는 수업(`useStudentTimetable` — 학생 홈 카드와 같은 훅)
 *  · 선생님 = 내가 가르치는 수업(`teacher_timetable`) — 선생님의 펫도 수업 시간엔 함께 «수업 중»
 *  · 그 밖 = 수업 정지 없이 잠만 자는 일정
 */
import { useMemo } from 'react';
import { useStudentTimetable } from '@/hooks/useStudentTimetable';
import { useStudentWeeklySchedule } from '@/hooks/useStudentWeeklySchedule';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { useSchoolCalendar } from '@/hooks/useSchoolCalendar';
import { TIME_CONFIG } from '@/lib/timeUtils';
import { gradeOfSectionName, type SchoolDayInfo } from '@/lib/schoolDay';
import { DEFAULT_SLEEP, hhmmToMinutes, type PeriodWindow, type SchoolSchedule } from '../model/clock';
import { useTeacherWeeklyTimetable, type PetLessonSlot } from './useTeacherWeeklyTimetable';

export const PERIOD_WINDOWS: PeriodWindow[] = Object.entries(TIME_CONFIG.PERIOD_TIMES).map(([period, t]) => ({
  period: Number(period),
  start: hhmmToMinutes(t.start),
  end: hhmmToMinutes(t.end),
}));

// 쉬는 날 = `lib/schoolDay`(NEIS 수업공제일명). 2026-10-11 전에는 제목 낱말
// `/(휴업|공휴일|방학|…)/` 로 걸렀는데 «방학식»(수업이 있는 날)까지 쉬는 날이 됐다.

/**
 * 일부 학년만 쉬는 날(1학년 수학여행)에 빠지는 교시 — 선생님 전용(2026-10-13).
 * 선생님은 학교 전체로 판정하므로 그날이 «수업일»로 남는다. 대시보드가 `isClosedForGrade` 로
 * 수업마다 보듯, 여기서도 수업 이름(`과목 1-3`)의 학년이 쉬는 학년이면 그 교시를 뺀다.
 */
export function partialClosedPeriods(
  days: Iterable<SchoolDayInfo>,
  slots: readonly PetLessonSlot[],
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const day of days) {
    if (day.isClosed || day.closedGrades.length === 0) continue;
    const periods = slots
      .filter((s) => s.day_of_week === day.dow && day.closedGrades.includes(gradeOfSectionName(s.subject) ?? -1))
      .map((s) => s.period);
    if (periods.length > 0) out[day.date] = [...new Set(periods)].sort((a, b) => a - b);
  }
  return out;
}

export type PetOwnerKind = 'student' | 'teacher' | 'none';

export function usePetSchedule(who: PetOwnerKind) {
  const student = useStudentTimetable({ enabled: who === 'student' });
  const teacher = useTeacherWeeklyTimetable(who === 'teacher');
  const { data: weekly = [] } = useStudentWeeklySchedule();
  const { data: term } = useAcademicTerm();
  // 오늘 앞뒤 — 다음 부름 예측(predictNextCall)이 하루 앞을 본다
  const today = new Date();
  const calStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const calEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8);
  // 학생은 자기 학년으로 판정(일부 학년 «수업 없는 날»). 선생님은 여러 학년을 가르치므로 전 학년 휴업만
  const calendar = useSchoolCalendar(calStart, calEnd, {
    applyTerm: false,
    enabled: who !== 'none',
    grade: who === 'student' ? student.studentGrade ?? null : null,
  });
  const closedKey = [...calendar.days.values()]
    .filter((day) => day.kind === 'holiday' || day.kind === 'vacation')
    .map((day) => day.date)
    .join(',');
  const { days } = calendar;

  const timetable: PetLessonSlot[] = useMemo(() => (
    who === 'student'
      ? student.timetable.map((e) => ({ day_of_week: e.day_of_week, period: e.period, subject: e.subject, teacher_name: e.teacher_name }))
      : who === 'teacher' ? teacher.slots : []
  ), [who, student.timetable, teacher.slots]);

  const schedule = useMemo<SchoolSchedule>(() => {
    if (who === 'none') return { classes: {}, periods: PERIOD_WINDOWS, sleep: DEFAULT_SLEEP };
    const classes: Record<number, number[]> = {};
    for (const entry of timetable) {
      if (!entry.subject) continue;
      (classes[entry.day_of_week] ??= []).push(entry.period);
    }
    const noClassDates = new Set<string>(closedKey ? closedKey.split(',') : []);
    return {
      classes,
      periods: PERIOD_WINDOWS,
      sleep: DEFAULT_SLEEP,
      noClassDates,
      noClassPeriods: who === 'teacher' ? partialClosedPeriods(days.values(), timetable) : undefined,
      term: term?.startDate && term?.endDate ? { start: term.startDate, end: term.endDate } : null,
    };
  }, [who, timetable, closedKey, days, term]);

  // 학사일정도 기다린다 — 읽기 전에 따라잡으면 쉬는 날의 수업 칸이 «수업 중»(시간 멈춤)으로 저장돼 되돌릴 수 없다
  const calendarLoading = who !== 'none' && calendar.isLoading;
  const loading = calendarLoading || (who === 'student' ? student.loading : who === 'teacher' ? teacher.loading : false);
  return { schedule, ready: !loading, timetable, weekly };
}
