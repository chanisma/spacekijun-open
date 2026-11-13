import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishTimer, initialPomodoro, markFocusSaved, parsePomodoro, pauseTimer, remainingMs, resumeTimer, startBreak, startFocus, timerText } from '../pomodoroModel';
import { layoutTimedTasks, rangeFromSlots } from '../timelineModel';
import type { PlannerTask } from '../types';

const task = { id: 'task-1', title: '읽기', task_date: '2026-09-20' };
const start = Date.parse('2026-09-20T00:00:00Z');
test('timer uses a deadline: delayed/background ticks finish one focus, never invent further cycles', () => {
  const running = startFocus(initialPomodoro(), task, 'session-1', start);
  assert.equal(remainingMs(running, start + 60_000), 24 * 60_000);
  const finished = finishTimer(running, start + 4 * 60 * 60_000);
  assert.equal(finished.pending?.focus_seconds, 1500);
  assert.equal(finished.pending?.ended_at, new Date(start + 25 * 60_000).toISOString());
  assert.equal(finished.pending?.task_id, task.id);
  assert.equal(finished.cycle, 0);
  assert.deepEqual(finishTimer(finished, start + 99_000_000), finished);
  assert.equal(startBreak(finished, start).phase, 'focus', 'unsaved work cannot be discarded by a break');
});

test('pause, storage restoration and resume exclude paused time from execution', () => {
  const running = startFocus(initialPomodoro(), task, 'session-1', start);
  const paused = pauseTimer(running, start + 120_000);
  const restored = parsePomodoro(JSON.stringify(paused));
  const resumed = resumeTimer(restored, start + 600_000);
  const finished = finishTimer(resumed, start + 660_000);
  assert.equal(finished.pending?.focus_seconds, 180);
  assert.equal(finished.pending?.completed, false);
  assert.equal(finished.pending?.planned_seconds, 1500);
  const saved = markFocusSaved(finished, 'session-1');
  assert.equal(saved.cycle, 0, 'partial focus is saved without crediting a full cycle');
  assert.equal(startBreak(saved, start + 660_000).phase, 'shortBreak');
});

test('four explicitly saved full sessions produce a long break; retries do not increase counts', () => {
  let state = initialPomodoro();
  let now = start;
  for (let cycle = 1; cycle <= 4; cycle++) {
    state = startFocus(state, task, `session-${cycle}`, now);
    now += 25 * 60_000;
    state = markFocusSaved(finishTimer(state, now), `session-${cycle}`);
    state = markFocusSaved(state, `session-${cycle}`);
    assert.equal(state.cycle, cycle);
    state = startBreak(state, now);
    assert.equal(state.phase, cycle === 4 ? 'longBreak' : 'shortBreak');
    now += state.durationMs;
    state = finishTimer(state, now);
    assert.equal(state.status, 'idle', 'break does not start the next focus automatically');
  }
});

test('active task identity stays fixed and expired pause creates a full record', () => {
  const running = startFocus(initialPomodoro(), task, 'session-1', start);
  assert.deepEqual(startFocus(running, { ...task, id: 'other' }, 'other-session', start), running);
  assert.equal(pauseTimer(running, start + 25 * 60_000).pending?.completed, true);
  assert.equal(finishTimer(running, start + 500).pending, null);
  assert.equal(timerText(1499), '00:02');
});

test('broken local storage is ignored; finished pending record survives reload', () => {
  for (const raw of [null, '{', '{}', JSON.stringify({ ...initialPomodoro(), settings: {focus:0,shortBreak:5,longBreak:15} }), JSON.stringify({ ...initialPomodoro(), status:'running', deadline:null })]) {
    assert.deepEqual(parsePomodoro(raw), initialPomodoro());
  }
  const finished = finishTimer(startFocus(initialPomodoro(), task, 'session-1', start), start + 1500_000);
  assert.deepEqual(parsePomodoro(JSON.stringify(finished)), finished);
});

test('shared timeline keeps reverse drags, day boundary, overlapping and adjacent blocks', () => {
  assert.deepEqual(rangeFromSlots(41, 37), { start: '09:15', end: '10:30', first: 37, count: 5 });
  assert.equal(rangeFromSlots(95, 95).end, '23:59');
  const tasks = [{id:'one',start_time:'09:00',end_time:'10:00'}, {id:'two',start_time:'09:30',end_time:'10:30'}, {id:'three',start_time:'10:30',end_time:'11:00'}, {id:'free',start_time:null,end_time:null}] as PlannerTask[];
  const blocks = layoutTimedTasks(tasks);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].columns, 2);
  assert.equal(blocks[1].column, 1);
  assert.equal(blocks[2].columns, 1);
});
