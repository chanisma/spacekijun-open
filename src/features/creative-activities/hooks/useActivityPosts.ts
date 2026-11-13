// ========================================
// 활동 글(성찰·기록) · 댓글 hooks
// ========================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  createActivityComment,
  createActivityPost,
  deleteActivityComment,
  deleteActivityPost,
  fetchActivityPosts,
  updateActivityPost,
} from '../services/activityPostService';
import type { ActivityPostInput, ActivityPostVisibility } from '../types';

export const postKeys = {
  all: ['creative-activity-posts'] as const,
  ofActivity: (activityId: string) => [...postKeys.all, activityId] as const,
};

export function useActivityPosts(activityId: string | null, enabled = true) {
  return useQuery({
    queryKey: postKeys.ofActivity(activityId ?? ''),
    queryFn: () => fetchActivityPosts(activityId!),
    enabled: !!activityId && enabled,
    staleTime: 30_000,
  });
}

export function useCreateActivityPost() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: ActivityPostInput) => createActivityPost(input),
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: postKeys.ofActivity(post.activity_id) });
      toast.success(post.kind === 'reflection' ? '성찰을 남겼습니다.' : '기록을 남겼습니다.');
    },
    onError: (error: Error) => {
      console.error('글 저장 실패:', error);
      // RLS가 막으면 PostgREST가 42501을 준다 — 사람이 읽을 말로 바꾼다.
      const message = /42501|row-level security/i.test(error.message)
        ? '이 활동에 글을 남길 권한이 없습니다. 참여자로 등록돼 있는지 확인해 주세요.'
        : error.message || '글 저장에 실패했습니다.';
      toast.error(message);
    },
  });
}

export function useUpdateActivityPost(activityId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      id: string;
      patch: { content?: string; title?: string | null; visibility?: ActivityPostVisibility };
    }) => updateActivityPost(payload.id, payload.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: postKeys.ofActivity(activityId) });
    },
    onError: (error: Error) => {
      console.error('글 수정 실패:', error);
      toast.error(error.message || '수정에 실패했습니다.');
    },
  });
}

export function useDeleteActivityPost(activityId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteActivityPost,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: postKeys.ofActivity(activityId) });
    },
    onError: (error: Error) => {
      console.error('글 삭제 실패:', error);
      toast.error(error.message || '삭제에 실패했습니다.');
    },
  });
}

export function useCreateActivityComment(activityId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: { postId: string; content: string; studentCode?: string | null }) =>
      createActivityComment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: postKeys.ofActivity(activityId) });
    },
    onError: (error: Error) => {
      console.error('댓글 저장 실패:', error);
      toast.error(error.message || '댓글 저장에 실패했습니다.');
    },
  });
}

export function useDeleteActivityComment(activityId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteActivityComment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: postKeys.ofActivity(activityId) });
    },
    onError: (error: Error) => {
      console.error('댓글 삭제 실패:', error);
      toast.error(error.message || '댓글 삭제에 실패했습니다.');
    },
  });
}
