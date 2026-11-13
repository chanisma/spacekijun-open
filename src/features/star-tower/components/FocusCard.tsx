/**
 * 집중 카드 — 쉬는 중: 길이 고르기 + [낚싯대 드리우기]. 집중 중: 남은 시간 · 5분 눈금 막대 · 걸린 횟수 · [그만두기].
 * 남은 시간은 서버 시각으로 잰다(serverNow). 시간이 다 차면 부모가 저절로 건져 올린다.
 */
import { useEffect, useState } from 'react';
import { FOCUS_MINUTES, ROLL_SECONDS, rollsForCompleted } from '../model/catalog';
import type { OpenFocus } from '../services/towerApi';
import { formatClock } from './ui';

export function focusProgress(focus: OpenFocus, now: number) {
  const elapsed = Math.max(0, (now - focus.startedAt) / 1000);
  const remaining = Math.max(0, focus.plannedSeconds - elapsed);
  const rolls = Math.floor(Math.min(elapsed, focus.plannedSeconds) / ROLL_SECONDS);
  return { elapsed, remaining, rolls, total: rollsForCompleted(focus.plannedSeconds / 60) - 1 };
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(id); }, [ms]);
}

export function FocusCard({ focus, serverNow, busy, minutes, onMinutes, onStart, onGiveUp, compact = false }: {
  focus: OpenFocus | null;
  serverNow: () => number;
  busy: boolean;
  minutes: number;
  onMinutes: (m: number) => void;
  onStart: () => void;
  onGiveUp: () => void;
  compact?: boolean;
}) {
  useTick(500);
  if (!focus) {
    return (
      <div className="st-panel" style={{ padding: compact ? 8 : 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        {!compact && <div className="st-hint st-focus-hint" style={{ textAlign: 'center' }}>집중하는 동안 5분마다 한 번 무언가 걸립니다. 끝까지 채우면 한 번 더, 그리고 별 조각.</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div className="st-seg" role="group" aria-label="집중 길이">
            {FOCUS_MINUTES.map((m) => (
              <button key={m} type="button" aria-pressed={minutes === m} onClick={() => onMinutes(m)}>{m}분</button>
            ))}
          </div>
          <button type="button" className="st-btn primary" disabled={busy} onClick={onStart}>낚싯대 드리우기</button>
        </div>
      </div>
    );
  }
  const p = focusProgress(focus, serverNow());
  const ticks = Math.floor(focus.plannedSeconds / ROLL_SECONDS);
  return (
    <div className="st-panel" style={{ padding: compact ? 8 : 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="st-timer" aria-live="off">{p.remaining > 0 ? formatClock(p.remaining) : '건져 올리는 중…'}</span>
        <span>걸린 횟수 <b className="st-good">{p.rolls}</b> / {p.total}</span>
      </div>
      <div className="st-bar" role="progressbar" aria-label="집중 진행" aria-valuemin={0} aria-valuemax={focus.plannedSeconds} aria-valuenow={Math.round(p.elapsed)}>
        <i style={{ width: `${Math.min(100, (p.elapsed / focus.plannedSeconds) * 100)}%` }} />
        {Array.from({ length: ticks - 1 }, (_, i) => <em key={i} style={{ left: `${((i + 1) / ticks) * 100}%` }} />)}
      </div>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="st-hint">무엇이 걸렸는지는 끝나면 건져 올려 봅니다.</span>
          <button type="button" className="st-btn ghost" disabled={busy} onClick={onGiveUp}>그만두기</button>
        </div>
      )}
    </div>
  );
}
