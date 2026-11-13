import { spreadsheetCell, spreadsheetText } from './submissionSpreadsheet';
// 제출 현황 → CSV (2026-09-03). **순수 모듈**이라 회귀 테스트에서 그대로 쓴다.
//
// 서비스(`taskSpecSubmissionService`)가 아니라 여기 있는 이유: CSV 조립은 HWPX 엔진·supabase와
// 아무 상관이 없는데, 서비스에 두면 테스트가 그 무거운 의존 사슬을 통째로 끌고 온다
// (실제로 `.hwpx` 에셋 import 때문에 Node 에서 죽었다).

/** 분석 뷰 행 중 CSV 가 실제로 쓰는 부분만 */
export interface SpecSubmissionCsvRow {
  assignee_name: string | null;
  unit_key: string | null;
  submitted_at: string;
  plan: Record<string, unknown>;
  field_values: Record<string, unknown>;
  row_values?: Record<string, unknown>;
}

/** Expand repeated/nested values into named columns so every value is usable in Excel. */
export function specSubmissionData(
  rows: SpecSubmissionCsvRow[],
  columns: { key: string; label: string }[]
) {
  const values = rows.map((row) => ({
    ...row.plan,
    ...row.field_values,
    ...Object.fromEntries(
      Object.entries(row.row_values ?? {}).map(([key, value]) => [`반복표:${key}`, value])
    ),
  }));
  const roots = new Map(columns.map((c) => [c.key, c.label]));
  for (const row of values)
    for (const key of Object.keys(row)) if (!roots.has(key)) roots.set(key, key);
  const labels = new Map<string, string>();
  const flat = values.map((row) => {
    const result: Record<string, string> = {};
    const visit = (value: unknown, path: string[], label: string) => {
      const entries = value !== null && typeof value === 'object' ? Object.entries(value) : [];
      if (entries.length) {
        for (const [key, cell] of entries)
          visit(cell, [...path, key], `${label} · ${Array.isArray(value) ? Number(key) + 1 : key}`);
      } else {
        const key = JSON.stringify(path);
        labels.set(key, label);
        result[key] = spreadsheetCell(value);
      }
    };
    for (const [key, label] of roots)
      if (Object.prototype.hasOwnProperty.call(row, key)) visit(row[key], [key], label);
    return result;
  });
  // Group fields by schema order even when an optional value first appears in a later row.
  const ordered = [...labels].sort(
    ([a], [b]) =>
      [...roots.keys()].indexOf(JSON.parse(a)[0]) - [...roots.keys()].indexOf(JSON.parse(b)[0])
  );
  return { columns: ordered.map(([key, label]) => ({ key, label })), values: flat };
}

/**
 * 담당자 × 필드 표를 CSV 로.
 *
 * 엑셀에서 바로 열리도록 **BOM 을 붙인다** — 없으면 한글이 cp949 로 해석돼 깨진다.
 */
export function specSubmissionsToCsv(
  rows: SpecSubmissionCsvRow[],
  columns: { key: string; label: string }[]
): string {
  const data = specSubmissionData(rows, columns);
  const head = ['담당자', '단위', '제출 시각', ...data.columns.map((c) => c.label)];
  const body = rows.map((r, index) => [
    r.assignee_name ?? '',
    r.unit_key ?? '',
    new Date(r.submitted_at).toLocaleString('ko-KR'),
    ...data.columns.map((c) => data.values[index][c.key] ?? ''),
  ]);
  // BOM 은 **이스케이프로 적는다** — 리터럴 U+FEFF 는 눈에 안 보여 lint(no-irregular-whitespace)에
  // 걸리고, 읽는 사람도 왜 있는지 알 수 없다
  return `\ufeff${spreadsheetText([head, ...body], ',')}`;
}
