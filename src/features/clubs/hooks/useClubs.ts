// 동아리 쿼리·변경 훅. 담당자 판정은 서버 is_club_manager()(admin ∨ 태그 «동아리담당자») — club_list.is_manager 로 받는다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import * as svc from '../services/clubService';

export const CLUBS_QUERY_KEY = ['clubs'] as const;

export function useClubList(year: number | null) {
  return useQuery({
    queryKey: [...CLUBS_QUERY_KEY, 'list', year],
    queryFn: () => svc.listClubs(year),
  });
}

export function useClub(id: string | null) {
  return useQuery({
    queryKey: [...CLUBS_QUERY_KEY, 'detail', id],
    queryFn: () => svc.getClub(id!),
    enabled: !!id,
  });
}

/** 변경 뒤엔 목록·상세를 모두 다시 읽는다(명단 수·기장이 목록에도 보인다) */
export function useClubMutation<A, R>(fn: (args: A) => Promise<R>, opts?: { success?: (r: R) => string | null }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: CLUBS_QUERY_KEY });
      const msg = opts?.success?.(r);
      if (msg) toast.success(msg);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useClubActivities(id: string | null) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'activities', id], queryFn: () => svc.listClubActivities(id!), enabled: !!id });
}

export function useClubNotes(id: string | null, enabled = true) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'notes', id], queryFn: () => svc.getClubNotes(id!), enabled: !!id && enabled });
}

/** clubYearId = null → 담당자의 그 해 전체 요청 현황 */
export function useClubRequests(clubYearId: string | null, year: number | null, enabled = true) {
  return useQuery({
    queryKey: [...CLUBS_QUERY_KEY, 'requests', clubYearId, year],
    queryFn: () => svc.listClubRequests(clubYearId, year),
    enabled,
  });
}

export function useClubFinance(id: string | null) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'finance', id], queryFn: () => svc.getClubFinance(id!), enabled: !!id });
}

export function useClubFinanceOverview(year: number | null, enabled = true) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'finance-overview', year], queryFn: () => svc.getClubFinanceOverview(year), enabled });
}

export function useMyBudgetLines(year: number, enabled: boolean) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'budget-lines', year], queryFn: () => svc.listMyBudgetLines(year), enabled });
}

export function useRecruits(year: number | null) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'recruits', year], queryFn: () => svc.listRecruits(year) });
}
export function useRecruit(id: string | null) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'recruit', id], queryFn: () => svc.getRecruit(id!), enabled: !!id });
}
export function useApplications(clubYearId: string | null, enabled = true) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'applications', clubYearId], queryFn: () => svc.listApplications(clubYearId!), enabled: !!clubYearId && enabled });
}
export function useProposals(year: number | null) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'proposals', year], queryFn: () => svc.listProposals(year) });
}

export function useHostCandidates(enabled: boolean) {
  return useQuery({ queryKey: [...CLUBS_QUERY_KEY, 'host-candidates'], queryFn: svc.listHostCandidates, enabled });
}
