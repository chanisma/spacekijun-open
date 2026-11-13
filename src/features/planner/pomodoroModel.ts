import type { PlannerTask } from './types';

export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak';
export interface PomodoroSettings { focus: number; shortBreak: number; longBreak: number }
export const defaultSettings: PomodoroSettings = { focus: 25, shortBreak: 5, longBreak: 15 };
export interface FocusRecord {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string;
  focus_seconds: number;
  planned_seconds: number;
  completed: boolean;
}
export interface PomodoroState {
  version: 1;
  phase: TimerPhase;
  status: 'idle' | 'running' | 'paused' | 'finished';
  settings: PomodoroSettings;
  cycle: number;
  task: Pick<PlannerTask, 'id' | 'title' | 'task_date'> | null;
  sessionId: string | null;
  startedAt: number | null;
  deadline: number | null;
  remainingMs: number;
  durationMs: number;
  pending: FocusRecord | null;
  saved: boolean;
}
export function initialPomodoro(settings = defaultSettings, cycle = 0): PomodoroState {
  return { version: 1, phase: 'focus', status: 'idle', settings, cycle, task: null, sessionId: null, startedAt: null, deadline: null, remainingMs: settings.focus * 60_000, durationMs: settings.focus * 60_000, pending: null, saved: false };
}
export function remainingMs(state: PomodoroState, now: number) {
  return state.status === 'running' && state.deadline !== null ? Math.min(state.durationMs, Math.max(0, state.deadline - now)) : state.remainingMs;
}
export function startFocus(state: PomodoroState, task: PomodoroState['task'], id: string, now: number): PomodoroState {
  if (state.status !== 'idle' || !task) return state;
  const durationMs = state.settings.focus * 60_000;
  return { ...state, phase: 'focus', status: 'running', task, sessionId: id, startedAt: now, durationMs, remainingMs: durationMs, deadline: now + durationMs, pending: null, saved: false };
}
export function finishTimer(state: PomodoroState, now: number): PomodoroState {
  if (state.status !== 'running' && state.status !== 'paused') return state;
  const remaining = remainingMs(state, now);
  const elapsed = Math.max(0, Math.floor((state.durationMs - remaining) / 1000));
  const complete = remaining === 0;
  if (state.phase !== 'focus') return { ...initialPomodoro(state.settings, state.cycle), task: state.task };
  return { ...state, status: 'finished', remainingMs: remaining, deadline: null, pending: elapsed && state.task && state.sessionId ? {
    id: state.sessionId, task_id: state.task.id, started_at: new Date(state.startedAt!).toISOString(),
    ended_at: new Date(complete && state.deadline ? state.deadline : now).toISOString(),
    focus_seconds: elapsed, planned_seconds: state.durationMs / 1000, completed: complete,
  } : null };
}
export function pauseTimer(state: PomodoroState, now: number): PomodoroState {
  if (state.status !== 'running') return state;
  if (remainingMs(state, now) === 0) return finishTimer(state, now);
  return { ...state, status: 'paused', remainingMs: remainingMs(state, now), deadline: null };
}
export function resumeTimer(state: PomodoroState, now: number): PomodoroState {
  return state.status === 'paused' ? { ...state, status: 'running', deadline: now + state.remainingMs } : state;
}
export function markFocusSaved(state: PomodoroState, id: string): PomodoroState {
  if (state.status !== 'finished' || state.pending?.id !== id || state.saved) return state;
  return { ...state, saved: true, cycle: state.cycle + (state.pending.completed ? 1 : 0) };
}
export function startBreak(state: PomodoroState, now: number): PomodoroState {
  if (state.status !== 'finished' || !state.saved) return state;
  const phase = state.cycle > 0 && state.cycle % 4 === 0 && state.pending?.completed ? 'longBreak' : 'shortBreak';
  const durationMs = state.settings[phase] * 60_000;
  return { ...state, phase, status: 'running', durationMs, remainingMs: durationMs, deadline: now + durationMs, pending: null, saved: false };
}
export function parsePomodoro(raw: string | null): PomodoroState {
  try {
    const state = JSON.parse(raw || 'null') as PomodoroState;
    if (!state || state.version !== 1 || !['focus', 'shortBreak', 'longBreak'].includes(state.phase) || !['idle', 'running', 'paused', 'finished'].includes(state.status)) return initialPomodoro();
    if (!state.settings || !['focus', 'shortBreak', 'longBreak'].every(key => Number.isInteger(state.settings[key]) && state.settings[key] >= 1 && state.settings[key] <= 120)) return initialPomodoro();
    if (!Number.isFinite(state.durationMs) || state.durationMs <= 0 || state.durationMs > 7_200_000 || !Number.isFinite(state.remainingMs) || state.remainingMs < 0 || state.remainingMs > state.durationMs) return initialPomodoro();
    if (!Number.isInteger(state.cycle) || state.cycle < 0 || (state.status === 'running' && !Number.isFinite(state.deadline))) return initialPomodoro();
    if (state.status !== 'idle' && (!state.task?.id || !state.task.title || !state.sessionId || !Number.isFinite(state.startedAt))) return initialPomodoro();
    if (state.pending && (state.pending.id !== state.sessionId || state.pending.task_id !== state.task?.id || !Number.isInteger(state.pending.focus_seconds) || state.pending.focus_seconds < 1 || state.pending.focus_seconds > 7200)) return initialPomodoro();
    return state;
  } catch { return initialPomodoro(); }
}

export function timerText(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
