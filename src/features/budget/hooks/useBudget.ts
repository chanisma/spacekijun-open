// 예산 관리 쿼리 (2026-11-10). 쿼리 키 접두어 = ['budget'] — 쓰기 뒤에는 접두어째 다시 읽는다
// (줄 하나를 고쳐도 목록 막대·상세 숫자·추경 탭이 함께 바뀐다).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/lib/toast';
import { fetchProjectDetail, fetchProjects, fetchProjectYears } from '../services/budgetService';

export const BUDGET_QUERY_KEY = ['budget'] as const;

export function useBudgetYears() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...BUDGET_QUERY_KEY, 'years'],
    queryFn: fetchProjectYears,
    enabled: !!user,
  });
}

export function useBudgetProjects(year: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...BUDGET_QUERY_KEY, 'projects', year],
    queryFn: () => fetchProjects(year, user!.id),
    enabled: !!user,
  });
}

export function useBudgetProject(id: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...BUDGET_QUERY_KEY, 'project', id],
    queryFn: () => fetchProjectDetail(id!, user!.id),
    enabled: !!user && !!id,
  });
}

/** 쓰기 공통 — 실패는 토스트, 성공하면 예산 쿼리를 모두 다시 읽는다. 성공 토스트는 부르는 쪽이 정한다 */
export function useBudgetMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, options?: {
  success?: (result: TResult, args: TArgs) => string | null;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, args) => {
      void qc.invalidateQueries({ queryKey: BUDGET_QUERY_KEY });
      const message = options?.success?.(result, args);
      if (message) toast.success(message);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다');
      void qc.invalidateQueries({ queryKey: BUDGET_QUERY_KEY });
    },
  });
}
