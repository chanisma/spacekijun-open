import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addSupervisionAdjustment,
  fetchSupervisionLedger,
  fetchSupervisionTeachers,
} from '../services/supervisionService';

const TEACHERS_KEY = ['exam-supervision-teachers'] as const;
const LEDGER_KEY = 'exam-supervision-ledger';

/** 감독 배정용 교사 목록 (section 분반 수 + 담임 태그 포함) */
export function useSupervisionTeachers() {
  return useQuery({
    queryKey: TEACHERS_KEY,
    queryFn: fetchSupervisionTeachers,
    staleTime: 10 * 60 * 1000,
  });
}

/** 교사별 누적 감독 횟수 (확정 감독표 + 수동 보정, 현재 행 제외) */
export function useSupervisionLedger(excludeScheduleId?: string) {
  return useQuery({
    queryKey: [LEDGER_KEY, excludeScheduleId ?? null],
    queryFn: () => fetchSupervisionLedger(excludeScheduleId),
    staleTime: 60 * 1000,
  });
}

export function useAddSupervisionAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addSupervisionAdjustment,
    onSuccess: () => qc.invalidateQueries({ queryKey: [LEDGER_KEY] }),
  });
}
