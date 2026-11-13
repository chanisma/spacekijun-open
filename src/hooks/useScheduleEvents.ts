// ========================================
// Schedule Events Hook (Optimized)
// 스케줄 이벤트를 가져오는 최적화된 hook
// ========================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { useToast } from '@/hooks/use-toast';

export interface ScheduleEvent {
  id: string;
  kind: 'class' | 'homeroom' | 'schedule' | 'duty' | 'training' | 'event' | 'document_submission' | 'task';
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by: string;
  source?: string;
  holiday?: boolean;
  section_name?: string;
  room_name?: string;
  assignee?: string;
  exchangeable?: boolean;
  date_only?: boolean;
  submission_deadline?: string;
  target?: string;
  description?: string;
  participant_count?: number;
  meta?: any;
  section?: { name: string };
}

/**
 * @param options.enabled false면 조회를 하지 않는다.
 *   useSchedule()을 mutation(createEvent 등) 목적으로만 쓰는 화면이
 *   화면에 그리지도 않을 한 달치 일정을 끌어오지 않도록 하는 용도.
 */
export function useScheduleEvents(startDate?: Date, endDate?: Date, options?: { enabled?: boolean }) {
  const currentResourceId = useCurrentResourceId();

  const getDateRange = () => {
    if (startDate && endDate) {
      return { start: startDate, end: endDate };
    }

    // 기본: 현재 월의 첫째 날 ~ 마지막 날 + 여유분
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // 앞뒤로 일주일씩 여유를 둠
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - 7);
    const end = new Date(lastDay);
    end.setDate(lastDay.getDate() + 7);

    return { start, end };
  };

  // 안정적인 queryKey 생성을 위한 날짜 문자열 변환
  const startDateKey = startDate ? startDate.toISOString().split('T')[0] : null;
  const endDateKey = endDate ? endDate.toISOString().split('T')[0] : null;

  return useQuery({
    queryKey: ['schedule-events', currentResourceId, startDateKey, endDateKey],
    queryFn: async () => {
      if (!currentResourceId) return [];

      const { start, end } = getDateRange();

      const { data: meetings, error } = await supabase
        .from('meeting')
        .select(`
          *,
          section(name)
        `)
        .gte('starts_at', start.toISOString())
        .lte('starts_at', end.toISOString())
        .order('starts_at', { ascending: true });

      if (error) {
        console.error('Error fetching schedule events:', error);
        throw error;
      }

      // Transform to ScheduleEvent format
      const events: ScheduleEvent[] = ((meetings || []).map(meeting => ({
        id: meeting.id,
        kind: meeting.kind || 'event',
        title: (meeting.meta as any)?.title || '제목 없음',
        starts_at: meeting.starts_at || new Date().toISOString(),
        ends_at: meeting.ends_at || new Date().toISOString(),
        status: meeting.status || 'active',
        created_by: meeting.created_by || '',
        source: (meeting.meta as any)?.source,
        holiday: (meeting.meta as any)?.holiday,
        section_name: meeting.section?.name,
        room_name: (meeting.meta as any)?.room_name,
        assignee: (meeting.meta as any)?.assignee,
        exchangeable: (meeting.meta as any)?.exchangeable,
        date_only: (meeting.meta as any)?.date_only,
        submission_deadline: (meeting.meta as any)?.submission_deadline,
        target: (meeting.meta as any)?.target,
        description: (meeting.meta as any)?.description,
        participant_count: (meeting.meta as any)?.participant_count,
        meta: meeting.meta,
        section: meeting.section
      })) as any);

      return events;
    },
    enabled: !!currentResourceId && (options?.enabled ?? true),
    staleTime: 10 * 60 * 1000,    // 10분간 fresh - 스케줄은 상대적으로 안정적
    gcTime: 30 * 60 * 1000,       // 30분간 캐시 보관
    refetchOnMount: false,        // 마운트 시 자동 refetch 방지
    refetchOnWindowFocus: false,  // 윈도우 포커스 시 refetch 방지
    refetchOnReconnect: true,     // 네트워크 재연결 시만 refetch
  });
}

export function useScheduleMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentResourceId = useCurrentResourceId();

  const createEvent = useMutation({
    mutationFn: async (eventData: {
      title: string;
      kind: string;
      starts_at: string;
      ends_at: string;
      description?: string;
      assignee?: string;
      meta?: any;
    }) => {
      if (!currentResourceId) {
        throw new Error('사용자 정보를 찾을 수 없습니다.');
      }

      const { data, error } = await (supabase as any)
        .from('meeting')
        .insert({
          ...eventData,
          created_by: currentResourceId,
          status: 'active'
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
    },
    onError: (error) => {
      console.error('일정 생성 오류:', error);
      toast({
        title: '오류',
        description: '일정 생성에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, ...eventData }: {
      id: string;
      title?: string;
      kind?: string;
      starts_at?: string;
      ends_at?: string;
      description?: string;
      assignee?: string;
      meta?: any;
    }) => {
      const { data, error } = await supabase
        .from('meeting')
        .update(eventData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
    },
    onError: (error) => {
      console.error('일정 수정 오류:', error);
      toast({
        title: '오류',
        description: '일정 수정에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('meeting')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      return eventId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
    },
    onError: (error) => {
      console.error('일정 삭제 오류:', error);
      toast({
        title: '오류',
        description: '일정 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  return {
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

// 특정 날짜의 이벤트만 필터링하는 유틸리티 함수
export function getEventsForDate(events: ScheduleEvent[], date: Date): ScheduleEvent[] {
  const dateStr = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  return events.filter(event =>
    event.starts_at.startsWith(dateStr)
  );
}