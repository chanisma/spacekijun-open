/**
 * 새 종 · 창고 · 통신 훅(2026-10-26).
 *
 * 통신은 실시간이다 — 다마고찌 화면이 열린 동안 표 `tama_link` 의 바뀜을 realtime 으로 듣는다(RLS = 두 사람만).
 * realtime 이 끊겨도 버티게, 기다리는 신청이 있는 동안은 3초마다 다시 읽는다(받는 쪽은 2분 안에 받아야 한다).
 * ⚠️ 다마고찌에서 쓰는 첫 realtime 이다 — 채널은 사용자마다 하나, 화면을 떠나면 닫는다.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { speciesService } from '../services/speciesService';
import { incomingLink, outgoingLink } from '../model/link';

export const SPECIES_KEY = ['tama-species'] as const;
export const LINK_KEY = ['tama-link'] as const;

export function useSpecies(enabled: boolean) {
  return useQuery({ queryKey: SPECIES_KEY, enabled, queryFn: speciesService.read, staleTime: 30_000 });
}

export function useLinks(enabled: boolean, me: string | null) {
  const qc = useQueryClient();
  // 1초마다 다시 그리기만 한다(남은 초) — 값은 그릴 때마다 지금 시각으로(처음 연 때의 시각에 머물면 «126초»가 나온다)
  const [, setTick] = useState(0);
  const links = useQuery({
    queryKey: LINK_KEY,
    enabled: enabled && !!me,
    queryFn: speciesService.links,
    staleTime: 2_000,
    // 기다리는 신청이 있으면 3초마다(실시간 대체), 아니면 30초마다
    refetchInterval: (q) => (q.state.data?.links.some((l) => l.status === 'pending') ? 3_000 : 30_000),
  });

  useEffect(() => {
    if (!enabled || !me) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: LINK_KEY });
    const channel = supabase.channel(`tama-link:${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tama_link', filter: `to_user=eq.${me}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tama_link', filter: `from_user=eq.${me}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, me, qc]);

  // 남은 초를 세는 시계 — 기다리는 신청이 있을 때만 1초마다
  const pending = links.data?.links.some((l) => l.status === 'pending') ?? false;
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [pending]);

  const offset = links.data ? links.data.serverNow - (links.dataUpdatedAt || Date.now()) : 0;
  const serverNow = Date.now() + offset;

  const act = useMutation({
    mutationFn: ({ action, payload }: { action: 'offer' | 'accept' | 'decline' | 'cancel'; payload: Record<string, unknown> }) =>
      speciesService.link(action, payload),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: LINK_KEY });
      if (r?.first_contact) void qc.invalidateQueries({ queryKey: SPECIES_KEY });
    },
  });

  return {
    links,
    serverNow,
    incoming: incomingLink(links.data, serverNow),
    outgoing: outgoingLink(links.data, serverNow),
    act,
  };
}
