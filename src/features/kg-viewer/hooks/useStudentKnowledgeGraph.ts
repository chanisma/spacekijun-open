import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchLatestKgVersion,
  type StudentKgVersion,
  type KgJson,
} from '@/services/studentKgService';
import { latestKgKeys } from './useLatestKg';

// ─── Query Keys ───
export const studentKgKeys = {
  all: ['student-knowledge-graph'] as const,
  byStudent: (studentId: string) =>
    [...studentKgKeys.all, studentId] as const,
};

// ─── Return type ───
export interface UseStudentKnowledgeGraphResult {
  /** The full KG JSON (entities + relations + metadata), or null if no KG exists */
  kgData: KgJson | null;
  /** Version metadata (id, version number, created_at, etc.), or null */
  versionInfo: Omit<StudentKgVersion, 'kg_json'> | null;
  /** Whether the query is currently fetching */
  isLoading: boolean;
  /** Whether an initial load is in progress (no cached data yet) */
  isFetching: boolean;
  /** Error object if the query failed */
  error: Error | null;
  /** Whether any KG data exists for this student */
  hasData: boolean;
  /** Manually refetch the latest KG version */
  refetch: () => void;
  /** Invalidate the cached KG so the next render triggers a fresh fetch */
  invalidate: () => void;
}

/**
 * 학생의 최신 지식 그래프(KG)를 조회하는 통합 훅.
 * Unified hook that retrieves the latest Knowledge Graph for a student
 * and provides structured data, loading/error states, and cache controls
 * for use by the Cytoscape.js visualization component.
 *
 * - studentId가 null이면 쿼리 비활성화 (선택 전 상태)
 * - 자동으로 2분 staleTime 캐시 적용
 * - 실패 시 최대 2회 재시도
 *
 * @param studentId - student_basic_info.id (UUID) or null
 */
export function useStudentKnowledgeGraph(
  studentId: string | null
): UseStudentKnowledgeGraphResult {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch: queryRefetch,
  } = useQuery<StudentKgVersion | null, Error>({
    queryKey: studentKgKeys.byStudent(studentId!),
    queryFn: () => fetchLatestKgVersion(studentId!),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000, // 2분 — KG는 자주 변하지 않음
    retry: 2,
  });

  // Separate KG data from version metadata for ergonomic consumption
  const kgData = data?.kg_json ?? null;
  const versionInfo = data
    ? {
        id: data.id,
        student_id: data.student_id,
        version: data.version,
        source_categories: data.source_categories,
        created_by: data.created_by,
        created_at: data.created_at,
      }
    : null;

  const refetch = () => {
    queryRefetch();
  };

  const invalidate = () => {
    // Invalidate both this hook's cache and the related useLatestKg cache
    queryClient.invalidateQueries({
      queryKey: studentKgKeys.byStudent(studentId!),
    });
    if (studentId) {
      queryClient.invalidateQueries({
        queryKey: latestKgKeys.byStudent(studentId),
      });
    }
  };

  return {
    kgData,
    versionInfo,
    isLoading,
    isFetching,
    error: error ?? null,
    hasData: !!data,
    refetch,
    invalidate,
  };
}
