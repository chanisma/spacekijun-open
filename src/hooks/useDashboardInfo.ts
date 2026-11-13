import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import { DashboardInfoBox, CreateDashboardInfoBoxInput, UpdateDashboardInfoBoxInput, StudentBirthday } from '@/types/dashboardInfo';
import { toast } from '@/lib/toast';

// Query key factory
export const dashboardInfoKeys = {
  all: ['dashboard-info'] as const,
  active: () => [...dashboardInfoKeys.all, 'active'] as const,
  latest: () => [...dashboardInfoKeys.all, 'latest'] as const,
  list: () => [...dashboardInfoKeys.all, 'list'] as const,
  detail: (id: string) => [...dashboardInfoKeys.all, 'detail', id] as const,
};

/**
 * Get all active cards (parent_card_id IS NULL) for home page display
 */
export function useLatestDashboardInfo() {
  return useQuery({
    queryKey: dashboardInfoKeys.latest(),
    queryFn: async (): Promise<DashboardInfoBox | null> => {
      const { data, error } = await supabase
        .from('dashboard_info_boxes')
        .select('*')
        .eq('is_active', true)
        .is('parent_card_id', null) // Only cards, not items
        .eq('content_type', 'card')
        .order('display_order', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching latest dashboard info:', error);
        throw error;
      }

      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get all cards (parent_card_id IS NULL) for admin management
 */
export function useDashboardInfoList() {
  return useQuery({
    queryKey: dashboardInfoKeys.list(),
    queryFn: async (): Promise<DashboardInfoBox[]> => {
      const { data, error } = await supabase
        .from('dashboard_info_boxes')
        .select('*')
        .is('parent_card_id', null) // Only cards, not items
        .eq('content_type', 'card')
        .order('display_order', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching dashboard info list:', error);
        throw error;
      }

      return data || [];
    },
  });
}

/**
 * Get items within a specific card
 */
export function useCardItems(cardId: string | null) {
  return useQuery({
    queryKey: [...dashboardInfoKeys.all, 'items', cardId],
    queryFn: async (): Promise<DashboardInfoBox[]> => {
      if (!cardId) return [];

      const { data, error } = await supabase
        .from('dashboard_info_boxes')
        .select('*')
        .eq('parent_card_id', cardId)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching card items:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!cardId,
  });
}

/**
 * Get all items (for all cards) grouped by parent_card_id
 */
export function useAllCardItems() {
  return useQuery({
    queryKey: [...dashboardInfoKeys.all, 'all-items'],
    queryFn: async (): Promise<Record<string, DashboardInfoBox[]>> => {
      const { data, error} = await supabase
        .from('dashboard_info_boxes')
        .select('*')
        .not('parent_card_id', 'is', null)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching all card items:', error);
        throw error;
      }

      // Group items by parent_card_id
      const grouped: Record<string, DashboardInfoBox[]> = {};
      (data || []).forEach((item) => {
        const parentId = item.parent_card_id!;
        if (!grouped[parentId]) {
          grouped[parentId] = [];
        }
        grouped[parentId].push(item);
      });

      return grouped;
    },
  });
}

/**
 * Create a new dashboard info box
 */
export function useCreateDashboardInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDashboardInfoBoxInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = await supabase
        .from('dashboard_info_boxes')
        .insert({
          ...input,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardInfoKeys.all });
    },
    onError: (error) => {
      console.error('Error creating dashboard info:', error);
      toast.error('대시보드 정보 생성에 실패했습니다.');
    },
  });
}

/**
 * Update an existing dashboard info box
 */
export function useUpdateDashboardInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateDashboardInfoBoxInput }) => {
      const { data, error } = await supabase
        .from('dashboard_info_boxes')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardInfoKeys.all });
    },
    onError: (error) => {
      console.error('Error updating dashboard info:', error);
      toast.error('대시보드 정보 수정에 실패했습니다.');
    },
  });
}

/**
 * Delete a dashboard info box
 */
export function useDeleteDashboardInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('dashboard_info_boxes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardInfoKeys.all });
    },
    onError: (error) => {
      console.error('Error deleting dashboard info:', error);
      toast.error('대시보드 정보 삭제에 실패했습니다.');
    },
  });
}

/**
 * Get today's birthdays from resource table
 */
export function useTodayBirthdays() {
  return useQuery({
    queryKey: ['today-birthdays'],
    queryFn: async (): Promise<StudentBirthday[]> => {
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayMMDD = `${month}-${day}`;

      const { data, error } = await supabase
        .from('resource')
        .select('name, meta')
        .eq('type', 'student')
        .not('meta->birthday', 'is', null);

      if (error) {
        console.error('Error fetching birthdays:', error);
        throw error;
      }

      // Filter students whose birthday matches today's month and day
      const birthdayStudents: StudentBirthday[] = (data || [])
        .filter((student) => {
          const birthday = student.meta?.birthday as string;
          if (!birthday) return false;
          const birthdayMMDD = birthday.slice(5); // Extract MM-DD from YYYY-MM-DD
          return birthdayMMDD === todayMMDD;
        })
        .map((student) => ({
          displayName: student.name,
          grade: student.meta?.grade as number,
          class: student.meta?.class as number,
          number: student.meta?.number as number,
        }))
        .sort((a, b) => {
          // Sort by grade, class, number
          if (a.grade !== b.grade) return a.grade - b.grade;
          if (a.class !== b.class) return a.class - b.class;
          return a.number - b.number;
        });

      return birthdayStudents;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
