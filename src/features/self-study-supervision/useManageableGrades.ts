import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import { manageableGrades } from '@/lib/selfStudySupervision';

/**
 * 내가 자습 감독을 배정할 수 있는 학년 — 학년부장(`N학년 부장`)·담임(`N학년 N반`) 태그, 관리자는 전 학년.
 * 교사 시점 미리보기에서는 미리보기 태그를 쓴다(`isAdmin` 은 미리보기 중 false — CLAUDE.md «Role-based UI»).
 */
export function useManageableGrades(currentResourceId: string | null | undefined): number[] {
  const { isAdmin, isStudentView, isTeacherView, teacherPreviewTags } = useAuth();
  const ids = currentResourceId && !isTeacherView && !isStudentView ? [currentResourceId] : [];
  const { data: assignments } = useResourceTagAssignments(ids);
  const actual = currentResourceId ? (assignments?.get(currentResourceId) ?? []).map((t) => t.name) : [];
  const tags = isStudentView ? [] : isTeacherView ? teacherPreviewTags : actual;
  const key = tags.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (isStudentView ? [] : manageableGrades(tags, isAdmin)), [key, isAdmin, isStudentView]);
}
