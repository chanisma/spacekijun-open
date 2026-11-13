// ========================================
// Today Timetable Hook
// 오늘의 시간표를 가져오는 최적화된 hook
// 교사 = teacher_timetable, 학생 = student_timetable (둘 다 학기 키를 가진 정규화 테이블)
// ========================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getPeriodFromDate } from '@/lib/timeUtils';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { format } from 'date-fns';
import { weekdayTimeCode } from '@/lib/timetableSource';
import { effectiveSlotLabel, type EffectiveTeacherSlot } from '@/lib/timetableOverride';
import { fetchEffectiveTeacherTimetable } from '@/services/timetableOverrideService';

/**
 * 오늘 요일에 해당하는 수업만 추려 반환한다.
 *
 * 2026-07-28: 소스를 `resource.meta.section` / `resource.meta.timetable` 에서
 * 정규화 테이블로 전환했다. meta 는 학기 개념이 없어 학기가 둘 이상이면 최신 업로드로
 * 덮이는 구조였다. 섹션명 문자열은 `teacherSectionName()` 으로 동일하게 재현한다.
 */
export function useTodayTimetable(currentResourceId: string | null) {
  const { term, isLoading: isTermLoading } = useTimetableTerm();

  return useQuery({
    // 운영 시간표는 날짜로 판정되므로 날짜가 키에 들어간다(자정을 넘긴 탭이 어제 시간표를 들고 있지 않게)
    queryKey: ['today-timetable', currentResourceId, term?.year ?? null, term?.semester ?? null, format(new Date(), 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!currentResourceId || !term) return [];

      const today = new Date();
      const todayWeekday = today.getDay() === 0 ? 7 : today.getDay();
      const currentPeriod = getPeriodFromDate(today);

      const markPhase = (period: number) => ({
        isCurrent: currentPeriod !== null && period === currentPeriod,
        isPast: currentPeriod !== null && period < currentPeriod,
        isFuture: currentPeriod === null || period > currentPeriod,
      });

      // Get resource data (type 판별용 — 교사/학생 소스가 다르다)
      const { data: resource, error: resourceError } = await supabase
        .from('resource')
        .select('id, name, type')
        .eq('id', currentResourceId)
        .single();

      if (resourceError || !resource) {
        return [];
      }

      // ── 학생: student_timetable ──
      if (resource.type === 'student') {
        const { data: rows, error } = await supabase
          .from('student_timetable')
          .select('day_of_week, period, subject, teacher_name')
          .eq('academic_year', term.year)
          .eq('semester', term.semester)
          .eq('resource_id', currentResourceId)
          .eq('day_of_week', todayWeekday);

        if (error) {
          console.error('학생 오늘 시간표 조회 오류:', error);
          return [];
        }

        return (rows ?? [])
          .map((entry) => ({
            id: `student-${entry.day_of_week}-${entry.period}`,
            period: entry.period,
            weekday: entry.day_of_week,
            subject: entry.subject || '',
            section_name: entry.subject || '',
            teacher_name: entry.teacher_name || '',
            type: 'pattern',
            ...markPhase(entry.period),
          }))
          .sort((a, b) => a.period - b.period);
      }

      // ── 교사: 오늘 실제로 들어가는 수업 — 정규 시간표에 운영 시간표(시험·수능 대비 등)를 덮은 결과 ──
      let slots: EffectiveTeacherSlot[] = [];
      try {
        slots = await fetchEffectiveTeacherTimetable({
          year: term.year,
          semester: term.semester,
          from: today,
          to: today,
          teacherResourceId: currentResourceId,
        });
      } catch (slotsError) {
        console.error('교사 오늘 시간표 조회 오류:', slotsError);
        return [];
      }

      return (slots ?? [])
        .filter((slot) => slot.period >= 1 && slot.period <= 8)
        .map((slot) => {
          const sectionName = effectiveSlotLabel(slot);
          return {
            id: `${sectionName.replace(/\s+/g, '-')}-${weekdayTimeCode(slot.day_of_week, slot.period)}`,
            period: slot.period,
            weekday: slot.day_of_week,
            subject: sectionName,
            section_name: sectionName,
            teacher_name: resource.name,
            type: 'pattern',
            weekday_time: weekdayTimeCode(slot.day_of_week, slot.period),
            ...markPhase(slot.period),
          };
        })
        .sort((a, b) => a.period - b.period);
    },
    enabled: !!currentResourceId && !isTermLoading && !!term,
    staleTime: 30 * 60 * 1000,    // 30분간 fresh - 시간표는 하루 중 변경되지 않음
    gcTime: 60 * 60 * 1000,       // 1시간간 캐시 보관
    refetchOnMount: true,         // 마운트 시 항상 최신 데이터 가져오기
    refetchOnWindowFocus: true,   // 탭 전환 시 staleTime 초과하면 refetch
    refetchOnReconnect: true,
  });
}
