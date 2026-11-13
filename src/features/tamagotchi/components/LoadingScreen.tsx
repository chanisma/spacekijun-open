/**
 * 첫 로딩 화면(2026-10-09) — 기기 자리를 덮고 «무엇을 기다리는지 · 몇 %»를 말한다. 머리줄(나가기)은 덮지 않는다.
 * 다 되면 잠깐 흐려지며 걷힌다 — 흐려지는 동안에도 기기를 누를 수 있게 pointer-events 를 먼저 끈다.
 */
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOAD_STEP_LABEL, loadProgress, type LoadStepKey } from '../model/loading';

export function LoadingScreen({ steps, done, leaving, classic }: {
  steps: LoadStepKey[]; done: Partial<Record<LoadStepKey, boolean>>; leaving: boolean; classic: boolean;
}) {
  const p = loadProgress(steps, done);
  return (
    <div data-tama-loading={leaving ? 'leaving' : 'on'}
      className={cn('tama-loading absolute inset-0 z-[9] grid place-items-center px-6 transition-opacity duration-300', leaving && 'pointer-events-none opacity-0')}>
      <div className="flex w-full max-w-xs flex-col items-center text-center" role="status" aria-live="polite">
        <div className="tama-loading-egg" aria-hidden="true">
          <span className={cn('block h-24 w-20 rounded-[50%_50%_46%_46%/60%_60%_40%_40%] shadow-lg',
            classic ? 'bg-gradient-to-b from-indigo-200 to-violet-400' : 'bg-gradient-to-b from-white to-pink-200 ring-2 ring-white/80')} />
        </div>
        <p className="mt-5 text-[16px] font-bold">다마고찌를 깨우는 중…</p>
        <p className="mt-1 text-[12px] opacity-75">{p.current ? `${LOAD_STEP_LABEL[p.current]} 준비 중` : '다 됐어요!'}</p>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/40" role="progressbar" aria-label="불러오는 중"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent}>
          <div className={cn('h-full rounded-full transition-[width] duration-300', classic ? 'bg-indigo-200' : 'bg-violet-500')} style={{ width: `${p.percent}%` }} />
        </div>
        <p className="mt-1.5 text-[13px] font-bold tabular-nums">{p.percent}%</p>
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px]">
          {steps.map((k) => (
            <li key={k} className={cn('tama-chip flex h-7 items-center gap-1 rounded-full px-2.5', !done[k] && 'opacity-60')}>
              {done[k] && <Check className="h-3 w-3" aria-hidden="true" />}
              {LOAD_STEP_LABEL[k]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
