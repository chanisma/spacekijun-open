/**
 * Mutations for class swap operations
 * Uses TanStack Query for state management and optimistic updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { CreateClassSwapRequest, UpdateClassSwapStatus } from '@/types/classSwap';
import { NotificationService } from '@/services/notificationService';

/**
 * Create a new class swap request
 */
export function useCreateClassSwap() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: CreateClassSwapRequest) => {
      const { data, error } = await (supabase as any)
        .from('class_swap')
        .insert([request])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (insertedSwap, variables) => {
      // Send notification to approver
      if (insertedSwap) {
        try {
          await NotificationService.notifyClassSwapRequested(
            insertedSwap.id,
            variables.meta.requester_name || '',
            variables.meta.requester_section_name || '',
            variables.approver_resource_id,
            variables.meta.approver_section_name || '',
            variables.requester_swap_date,
            variables.requester_original_weekday,
            variables.requester_original_period,
            variables.approver_original_weekday,
            variables.approver_original_period
          );
        } catch (notificationError) {
          console.error('Failed to send notification:', notificationError);
          // Don't fail the mutation if notification fails
        }
      }

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['timetable-data'] });
      queryClient.invalidateQueries({ queryKey: ['class-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['swap-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-swap-count'] });

      toast({
        title: '교체 신청 완료',
        description: `${variables.meta.approver_name} 선생님에게 교체 요청을 보냈습니다.`
      });
    },
    onError: (error) => {
      console.error('교체 신청 오류:', error);
      toast({
        title: '신청 실패',
        description: '교체 신청 중 오류가 발생했습니다.',
        variant: 'destructive'
      });
    }
  });
}

/**
 * Update class swap status (approve/reject)
 */
export function useUpdateClassSwapStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      swapId,
      status,
      rejection_reason
    }: {
      swapId: string;
      status: UpdateClassSwapStatus['status'];
      rejection_reason?: string;
    }) => {
      const updateData: any = {
        status,
        responded_at: new Date().toISOString()
      };

      if (status === 'rejected' && rejection_reason) {
        // meta 는 **병합**한다. 종전엔 `{ rejection_reason }` 로 통째로 덮어써서 거절 한 번에
        // 대체 구분(type)·이름·결강 연결(absence_meeting_id)이 사라졌다 — 거절된 대체가
        // 교체로 보이고, 결강 처리 모달의 "거절됨, 다시 요청" 이 이름 없이 뜬다.
        const { data: current } = await supabase
          .from('class_swap')
          .select('meta')
          .eq('id', swapId)
          .maybeSingle();
        const prevMeta =
          current?.meta && typeof current.meta === 'object' && !Array.isArray(current.meta)
            ? current.meta
            : {};
        updateData.meta = { ...prevMeta, rejection_reason };
      }

      const { data, error } = await (supabase as any)
        .from('class_swap')
        .update(updateData)
        .eq('id', swapId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (updatedSwap, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['timetable-data'] });
      queryClient.invalidateQueries({ queryKey: ['class-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['swap-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-swap-count'] });

      const statusMessage = variables.status === 'approved'
        ? '교체 요청을 승인했습니다.'
        : '교체 요청을 거절했습니다.';

      toast({
        title: '처리 완료',
        description: statusMessage
      });
    },
    onError: (error, variables) => {
      console.error('상태 업데이트 오류:', error);
      toast({
        title: '처리 실패',
        description: '교체 요청 처리 중 오류가 발생했습니다.',
        variant: 'destructive'
      });
    }
  });
}

/**
 * Cancel a class swap request (requester only)
 */
export function useCancelClassSwap() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (swapId: string) => {
      const { data, error } = await (supabase as any)
        .from('class_swap')
        .update({ status: 'cancelled' })
        .eq('id', swapId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable-data'] });
      queryClient.invalidateQueries({ queryKey: ['class-swaps'] });
      queryClient.invalidateQueries({ queryKey: ['swap-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-swap-count'] });

      toast({
        title: '취소 완료',
        description: '교체 요청이 취소되었습니다.'
      });
    },
    onError: (error) => {
      console.error('취소 오류:', error);
      toast({
        title: '취소 실패',
        description: '교체 요청 취소 중 오류가 발생했습니다.',
        variant: 'destructive'
      });
    }
  });
}

/**
 * Invalidate all swap-related queries
 */
export function useInvalidateSwapQueries() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['timetable-data'] });
    queryClient.invalidateQueries({ queryKey: ['class-swaps'] });
    queryClient.invalidateQueries({ queryKey: ['swap-requests'] });
    queryClient.invalidateQueries({ queryKey: ['swap-candidates'] });
    queryClient.invalidateQueries({ queryKey: ['pending-swap-count'] });
  };
}
