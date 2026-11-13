import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface TeacherResource {
  id: string;
  name: string;
  meta: Record<string, unknown> | null;
}

export function useCurrentTeacherResource() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['current-teacher-resource', user?.id, profile?.name],
    enabled: !!user && !!profile?.name,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<TeacherResource | null> => {
      if (!profile?.name) return null;
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, meta')
        .eq('type', 'teacher')
        .eq('name', profile.name)
        .maybeSingle();
      if (error) throw error;
      return data as TeacherResource | null;
    },
  });
}
