import { useQuery } from '@tanstack/react-query';
import {
  fetchLatestKgVersion,
  type StudentKgVersion,
} from '@/services/studentKgService';

// ─── Query Keys ───
export const latestKgKeys = {
  all: ['kg-viewer', 'latest'] as const,
  byStudent: (studentId: string) => [...latestKgKeys.all, studentId] as const,
};

/**
 * 선택된 학생의 최신 KG 버전을 조회하는 훅.
 * Fetches the latest KG version for the selected student.
 *
 * - studentId가 null이면 쿼리 비활성화
 * - studentId 변경 시 자동으로 새 데이터 fetch
 *
 * @param studentId - student_basic_info.id (UUID) or null
 */
export function useLatestKg(studentId: string | null) {
  return useQuery<StudentKgVersion | null>({
    queryKey: latestKgKeys.byStudent(studentId!),
    queryFn: () => fetchLatestKgVersion(studentId!),
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000, // 2분 — KG는 자주 변하지 않음
    retry: 2,
  });
}
