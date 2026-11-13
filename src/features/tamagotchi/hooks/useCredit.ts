/**
 * 코인 · 펫 일기 · 함께 집중 — 서버 상태를 읽고 쓰는 훅(Phase 2).
 * 서버 시각은 응답의 `server_now` 로 맞춘다(집중 남은 시간을 기기 시계로 세지 않는다).
 */
import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { creditService, type CreditStatus } from '../services/creditService';
import { focusProgress, type DiaryKind } from '../model/credit';

export const CREDIT_KEY = ['tama-credit'] as const;
export const DIARY_KEY = ['tama-diary'] as const;

export function useCredit(enabled: boolean) {
  const qc = useQueryClient();
  const offset = useRef(0);
  const status = useQuery({
    queryKey: CREDIT_KEY,
    enabled,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const data = await creditService.read();
      offset.current = data.server_now - Date.now();
      return data;
    },
  });
  const serverNow = useCallback(() => Date.now() + offset.current, []);
  const setStatus = (patch: (s: CreditStatus) => CreditStatus) =>
    qc.setQueryData<CreditStatus>(CREDIT_KEY, (prev) => (prev ? patch(prev) : prev));

  const writeDiary = useMutation({
    mutationFn: ({ kind, body, prompt }: { kind: DiaryKind; body: string; prompt?: string | null }) => creditService.diaryWrite(kind, body, prompt ?? null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CREDIT_KEY });
      void qc.invalidateQueries({ queryKey: DIARY_KEY });
    },
  });
  const deleteDiary = useMutation({
    mutationFn: (id: string) => creditService.diaryDelete(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: DIARY_KEY }); },
  });
  const startFocus = useMutation({
    mutationFn: ({ minutes, taskId }: { minutes: number; taskId: string | null }) => creditService.focusStart(minutes, taskId),
    onSuccess: (r) => {
      offset.current = r.server_now - Date.now();
      setStatus((s) => ({ ...s, focus: r.focus }));
    },
  });
  const finishFocus = useMutation({
    mutationFn: ({ id, giveUp }: { id: string; giveUp: boolean }) => creditService.focusFinish(id, giveUp),
    onSuccess: (r) => {
      offset.current = r.server_now - Date.now();
      if (r.outcome !== 'running') void qc.invalidateQueries({ queryKey: CREDIT_KEY });
    },
  });

  const focus = status.data?.focus ?? null;
  const focusEndsAt = useMemo(() => (focus ? focusProgress(focus, 0).endsAt : null), [focus]);

  return { status, serverNow, focus, focusEndsAt, writeDiary, deleteDiary, startFocus, finishFocus };
}

export function useDiaryList(enabled: boolean) {
  return useQuery({ queryKey: DIARY_KEY, enabled, queryFn: creditService.diaryList, staleTime: 60_000 });
}

export type CreditController = ReturnType<typeof useCredit>;
