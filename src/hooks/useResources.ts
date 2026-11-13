import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Resource, ResourceType } from '@/types/domain';

// Query Keys
export const resourceKeys = {
  all: ['resources'] as const,
  lists: () => [...resourceKeys.all, 'list'] as const,
  list: (type?: ResourceType) => [...resourceKeys.lists(), type] as const,
  teachers: () => [...resourceKeys.all, 'teachers'] as const,
};

// Resource hooks
export function useResources(type?: ResourceType) {
  return useQuery({
    queryKey: resourceKeys.list(type),
    queryFn: async (): Promise<Resource[]> => {
      let query = supabase
        .from('resource')
        .select('*')
        .order('name', { ascending: true });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data as any) || [];
    },
  });
}

// Teachers (resource type = 'teacher')
export function useTeachers() {
  return useQuery({
    queryKey: resourceKeys.teachers(),
    queryFn: async (): Promise<Resource[]> => {
      const { data, error } = await supabase
        .from('resource')
        .select('*')
        .eq('type', 'teacher')
        .order('name', { ascending: true });

      if (error) throw error;

      return (data as any) || [];
    },
  });
}