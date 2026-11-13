import { useQuery } from '@tanstack/react-query';
import {
  fetchKgVersionChecksums,
  type KgVersionChecksum,
} from '@/services/studentKgService';

// ─── Query Keys ───
export const kgChecksumKeys = {
  all: ['kg-viewer', 'checksums'] as const,
  byStudent: (studentId: string) =>
    [...kgChecksumKeys.all, studentId] as const,
};

/**
 * 학생의 모든 KG 버전 체크섬을 조회하는 훅.
 * Fetches MD5 checksums for all KG versions of a student.
 *
 * Primary use case: snapshot checksums before a save, then compare after
 * to verify that no prior version was mutated.
 *
 * Disabled by default (enabled parameter) since this is typically used
 * on-demand for integrity verification, not on every render.
 *
 * @param studentId - student_basic_info.id or null
 * @param enabled - Whether to run the query (default: false)
 */
export function useKgVersionChecksums(
  studentId: string | null,
  enabled = false
) {
  return useQuery<KgVersionChecksum[]>({
    queryKey: kgChecksumKeys.byStudent(studentId!),
    queryFn: () => fetchKgVersionChecksums(studentId!),
    enabled: !!studentId && enabled,
    staleTime: 0, // Always fresh — checksums are used for point-in-time comparison
    retry: 1,
  });
}
