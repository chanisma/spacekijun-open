import { useCallback, useEffect, useRef, useState } from 'react';
import { finishTimer, initialPomodoro, parsePomodoro, remainingMs, startFocus, type PomodoroState } from './pomodoroModel';
import type { PlannerTask } from './types';

export function usePomodoro(userId: string) {
  const key = `planner:pomodoro:v1:${userId}`;
  const [storageError, setStorageError] = useState(false);
  const [state, setState] = useState(() => {
    try { return parsePomodoro(localStorage.getItem(key)); } catch { return initialPomodoro(); }
  });
  const current = useRef(state);
  const persisted = useRef(true);
  const [now, setNow] = useState(Date.now);
  const change = useCallback(async (reduce: (previous: PomodoroState) => PomodoroState) => {
    const commit = () => {
      let previous = current.current;
      try { const raw = localStorage.getItem(key); if (raw && persisted.current) previous = parsePomodoro(raw); } catch { setStorageError(true); }
      const next = reduce(previous);
      if (next === previous) { current.current = previous; setState(previous); return; }
      try { localStorage.setItem(key, JSON.stringify(next)); persisted.current = true; setStorageError(false); } catch { persisted.current = false; setStorageError(true); }
      current.current = next; setState(next); setNow(Date.now());
    };
    // One writer per account across tabs. The synchronous fallback supports older browsers.
    if (navigator.locks) await navigator.locks.request(key, commit);
    else commit();
  }, [key]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      const next = parsePomodoro(event.newValue);
      current.current = next; setState(next); setNow(Date.now());
    };
    const tick = () => setNow(Date.now());
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', tick);
    const interval = window.setInterval(tick, 500);
    return () => { window.removeEventListener('storage', sync); document.removeEventListener('visibilitychange', tick); window.clearInterval(interval); };
  }, [key]);
  useEffect(() => {
    if (state.status === 'running' && remainingMs(state, now) === 0) {
      void change(previous => previous.sessionId === state.sessionId && previous.phase === state.phase && previous.status === 'running' && remainingMs(previous, Date.now()) === 0 ? finishTimer(previous, Date.now()) : previous);
    }
  }, [state, now, change]);
  const start = (task: PlannerTask) => change(previous => startFocus(previous, { id: task.id, title: task.title, task_date: task.task_date }, crypto.randomUUID(), Date.now()));
  return { state, now, change, start, storageError };
}
