import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationEvent } from '@/hooks/useNotifications';
import { getNotificationCardType, getNotificationIcon, formatTimeAgo } from './notificationUtils';
import { NotificationRow } from './NotificationRow';
import { SwapApprovalDialog } from '@/components/timetable/SwapApprovalDialog';
import { NotificationReplyDialog } from './NotificationReplyDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { ClassSwap } from '@/types/classSwap';
import { getNotificationDestination } from './notificationNavigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { isFacultyRole } from '@/lib/roles';
import { isReplyableNotification } from '@/lib/notificationReply';

interface NotificationItemProps {
  notification: NotificationEvent;
  onMarkAsRead: (notificationId: string) => void;
  onDelete?: (notificationId: string) => void;
  isLoading?: boolean;
  isDeleting?: boolean;
}

export const NotificationItem = ({ notification, onMarkAsRead, onDelete, isLoading, isDeleting }: NotificationItemProps) => {
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [swapData, setSwapData] = useState<ClassSwap | null>(null);
  const [loadingSwap, setLoadingSwap] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { effectiveRole } = useAuth();

  const isSwapRequest = notification.type === 'class_swap_requested';
  // 쿨메신저 쪽지·SPACEKIJUN 답장 — 답장은 SPACEKIJUN 안의 교직원에게 알림으로 간다(2026-09-22).
  // 보낸 사람 이름이 없는 알림(묶음 등)도 버튼을 단다: 받는 사람은 다이얼로그에서 고른다.
  // 서버 RPC 가 교직원만 받으므로 학생(쿨메신저 알림을 받는 학생 계정이 실제로 있다)에게는 감춘다.
  const canReply = isReplyableNotification(notification) && isFacultyRole(effectiveRole);
  const repliedTo = typeof notification.meta?.replied_to_name === 'string'
    ? notification.meta.replied_to_name : null;
  const quote = notification.type === 'direct_reply' && typeof notification.meta?.quote === 'string'
    ? notification.meta.quote : undefined;
  const destination = getNotificationDestination(notification);
  const isSubstitute = swapData?.meta.type === 'substitute';
  const cardType = getNotificationCardType(notification.type, notification.priority);

  const handleMarkAsRead = () => {
    onMarkAsRead(notification.id);
  };

  const handleDelete = () => {
    onDelete?.(notification.id);
  };

  const handleOpenApproval = async () => {
    if (!notification.meta?.swap_id) return;

    setLoadingSwap(true);
    try {
      const { data, error } = await supabase
        .from('class_swap' as any)
        .select('*')
        .eq('id', notification.meta.swap_id)
        .single();

      if (error) throw error;

      if (data) {
        setSwapData(data as any);
        setApprovalDialogOpen(true);
      }
    } catch (error) {
      console.error('교체 정보 조회 오류:', error);
      toast({
        title: '오류',
        description: '교체 정보를 불러올 수 없습니다.',
        variant: 'destructive'
      });
    } finally {
      setLoadingSwap(false);
    }
  };

  // Prepare badge for swap notifications
  const badge = isSwapRequest && swapData ? {
    label: isSubstitute ? '수업 대체' : '수업 교체',
    variant: (isSubstitute ? 'default' : 'outline') as 'default' | 'outline'
  } : repliedTo ? {
    // 서버가 답장 시 원래 알림에 남긴 흔적 — 같은 쪽지에 두 번 답하는 일을 줄인다
    label: `답장함 · ${repliedTo}`,
    variant: 'secondary' as const
  } : undefined;

  const handleOpenRelatedInfo = () => {
    if (!destination) return;
    if (!notification.is_read) handleMarkAsRead();
    navigate(destination.to, { state: destination.state });
  };

  // Prepare primary action for swap approval
  const primaryAction = isSwapRequest && notification.meta?.swap_id ? {
    label: '승인/거절',
    onClick: handleOpenApproval,
    loading: loadingSwap,
    variant: 'success' as const
  } : canReply ? {
    label: '답장',
    onClick: () => setReplyDialogOpen(true),
    variant: 'default' as const
  } : destination ? {
    label: destination.label,
    onClick: handleOpenRelatedInfo,
    variant: 'default' as const
  } : undefined;

  return (
    <>
      <NotificationRow
        tone={cardType}
        icon={getNotificationIcon(notification.type)}
        title={notification.title}
        message={notification.message}
        quote={quote}
        timeLabel={formatTimeAgo(notification.created_at)}
        timeTitle={new Date(notification.created_at).toLocaleString('ko-KR')}
        isRead={notification.is_read}
        onMarkAsRead={handleMarkAsRead}
        onDelete={onDelete ? handleDelete : undefined}
        primaryAction={primaryAction}
        badge={badge}
        isActionLoading={isLoading || isDeleting}
      />

      {/* 답장 — SPACEKIJUN 안의 교직원에게 알림으로 보낸다. 원래 알림의 읽음·'답장함'은 서버가 기록한다 */}
      {canReply && (
        <NotificationReplyDialog
          open={replyDialogOpen}
          onOpenChange={setReplyDialogOpen}
          notification={notification}
        />
      )}

      {/* Swap Approval Dialog */}
      {swapData && (
        <SwapApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={setApprovalDialogOpen}
          swap={swapData}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            handleMarkAsRead();
          }}
        />
      )}
    </>
  );
};
