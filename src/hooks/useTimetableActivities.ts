/**
 * Hook for managing timetable activities
 * Uses TanStack Query for caching and state management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

export interface TimetableActivity {
  id: string;
  title: string;
  description?: string;
  activity_date: string;
  period: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Query hook for fetching timetable activities
 */
export const useTimetableActivities = () => {
  const { user } = useAuth();

  const { data: activities = [], isLoading: loading } = useQuery({
    queryKey: ['timetable-activities'],
    queryFn: async (): Promise<TimetableActivity[]> => {
      const { data, error } = await supabase
        .from('timetable_activities')
        .select('*')
        .order('activity_date', { ascending: true })
        .order('period', { ascending: true });

      if (error) {
        console.error('시간표 활동 조회 오류:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!user,
    staleTime: 3 * 60 * 1000,     // 3분간 fresh
    gcTime: 10 * 60 * 1000,       // 10분간 캐시 보관
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true
  });

  return {
    activities,
    loading
  };
};

/**
 * Mutation hook for creating timetable activities
 */
export const useCreateTimetableActivity = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (activity: Omit<TimetableActivity, 'id' | 'created_by' | 'created_at' | 'updated_at'>) => {
      requireUser(user);

      const { data, error } = await supabase
        .from('timetable_activities')
        .insert([{
          ...activity,
          created_by: user.id
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-activities'] });
    },
    onError: (error) => {
      console.error('시간표 활동 생성 오류:', error);
      toast({
        title: '오류',
        description: '시간표 활동을 생성하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  });
};

/**
 * Mutation hook for deleting timetable activities
 */
export const useDeleteTimetableActivity = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      requireUser(user);

      const { error } = await supabase
        .from('timetable_activities')
        .delete()
        .eq('id', id)
        .eq('created_by', user.id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-activities'] });
    },
    onError: (error) => {
      console.error('시간표 활동 삭제 오류:', error);
      toast({
        title: '오류',
        description: '시간표 활동을 삭제하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  });
};