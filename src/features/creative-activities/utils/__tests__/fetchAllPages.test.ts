import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchAllPages } from '../fetchAllPages';

test('1,000건을 넘는 목록과 마지막 페이지를 모두 읽는다', async () => {
  const source = Array.from({ length: 1593 }, (_, id) => id);
  const rows = await fetchAllPages(async (from, to) => ({
    data: source.slice(from, to + 1), error: null,
  }));
  assert.deepEqual(rows, source);
});

test('빈 목록과 페이지 크기의 배수인 목록에서도 종료한다', async () => {
  for (const length of [0, 500, 1000]) {
    let calls = 0;
    const source = Array.from({ length }, (_, id) => id);
    const rows = await fetchAllPages(async (from, to) => {
      calls++;
      return { data: source.slice(from, to + 1), error: null };
    });
    assert.deepEqual(rows, source);
    assert.equal(calls, length / 500 + 1);
  }
});

test('후속 페이지 실패 시 일부만 성공으로 반환하지 않는다', async () => {
  const error = new Error('page failed');
  await assert.rejects(fetchAllPages(async (from) => from === 0
    ? { data: Array(500).fill(0), error: null }
    : { data: null, error }), error);
});
