import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

export interface DutyEvent {
  id: string;
  kind: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  section?: {
    name: string;
    subject: string;
  };
}

export type ViewMode = 'month' | 'day';

export const useDuty = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<DutyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const fetchEvents = async (startDate?: Date, endDate?: Date) => {
    if (!user) return;

    setLoading(true);
    try {
      const start = startDate || new Date();
      const end = endDate || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Fetch duty meetings - RLS will automatically filter for current user
      const { data: meetings, error: meetingsError } = await supabase
        .from('meeting')
        .select(`
          id,
          kind,
          starts_at,
          ends_at,
          status,
          meta
        `)
        .eq('kind', 'duty')
        .gte('starts_at', start.toISOString())
        .lte('starts_at', end.toISOString())
        .order('starts_at');

      if (meetingsError) {
        console.error('당직 조회 오류:', meetingsError);
        toast({
          title: '오류',
          description: '당직 일정을 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      const formattedEvents: DutyEvent[] = (meetings || []).map((meeting) => ({
        id: meeting.id,
        kind: meeting.kind,
        title: (meeting.meta as any)?.title || '당직',
        starts_at: meeting.starts_at,
        ends_at: meeting.ends_at,
        status: meeting.status || 'scheduled',
        section: (meeting as any).section
      }));

      setEvents(formattedEvents);
    } catch (error) {
      console.error('당직 조회 중 오류:', error);
      toast({
        title: '오류',
        description: '당직 일정을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async (eventData: {
    title: string;
    starts_at: string;
    ends_at: string;
    section_id?: string;
  }) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('meeting')
        .insert([{
          kind: 'duty',
          starts_at: eventData.starts_at,
          ends_at: eventData.ends_at,
          section_id: eventData.section_id,
          status: 'scheduled',
          meta: {
            title: eventData.title
          }
        }]);

      if (error) {
        console.error('당직 생성 오류:', error);
        toast({
          title: '오류',
          description: '당직 일정을 생성하는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }


      fetchEvents();
    } catch (error) {
      console.error('당직 생성 중 오류:', error);
      toast({
        title: '오류',
        description: '당직 일정을 생성하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user, selectedDate, viewMode]);

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(event => {
      const eventDate = new Date(event.starts_at).toISOString().split('T')[0];
      return eventDate === dateStr;
    });
  };

  const refetch = () => fetchEvents();

  return {
    events,
    loading,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    fetchEvents,
    createEvent,
    getEventsForDate,
    refetch
  };
};