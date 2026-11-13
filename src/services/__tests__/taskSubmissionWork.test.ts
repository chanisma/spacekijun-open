import assert from 'node:assert/strict';
import { test } from 'node:test';

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: () => null, setItem: () => undefined, removeItem: () => undefined,
} });
const { getTaskSubmissionWork, ensureSubmissionAction } = await import('../taskSpecSubmissionService');

test('composer resolves saved workId without relying on the task-card snapshot', async () => {
  const filters: unknown[][] = [];
  const client = { from: (table: string) => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([table, key, value]); return query; },
      is: (key: string, value: unknown) => { filters.push([table, key, value]); return query; },
      single: async () => ({ data: { meta: { submission: { required: true, mode: 'spec', actionId: 'saved-work', guide: '최신 지침' } } }, error: null }),
      maybeSingle: async () => ({ data: { id: 'saved-work' }, error: null }),
    };
    return query;
  } };
  const result = await getTaskSubmissionWork('task-1', client as never);
  assert.equal(result.action.id, 'saved-work');
  assert.equal(result.config.guide, '최신 지침');
  assert.deepEqual(filters, [['task', 'id', 'task-1'], ['task_action', 'id', 'saved-work'],
    ['task_action', 'task_id', 'task-1'], ['task_action', 'action_type', 'document.spec_fill'], ['task_action', 'archived_at', null]]);
});

test('missing actionId is a configuration error, not an unrelated work fallback', async () => {
  let calls = 0;
  const query = { select: () => query, eq: () => query,
    single: async () => ({ data: { meta: { submission: { required: true, mode: 'spec', template: { id: 'tpl' } } } }, error: null }) };
  const client = { from: () => { calls++; return query; } };
  await assert.rejects(() => getTaskSubmissionWork('task-1', client as never), /연결이 완료되지/);
  assert.equal(calls, 1);
});

test('new submission work uses modes accepted by the database constraints', async () => {
  let inserted: Record<string, unknown> | undefined;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: (row: Record<string, unknown>) => { inserted = row; return query; },
        single: async () => {
          const valid = ['manual', 'assisted', 'automatic'].includes(String(inserted?.execution_mode))
            && ['none', 'automatic', 'human_review'].includes(String(inserted?.verification_mode));
          return valid ? { data: { id: 'new-work' }, error: null } : { data: null, error: { message: 'check constraint violation' } };
        },
      };
      return query;
    },
  };
  const id = await ensureSubmissionAction({ taskId: 'task-1', template: { id: 'tpl', familyId: 'family' } }, client as never);
  assert.equal(id, 'new-work');
  assert.equal(inserted?.task_id, 'task-1');
  assert.deepEqual(inserted?.config, { origin: 'submission', defaultTemplate: { id: 'tpl', name: null, familyId: 'family' } });
});
