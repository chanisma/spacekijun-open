import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  fetchLatestKgVersion,
  saveKgVersion,
  verifyKgVersionIntegrity,
  fetchKgVersionList,
  fetchKgVersionById,
  type SaveKgParams,
  type StudentKgVersion,
  type KgVersionIntegrity,
} from '@/services/studentKgService';

// =============================================
// Query Keys
// =============================================

export const kgQueryKeys = {
  all: ['student-kg'] as const,
  versions: (studentId: string) => [...kgQueryKeys.all, 'versions', studentId] as const,
  latest: (studentId: string) => [...kgQueryKeys.all, 'latest', studentId] as const,
  byId: (versionId: string) => [...kgQueryKeys.all, 'version', versionId] as const,
  integrity: (studentId: string) => [...kgQueryKeys.all, 'integrity', studentId] as const,
};

// =============================================
// Hooks
// =============================================

/**
 * 학생의 최신 KG 버전을 조회하는 hook.
 * Fetches the latest KG version for a student.
 *
 * Access control:
 * - Teachers/admins: can fetch any student's KG (server-side RLS enforced)
 * - Students: can only fetch their own KG (server-side RPC role check)
 * - Unauthenticated: query is disabled (won't fire)
 *
 * @param studentId - The student_basic_info.id value
 * @param options - Optional { enabled } to conditionally disable the query
 */
export function useLatestKgVersion(
  studentId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  const { session, profile } = useAuth();

  return useQuery({
    queryKey: kgQueryKeys.latest(studentId ?? ''),
    queryFn: () => fetchLatestKgVersion(studentId!),
    enabled:
      (options?.enabled ?? true) &&
      !!studentId &&
      !!session &&
      !!profile &&
      // Only teachers, admins, and students with matching ID can query
      (profile.role === 'teacher' ||
        profile.role === 'admin' ||
        profile.role === 'student'),
    staleTime: 30 * 1000, // 30s — KG data changes infrequently
    gcTime: 5 * 60 * 1000, // 5 min garbage collection
  });
}

/**
 * KG 버전을 저장하는 mutation hook.
 * Auto-increments version number (server-side atomic).
 *
 * Access control:
 * - Only teachers/admins can save (enforced by save_kg_version_secure RPC)
 * - Students will receive an error from the server if they attempt to call this
 *
 * On success, invalidates the student's latest KG query cache.
 */
export function useSaveKgVersion() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (params: SaveKgParams) => {
      // Client-side guard: only teachers/admins should attempt save
      if (!profile || !['teacher', 'admin'].includes(profile.role ?? '')) {
        return Promise.reject(
          new Error('KG 저장은 교사/관리자만 가능합니다.')
        );
      }
      return saveKgVersion(params);
    },
    onSuccess: (_data, variables) => {
      // Invalidate cached queries for this student so UI updates
      queryClient.invalidateQueries({
        queryKey: kgQueryKeys.latest(variables.studentId),
      });
      queryClient.invalidateQueries({
        queryKey: kgQueryKeys.versions(variables.studentId),
      });
    },
  });
}

/**
 * 학생의 모든 KG 버전 목록을 조회하는 hook (메타데이터만, kg_json 제외).
 * Fetches version list for future version selection UI.
 */
export function useKgVersionList(
  studentId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  const { session, profile } = useAuth();

  return useQuery({
    queryKey: kgQueryKeys.versions(studentId ?? ''),
    queryFn: () => fetchKgVersionList(studentId!),
    enabled:
      (options?.enabled ?? true) &&
      !!studentId &&
      !!session &&
      !!profile,
    staleTime: 30 * 1000,
  });
}

/**
 * 특정 KG 버전을 ID로 조회하는 hook.
 */
export function useKgVersionById(
  versionId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  const { session, profile } = useAuth();

  return useQuery({
    queryKey: kgQueryKeys.byId(versionId ?? ''),
    queryFn: () => fetchKgVersionById(versionId!),
    enabled:
      (options?.enabled ?? true) &&
      !!versionId &&
      !!session &&
      !!profile,
    staleTime: 60 * 1000,
  });
}

/**
 * KG 버전 무결성 검증 hook.
 * Only callable by teachers/admins (server-side enforced).
 */
export function useKgVersionIntegrity(
  studentId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  const { session, profile } = useAuth();

  return useQuery({
    queryKey: kgQueryKeys.integrity(studentId ?? ''),
    queryFn: () => verifyKgVersionIntegrity(studentId!),
    enabled:
      (options?.enabled ?? true) &&
      !!studentId &&
      !!session &&
      !!profile &&
      // Only teachers/admins can verify integrity
      ['teacher', 'admin'].includes(profile.role ?? ''),
    staleTime: 60 * 1000,
  });
}
