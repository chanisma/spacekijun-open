import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHwpxSection, renumberRowXml } from '../hwpxIndex';
import { replaceTableRows, validateTableGrid } from '../tableRows';
import { fillDocument } from '../engine';
import type { WorkSpec } from '../types';
import { derivePlanSchema, planSchemaPrompt, validatePlan } from '../planSchema';
import { generatePlan, splitSeedRows } from '../llm';
import { resolvePrompt } from '../promptMode';
import { repeatReplacementRange } from '../repeatRegion';

const cell = (r: number, c: number, span = 1, cols = 1, text = '값', nested = '') =>
  `<hp:tc><hp:subList><hp:p><hp:run><hp:t>${text}</hp:t>${nested}</hp:run></hp:p></hp:subList><hp:cellAddr rowAddr="${r}" colAddr="${c}"/><hp:cellSpan rowSpan="${span}" colSpan="${cols}"/><hp:cellSz width="100" height="${span * 100}"/></hp:tc>`;
const row = (...cells: string[]) => `<hp:tr>${cells.join('')}</hp:tr>`;
const table = (cols: number, ...rows: string[]) => `<hp:tbl rowCnt="${rows.length}" colCnt="${cols}">${rows.join('')}</hp:tbl>`;
const index = (xml: string) => parseHwpxSection(xml).tables[0];
const replace = (xml: string, count: number, range: [number, number] = [1, 2], template = 0, keep: number[] = []) =>
  replaceTableRows(xml, index(xml), range, keep, template, count, [1], (fragment, i) => fragment.replace('값', `생성${i}`));
const merged = table(2, row(cell(0, 0), cell(0, 1)), row(cell(1, 0, 2, 1, '분류'), cell(1, 1)), row(cell(2, 1)), row(cell(3, 0), cell(3, 1)));

for (const count of [0, 1, 2, 4]) test(`shared vertical label survives ${count} generated rows`, () => {
  const out = replace(merged, count);
  const t = index(out);
  validateTableGrid(t);
  const outputCount = Math.ceil(count / 2) * 2;
  assert.equal(t.rowCnt, outputCount + 2);
  const labels = t.rows.flatMap((r) => r.cells).filter((c) => c.text === '분류');
  assert.equal(labels.length, Math.ceil(count / 2));
  if (count) assert.equal(labels[0].span.rows, 2);
  assert.equal(t.rows.at(-1)!.cells[0].addr.row, outputCount + 1);
});

test('merge starting above and ending below range expands and shrinks', () => {
  const xml = table(2, row(cell(0, 0, 4, 1, '분류'), cell(0, 1)), row(cell(1, 1)), row(cell(2, 1)), row(cell(3, 1)));
  for (const count of [0, 1, 4]) assert.equal(index(replace(xml, count)).rows[0].cells[0].span.rows, Math.ceil(count / 2) * 2 + 2);
});

test('template in continuation row retains anchor and horizontal merge', () => {
  const xml = table(3, row(cell(0, 0, 2, 2, '분류'), cell(0, 2)), row(cell(1, 2)));
  const out = replaceTableRows(xml, index(xml), [0, 1], [], 1, 4, [2], (s) => s);
  assert.equal(index(out).rows[0].cells[0].span.cols, 2);
  assert.equal(index(out).rows[0].cells[0].span.rows, 2);
  assert.equal(index(out).rows[1].cells.length, 1);
});

test('preserved row remains covered by shared merge', () => {
  const xml = table(2, row(cell(0, 0, 3, 1, '분류'), cell(0, 1)), row(cell(1, 1)), row(cell(2, 1, 1, 1, '합계')));
  const out = replace(xml, 4, [0, 2], 0, [2]);
  assert.equal(index(out).rows[0].cells[0].span.rows, 5);
  assert.equal(index(out).rows[4].cells[0].text, '합계');
});

test('partial merge rejects resizing but preserves fixed row structures', () => {
  const xml = table(2, row(cell(0, 0, 2), cell(0, 1)), row(cell(1, 1)), row(cell(2, 0), cell(2, 1)));
  assert.throws(() => replace(xml, 4, [1, 2]), /병합 영역/);
  assert.equal(index(replace(xml, 3, [0, 2])).rows[0].cells[0].span.rows, 2);
});

