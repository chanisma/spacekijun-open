// ========================================
// 부서 공지사항 TanStack Query hooks
// department_notice 테이블 CRUD
// ========================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import { toast } from '@/lib/toast';
import type { DepartmentNotice, NoticeInput } from '../types';

export const noticeKeys = {
  all: ['department-notices'] as const,
  list: () => [...noticeKeys.all, 'list'] as const,
};

/**
 * 전체 공지 목록 (최신순).
 * 학교 규모상 전체 페치 후 클라이언트에서 활성/부서 필터링.
 * (활성 판정은 로컬 날짜 기준이라 서버 필터보다 클라이언트 판정이 정확)
 */
export function useDepartmentNotices() {
  return useQuery({
    queryKey: noticeKeys.list(),
    queryFn: async (): Promise<DepartmentNotice[]> => {
      const { data, error } = await supabase
        .from('department_notice')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as DepartmentNotice[];
    },
    staleTime: 1000 * 60, // 1분
  });
}

export function useCreateNotice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ input, authorName }: { input: NoticeInput; authorName: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      requireUser(user);

      const { data, error } = await supabase
        .from('department_notice')
        .insert({
          ...input,
          created_by: user.id,
          author_name: authorName,
        })
        .select()
        .single();

      if (error) throw error;
      return data as DepartmentNotice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noticeKeys.all });
    },
    onError: (error) => {
      console.error('공지 등록 실패:', error);
      toast.error('공지사항 등록에 실패했습니다.');
    },
  });
}

export function useUpdateNotice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: NoticeInput }) => {
      const { data, error } = await supabase
        .from('department_notice')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as DepartmentNotice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noticeKeys.all });
    },
    onError: (error) => {
      console.error('공지 수정 실패:', error);
      toast.error('공지사항 수정에 실패했습니다.');
    },
  });
}

export function useDeleteNotice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('department_notice')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noticeKeys.all });
    },
    onError: (error) => {
      console.error('공지 삭제 실패:', error);
      toast.error('공지사항 삭제에 실패했습니다.');
    },
  });
}
