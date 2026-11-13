/**
 * Hook to fetch teachers available for class substitution
 * Returns teachers who don't have a class at the specified time slot
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { nextDateForWeekday } from '@/lib/timetableOverride';
import { fetchEffectiveTeacherTimetable } from '@/services/timetableOverrideService';

export interface AvailableTeacher {
  id: string;
  name: string;
  hasConflict: boolean;
}

/**
 * Fetches all teachers who are available (no class conflict) at the specified time
 * @param weekday - Day of week (1=Monday, 7=Sunday)
 * @param period - Period number (1-8)
 * @param enabled - Whether to enable the query
 *
 * 2026-07-28: 충돌 판정 소스를 `resource.meta.section` 시간코드 파싱 → 정규화 테이블
 * `teacher_timetable`(해당 학기)로 전환. 학기가 둘 이상일 때 meta 는 최신 업로드만 담아
 * 과거 학기 기준으로 판정할 수 없었다.
 */
export function useAvailableTeachers(
  weekday: number | undefined,
  period: number | undefined,
  enabled: boolean = true,
  /**
   * 수업 날짜(yyyy-MM-dd). 운영 시간표(시험·수능 대비 등)는 날짜로 판정된다 —
   * 모르면 오늘부터 가장 가까운 그 요일로 본다.
   */
  lessonDate?: string
) {
  const { term, isLoading: isTermLoading } = useTimetableTerm();
  const date =
    lessonDate ?? (weekday ? format(nextDateForWeekday(weekday), 'yyyy-MM-dd') : undefined);

  return useQuery({
    queryKey: ['availableTeachers', weekday, period, term?.year ?? null, term?.semester ?? null, date ?? null],
    queryFn: async (): Promise<AvailableTeacher[]> => {
      if (!weekday || !period || !term || !date) {
        return [];
      }

      // Step 1: Get all teachers
      const { data: teachers, error: teachersError } = await supabase
        .from('resource')
        .select('id, name')
        .eq('type', 'teacher')
        .order('name'); // Sorted alphabetically in Korean

      if (teachersError) {
        console.error('Error fetching teachers:', teachersError);
        throw teachersError;
      }

      if (!teachers || teachers.length === 0) {
        return [];
      }

      // Step 2: 그날 그 교시에 수업이 있는 교사 — 정규 시간표에 운영 시간표를 덮은 결과
      const busySlots = (
        await fetchEffectiveTeacherTimetable({ year: term.year, semester: term.semester, from: date!, to: date! })
      ).filter((slot) => slot.day_of_week === weekday && slot.period === period && slot.teacher_resource_id);

      const busyTeacherIds = new Set<string>(
        (busySlots ?? [])
          .map((slot) => slot.teacher_resource_id)
          .filter((id): id is string => !!id)
      );

      // Step 3: Mark teachers as available or busy
      const availableTeachers: AvailableTeacher[] = teachers.map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        hasConflict: busyTeacherIds.has(teacher.id)
      }));

      // Sort: available teachers first, then by name
      availableTeachers.sort((a, b) => {
        if (a.hasConflict !== b.hasConflict) {
          return a.hasConflict ? 1 : -1; // Available first
        }
        return a.name.localeCompare(b.name, 'ko'); // Korean alphabetical order
      });

      return availableTeachers;
    },
    enabled: enabled && !!weekday && !!period && !isTermLoading && !!term,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
