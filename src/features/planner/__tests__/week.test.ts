import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goalColor, movePayload, weekCenter, weekDays, weekLabel, weekStartOf } from '../plannerModel';

test('weeks start on Monday, including when the day is Sunday or crosses a month/year', () => {
  assert.equal(weekStartOf('2026-10-03'), '2026-09-28'); // 토
  assert.equal(weekStartOf('2026-10-04'), '2026-09-28'); // 일 → 앞 주 월요일
  assert.equal(weekStartOf('2026-09-28'), '2026-09-28'); // 월
  assert.equal(weekStartOf('2027-01-01'), '2026-12-28');
  assert.deepEqual(weekDays('2026-09-28'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
});

test('reading the Thursday returns exactly Mon..Sun (the read RPC window is ±3 days)', () => {
  const start = '2026-09-28', center = weekCenter(start);
  const days = weekDays(start);
  const window = Array.from({ length: 7 }, (_, i) => i - 3).map(o => { const d = new Date(`${center}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + o); return d.toISOString().slice(0, 10); });
  assert.deepEqual(window, days);
});

test('week label follows the month of the Thursday (a week belongs to one month)', () => {
  assert.equal(weekLabel('2026-09-28'), '10월 1주차'); // 목 = 10/1
  assert.equal(weekLabel('2026-10-26'), '10월 5주차'); // 목 = 10/29
  assert.equal(weekLabel('2026-08-31'), '9월 1주차');
});

test('goal colors are stable per id and empty without a goal; moving keeps everything but the date', () => {
  assert.equal(goalColor('abc'), goalColor('abc'));
  assert.equal(goalColor(null), null);
  const task = { id: 't', title: '영단어', priority: 'high', related_goal_id: 'g', memo: null, start_time: '07:00', end_time: '07:30' };
  assert.deepEqual(movePayload(task, '2026-10-05'), { id: 't', title: '영단어', task_date: '2026-10-05', priority: 'high', related_goal_id: 'g', memo: '', start_time: '07:00', end_time: '07:30' });
});

test('month grid starts on the Monday on/before the 1st, covers 42 days; month shift lands on the 1st', async () => {
  const { monthGrid, shiftMonth } = await import('../usePlannerMonth');
  const grid = monthGrid('2026-10-03');
  assert.equal(grid.length, 42);
  assert.equal(grid[0], '2026-09-28');
  assert.ok(grid.includes('2026-10-31'));
  assert.equal(monthGrid('2026-06-15')[0], '2026-06-01', 'a month that starts on Monday starts on its 1st');
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-01', 'no day overflow into March');
  assert.equal(shiftMonth('2026-01-10', -1), '2025-12-01');
});

test('goal tree: long goals with their short goals, loose shorts, and orphaned shorts fall back to loose', async () => {
  const { goalTree, goalHorizon, GOAL_LABELS } = await import('../plannerModel');
  const goals = [
    { id: 'L', horizon: 'long' }, { id: 'a', horizon: 'short', parent_goal_id: 'L' }, { id: 'b', parent_goal_id: 'L' },
    { id: 'c' }, { id: 'd', parent_goal_id: 'gone' },
  ];
  const tree = goalTree(goals);
  assert.deepEqual(tree.longs.map(g => g.id), ['L']);
  assert.deepEqual(tree.childrenOf('L').map(g => g.id), ['a', 'b'], 'horizon 없는 옛 목표도 단기 목표로 읽힌다');
  assert.deepEqual(tree.loose.map(g => g.id), ['c', 'd'], '부모가 없어진 단기 목표는 «묶지 않은» 쪽으로');
  assert.equal(goalHorizon({}), 'short');
  assert.deepEqual(GOAL_LABELS, { long: '장기 목표', short: '단기 목표' });
});
