/**
 * 집중 권하기 재료 모으기(2026-10-15) — 오늘의 자습 신청 · 시간이 정해진 플래너 계획. 판정은 model/focusInvite.ts.
 *
 *  · 플래너는 펫 알림(usePetMessages)·함께 집중 창과 **같은 쿼리 키**를 쓴다(요청을 늘리지 않는다)
 *  · 자습 신청은 학생만(seaton 예약 — RPC academy_study_read 는 학생 본인 것)
 *  · [나중에]는 그날의 기기 저장소에 덩어리 열쇠로 남는다(서버에 쓰지 않는다 — 다른 기기에서 다시 권해도 해가 없다)
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPlanner } from '@/features/planner/plannerService';
import { fetchStudy } from '@/features/academy/game/studyService';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { readStoredJson, writeStoredJson } from '@/lib/safeLocalStorage';
import { kstParts } from '../model/clock';
import { activeBlockKeys, pickFocusInvite, planBlocks, studyBlocks, type FocusInvite } from '../model/focusInvite';

const dismissKey = (date: string) => `tamagotchi:invite-dismissed:${date}`;
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function useFocusInvite(opts: {
  enabled: boolean;
  userId: string | null;
  isStudent: boolean;
  /** 서버 시각(함께 집중과 같은 시계) */
  serverNow: () => number;
  focusOpen: boolean;
  /** 수업 중 · 자는 시간 · 펫이 아직 없음 */
  busy: boolean;
}): { invite: FocusInvite | null; dismiss: () => void } {
  useCurrentTime(); // 분이 바뀔 때마다 다시 판정
  const { date: today, minutes: nowMin } = kstParts(opts.serverNow());

  const planner = useQuery({
    queryKey: ['academy-dormitory', opts.userId, 'tamagotchi', today],
    queryFn: () => fetchPlanner(today, null),
    enabled: opts.enabled && !!opts.userId,
    staleTime: 60_000,
  });
  const study = useQuery({
    queryKey: ['tamagotchi', 'study-today', opts.userId, today],
    queryFn: () => fetchStudy(null, null),
    enabled: opts.enabled && opts.isStudent && !!opts.userId,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const [dismissed, setDismissed] = useState<{ date: string; keys: string[] }>(() => ({
    date: today, keys: readStoredJson(dismissKey(today), [], isStringList),
  }));
  const keys = dismissed.date === today ? dismissed.keys : readStoredJson(dismissKey(today), [], isStringList);

  const blocks = useMemo(() => [
    ...planBlocks(planner.data?.tasks ?? [], today),
    ...studyBlocks(study.data?.entries ?? [], today),
  ], [planner.data, study.data, today]);

  // [나중에] = «지금은 말고» — 지금 걸쳐 있는 덩어리를 전부 접는다(겹친 자습을 곧바로 다시 권하지 않게)
  const dismiss = useCallback(() => {
    const next = [...new Set([...keys, ...activeBlockKeys(blocks, nowMin)])];
    writeStoredJson(dismissKey(today), next);
    setDismissed({ date: today, keys: next });
  }, [keys, blocks, nowMin, today]);

  const invite = opts.enabled
    ? pickFocusInvite({ blocks, nowMin, focusOpen: opts.focusOpen, busy: opts.busy, dismissed: new Set(keys) })
    : null;
  return { invite, dismiss };
}
