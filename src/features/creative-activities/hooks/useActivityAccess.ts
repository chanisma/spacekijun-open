// ========================================
// 창체 권한 판정 — 서버 함수의 거울
//
// 정본은 서버다:
//   is_activity_manager()      = 창체담당자 태그 ∨ admin
//   can_manage_activity(id)    = 담당교사 ∨ 생성자 ∨ 창체담당자 ∨ admin
//   can_manage_activity_host() = 담당교사 ∨ 생성자 ∨ 창체담당자 ∨ admin
//
// 여기는 **버튼을 보일지 말지**만 정한다. 한쪽만 바꾸면 화면은 열려 있는데
// RLS가 0행이거나(저장한 줄 알았는데 안 됨) 반대로 버튼이 없는데 API는
// 열린 상태가 된다 — staff 권한 개편 때의 교훈.
// ========================================

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import type { ActivityWithContext } from '../types';

const ACTIVITY_MANAGER_TAG = '창체담당자';

export interface ActivityAccess {
  /** 창체담당자 ∨ admin — 전체 활동 열람·기록 */
  isManager: boolean;
  /** 활동을 만들 수 있는가. **학생도 만들 수 있다**(동아리 활동만 — clubOnly 참조) */
  canCreate: boolean;
  /**
   * 만들 수 있는 범위가 동아리로 한정되는가(= 학생).
   * 서버도 같은 제약을 강제한다 — `activity_insert` 정책의 `area = 'club'`.
   */
  clubOnly: boolean;
  /** 활동 검토·제안 검토를 할 수 있는가(교사·admin) */
  canReview: boolean;
  /** 로그인한 사용자의 교사 리소스 id */
  myResourceId: string | null;
  /** 로그인한 사용자의 profiles.id — 내가 쓴 글 판정용 */
  myProfileId: string | null;
  /** 학생이면 학생코드, 아니면 null */
  myStudentCode: string | null;
  isStudent: boolean;
  isLoading: boolean;
  /** 이 활동을 수정·참여자 기록할 수 있는가 (can_manage_activity의 거울) */
  canManage: (activity: Pick<ActivityWithContext, 'created_by' | 'teachers'>) => boolean;
}

export function useActivityAccess(): ActivityAccess {
  const { user, profile, isAdmin, isStudentView, effectiveRole, viewAsStudentId } = useAuth();
  const { resourceId, isLoading: resourceLoading } = useCurrentResourceId();

  const tagsQuery = useQuery({
    queryKey: ['creative-activities', 'my-tags', resourceId],
    enabled: !!resourceId && !isAdmin, // admin은 태그를 볼 필요가 없다
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data: assigns, error: aErr } = await supabase
        .from('resource_tag_assignments')
        .select('tag_id')
        .eq('resource_id', resourceId!);
      if (aErr) throw aErr;

      const tagIds = [...new Set((assigns ?? []).map((a) => a.tag_id))];
      if (tagIds.length === 0) return [];

      const { data: tags, error: tErr } = await supabase
        .from('resource_tags')
        .select('name')
        .in('id', tagIds);
      if (tErr) throw tErr;
      return (tags ?? []).map((t) => t.name);
    },
  });

  const isManager = isAdmin || (tagsQuery.data ?? []).includes(ACTIVITY_MANAGER_TAG);

  // 미리보기(admin이 학생 시점으로 보기)까지 반영해야 화면이 정직해진다.
  const isStudent = isStudentView;
  const myStudentCode = isStudent
    ? viewAsStudentId || user?.email?.split('@')[0] || null
    : null;

  // 학생도 활동을 기록할 수 있다(2026-08-28 사용자 결정) — 단 동아리 활동만.
  // 서버가 같은 제약을 강제하므로 화면이 뚫려도 저장은 막힌다(이중 방어).
  const isTeacherLike = effectiveRole === 'teacher' || effectiveRole === 'admin';
  const canCreate = isTeacherLike || isStudent;
  const clubOnly = isStudent;

  const canManage = useMemo(
    () =>
      (activity: Pick<ActivityWithContext, 'created_by' | 'teachers'>) => {
        if (isManager) return true;
        if (!user) return false;
        if (activity.created_by === user.id) return true;
        if (!resourceId) return false;
        return (activity.teachers ?? []).some((t) => t.resource_id === resourceId);
      },
    [isManager, user, resourceId]
  );

  return {
    isManager,
    canCreate,
    clubOnly,
    canReview: isTeacherLike,
    myResourceId: resourceId ?? null,
    myProfileId: user?.id ?? null,
    myStudentCode,
    isStudent,
    isLoading: resourceLoading || (tagsQuery.isLoading && !isAdmin) || !profile,
    canManage,
  };
}
