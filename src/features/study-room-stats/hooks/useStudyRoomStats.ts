import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  fetchStudents,
  fetchStudyRooms,
  fetchSummary,
  fetchTemperature,
  fetchWeekday,
} from '../services/studyRoomStatsService';
import type { StatsFilters } from '../types';

const KEY = 'study-room-stats';
// 출석 체크는 하루 종일 일어나므로 오래 붙잡지 않는다. 탭을 오갈 때 다시 받지 않을 만큼만.
const STALE_MS = 60_000;

export function useStudyRoomSummary(f: StatsFilters, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'summary', f],
    queryFn: () => fetchSummary(f),
    enabled,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useStudyRoomStudents(f: StatsFilters, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'students', f],
    queryFn: () => fetchStudents(f),
    enabled,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useStudyRoomWeekday(f: StatsFilters, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'weekday', f],
    queryFn: () => fetchWeekday(f),
    enabled,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useStudyRoomTemperature(month: string | null, grade: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'temperature', month, grade],
    queryFn: () => fetchTemperature(month, grade),
    enabled,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useStudyRooms() {
  return useQuery({
    queryKey: [KEY, 'rooms'],
    queryFn: fetchStudyRooms,
    staleTime: 10 * 60_000,
  });
}