test('merged column receives all covered data indexes once', () => {
  const mergedIndexes: number[][] = [];
  const out = replaceTableRows(merged, index(merged), [1, 2], [], 0, 4, [0, 1], (s, _i, indexes) => {
    if (indexes) mergedIndexes.push(indexes);
    return s;
  });
  validateTableGrid(index(out));
  assert.deepEqual(mergedIndexes, [[0, 1], [2, 3]]);
});

test('nested table addresses are untouched by renumber and repeat', () => {
  const nested = table(1, row(cell(0, 0)), row(cell(1, 0)));
  const fragment = row(cell(0, 0, 1, 1, 'outer', nested));
  assert.ok(renumberRowXml(fragment, 7).includes(nested));
  const xml = table(1, fragment);
  const out = replaceTableRows(xml, index(xml), [0, 0], [], 0, 3, [], (s) => s);
  const tables = parseHwpxSection(out).tables;
  assert.equal(tables.length, 4);
  tables.forEach(validateTableGrid);
});

test('grid validator rejects overlap, holes and out of bounds spans', () => {
  for (const xml of [table(2, row(cell(0, 0), cell(0, 0))), table(2, row(cell(0, 0))), table(1, row(cell(0, 0, 2)))]) {
    assert.throws(() => validateTableGrid(index(xml)));
  }
});

test('cell heights, table height and zone coordinates follow row count', () => {
  const xml = merged.replace('colCnt="2">', 'colCnt="2"><hp:sz height="400"/><hp:cellzoneList><hp:cellZone startRowAddr="3" endRowAddr="3"/></hp:cellzoneList>');
  const out = replace(xml, 4);
  assert.ok(out.includes('<hp:sz height="600"/>'));
  assert.ok(out.includes('startRowAddr="5" endRowAddr="5"'));
  const label = index(out).rows[1].cells[0];
  assert.ok(out.slice(label.start, label.end).includes('height="200"'));
});

test('failed structural edit leaves the input section intact', async () => {
  const spec: WorkSpec = { specVersion: 1, documentType: 'STEAM', targets: [{
    id: 'r', kind: 'rowGroup', rowSource: 'plan.items',
    locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [1, 2] },
    rowSchema: [{ col: 0, kind: 'scalar', source: 'row.content' }],
  }] };
  const invalid = merged.replace('rowSpan="2"', 'rowSpan="9"');
  const result = await fillDocument([invalid], { spec, plan: { items: [{ content: 'a' }, { content: 'b' }, { content: 'c' }] } });
  assert.equal(result.report.at(-1)?.status, 'error');
  assert.equal(result.sections[0], invalid);
});

test('fillDocument fills ordinary cells and keeps shared label', async () => {
  const spec: WorkSpec = { specVersion: 1, documentType: 'STEAM 운영계획서', targets: [{
    id: 'activities', kind: 'rowGroup', rowSource: 'plan.activities',
    locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [1, 2] },
    rowSchema: [{ col: 1, kind: 'scalar', source: 'row.content' }],
  }] };
  const result = await fillDocument([merged], { spec, plan: { activities: [
    { content: '탐구' }, { content: '설계' }, { content: '실험' },
  ] } });
  assert.equal(result.report.find((r) => r.targetId === 'activities')?.status, 'filled');
  const t = index(result.sections[0]);
  validateTableGrid(t);
  assert.equal(t.rows[1].cells[0].text, '분류');
  assert.deepEqual(t.rows.slice(1, 4).map((r) => r.cells.at(-1)!.text), ['탐구', '설계', '실험']);
});

const annual = table(4,
  row(cell(0, 0, 1, 1, '월'), cell(0, 1, 1, 1, '주'), cell(0, 2, 1, 1, '차시'), cell(0, 3, 1, 1, '내용')),
  row(cell(1, 0, 4, 1, '연간'), cell(1, 1, 2, 1, '상반기'), cell(1, 2), cell(1, 3)),
  row(cell(2, 2), cell(2, 3)),
  row(cell(3, 1, 2, 1, '하반기'), cell(3, 2), cell(3, 3)),
  row(cell(4, 2), cell(4, 3)),
  row(cell(5, 0), cell(5, 1), cell(5, 2), cell(5, 3)),
);

