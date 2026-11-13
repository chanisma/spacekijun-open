/**
 * Hook for querying class swap candidates
 * Uses TanStack Query for caching and state management
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ResourceId } from '@/services/unifiedAuth';
import type { TimetableEntry } from '@/hooks/useTimetableData';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';

/**
 * Fetch all teacher timetables for swap candidates
 * Uses RPC function to bypass RLS and get all teachers' schedules
 *
 * 2026-07-28: RPC 가 resource.meta.section 파싱 → teacher_timetable 기반으로 바뀌고
 * 학년도·학기 파라미터가 추가됐다(라이브 실측 856행 완전 동일 확인).
 */
export function useSwapCandidates(
  targetEntry: TimetableEntry | null,
  enabled: boolean = true
) {
  const { term, isLoading: isTermLoading } = useTimetableTerm();

  return useQuery({
    queryKey: [
      'swap-candidates',
      targetEntry?.grade,
      targetEntry?.class_number,
      term?.year ?? null,
      term?.semester ?? null,
    ],
    queryFn: async (): Promise<TimetableEntry[]> => {
      if (!targetEntry || !targetEntry.grade || !targetEntry.class_number || !term) {
        return [];
      }

      // Use RPC function to get all teacher timetables (bypasses RLS)
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_teacher_timetables_for_swap',
        {
          target_grade: targetEntry.grade,
          // RPC 파라미터는 정수다. (RPC 본문에서는 쓰이지 않지만 시그니처를 맞춘다.)
          target_class: Number(targetEntry.class_number),
          p_academic_year: term.year,
          p_semester: term.semester,
        }
      );

      if (rpcError) {
        console.error('RPC error:', rpcError);
        throw rpcError;
      }

      // Convert RPC result to TimetableEntry format
      const entries: TimetableEntry[] = (Array.isArray(rpcData) ? rpcData : []).map((row) => ({
        id: row.id,
        period: row.period,
        weekday: row.weekday,
        subject: row.subject,
        section_name: row.section_name,
        room_name: undefined,
        teacher_name: row.teacher_name,
        grade: row.grade,
        // TimetableEntry.class_number 는 문자열 표기로 통일한다
        // (useTimetableData 가 section.meta 의 JSON 숫자를 문자열로 정규화하는 것과 짝).
        class_number: row.class_number != null ? String(row.class_number) : undefined,
        week_span: null,
        type: 'pattern' as const,
        is_combined: false,
        resource_id: row.resource_id as ResourceId,
        section_id: row.section_id,
        weekday_time: row.weekday_time,
        // 교체 가능 여부(`isSwappableLesson`)의 정본. 거르는 일은 후보 **목록**에서만 한다
        // — 여기서 빼면 그 시간에 동아리를 맡은 교사가 비어 있는 것으로 보인다.
        activity_type: row.activity_type ?? undefined
      }));

      return entries;
    },
    enabled:
      enabled &&
      !!targetEntry &&
      !!targetEntry.grade &&
      !!targetEntry.class_number &&
      !isTermLoading &&
      !!term,
    staleTime: 3 * 60 * 1000,     // 3분간 fresh
    gcTime: 10 * 60 * 1000,       // 10분간 캐시 보관
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true
  });
}
