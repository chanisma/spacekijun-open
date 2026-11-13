import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import {
  readHomeroomStudentRows,
  readHomeroomStudentSignals,
} from '../services/homeroomStudentReadService';
import {
  buildHomeroomStudentOverview,
  getHomeroomScopes,
  getLocalMonthRange,
} from '../utils/homeroomStudentOverview';

export function useHomeroomStudentOverview(currentResourceId: string | undefined) {
  const { isTeacherView, teacherPreviewTags } = useAuth();
  const resourceIds = currentResourceId && !isTeacherView ? [currentResourceId] : [];
  const { data: assignments, isLoading: isLoadingTags } = useResourceTagAssignments(resourceIds);
  const actualTags = currentResourceId
    ? (assignments?.get(currentResourceId) ?? []).map((tag) => tag.name)
    : [];
  const visibleTags = isTeacherView ? teacherPreviewTags : actualTags;
  const scopes = useMemo(() => getHomeroomScopes(visibleTags), [visibleTags]);
  const monthRange = getLocalMonthRange();
  const scopeKey = scopes.map((scope) => `${scope.grade}-${scope.classNum}`).join(',');

  const coreQuery = useQuery({
    queryKey: ['teacher-dashboard', 'homeroom-students', scopeKey, monthRange.monthStart],
    queryFn: async () => {
      const result = await readHomeroomStudentRows({
        scopes,
        monthStart: monthRange.monthStart,
        nextMonth: monthRange.nextMonth,
      });
      return result;
    },
    enabled: scopes.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: scopes.length > 0 ? 60 * 1000 : false,
    refetchOnWindowFocus: true,
  });
  const studentCodeKey = (coreQuery.data?.students ?? [])
    .map((student) => student.studentCode)
    .join(',');
  const signalQuery = useQuery({
    queryKey: ['teacher-dashboard', 'homeroom-student-signals', scopeKey, studentCodeKey],
    queryFn: () => readHomeroomStudentSignals(coreQuery.data?.students ?? []),
    enabled: scopes.length > 0 && (coreQuery.data?.students.length ?? 0) > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: scopes.length > 0 ? 5 * 60 * 1000 : false,
    refetchOnWindowFocus: true,
  });
  const overview = useMemo(() => {
    if (!coreQuery.data) return undefined;
    return buildHomeroomStudentOverview({
      ...coreQuery.data,
      monthStart: monthRange.monthStart,
      today: monthRange.today,
      signals: signalQuery.data,
    });
  }, [coreQuery.data, monthRange.monthStart, monthRange.today, signalQuery.data]);

  return {
    ...coreQuery,
    data: overview,
    scopes,
    monthLabel: monthRange.monthLabel,
    isFetchingSignals: signalQuery.isFetching,
    isLoadingTags: isTeacherView ? false : isLoadingTags,
  };
}
