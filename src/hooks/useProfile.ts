import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Re-export Profile type from domain types for backward compatibility
export type { Profile } from '@/types/domain';

export const useProfile = () => {
  const { profile, loading, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);

  const updateProfile = async (updates: Partial<any>) => {
    if (!profile) return false;

    setUpdating(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)
        .select()
        .single();

      if (error) {
        console.error('프로필 업데이트 오류:', error);
        toast({
          title: '오류',
          description: '프로필 업데이트에 실패했습니다.',
          variant: 'destructive',
        });
        return false;
      }

      // Refresh profile from AuthProvider to ensure consistency
      await refreshProfile();
      
      return true;
    } catch (error) {
      console.error('프로필 업데이트 오류:', error);
      return false;
    } finally {
      setUpdating(false);
    }
  };

  return {
    profile,
    loading,
    updating,
    updateProfile,
    refetch: refreshProfile,
  };
};