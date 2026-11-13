/** Text-only spreadsheet interchange. Never evaluate user input as a formula. */
export function spreadsheetCell(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function spreadsheetText(rows: unknown[][], delimiter = '\t'): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const raw = spreadsheetCell(value);
          const safe = /^[\s]*[=+@-]/.test(raw) || /^[\t\r]/.test(raw) ? `'${raw}` : raw;
          return safe.includes(delimiter) || /["\r\n]/.test(safe)
            ? `"${safe.replace(/"/g, '""')}"`
            : safe;
        })
        .join(delimiter)
    )
    .join('\r\n');
}

/** Parse quoted Excel/Sheets clipboard cells, including embedded line breaks. */
export function parseSpreadsheetPaste(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || !cell)) {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === '\t' || c === '\n' || c === '\r')) {
      rows[rows.length - 1].push(cell);
      cell = '';
      if (c !== '\t') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        rows.push([]);
      }
    } else cell += c;
  }
  rows[rows.length - 1].push(cell);
  if (rows.length > 1 && rows[rows.length - 1]?.length === 1 && rows[rows.length - 1]?.[0] === '')
    rows.pop();
  return rows;
}

export function validateSpreadsheetRows(rows: string[][], columnCount: number): string | null {
  if (!columnCount || rows.length < 1 || rows.length > 500) return '1~500행을 입력해 주세요.';
  if (rows.some((row) => row.length !== columnCount || row.some((cell) => cell.length > 5000)))
    return '컬럼 수를 확인하고 셀은 5,000자 이내로 입력해 주세요.';
  if (rows.some((row) => row.every((cell) => !cell.trim())))
    return '빈 행을 채우거나 삭제해 주세요.';
  return null;
}
