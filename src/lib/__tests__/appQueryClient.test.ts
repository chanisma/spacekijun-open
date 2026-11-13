import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryObserver } from '@tanstack/react-query';
import { AppQueryClient } from '../appQueryClient';

test('saving a schedule refreshes an active dashboard before invalidation resolves', async () => {
  const client = new AppQueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  let title = 'before';
  client.setQueryData(['today-meetings'], title);
  const observer = new QueryObserver(client, { queryKey: ['today-meetings'], queryFn: async () => title });
  const unsubscribe = observer.subscribe(() => {});
  try {
    title = 'after';
    await client.invalidateQueries({ queryKey: ['schedule-events'] });
    assert.equal(observer.getCurrentResult().data, 'after');
  } finally { unsubscribe(); client.clear(); }
});

test('exact invalidation preserves other records under the same root and unrelated screens', async () => {
  const client = new AppQueryClient();
  for (const key of [['work-detail-jsonb', 'a'], ['work-detail-jsonb', 'b'], ['my-tasks-jsonb'], ['documents']]) {
    client.setQueryData(key, 'cached');
  }
  await client.invalidateQueries({ queryKey: ['work-detail-jsonb', 'a'], exact: true, refetchType: 'none' });
  assert.equal(client.getQueryState(['work-detail-jsonb', 'a'])?.isInvalidated, true);
  assert.equal(client.getQueryState(['my-tasks-jsonb'])?.isInvalidated, true);
  assert.equal(client.getQueryState(['work-detail-jsonb', 'b'])?.isInvalidated, false);
  assert.equal(client.getQueryState(['documents'])?.isInvalidated, false);
  client.clear();
});

test('inactive dependent screens become stale without recursively invalidating all resources', async () => {
  const client = new AppQueryClient();
  for (const root of ['course_offering', 'resource-select', 'school-life-assignment-courses', 'resources']) {
    client.setQueryData([root], []);
  }
  await client.invalidateQueries({ queryKey: ['course_offering'] });
  assert.equal(client.getQueryState(['school-life-assignment-courses'])?.isInvalidated, true);
  assert.equal(client.getQueryState(['resource-select'])?.isInvalidated, true);
  assert.equal(client.getQueryState(['resources'])?.isInvalidated, false);
  client.clear();
});

test('caller predicates still restrict related queries', async () => {
  const client = new AppQueryClient();
  client.setQueryData(['today-meetings', 'a'], []);
  client.setQueryData(['today-meetings', 'b'], []);
  await client.invalidateQueries({ queryKey: ['schedule-events'], predicate: query => query.queryKey[1] === 'a' });
  assert.equal(client.getQueryState(['today-meetings', 'a'])?.isInvalidated, true);
  assert.equal(client.getQueryState(['today-meetings', 'b'])?.isInvalidated, false);
  client.clear();
});

test('queries without a dependency family keep standard QueryClient behavior', async () => {
  const client = new AppQueryClient();
  client.setQueryData(['documents'], []);
  client.setQueryData(['schedule-events'], []);
  await client.invalidateQueries({ queryKey: ['documents'] });
  assert.equal(client.getQueryState(['documents'])?.isInvalidated, true);
  assert.equal(client.getQueryState(['schedule-events'])?.isInvalidated, false);
  client.clear();
});
