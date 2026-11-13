import { useQuery } from '@tanstack/react-query';
import {
  verifyKgVersionIntegrity,
  type KgVersionIntegrity,
} from '@/services/studentKgService';

// ─── Query Keys ───
export const kgIntegrityKeys = {
  all: ['kg-viewer', 'integrity'] as const,
  byStudent: (studentId: string) =>
    [...kgIntegrityKeys.all, studentId] as const,
};

/**
 * 학생의 KG 버전 무결성을 검증하는 훅.
 * Verifies that all KG versions for a student are intact:
 * - Contiguous version numbering (1..N with no gaps)
 * - No prior versions deleted or renumbered
 *
 * Only works for teacher/admin roles (enforced server-side).
 *
 * @param studentId - student_basic_info.id (UUID) or null
 * @param enabled - Whether to run the check (default: false to avoid unnecessary queries)
 */
export function useKgVersionIntegrity(
  studentId: string | null,
  enabled = false
) {
  return useQuery<KgVersionIntegrity | null>({
    queryKey: kgIntegrityKeys.byStudent(studentId!),
    queryFn: () => verifyKgVersionIntegrity(studentId!),
    enabled: !!studentId && enabled,
    staleTime: 5 * 60 * 1000, // 5분 — integrity checks are not frequent
    retry: 1,
  });
}
