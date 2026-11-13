import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedAuth } from '@/services/hooks/useUnifiedAuth';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import { parseTeacherTag, type ManagedClass } from '../utils/parseTeacherTag';

export interface ClassManagementAccess {
  /** 학급 관리 탭을 볼 수 있는가 (담임/학년부장/부장/admin) */
  canManage: boolean;
  /** 학년 없는 부장(교무부장 등) 또는 admin — 전체 반 관리 */
  isHeadTeacher: boolean;
  /** 담임으로 매칭된 반 목록 (부장/admin이면 빈 배열일 수 있고 allClasses로 동작) */
  managedClasses: ManagedClass[];
  /** 학년 부장으로 매칭된 학년 목록 — 그 학년 전체 반 관리 */
  managedGrades: number[];
  /** 모든 반 관리 가능 여부 (학년 없는 부장/admin) */
  allClasses: boolean;
  /** 로딩 상태 — 로딩 중에는 fail-closed */
  isLoading: boolean;
  /** 특정 학년/반을 관리할 수 있는지 */
  canManageClass: (grade: number, classNum: number) => boolean;
}

export function useClassManagementAccess(): ClassManagementAccess {
  const { isAdmin } = useAuth();
  const { user } = useUnifiedAuth();
  const resourceId = user?.primaryResource?.id ?? null;
  const resourceIds = useMemo(() => (resourceId ? [resourceId] : []), [resourceId]);

  const { data: tagAssignments, isLoading: isTagsLoading } =
    useResourceTagAssignments(resourceIds);

  return useMemo<ClassManagementAccess>(() => {
    const isLoading = !!resourceId && isTagsLoading;

    // admin은 전체 반
    if (isAdmin) {
      return {
        canManage: true,
        isHeadTeacher: true,
        managedClasses: [],
        managedGrades: [],
        allClasses: true,
        isLoading: false,
        canManageClass: () => true,
      };
    }

    if (isLoading || !resourceId) {
      return {
        canManage: false,
        isHeadTeacher: false,
        managedClasses: [],
        managedGrades: [],
        allClasses: false,
        isLoading,
        canManageClass: () => false,
      };
    }

    const tags = tagAssignments?.get(resourceId) ?? [];
    const parsed = tags.map((t) => parseTeacherTag(t.name));

    const isHead = parsed.some((p) => p.isFullAccess);
    const managed: ManagedClass[] = [];
    const seen = new Set<string>();
    // 학년 부장: grade 만 있고 classNum 이 null → 그 학년 전체 반 관리
    const gradeSet = new Set<number>();
    for (const p of parsed) {
      if (p.isFullAccess) continue;
      if (p.grade != null && p.classNum != null) {
        const key = `${p.grade}-${p.classNum}`;
        if (!seen.has(key)) {
          seen.add(key);
          managed.push({ grade: p.grade, classNum: p.classNum });
        }
      } else if (p.grade != null && p.classNum == null) {
        gradeSet.add(p.grade);
      }
    }
    const managedGrades = Array.from(gradeSet).sort((a, b) => a - b);

    const allClasses = isHead;
    const canManage = isHead || managed.length > 0 || managedGrades.length > 0;

    return {
      canManage,
      isHeadTeacher: isHead,
      managedClasses: managed,
      managedGrades,
      allClasses,
      isLoading: false,
      canManageClass: (grade: number, classNum: number) =>
        allClasses ||
        gradeSet.has(grade) ||
        managed.some((m) => m.grade === grade && m.classNum === classNum),
    };
  }, [isAdmin, resourceId, isTagsLoading, tagAssignments]);
}
