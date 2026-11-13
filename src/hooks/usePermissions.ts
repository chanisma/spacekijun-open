import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId as useUnifiedCurrentResourceId } from '@/services/hooks/useUnifiedAuth';

/**
 * 사용자의 현재 리소스 ID를 가져오는 hook
 *
 * @deprecated Use useCurrentResourceId from '@/services/hooks/useUnifiedAuth' directly
 * This hook is maintained for backward compatibility with existing components
 * that expect { data, isLoading } format instead of { resourceId, isLoading }
 */
export function useCurrentUserResourceId() {
  const { resourceId, isLoading, error } = useUnifiedCurrentResourceId();

  // Return in TanStack Query-like format for backward compatibility
  return {
    data: resourceId,
    isLoading,
    error,
    isError: !!error,
    isSuccess: !isLoading && !error && resourceId !== null,
  };
}

/**
 * 이벤트의 관리자 여부를 확인하는 공통 헬퍼
 * manager_id (레거시)와 meta.managers (신규) 모두 확인
 */
async function checkIsWorkManagerFromDB(
  eventId: string,
  currentUserResourceId: string
): Promise<boolean> {
  const { data: eventData, error } = await (supabase as any)
    .from('work' as any)
    .select('manager_id, meta')
    .eq('id', eventId)
    .single();

  if (error) {
    console.error('Error checking event manager:', error);
    return false;
  }

  // Check legacy manager_id field
  if ((eventData as any)?.manager_id === currentUserResourceId) return true;

  // Check meta.managers array
  if ((eventData as any)?.meta?.managers && Array.isArray((eventData as any).meta.managers)) {
    return (eventData as any).meta.managers.some((m: any) => m.id === currentUserResourceId);
  }

  return false;
}

// 태스크 삭제 권한 체크 hook
export function useCanDeleteTask(task: { id: string; event_id: string; created_by?: string }, options?: { enabled?: boolean }) {
  const { profile } = useAuth();
  const { data: currentUserResourceId } = useCurrentUserResourceId();

  return useQuery({
    queryKey: ['can-delete-task', task.id, currentUserResourceId],
    queryFn: async () => {
      if (!currentUserResourceId || !profile) return false;

      // Admin은 모든 권한
      if (profile.role === 'admin') return true;

      // 태스크 생성자는 삭제 가능
      if (task.created_by === currentUserResourceId) return true;

      // 이벤트 관리자는 해당 이벤트의 모든 태스크 삭제 가능 (manager_id + meta.managers 모두 확인)
      return checkIsWorkManagerFromDB(task.event_id, currentUserResourceId);
    },
    enabled: (options?.enabled ?? true) && !!currentUserResourceId && !!profile && !!task.id && !!task.event_id,
    staleTime: (query) => {
      // false 결과는 30초만 캐싱 — race condition으로 인한 잘못된 false를 빠르게 복구
      return query.state.data === false ? 30 * 1000 : 5 * 60 * 1000;
    },
    gcTime: 10 * 60 * 1000,
  });
}

// 이벤트 편집 권한 체크 hook
export function useCanEditWork(event: { id: string; manager_id?: string }, options?: { enabled?: boolean }) {
  const { profile } = useAuth();
  const { data: currentUserResourceId } = useCurrentUserResourceId();

  return useQuery({
    queryKey: ['can-edit-event', event.id, currentUserResourceId],
    queryFn: async () => {
      if (!currentUserResourceId || !profile) return false;

      // Admin은 모든 권한
      if (profile.role === 'admin') return true;

      // 이벤트 관리자 확인 (manager_id + meta.managers 모두 확인)
      return checkIsWorkManagerFromDB(event.id, currentUserResourceId);
    },
    enabled: (options?.enabled ?? true) && !!currentUserResourceId && !!profile && !!event.id,
    staleTime: (query) => {
      return query.state.data === false ? 30 * 1000 : 5 * 60 * 1000;
    },
    gcTime: 10 * 60 * 1000,
  });
}

// 이벤트 삭제 권한 체크 hook
export function useCanDeleteWork(event: { id: string; manager_id?: string }, options?: { enabled?: boolean }) {
  const { profile } = useAuth();
  const { data: currentUserResourceId } = useCurrentUserResourceId();

  return useQuery({
    queryKey: ['can-delete-event', event.id, currentUserResourceId],
    queryFn: async () => {
      if (!currentUserResourceId || !profile) return false;

      // Admin은 모든 권한
      if (profile.role === 'admin') return true;

      // 이벤트 관리자 확인 (manager_id + meta.managers 모두 확인)
      return checkIsWorkManagerFromDB(event.id, currentUserResourceId);
    },
    enabled: (options?.enabled ?? true) && !!currentUserResourceId && !!profile && !!event.id,
    staleTime: (query) => {
      return query.state.data === false ? 30 * 1000 : 5 * 60 * 1000;
    },
    gcTime: 10 * 60 * 1000,
  });
}

// 업무 편집 권한 체크 hook
export function useCanEditTask(task: { id: string; event_id: string; created_by?: string }, options?: { enabled?: boolean }) {
  const { profile } = useAuth();
  const { data: currentUserResourceId } = useCurrentUserResourceId();

  return useQuery({
    queryKey: ['can-edit-task', task.id, currentUserResourceId],
    queryFn: async () => {
      if (!currentUserResourceId || !profile) return false;

      // Admin은 모든 권한
      if (profile.role === 'admin') return true;

      // 업무 생성자는 편집 가능
      if (task.created_by === currentUserResourceId) return true;

      // 이벤트 관리자는 해당 이벤트의 모든 업무 편집 가능 (manager_id + meta.managers 모두 확인)
      return checkIsWorkManagerFromDB(task.event_id, currentUserResourceId);
    },
    enabled: (options?.enabled ?? true) && !!currentUserResourceId && !!profile && !!task.id && !!task.event_id,
    staleTime: (query) => {
      return query.state.data === false ? 30 * 1000 : 5 * 60 * 1000;
    },
    gcTime: 10 * 60 * 1000,
  });
}
