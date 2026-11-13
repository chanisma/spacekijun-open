/**
 * 탑 상태 + 서버 시계. 집중의 남은 시간은 «서버 시각 − 시작 시각»으로 잰다 — 기기 시계가 틀려도(휴대폰 수동 시각 등)
 * 타이머가 틀리지 않게, 응답마다 서버 시각과 기기 시각의 차이(offset)를 갱신한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import type { FinishResult, TowerApi, TowerSnapshot } from '../services/towerApi';
import type { TradeKind } from '../model/catalog';
import type { TowerAchievementsData } from '../model/achievements';

export function useTower(api: TowerApi) {
  const [snap, setSnap] = useState<TowerSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 업적(2026-10-23) — 진행도는 서버가 센다. 진행이 바뀌는 일(건지기·짓기·인사) 뒤에 다시 읽는다. 실패해도 탑은 그대로(조용히)
  const [achievements, setAchievements] = useState<TowerAchievementsData | null>(null);
  const offset = useRef(0);
  const refreshAchievements = useCallback(async () => {
    try { setAchievements(await api.achievements()); } catch { /* 업적은 탑을 막지 않는다 */ }
  }, [api]);

  const apply = useCallback((s: TowerSnapshot) => {
    offset.current = s.serverNow - Date.now();
    setSnap(s);
  }, []);

  const reload = useCallback(async () => {
    try {
      apply(await api.read());
      setLoadError(null);
      void refreshAchievements();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [api, apply, refreshAchievements]);

  useEffect(() => {
    void reload();
    // 다른 탭·작은 창에서 바뀌었을 수 있다 — 돌아올 때마다 다시 읽는다
    const onVis = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reload]);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '잠시 후 다시 해 주세요.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback((minutes: number) => run(async () => { apply(await api.start(minutes)); return true; }), [api, apply, run]);
  const trade = useCallback((kind: TradeKind, times: number) => run(async () => { apply(await api.trade(kind, times)); return true; }), [api, apply, run]);
  const build = useCallback((key: string) => run(async () => { apply(await api.build(key)); void refreshAchievements(); return true; }), [api, apply, run, refreshAchievements]);
  const reorder = useCallback((floors: string[]) => run(async () => { apply(await api.reorder(floors)); return true; }), [api, apply, run]);
  const newTower = useCallback(() => run(async () => { apply(await api.newTower()); return true; }), [api, apply, run]);
  // 코인은 탑 밖(아카데미·다마고찌)에서 쓰므로 받은 것을 한 줄로 알린다 — 탑 화면에는 코인이 그려지지 않는다
  const sellStars = useCallback((times: number) => run(async () => {
    const r = await api.sellStars(times);
    apply(r);
    toast.success(`별 조각 ${times}개 → ${r.coinsGot}코인 · 아카데미·다마고찌에서 쓸 수 있어요`);
    return true;
  }), [api, apply, run]);
  const sellBottles = useCallback((times: number) => run(async () => {
    const r = await api.sellBottles(times);
    apply(r);
    toast.success(`남는 병 ${times}개 → ${r.coinsGot}코인 · 아카데미·다마고찌에서 쓸 수 있어요`);
    return true;
  }), [api, apply, run]);
  // 업적 코인 받기 — 서버가 다시 세고 업적마다 한 번만 준다
  const claimAchievement = useCallback((id: string, title: string) => run(async () => {
    const r = await api.claimAchievement(id);
    await refreshAchievements();
    if (r.granted) toast.success(`업적 «${title}» — ${r.amount}코인을 받았어요`);
    return r.granted;
  }), [api, run, refreshAchievements]);

  const finish = useCallback(async (giveUp: boolean): Promise<FinishResult | null> => {
    const id = snap?.focus?.id;
    if (!id) return null;
    return run(async () => {
      const r = await api.finish(id, giveUp);
      if (r.state) apply(r.state);
      if (r.outcome !== 'running') void refreshAchievements();
      return r;
    });
  }, [api, apply, run, snap?.focus?.id, refreshAchievements]);

  /** 방문자를 처음 눌렀을 때 — 도감 기록. 실패해도 조용히(보상이 없는 기록이라 다음에 다시 누르면 된다) */
  const meet = useCallback(async (key: string) => {
    if (snap?.visitors.includes(key)) return false;
    try { apply(await api.meet(key)); void refreshAchievements(); return true; } catch { return false; }
  }, [api, apply, snap?.visitors, refreshAchievements]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  return { snap, loadError, busy, reload, start, finish, trade, build, meet, reorder, sellStars, sellBottles, newTower, serverNow, achievements, claimAchievement };
}

export type TowerController = ReturnType<typeof useTower>;
