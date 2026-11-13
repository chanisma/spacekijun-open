import { useQuery } from '@tanstack/react-query';
import { fetchRescueRoster, fetchGradeRoster, fetchCrisisDashboard } from '../services/rescueRoster';

export function useRescueRoster(grade: number | null, classNum: number | null) {
  return useQuery({
    queryKey: ['rescue-note', 'roster', grade, classNum],
    queryFn: () => fetchRescueRoster(grade!, classNum!),
    enabled: grade !== null && classNum !== null,
    staleTime: 60_000,
  });
}

/**
 * 학년 전체 로스터. classNums(해당 학년의 반 번호 목록)를 받아 합산한다.
 * queryKey 에 정렬된 반 목록을 포함해 반 구성이 바뀌면 자동 갱신.
 */
export function useGradeRoster(grade: number | null, classNums: number[]) {
  const sortedClasses = [...classNums].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['rescue-note', 'grade-roster', grade, sortedClasses.join(',')],
    queryFn: () => fetchGradeRoster(grade!, sortedClasses),
    enabled: grade !== null && sortedClasses.length > 0,
    staleTime: 60_000,
  });
}

export function useCrisisDashboard() {
  return useQuery({
    queryKey: ['rescue-note', 'crisis-dashboard'],
    queryFn: fetchCrisisDashboard,
    staleTime: 60_000,
  });
}
