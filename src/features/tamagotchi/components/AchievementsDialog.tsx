/**
 * 업적 · 개복치 사망 도감(2026-10-19) — 정의 = model/achievements.ts, **진행도·받기 = 서버**(tama_achievements · tama_achievement_claim —
 * 코인이 걸리므로 화면이 세지 않는다). 2026-10-21 학생·교사에게 열었고, 같은 날 «반복 업적» 탭(tama_repeat_claim — 단계마다 한 번)을 더했다.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { TamaDialog } from './AppChrome';
import { CREDIT_KEY } from '../hooks/useCredit';
import { SHOP_KEY } from '../hooks/useShop';
import { socialService } from '../services/socialService';
import { DEATH_DEX, EVENT_LABEL, achievementRows, repeatRows } from '../model/achievements';
import { deathCauseOf, type HardEvent } from '../model/petModes';
import type { DeviceStyle } from '../three/dims';

export const ACHIEVEMENTS_KEY = ['tama-achievements'] as const;

export function AchievementsDialog({ open, onOpenChange, style }: {
  open: boolean; onOpenChange: (o: boolean) => void; style: DeviceStyle;
}) {
  const [tab, setTab] = useState<'list' | 'repeat' | 'deaths'>('list');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ACHIEVEMENTS_KEY, enabled: open, queryFn: socialService.achievements, staleTime: 10_000 });
  const rows = useMemo(() => (q.data ? achievementRows(q.data) : []), [q.data]);
  const reps = useMemo(() => (q.data ? repeatRows(q.data) : []), [q.data]);
  const got = useMemo(() => new Set(q.data?.deaths ?? []), [q.data]);
  const [busy, setBusy] = useState<string | null>(null);
  const claimRepeat = async (id: string, title: string) => {
    setBusy(`repeat:${id}`);
    try {
      const r = await socialService.claimRepeat(id);
      toast.success(`«${title}» ${r.times}단계 · ${r.amount}코인을 받았어요`);
      void qc.invalidateQueries({ queryKey: ACHIEVEMENTS_KEY });
      void qc.invalidateQueries({ queryKey: CREDIT_KEY });
      void qc.invalidateQueries({ queryKey: SHOP_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '보상을 받지 못했어요.');
    } finally { setBusy(null); }
  };
  const claim = async (id: string, title: string) => {
    setBusy(id);
    try {
      const r = await socialService.claimAchievement(id);
      toast.success(r.granted ? `«${title}» 업적 보상 ${r.amount}코인을 받았어요` : '이미 받은 보상이에요');
      void qc.invalidateQueries({ queryKey: ACHIEVEMENTS_KEY });
      void qc.invalidateQueries({ queryKey: CREDIT_KEY });
      void qc.invalidateQueries({ queryKey: SHOP_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '보상을 받지 못했어요.');
    } finally { setBusy(null); }
  };
  const groups = useMemo(() => {
    const m = new Map<HardEvent | 'sick', string[]>();
    for (const d of DEATH_DEX) m.set(d.event, [...(m.get(d.event) ?? []), d.id]);
    return [...m];
  }, []);
  const classic = style === 'classic';
  const chip = (on: boolean) => cn('h-10 rounded-full px-4 text-[13px]', on ? (classic ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white') : classic ? 'bg-white/10' : 'bg-white/60');
  const done = rows.filter((a) => a.done).length;
  const waiting = rows.filter((a) => a.claimable).length;
  const repWaiting = reps.filter((r) => r.ready > 0).length;

  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="업적" description="업적과 개복치 사망 도감" testId="achievements">
      <div role="tablist" className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')} className={cn(chip(tab === 'list'), 'relative')}>
          업적 {done}/{rows.length}
          {waiting > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-[11px] font-bold text-white" aria-label={`받을 보상 ${waiting}개`}>{waiting}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'repeat'} onClick={() => setTab('repeat')} className={cn(chip(tab === 'repeat'), 'relative')}>
          반복 업적
          {repWaiting > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-[11px] font-bold text-white" aria-label={`받을 반복 보상 ${repWaiting}개`}>{repWaiting}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'deaths'} onClick={() => setTab('deaths')} className={chip(tab === 'deaths')}>개복치 도감 {got.size}/{DEATH_DEX.length}</button>
      </div>
      {q.isPending ? <p className="mt-3 text-[13px] opacity-75">불러오는 중…</p> : q.isError ? (
        <p className="mt-3 rounded-2xl bg-white/40 px-4 py-3 text-[13px]">업적을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
      ) : tab === 'list' ? (
        <ul className="mt-3 max-h-[55vh] space-y-1.5 overflow-y-auto pr-1" data-achievements="list">
          {rows.map((a) => (
            <li key={a.id} data-achievement={a.id} data-done={a.done} data-claimed={a.claimed}
              className={cn('rounded-2xl px-3 py-2 text-[13px]', a.done ? (classic ? 'bg-white/25' : 'bg-white/80') : classic ? 'bg-white/10' : 'bg-white/45')}>
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">{a.done ? '🏅' : '🔒'}</span>
                <b className={cn('min-w-0 flex-1 truncate', !a.done && 'opacity-70')}>{a.title}</b>
                {a.claimable ? (
                  <button type="button" disabled={!!busy} onClick={() => void claim(a.id, a.title)} data-achievement-claim={a.id}
                    className="h-9 shrink-0 rounded-full bg-amber-400 px-3 text-[12px] font-black text-amber-950 shadow disabled:opacity-50">
                    {busy === a.id ? '받는 중…' : `${a.reward}코인 받기`}
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] tabular-nums opacity-75">{a.claimed ? `받음 · ${a.reward}코인` : `${Math.min(a.progress, a.goal)}/${a.goal} · ${a.reward}코인`}</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] opacity-75">{a.desc}</p>
              {!a.done && a.goal > 1 && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${(100 * a.progress) / a.goal}%` }} />
                </div>
              )}
            </li>
          ))}
          <li className="px-1 pt-1 text-[11px] opacity-70">보상은 업적마다 한 번만 받을 수 있어요.</li>
        </ul>
      ) : tab === 'repeat' ? (
        <ul className="mt-3 max-h-[55vh] space-y-1.5 overflow-y-auto pr-1" data-achievements="repeat">
          {reps.map((r) => (
            <li key={r.id} data-repeat={r.id} data-ready={r.ready}
              className={cn('rounded-2xl px-3 py-2 text-[13px]', r.ready ? (classic ? 'bg-white/25' : 'bg-white/80') : classic ? 'bg-white/10' : 'bg-white/45')}>
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">🔁</span>
                <b className="min-w-0 flex-1 truncate">{r.title}</b>
                {r.ready > 0 ? (
                  <button type="button" disabled={!!busy} onClick={() => void claimRepeat(r.id, r.title)} data-repeat-claim={r.id}
                    className="h-9 shrink-0 rounded-full bg-amber-400 px-3 text-[12px] font-black text-amber-950 shadow disabled:opacity-50">
                    {busy === `repeat:${r.id}` ? '받는 중…' : `${r.reward * r.ready}코인 받기${r.ready > 1 ? ` (×${r.ready})` : ''}`}
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] tabular-nums opacity-75">{r.inStep}/{r.step} · {r.reward}코인</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] opacity-75">{r.desc}{r.claimed > 0 && ` · 지금까지 ${r.claimed}번 받음`}</p>
              {r.ready === 0 && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${(100 * r.inStep) / r.step}%` }} />
                </div>
              )}
            </li>
          ))}
          <li className="px-1 pt-1 text-[11px] opacity-70">반복 업적은 단계에 닿을 때마다 다시 받을 수 있어요.</li>
        </ul>
      ) : (
        <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1" data-achievements="deaths">
          <p className="text-[12px] opacity-80">내 펫이 별이 된 이유를 모아요. 아직 모르는 칸은 «어디서»만 보여요.</p>
          {groups.map(([event, ids]) => (
            <section key={event} className={cn('rounded-2xl p-2', classic ? 'bg-white/10' : 'bg-white/50')}>
              <h3 className="px-1 text-[12px] font-bold">{EVENT_LABEL[event]} <span className="font-normal opacity-70">{ids.filter((id) => got.has(id)).length}/{ids.length}</span></h3>
              <ul className="mt-1 space-y-1">
                {ids.map((id) => (
                  <li key={id} data-death-dex={id} data-got={got.has(id)} className="rounded-xl bg-white/50 px-2.5 py-1.5 text-[12px]">
                    {got.has(id) ? <>⭐ {deathCauseOf(id).phrase}…</> : <span className="opacity-60">??? — {EVENT_LABEL[event]} 무슨 일이…</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </TamaDialog>
  );
}
