/**
 * 선생님의 한 주 수업(요일·교시·과목 반) — 다마고찌가 선생님의 수업 시간에도 «수업 중»이 되도록(2026-10-07).
 * 정본 = `teacher_timetable`(학기 키) · 학기 = 학사력(`useTimetableTerm`) · 반 이름 = `teacherSectionName`(시간표 화면과 같은 글).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unifiedAuth } from '@/services/unifiedAuth';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { teacherSectionName } from '@/lib/timetableSource';

export interface PetLessonSlot {
  day_of_week: number;
  period: number;
  subject: string;
  teacher_name: string;
}

export function useTeacherWeeklyTimetable(enabled: boolean) {
  const { term, isLoading: termLoading } = useTimetableTerm();
  const { data, isLoading } = useQuery({
    queryKey: ['tamagotchi-teacher-timetable', term?.year ?? null, term?.semester ?? null],
    enabled: enabled && !!term,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<PetLessonSlot[]> => {
      const resourceId = await unifiedAuth.getCurrentResourceId();
      if (!resourceId || !term) return [];
      const { data: rows, error } = await supabase
        .from('teacher_timetable')
        .select('day_of_week, period, grade, subject_name, class_label')
        .eq('academic_year', term.year)
        .eq('semester', term.semester)
        .eq('teacher_resource_id', resourceId);
      if (error) throw error;
      return (rows ?? []).map((r) => ({
        day_of_week: r.day_of_week,
        period: r.period,
        subject: teacherSectionName(r),
        teacher_name: '',
      }));
    },
  });
  return { slots: data ?? [], loading: enabled && (termLoading || isLoading) };
}