for (const count of [0, 1, 2, 3, 4, 5, 6, 8]) test(`annual plan: global merge, pair merges and ordinary cells with ${count} rows`, () => {
  const out = replaceTableRows(annual, index(annual), [1, 4], [], 1, count, [2, 3], (s) => s);
  const t = index(out);
  validateTableGrid(t);
  const outputCount = Math.ceil(count / 4) * 4;
  assert.equal(t.rowCnt, outputCount + 2);
  const cells = t.rows.slice(1, outputCount + 1).flatMap((r) => r.cells);
  const global = cells.filter((c) => c.addr.col === 0);
  assert.equal(global.length, Math.ceil(count / 4));
  if (count) assert.equal(global[0].span.rows, 4);
  const pairs = cells.filter((c) => c.addr.col === 1);
  assert.equal(pairs.length, outputCount / 2);
  pairs.forEach((c, i) => {
    assert.equal(c.addr.row, 1 + i * 2);
    assert.equal(c.span.rows, 2);
    assert.equal(c.text, i % 2 === 0 ? '상반기' : '하반기');
  });
  for (const col of [2, 3]) assert.equal(cells.filter((c) => c.addr.col === col).length, outputCount);
  assert.equal(t.rows.at(-1)!.cells[0].addr.row, outputCount + 1);
});

for (const count of [4, 7]) test(`fillDocument writes all columns in complex merges (${count} rows)`, async () => {
  const spec: WorkSpec = { specVersion: 1, documentType: '방과후학교 연간운영계획서', targets: [{
    id: 'annual', kind: 'rowGroup', rowSource: 'plan.activities',
    locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [1, 4] },
    rowSchema: [0, 1, 2, 3].map((col) => ({ col, kind: 'scalar', source: `row.c${col}` })),
  }] };
  const activities = Array.from({ length: count }, (_, i) => ({
    c0: '연간 운영', c1: `묶음${Math.floor(i / 2)}`, c2: `활동${i}`, c3: `시기${i}`,
  }));
  const result = await fillDocument([annual], { spec, plan: { activities } });
  assert.equal(result.report.at(-1)?.status, 'filled', JSON.stringify(result.report));
  const t = index(result.sections[0]);
  validateTableGrid(t);
  assert.equal(t.rows[1].cells[0].text, '연간 운영');
  for (let i = 0; i < count; i++) {
    const rowCells = t.rows[i + 1].cells;
    assert.equal(rowCells.find((c) => c.addr.col === 2)?.text, `활동${i}`);
    assert.equal(rowCells.find((c) => c.addr.col === 3)?.text, `시기${i}`);
    if (i % 2 === 0) assert.equal(rowCells.find((c) => c.addr.col === 1)?.text, `묶음${i / 2}`);
  }
});

test('conflicting parent values cannot be concatenated into one merged cell', async () => {
  const spec: WorkSpec = { specVersion: 1, documentType: '연간운영', targets: [{
    id: 'r', kind: 'rowGroup', rowSource: 'plan.items',
    locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [1, 4] },
    rowSchema: [{ col: 1, kind: 'scalar', source: 'row.value' }],
  }] };
  const result = await fillDocument([annual], { spec, plan: { items: [
    { value: '첫 활동' }, { value: '다음 활동' }, { value: '공통 활동' }, { value: '공통 활동' },
  ] } });
  assert.equal(result.report.at(-1)?.status, 'error');
  assert.match(result.report.at(-1)?.detail ?? '', /상위 항목/);
  assert.equal(result.sections[0], annual);
});

