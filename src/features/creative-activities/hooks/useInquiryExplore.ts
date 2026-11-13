// 탐구 탐색 훅. 전부 읽기 전용이라 캐시를 길게 잡는다 —
// `inquiry_*` 는 파이프라인이 배치로만 갱신하므로 화면이 도는 동안 바뀌지 않는다.
import { useQuery } from '@tanstack/react-query';
import {
  fetchActivity,
  fetchActivityNeighbors,
  fetchLeafThemes,
  fetchRecurringPrograms,
  fetchThemeActivities,
  fetchThemeGraph,
  fetchTopThemes,
  searchInquiryActivities,
} from '../services/inquiryExploreService';

const STALE = 30 * 60 * 1000;

export function useInquiryTopThemes() {
  return useQuery({ queryKey: ['inquiry', 'top-themes'], queryFn: fetchTopThemes, staleTime: STALE });
}

export function useInquiryLeafThemes(topId: string | null) {
  return useQuery({
    queryKey: ['inquiry', 'leaf-themes', topId],
    queryFn: () => fetchLeafThemes(topId!),
    enabled: !!topId,
    staleTime: STALE,
  });
}

export function useInquiryThemeActivities(themeId: string | null) {
  return useQuery({
    queryKey: ['inquiry', 'theme-activities', themeId],
    queryFn: () => fetchThemeActivities(themeId!),
    enabled: !!themeId,
    staleTime: STALE,
  });
}

export function useInquiryActivity(id: string | null) {
  return useQuery({
    queryKey: ['inquiry', 'activity', id],
    queryFn: () => fetchActivity(id!),
    enabled: !!id,
    staleTime: STALE,
  });
}

export function useInquiryNeighbors(id: string | null) {
  return useQuery({
    queryKey: ['inquiry', 'neighbors', id],
    queryFn: () => fetchActivityNeighbors(id!),
    enabled: !!id,
    staleTime: STALE,
  });
}

export function useRecurringPrograms(enabled: boolean) {
  return useQuery({
    queryKey: ['inquiry', 'programs'],
    queryFn: fetchRecurringPrograms,
    enabled,
    staleTime: STALE,
  });
}

/** 두 글자 미만이면 요청 자체를 보내지 않는다(서비스도 같은 규칙 — 둘 다 두는 편이 안전하다). */
export function useInquirySearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ['inquiry', 'search', q],
    queryFn: () => searchInquiryActivities(q),
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/** 주제군 그래프 — 목록보다 무거우므로 그래프 탭을 실제로 열 때만 받는다. */
export function useInquiryThemeGraph(themeId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['inquiry', 'theme-graph', themeId],
    queryFn: () => fetchThemeGraph(themeId!),
    enabled: !!themeId && enabled,
    staleTime: STALE,
  });
}
