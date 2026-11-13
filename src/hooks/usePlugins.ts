import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import { Plugin, PluginInstance, PollVote } from '@/types/plugin';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/hooks/use-toast';

// 활성화된 플러그인 목록 가져오기
export const usePlugins = () => {
  return useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plugins')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as Plugin[];
    },
  });
};

// 특정 엔티티의 플러그인 인스턴스 가져오기
export const usePluginInstances = (entityType: string, entityId: string) => {
  return useQuery({
    queryKey: ['plugin-instances', entityType, entityId],
    queryFn: async () => {
      // 플러그인 인스턴스 조회
      const { data: instances, error: instancesError } = await supabase
        .from('plugin_instances')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);

      if (instancesError) throw instancesError;
      if (!instances || instances.length === 0) return [];

      // 각 인스턴스에 대한 플러그인 정보 조회
      const pluginIds = instances.map(i => i.plugin_id);
      const { data: plugins, error: pluginsError } = await supabase
        .from('plugins')
        .select('*')
        .in('id', pluginIds);

      if (pluginsError) throw pluginsError;

      // 인스턴스와 플러그인 정보 결합
      const result = instances.map(instance => ({
        ...instance,
        plugin: plugins?.find(p => p.id === instance.plugin_id) || null
      }));

      return result as (PluginInstance & { plugin: Plugin })[];
    },
    enabled: !!entityId && !!entityType,
  });
};

// 플러그인 인스턴스 생성
export const useCreatePluginInstance = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      pluginId,
      entityType,
      entityId,
      data,
      settings,
    }: {
      pluginId: string;
      entityType: 'meeting' | 'task' | 'note';
      entityId: string;
      data?: any;
      settings?: any;
    }) => {
      const { data: instance, error } = await supabase
        .from('plugin_instances')
        .insert({
          plugin_id: pluginId,
          entity_type: entityType,
          entity_id: entityId,
          data: data || {},
          settings: settings || {},
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return instance;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['plugin-instances', data.entity_type, data.entity_id]
      });
    },
    onError: (error: any) => {
      toast({
        title: '플러그인 추가 실패',
        description: error.message || '플러그인 추가 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
};

// 플러그인 인스턴스 업데이트
export const useUpdatePluginInstance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      instanceId,
      data,
      settings,
    }: {
      instanceId: string;
      data?: any;
      settings?: any;
    }) => {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (data !== undefined) updateData.data = data;
      if (settings !== undefined) updateData.settings = settings;

      const { data: instance, error } = await supabase
        .from('plugin_instances')
        .update(updateData)
        .eq('id', instanceId)
        .select()
        .single();

      if (error) throw error;
      return instance;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['plugin-instances', data.entity_type, data.entity_id]
      });
    },
    onError: (error: any) => {
      toast({
        title: '플러그인 업데이트 실패',
        description: error.message || '플러그인 업데이트 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
};

// 플러그인 인스턴스 삭제
export const useDeletePluginInstance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from('plugin_instances')
        .delete()
        .eq('id', instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-instances'] });
    },
    onError: (error: any) => {
      toast({
        title: '플러그인 삭제 실패',
        description: error.message || '플러그인 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
};

// 투표 관련 훅들
export const usePollVotes = (instanceId: string) => {
  return useQuery({
    queryKey: ['poll-votes', instanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('poll_votes')
        .select('*')
        .eq('instance_id', instanceId);

      if (error) throw error;
      return data as PollVote[];
    },
    enabled: !!instanceId,
  });
};

export const useVote = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      instanceId,
      optionId,
    }: {
      instanceId: string;
      optionId: string;
    }) => {
      requireUser(user);

      // 기존 투표 확인
      const { data: existingVote } = await supabase
        .from('poll_votes')
        .select('*')
        .eq('instance_id', instanceId)
        .eq('user_id', user.id)
        .single();

      if (existingVote) {
        // 투표 업데이트
        const { error } = await supabase
          .from('poll_votes')
          .update({ option_id: optionId })
          .eq('id', existingVote.id);

        if (error) throw error;
      } else {
        // 새 투표 생성
        const { error } = await supabase
          .from('poll_votes')
          .insert({
            instance_id: instanceId,
            option_id: optionId,
            user_id: user.id,
          });

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['poll-votes', variables.instanceId]
      });
    },
    onError: (error: any) => {
      toast({
        title: '투표 실패',
        description: error.message || '투표 처리 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });
};