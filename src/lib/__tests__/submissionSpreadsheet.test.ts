import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpreadsheetPaste,
  spreadsheetText,
  validateSpreadsheetRows,
} from '../submissionSpreadsheet';
import {
  buildSubmissionMetaPatch,
  getSubmissionConfig,
  validateSubmissionConfig,
} from '../taskSubmissionConfig';
import { specSubmissionsToCsv } from '../taskSubmissionCsv';

test('Excel clipboard preserves Korean, empty cells, quotes and multiline cells', () => {
  assert.deepEqual(parseSpreadsheetPaste('국어\t"첫 줄\n둘째 줄"\r\n수학\t"따옴표 ""안녕"""\r\n'), [
    ['국어', '첫 줄\n둘째 줄'],
    ['수학', '따옴표 "안녕"'],
  ]);
  assert.deepEqual(parseSpreadsheetPaste('a\t\tb\t'), [['a', '', 'b', '']]);
});

test('text export escapes delimiters and neutralizes spreadsheet formulas', () => {
  const text = spreadsheetText([
    ['=HYPERLINK("https://example.test")', '001', 'a\tb', '한글\n두 줄'],
  ]);
  assert.ok(text.startsWith('"\'=HYPERLINK'));
  assert.deepEqual(
    parseSpreadsheetPaste(text).map((row) => row.slice(1)),
    [['001', 'a\tb', '한글\n두 줄']]
  );
  assert.equal(spreadsheetText([['  +cmd', '-1', '@SUM(A1)']]), "'  +cmd\t'-1\t'@SUM(A1)");
});

test('spreadsheet configuration preserves columns and defaults to private', () => {
  const columns = [{ key: 'subject', label: ' 과목 ' }];
  const submission = buildSubmissionMetaPatch({ required: true, mode: 'spreadsheet', columns });
  const config = getSubmissionConfig({ meta: { submission } });
  assert.equal(config.mode, 'spreadsheet');
  assert.equal(config.visibility, 'own');
  assert.deepEqual(config.columns, [{ key: 'subject', label: '과목' }]);
  assert.equal(getSubmissionConfig({ meta: {} }).mode, 'file');
});

test('column validation and existing submission modes prevent destructive edits', () => {
  const base = { required: true, mode: 'spreadsheet' as const, templateId: null, deadlineCount: 1 };
  assert.ok(validateSubmissionConfig({ ...base, columns: [] }).length);
  assert.ok(
    validateSubmissionConfig({
      ...base,
      columns: [
        { key: 'a', label: '과목' },
        { key: 'b', label: ' 과목 ' },
      ],
    }).length
  );
  assert.ok(
    validateSubmissionConfig({
      ...base,
      columns: [{ key: 'a', label: '과목' }],
      existingKinds: ['spec'],
    }).length
  );
  assert.deepEqual(
    validateSubmissionConfig({ ...base, columns: [{ key: 'a', label: '과목' }] }),
    []
  );
});

test('reject empty rows, oversized cells and malformed dimensions', () => {
  assert.equal(validateSpreadsheetRows([['국어', '']], 2), null);
  assert.ok(validateSpreadsheetRows([['', ' ']], 2));
  assert.ok(validateSpreadsheetRows([['국어']], 2));
  assert.ok(validateSpreadsheetRows([['가'.repeat(5001)]], 1));
  assert.ok(
    validateSpreadsheetRows(
      Array.from({ length: 501 }, () => ['a']),
      1
    )
  );
});

test('spec CSV exports actual nested values instead of row counts', () => {
  const csv = specSubmissionsToCsv(
    [
      {
        assignee_name: '교사',
        unit_key: null,
        submitted_at: '2026-09-10',
        plan: {
          rows: [
            { subject: '국어', count: 2 },
            { subject: '수학', count: 3 },
          ],
        },
        field_values: { note: '=1+1' },
      },
    ],
    [
      { key: 'rows', label: '자료' },
      { key: 'note', label: '비고' },
    ]
  );
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('국어') && csv.includes('수학'));
  assert.ok(!csv.includes('2행'));
  assert.ok(csv.includes("'=1+1"));
});
