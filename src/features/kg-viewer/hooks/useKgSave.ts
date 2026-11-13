import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveKgVersion,
  type SaveKgParams,
  type SaveKgResult,
} from '@/services/studentKgService';
import { toast } from '@/hooks/use-toast';
import { latestKgKeys } from './useLatestKg';
import { studentKgKeys } from './useStudentKnowledgeGraph';
import { kgIntegrityKeys } from './useKgVersionIntegrity';
import { kgChecksumKeys } from './useKgVersionChecksums';

// ─── Types ───

export interface UseKgSaveOptions {
  /** Called after successful save with the result metadata */
  onSuccess?: (result: SaveKgResult) => void;
  /** Called after a failed save attempt (in addition to the toast) */
  onError?: (error: Error) => void;
}

export interface UseKgSaveResult {
  /** Trigger a KG save. Automatically shows toast on failure. */
  saveKg: (params: SaveKgParams) => void;
  /** Trigger a KG save and return a promise (for await chaining) */
  saveKgAsync: (params: SaveKgParams) => Promise<SaveKgResult>;
  /** Whether a save is currently in progress */
  isSaving: boolean;
  /** The error from the most recent failed save, if any */
  error: Error | null;
  /** Whether the most recent save was successful */
  isSuccess: boolean;
  /** Reset the mutation state (clear error/success) */
  reset: () => void;
}

/**
 * KG 저장 뮤테이션 훅 — 저장 실패 시 토스트 알림을 표시합니다.
 * Mutation hook for saving Knowledge Graph versions to Supabase.
 *
 * Features:
 * - Auto-saves KG JSON upon generation completion (caller invokes saveKg)
 * - Displays a destructive toast notification on save failure
 * - Displays a success toast on successful save
 * - Automatically invalidates cached KG queries so viewers refresh
 * - No auto-retry (toast-only error handling per MVP spec)
 *
 * @param options - Optional success/error callbacks
 */
export function useKgSave(options: UseKgSaveOptions = {}): UseKgSaveResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<SaveKgResult, Error, SaveKgParams>({
    mutationFn: saveKgVersion,

    onSuccess: (result) => {
      // Show success toast
      toast({
        title: 'KG 저장 완료',
        description: `지식 그래프 v${result.version}이(가) 저장되었습니다.`,
      });

      // Invalidate related queries so viewers display fresh data
      queryClient.invalidateQueries({
        queryKey: latestKgKeys.byStudent(result.student_id),
      });
      queryClient.invalidateQueries({
        queryKey: studentKgKeys.byStudent(result.student_id),
      });
      // Also invalidate integrity and checksum caches so next check reflects the new version
      queryClient.invalidateQueries({
        queryKey: kgIntegrityKeys.byStudent(result.student_id),
      });
      queryClient.invalidateQueries({
        queryKey: kgChecksumKeys.byStudent(result.student_id),
      });

      // Notify caller
      options.onSuccess?.(result);
    },

    onError: (error: Error, variables) => {
      // Log full error for debugging
      console.error(
        '[useKgSave] KG 저장 실패:',
        { studentId: variables.studentId, error }
      );

      // Display toast notification to the teacher
      toast({
        title: 'KG 저장 실패',
        description: getKgSaveErrorMessage(error),
        variant: 'destructive',
      });

      // Notify caller
      options.onError?.(error);
    },

    // No automatic retry — per MVP spec, toast-only error handling
    retry: false,
  });

  return {
    saveKg: mutation.mutate,
    saveKgAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error ?? null,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}

// ─── Error message helper ───

/**
 * Maps common Supabase/KG save errors to user-friendly Korean messages.
 */
function getKgSaveErrorMessage(error: Error): string {
  const msg = error.message ?? '';

  // RLS / permission denied
  if (msg.includes('permission denied') || msg.includes('row-level security')) {
    return '저장 권한이 없습니다. 로그인 상태를 확인해주세요.';
  }

  // Auth / JWT issues
  if (msg.includes('JWT') || msg.includes('token') || msg.includes('auth')) {
    return '인증이 만료되었습니다. 다시 로그인해주세요.';
  }

  // Network errors
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
    return '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
  }

  // Unique constraint violation (version conflict that exhausted retries)
  if (msg.includes('23505') || msg.includes('unique') || msg.includes('duplicate')) {
    return '버전 충돌이 발생했습니다. 잠시 후 다시 시도해주세요.';
  }

  // Foreign key violation (invalid student_id)
  if (msg.includes('23503') || msg.includes('foreign key')) {
    return '학생 정보를 찾을 수 없습니다. 학생 ID를 확인해주세요.';
  }

  // Validation errors from our service
  if (msg.includes('필수') || msg.includes('포함해야')) {
    return msg;
  }

  // Generic fallback
  return `저장 중 오류가 발생했습니다: ${msg.slice(0, 100)}`;
}
