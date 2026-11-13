import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHwpxSection } from '../hwpxIndex';
import type { RowGroupTarget, WorkSpec } from '../types';
import type { ChatFn } from '../llm';

// The UI helper's default chat import expects browser storage; tests inject their own chat.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(),
} });
const { suggestSpecMeta } = await import('../../../components/SpecEditColumn');

const target: RowGroupTarget = {
  id: 'schedule', kind: 'rowGroup', label: '운영 일정', instruction: '활동별로 작성',
  rowSource: 'plan.activities',
  locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [1, 1], cols: [1, 3, 5, 7] },
  rowSchema: [
    { col: 1, kind: 'scalar', source: 'row.date', instruction: ' ' },
    { col: 3, kind: 'computed', formula: 'row.cost * row.count' },
    { col: 5, kind: 'prose', instruction: '사람이 쓴 지침', source: 'row.description' },
    { col: 7, kind: 'keep' },
  ],
};
const spec: WorkSpec = { specVersion: 1, documentType: 'STEAM 운영계획서', contextExample: '내 예시', targets: [target] };
const cell = (r: number, c: number, text: string) => `<hp:tc><hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p><hp:cellAddr rowAddr="${r}" colAddr="${c}"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc>`;
const indexes = [parseHwpxSection(`<hp:tbl rowCnt="2" colCnt="8"><hp:tr>${cell(0, 1, '실시일')}${cell(0, 3, '예산')}</hp:tr><hp:tr>${cell(1, 1, '9월 7일')}${cell(1, 3, '30,000원')}</hp:tr></hp:tbl>`)];

test('column-only gaps trigger AI; column numbers map suggestions without changing existing rules', async () => {
  const prompts: string[] = [];
  const chat: ChatFn = async ({ userPrompt }) => {
    prompts.push(userPrompt);
    return JSON.stringify([{ id: 'schedule', label: '덮어쓰기', instruction: '덮어쓰기', confidence: 1, rowSchema: [
      { col: 3, instruction: '금액은 원 단위로 표시한다.', formula: '0' },
      { col: 1, instruction: '실시일을 월·일로 작성한다.' },
      { col: 5, instruction: '기존 지침 변경' }, { col: 7, instruction: '유지 열 변경' },
      { col: 99, instruction: '없는 열' }, null, { col: '1', instruction: '잘못된 열번호' },
    ] }]);
  };
  const result = await suggestSpecMeta(spec, indexes, chat);
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes('실시일'));
  assert.ok(prompts[0].includes('9월 7일'));
  assert.ok(prompts[0].includes('"col":3'));
  assert.equal(result.count, 2);
  const updated = result.spec.targets[0] as RowGroupTarget;
  assert.equal(updated.label, target.label);
  assert.equal(updated.instruction, target.instruction);
  assert.equal(updated.rowSchema[0].instruction, '실시일을 월·일로 작성한다.');
  assert.equal(updated.rowSchema[1].instruction, '금액은 원 단위로 표시한다.');
  assert.equal(updated.rowSchema[1].formula, target.rowSchema[1].formula);
  assert.deepEqual(updated.rowSchema.slice(2), target.rowSchema.slice(2));
  assert.equal(target.rowSchema[0].instruction, ' ');
  await suggestSpecMeta(result.spec, indexes, chat);
  assert.equal(prompts.length, 1, 'completed column instructions must not trigger another request');
});

test('unknown and malformed column suggestions do not count as changes', async () => {
  const chat: ChatFn = async () => JSON.stringify([{ id: 'schedule', rowSchema: [
    { col: 99, instruction: 'unknown' }, { col: 1, instruction: {} }, { col: 3, instruction: '  ' },
  ] }]);
  const result = await suggestSpecMeta(spec, indexes, chat);
  assert.equal(result.count, 0);
  assert.equal(result.spec, spec);
});