test('crossing two-row and three-row groups preserve their own boundaries', () => {
  const xml = table(4, ...Array.from({ length: 6 }, (_, r) => row(
    ...(r === 0 ? [cell(r, 0, 6)] : []),
    ...(r % 2 === 0 ? [cell(r, 1, 2)] : []),
    ...(r % 3 === 0 ? [cell(r, 2, 3)] : []),
    cell(r, 3),
  )));
  const out = replaceTableRows(xml, index(xml), [0, 5], [], 0, 9, [3], (s) => s);
  const t = index(out);
  validateTableGrid(t);
  const cells = t.rows.flatMap((r) => r.cells);
  assert.deepEqual(cells.filter((c) => c.addr.col === 1).map((c) => c.span.rows), [2, 2, 2, 2, 2, 2]);
  assert.deepEqual(cells.filter((c) => c.addr.col === 2).map((c) => c.span.rows), [3, 3, 3, 3]);
  assert.equal(t.rows[0].cells[0].span.rows, 6);
  assert.equal(t.rows[6].cells[0].span.rows, 6);
});

const hierarchySpec: WorkSpec = { specVersion: 1, documentType: '방과후학교 연간운영계획서', targets: [{
  id: 'annual', kind: 'rowGroup', repeatUnit: 'block', rowSource: 'plan.activities',
  locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [1, 4] },
  rowSchema: [0, 1, 2, 3].map((col) => ({ col, kind: 'scalar', source: `row.c${col}` })),
}] };
const monthRows = Array.from({ length: 8 }, (_, i) => ({
  c0: i < 4 ? '3월' : '4월', c1: `${Math.floor(i % 4 / 2) + 1}주`,
  c2: `${i % 2 + 1}차시`, c3: `활동 ${i + 1}`,
}));

test('two months repeat the complete selected shape with separate month/week/session owners', async () => {
  const result = await fillDocument([annual], { spec: hierarchySpec, plan: { activities: monthRows } });
  assert.equal(result.report.at(-1)?.status, 'filled', JSON.stringify(result.report));
  const t = index(result.sections[0]);
  assert.equal(t.rowCnt, 10);
  assert.equal(t.rows[1].cells[0].text, '3월');
  assert.equal(t.rows[5].cells[0].text, '4월');
  const shape = (rows: typeof t.rows, offset: number) => rows.map((r) => r.cells.map((c) => ({
    row: c.addr.row - offset, col: c.addr.col, span: c.span,
  })));
  const originalShape = shape(index(annual).rows.slice(1, 5), 1);
  assert.deepEqual(shape(t.rows.slice(1, 5), 1), originalShape);
  assert.deepEqual(shape(t.rows.slice(5, 9), 5), originalShape);
  assert.deepEqual([1, 3, 5, 7].map((r) => t.rows[r].cells.find((c) => c.addr.col === 1)?.text), ['1주', '2주', '1주', '2주']);
});

test('generation schema derives containment and retries contradictory parent values', async () => {
  const schema = derivePlanSchema(hierarchySpec, [annual]);
  const block = schema[0].repeatBlock!;
  assert.equal(block.rows, 4);
  assert.equal(block.cells.find((c) => c.key === 'c1')?.parent, 'c0');
  assert.equal(block.cells.find((c) => c.key === 'c2')?.parent, 'c1');
  assert.ok(planSchemaPrompt(schema).includes('월'));
  assert.ok(planSchemaPrompt(schema).includes('상위 c1에 포함'));
  assert.deepEqual(validatePlan(schema, { activities: monthRows }), []);
  assert.ok(validatePlan(schema, { activities: monthRows.slice(0, 7) }).some((e) => e.includes('완전한 반복 묶음')));
  const conflicting = monthRows.map((r, i) => i === 1 ? { ...r, c0: '5월' } : r);
  let calls = 0;
  const result = await generatePlan(async ({ userPrompt }) => {
    calls++;
    const prompt = resolvePrompt(userPrompt, 'luna');
    assert.ok(prompt.includes('선택 영역 전체 4행'));
    if (calls === 2) assert.ok(prompt.includes('상위 값이 병합 구역 안에서 달라짐'));
    return JSON.stringify({ activities: calls === 1 ? conflicting : monthRows });
  }, hierarchySpec, schema, {}, '3월과 4월 계획을 작성', 1);
  assert.equal(calls, 2);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.plan.activities, monthRows);
});

