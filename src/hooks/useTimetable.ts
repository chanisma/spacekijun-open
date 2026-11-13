import { useState, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { ResourceId } from '@/services/unifiedAuth';
import {
  useTimetableData,
  useTimetableMutations,
  WEEKDAYS,
  PERIODS
} from './useTimetableData';
import type { TimetableEntry } from './useTimetableData';

// Re-export for compatibility
export { TimetableEntry };

export const useTimetable = (targetResourceId?: ResourceId, currentDate?: Date) => {
  const { resourceId: currentResourceId, isLoading: isCurrentResourceLoading } = useCurrentResourceId();
  const { toast } = useToast();

  // 선택된 리소스 상태 관리
  const [selectedResource, setSelectedResource] = useState<ResourceId | ''>(
    targetResourceId || currentResourceId || ''
  );

  // 사용자가 수동으로 교사를 선택했는지 추적
  const [isManualSelection, setIsManualSelection] = useState(false);

  // TanStack Query 훅 사용 - 시간표 데이터만 로드
  const { data: timetableEntries = [], isLoading: dataLoading, error: dataError, refetch } = useTimetableData(selectedResource || undefined, currentDate);
  const { invalidateTimetableQueries } = useTimetableMutations();

  // currentResourceId 변경 감지 - 프로필 변경 시 selectedResource 업데이트
  useEffect(() => {
    // 수동 선택이 아니고, targetResourceId가 없고, currentResourceId가 변경되면 자동 업데이트
    if (!isManualSelection && !targetResourceId && currentResourceId && selectedResource !== currentResourceId) {
      console.log('[useTimetable] currentResourceId 변경 감지:', selectedResource, '→', currentResourceId);
      setSelectedResource(currentResourceId);
    }
  }, [currentResourceId, targetResourceId, selectedResource, isManualSelection]);

  // 현재 사용자의 리소스를 자동 선택 (targetResourceId가 없을 경우에만)
  useMemo(() => {
    if (!selectedResource && !targetResourceId && currentResourceId) {
      setSelectedResource(currentResourceId);
    }
  }, [selectedResource, targetResourceId, currentResourceId]);

  // 오류 처리
  useMemo(() => {
    if (dataError) {
      console.error('시간표 조회 오류:', dataError);
      toast({
        title: '오류',
        description: '시간표를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  }, [dataError, toast]);

  // 로딩 상태 결합
  const loading = isCurrentResourceLoading || dataLoading;

  // setSelectedResource를 래핑하여 수동 선택 추적
  const handleSetSelectedResource = (resource: ResourceId | '') => {
    console.log('[useTimetable] 수동 선택:', resource);
    setIsManualSelection(true);
    setSelectedResource(resource);
  };

  return useMemo(() => ({
    timetable: timetableEntries,
    loading,
    weekdays: WEEKDAYS,
    periods: PERIODS,
    selectedResource,
    setSelectedResource: handleSetSelectedResource,
    refetch: () => {
      refetch();
      invalidateTimetableQueries();
    }
  }), [timetableEntries, loading, selectedResource, refetch, invalidateTimetableQueries]);
};