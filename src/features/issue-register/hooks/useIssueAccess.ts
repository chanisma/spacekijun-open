import { useAuth } from '@/components/auth/AuthProvider';
import type { DocumentIssue } from '../types';
import { isClubFormData } from '../types';
import { useHomeroomTeachers } from './useHomeroomTeachers';

/**
 * 발급 문서 수정/삭제 권한 판정.
 * - canEdit: record 전체 수정·삭제 = 작성자 본인 또는 admin.
 * - canEditClass: 반별 명단 수정 = 작성자/admin 또는 그 반 담임(자기 반만).
 * - canEditClub: 동아리 활동 수정 = 작성자/admin 또는 그 동아리 담당교사(자기 동아리만).
 * 열람은 모든 교사/admin (RLS 보장). isAdmin = 데이터 권한 플래그(미리보기 무관).
 * 서버 RLS/RPC(update_volunteer_class_roster·update_club_activities)가 최종 권위 — 여기선 UI 노출만 판정.
 */
export function useIssueAccess() {
  const { user, profile, isAdmin } = useAuth();
  const { homeroomOf } = useHomeroomTeachers();

  const canEdit = (issue: DocumentIssue) =>
    isAdmin || (!!user && issue.created_by === user.id);

  // 그 반 담임인가 = 담임 매핑에서 (grade,cls)의 담임명이 내 이름과 같은가
  const isHomeroomOf = (grade: number, cls: number) =>
    !!profile?.name && homeroomOf(grade, cls) === profile.name;

  const canEditClass = (issue: DocumentIssue, grade: number, cls: number) =>
    canEdit(issue) || isHomeroomOf(grade, cls);

  // 그 동아리 담당교사인가 = 동아리의 담당교사명이 내 이름과 같은가
  const isClubAdvisor = (teacherName?: string | null) =>
    !!profile?.name && !!teacherName && teacherName === profile.name;

  // 그 동아리 담당교사인가 = 동아리의 담당교사명이 내 이름과 같은가 (서버가 resource_id로 최종 판정)
  const canEditClub = (issue: DocumentIssue, clubId: string) => {
    if (canEdit(issue)) return true;
    if (!isClubFormData(issue.form_data)) return false;
    const club = issue.form_data.clubs.find(c => c.club_id === clubId);
    return !!club && isClubAdvisor(club.teacher_name);
  };

  return { canEdit, canEditClass, canEditClub, isHomeroomOf, isClubAdvisor };
}
