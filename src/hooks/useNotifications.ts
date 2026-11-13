// ========================================
// Notifications Hook (Optimized)
// 알림을 가져오는 최적화된 hook with mutations
// ========================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { useToast } from '@/hooks/use-toast';
import { toast as notify } from '@/lib/toast';

export interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  related_meeting_id?: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  resource_id: string;
  sender_name?: string;
  meta?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high';
}

export function useNotifications() {
  const { resourceId } = useCurrentResourceId();

  return useQuery({
    queryKey: ['notifications', resourceId],
    queryFn: async (): Promise<NotificationEvent[]> => {
      if (!resourceId) return [];

      const { data: notifications, error } = await supabase
        .from('notification_events')
        .select('id, resource_id, type, title, message, is_read, created_at, updated_at, meta, priority, related_meeting_id')
        .eq('resource_id', resourceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching notifications:', error);
        throw error;
      }

      return (notifications as any) || [];
    },
    enabled: !!resourceId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    // 실시간 연결이 누락한 알림도 화면을 보는 동안에는 다시 확인한다.
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { resourceId } = useCurrentResourceId();

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!resourceId) {
        throw new Error('리소스 정보가 없습니다.');
      }

      const { error } = await supabase
        .from('notification_events')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('resource_id', resourceId);

      if (error) throw error;
      return notificationId;
    },
    onMutate: async (notificationId) => {
      // 낙관적 업데이트
      await queryClient.cancelQueries({ queryKey: ['notifications', resourceId] });

      const previousNotifications = queryClient.getQueryData(['notifications', resourceId]);

      queryClient.setQueryData(['notifications', resourceId], (old: NotificationEvent[] | undefined) => {
        if (!old) return [];
        return old.map(n => n.id === notificationId ? { ...n, is_read: true } : n);
      });

      return { previousNotifications };
    },
    onError: (error, notificationId, context) => {
      console.error('알림 읽음 처리 오류:', error);
      // 롤백
      queryClient.setQueryData(['notifications', resourceId], context?.previousNotifications);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', resourceId] });
    },
  });

  // 모두 읽음 — 서버에서 «내 앞으로 온 안 읽은 알림» 전부를 한 번에 바꾼다.
  // 화면에 보이는 id 목록을 보내지 않는 이유: 목록을 불러온 뒤 막 도착한 알림까지 함께 처리돼
  // 배지가 0 이 됐는데 목록에 안 읽은 줄이 남는 어긋남이 없다(갱신 후 다시 불러온다).
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!resourceId) {
        throw new Error('리소스 정보가 없습니다.');
      }

      const { error, count } = await supabase
        .from('notification_events')
        .update({ is_read: true }, { count: 'exact' })
        .eq('resource_id', resourceId)
        .eq('is_read', false);

      if (error) throw error;
      return count ?? 0;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', resourceId] });

      const previousNotifications = queryClient.getQueryData(['notifications', resourceId]);

      queryClient.setQueryData(['notifications', resourceId], (old: NotificationEvent[] | undefined) => {
        if (!old) return [];
        return old.map(n => n.is_read ? n : { ...n, is_read: true });
      });

      return { previousNotifications };
    },
    onSuccess: (count) => {
      if (count > 0) notify.success(`알림 ${count}건을 읽음으로 표시했습니다.`);
    },
    onError: (error, _vars, context) => {
      console.error('알림 모두 읽음 처리 오류:', error);
      queryClient.setQueryData(['notifications', resourceId], context?.previousNotifications);
      notify.error('알림을 읽음으로 표시하지 못했습니다.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', resourceId] });
    },
  });

  const createManualNotification = useMutation({
    mutationFn: async ({
      title,
      message,
      targetResourceIds
    }: {
      title: string;
      message: string;
      targetResourceIds: string[];
    }) => {
      if (targetResourceIds.length === 0) {
        throw new Error('알림을 받을 대상자가 없습니다.');
      }

      const { error } = await supabase.rpc('create_manual_notification', {
        p_target_resource_ids: targetResourceIds,
        p_title: title,
        p_message: message,
        p_related_meeting_id: null
      });

      if (error) throw error;
      return { targetCount: targetResourceIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: '성공',
        description: `${data.targetCount}명에게 알림이 발송되었습니다.`,
      });
    },
    onError: (error) => {
      console.error('알림 생성 오류:', error);
      toast({
        title: '오류',
        description: '알림 생성에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!resourceId) {
        throw new Error('리소스 정보가 없습니다.');
      }

      const { error } = await supabase
        .from('notification_events')
        .delete()
        .eq('id', notificationId)
        .eq('resource_id', resourceId);

      if (error) throw error;
      return notificationId;
    },
    onMutate: async (notificationId) => {
      // 낙관적 업데이트
      await queryClient.cancelQueries({ queryKey: ['notifications', resourceId] });

      const previousNotifications = queryClient.getQueryData(['notifications', resourceId]);

      queryClient.setQueryData(['notifications', resourceId], (old: NotificationEvent[] | undefined) => {
        if (!old) return [];
        return old.filter(n => n.id !== notificationId);
      });

      return { previousNotifications };
    },
    onError: (error, notificationId, context) => {
      console.error('알림 삭제 오류:', error);
      // 롤백
      queryClient.setQueryData(['notifications', resourceId], context?.previousNotifications);
      toast({
        title: '오류',
        description: '알림 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', resourceId] });
    },
  });

  return {
    markAsRead,
    markAllAsRead,
    createManualNotification,
    deleteNotification,
  };
}
