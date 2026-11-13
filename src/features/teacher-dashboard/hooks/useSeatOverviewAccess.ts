import { useAuth } from '@/components/auth/AuthProvider';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import { useTodayMeetings } from '@/hooks/useTodayMeetings';
import { isUserAssignee, type AssigneeData } from '@/lib/assigneeUtils';
import { getSeatOverviewTagReason } from '../utils/seatOverviewAccess';

export function useSeatOverviewAccess(currentResourceId: string | undefined) {
  const { isAdminUI, isTeacherView, profile, teacherPreviewTags } = useAuth();
  const resourceIds = currentResourceId && !isTeacherView ? [currentResourceId] : [];
  const { data: assignments, isLoading: loadingTags } = useResourceTagAssignments(resourceIds);
  const { data: todayMeetings = [], isLoading: loadingMeetings } = useTodayMeetings(
    isTeacherView ? null : currentResourceId ?? null,
  );

  const tagNames = currentResourceId
    ? (assignments?.get(currentResourceId) ?? []).map((tag) => tag.name)
    : [];
  const tagReason = getSeatOverviewTagReason(tagNames);
  const hasTodayDuty = Boolean(profile?.name) && todayMeetings.some((meeting) => {
    const meta = meeting.meta as { assignee?: AssigneeData } | null;
    return meeting.kind === 'duty'
      && isUserAssignee(meta?.assignee, profile?.name ?? '');
  });

  const reason = isTeacherView
    ? getSeatOverviewTagReason(teacherPreviewTags)
    : isAdminUI
      ? '관리자 역할'
      : tagReason ?? (hasTodayDuty ? '오늘 당직 담당' : null);

  return {
    canView: Boolean(reason),
    isLoading: isTeacherView ? false : loadingTags || loadingMeetings,
    reason,
  };
}