test('long generation batches never cut through a month repeat unit', () => {
  const batches = splitSeedRows(monthRows, 100, 4);
  assert.deepEqual(batches.map((b) => [b.offset, b.rows.length]), [[0, 4], [4, 4]]);
  assert.deepEqual(batches.flatMap((b) => b.rows), monthRows);
});

test('one template row replaces all three old examples and preserves the summary', async () => {
  const xml = table(2,
    row(cell(0, 0, 1, 1, '활동'), cell(0, 1, 1, 1, '시기')),
    ...[1, 2, 3].map((r) => row(cell(r, 0, 1, 1, `옛활동${r}`), cell(r, 1, 1, 1, `옛시기${r}`))),
    row(cell(4, 0, 1, 1, '합계'), cell(4, 1, 1, 1, '보존')),
  );
  const spec: WorkSpec = { specVersion: 1, documentType: '계획', targets: [{
    id: 'r', kind: 'rowGroup', rowSource: 'plan.items',
    locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [2, 2] },
    rowSchema: [{ col: 0, kind: 'scalar', source: 'row.activity' }, { col: 1, kind: 'scalar', source: 'row.when' }],
  }] };
  assert.deepEqual(repeatReplacementRange(xml, index(xml), [2, 2], [0, 1]), [1, 3]);
  const items = Array.from({ length: 5 }, (_, i) => ({ activity: `새활동${i}`, when: `새시기${i}` }));
  const result = await fillDocument([xml], { spec, plan: { items } });
  assert.equal(result.report.at(-1)?.status, 'filled', JSON.stringify(result.report));
  const t = index(result.sections[0]);
  assert.equal(t.rowCnt, 7);
  assert.equal(t.rows.at(-1)!.cells[0].text, '합계');
  assert.ok(!result.sections[0].includes('옛활동') && !result.sections[0].includes('옛시기'));
  assert.deepEqual(t.rows.slice(1, 6).map((r) => r.cells[0].text), items.map((i) => i.activity));
});

test('a middle selection also replaces preceding examples in a table without a header', () => {
  const xml = table(2, ...[0, 1, 2].map((r) => row(cell(r, 0, 1, 1, `예시${r}`), cell(r, 1))));
  assert.deepEqual(repeatReplacementRange(xml, index(xml), [1, 1], [0, 1]), [0, 2]);
});

for (const count of [1, 5]) test(`new lesson rows remain inside their original month and week (${count})`, async () => {
  const spec: WorkSpec = { specVersion: 1, documentType: '월별 계획', targets: [{
    id: 'r', kind: 'rowGroup', rowSource: 'plan.items',
    locator: { kind: 'rowGroup', section: 0, table: { index: 0 }, rows: [2, 2], cols: [2, 3] },
    rowSchema: [{ col: 2, kind: 'scalar', source: 'row.lesson' }, { col: 3, kind: 'scalar', source: 'row.content' }],
  }] };
  assert.deepEqual(repeatReplacementRange(annual, index(annual), [2, 2], [2, 3]), [1, 2]);
  const result = await fillDocument([annual], { spec, plan: { items: Array.from({ length: count }, (_, i) => ({ lesson: `차시${i}`, content: `내용${i}` })) } });
  assert.equal(result.report.at(-1)?.status, 'filled', JSON.stringify(result.report));
  const t = index(result.sections[0]);
  validateTableGrid(t);
  assert.equal(t.rows[1].cells[0].span.rows, count + 2, 'month contains updated first week plus original next week');
  assert.equal(t.rows[1].cells[1].span.rows, count, 'all generated lessons belong to the same week');
  assert.equal(t.rows[count + 1].cells[0].text, '하반기', 'next group is untouched');
  assert.equal(t.rows[count + 1].cells[0].span.rows, 2);
  const schema = derivePlanSchema(spec, [annual]);
  assert.equal(schema[0].repeatBlock?.rows, 1, 'replacement rows do not change the template unit');
  assert.ok(planSchemaPrompt(schema).includes('상위 병합 구역'));
});
