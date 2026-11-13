import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchWishlist,
  searchPrograms,
  searchMajors,
  fetchClassWishlist,
  addWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  saveWishlistPlans,
  setWishlistTier,
  reorderWishlist,
  fetchAdmissionChanges,
  fetchAdmissionSchedules,
  fetchAdmissionUnivInfo,
  fetchCsatRules,
} from '../services/wishlist';
import type { AdmissionTrack, NewWishlistInput, MajorSearchOptions, WishlistTier } from '../types';

const KEY = 'admission-wishlist';

/** 학생의 지원 목록 + 참고데이터 */
export function useWishlist(studentCode: string | null) {
  return useQuery({
    queryKey: [KEY, 'list', studentCode],
    queryFn: () => fetchWishlist(studentCode!),
    enabled: !!studentCode,
    staleTime: 30_000,
  });
}

/** 입력 화면 검색 (track + query) — 전형 단위 (gyogwa 모집단위 / jonghap 대학) */
export function useProgramSearch(track: AdmissionTrack, query: string) {
  return useQuery({
    queryKey: [KEY, 'search', track, query.trim()],
    queryFn: () => searchPrograms(track, query),
    enabled: query.trim().length >= 1,
    staleTime: 60_000,
  });
}

/** 학과 검색 1페이지 크기 (RPC p_limit) */
export const MAJOR_SEARCH_PAGE = 40;

/**
 * 입력 화면 학과 검색 (track + query) — adiga 학과 단위 (major 선택).
 * 무한 스크롤: 한 번에 MAJOR_SEARCH_PAGE 개씩, 스크롤 시 다음 offset 페이지를 로드.
 * (이전엔 단일 LIMIT 40 으로 잘려 "간호" 같은 검색이 311개 중 40개만 보였다.)
 */
export function useMajorSearch(
  track: AdmissionTrack,
  query: string,
  options?: MajorSearchOptions
) {
  const q = query.trim();
  const regions = options?.regions ?? [];
  const cutMin = options?.cutMin ?? null;
  const cutMax = options?.cutMax ?? null;
  const recruitMin = options?.recruitMin ?? null;
  const sort = options?.sort ?? 'grade70';
  const hasFilter = regions.length > 0 || cutMin != null || cutMax != null || recruitMin != null;
  return useInfiniteQuery({
    // 정렬·필터를 쿼리키에 포함 → 변경 시 자동 refetch. regions는 정렬해 키 안정화.
    queryKey: [KEY, 'search-majors', track, q, [...regions].sort().join(','), cutMin, cutMax, recruitMin, sort],
    queryFn: ({ pageParam }) =>
      searchMajors(track, q, MAJOR_SEARCH_PAGE, pageParam, { regions, cutMin, cutMax, recruitMin, sort }),
    initialPageParam: 0,
    // 마지막 페이지가 가득 찼으면(=더 있을 수 있음) 다음 offset, 아니면 끝
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < MAJOR_SEARCH_PAGE ? undefined : allPages.length * MAJOR_SEARCH_PAGE,
    // 검색어가 1자 이상이거나, 필터가 하나라도 설정돼 있으면 조회
    enabled: q.length >= 1 || hasFilter,
    staleTime: 60_000,
  });
}

/** 학급 전체 수시 지원 현황 (교사/admin 학급 테이블) */
export function useClassWishlist(grade: number | null, classNum: number | null) {
  return useQuery({
    queryKey: [KEY, 'class', grade, classNum],
    queryFn: () => fetchClassWishlist(grade!, classNum!),
    enabled: grade !== null && classNum !== null,
    staleTime: 30_000,
  });
}

export function useAddWishlistItem(studentCode: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewWishlistInput) => addWishlistItem(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'list', studentCode] });
    },
  });
}

export function useUpdateWishlistItem(studentCode: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateWishlistItem>[1] }) =>
      updateWishlistItem(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'list', studentCode] });
    },
  });
}

export function useDeleteWishlistItem(studentCode: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWishlistItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'list', studentCode] });
    },
  });
}

// ---------------------------------------------------------------------------
// 지망 보드 / 비교표 전용 뮤테이션
//  - 세 훅 모두 같은 ['admission-wishlist','list',studentCode] 캐시를 무효화한다.
//    보드·비교표·상세 모달이 이 쿼리 하나를 공유하므로 어디서 고쳐도 함께 갱신된다.
// ---------------------------------------------------------------------------

/** 비교표에서 직접 입력한 항목(환산점수·일정·메모)을 한 번에 저장 */
export function useSaveWishlistPlans(studentCode: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patches: Parameters<typeof saveWishlistPlans>[0]) => saveWishlistPlans(patches),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'list', studentCode] });
    },
  });
}

/** 지원희망 ↔ 관심대학 이동 */
export function useSetWishlistTier(studentCode: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: WishlistTier }) =>
      setWishlistTier(id, studentCode!, tier),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'list', studentCode] });
    },
  });
}

/** 지망 순서 재배치 (orderedIds 순서대로 sort_order 0..n-1) */
export function useReorderWishlist(studentCode: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderWishlist(orderedIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'list', studentCode] });
    },
  });
}

/**
 * 위시리스트에 담긴 대학들의 전형 변경사항.
 * 대학 목록이 바뀔 때만 다시 조회하도록 **정렬한 대학명**을 쿼리 키로 쓴다
 * (항목 순서만 바뀌어도 다시 부르면 낭비).
 */
export function useAdmissionChanges(universities: string[]) {
  const key = Array.from(new Set(universities.filter(Boolean))).sort();
  return useQuery({
    queryKey: [KEY, 'changes', key.join('|')],
    queryFn: () => fetchAdmissionChanges(key),
    enabled: key.length > 0,
    // 전형 변경사항은 학년도 단위로 갱신되는 정적 자료라 오래 캐시해도 안전하다.
    staleTime: 30 * 60 * 1000,
  });
}

/** 위시리스트 대학들의 고사 일정 (변경사항과 같은 캐시 전략) */
export function useAdmissionSchedules(universities: string[]) {
  const key = Array.from(new Set(universities.filter(Boolean))).sort();
  return useQuery({
    queryKey: [KEY, 'schedules', key.join('|')],
    queryFn: () => fetchAdmissionSchedules(key),
    enabled: key.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * 위시리스트 대학들의 기본 정보 — 입학처 사이트·복수지원 (같은 캐시 전략).
 *
 * 반환은 **매칭 후보 전체**이고, 항목마다 어느 것을 쓸지는 `resolveUnivInfo` 가 정한다.
 */
export function useAdmissionUnivInfo(universities: string[]) {
  const key = Array.from(new Set(universities.filter(Boolean))).sort();
  return useQuery({
    queryKey: [KEY, 'univ-info', key.join('|')],
    queryFn: () => fetchAdmissionUnivInfo(key),
    enabled: key.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

/** 위시리스트가 참조하는 전형들의 수능최저 구조화 규칙 */
export function useCsatRules(gyogwaIds: string[]) {
  const key = Array.from(new Set(gyogwaIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: [KEY, 'csat-rules', key.join('|')],
    queryFn: () => fetchCsatRules(key),
    enabled: key.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}
