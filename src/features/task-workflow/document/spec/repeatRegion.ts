import type { TableNode } from './hwpxIndex';

/** A one-row selection is the template, not necessarily the entire old data range.
 * Stop at structural changes, header/total rows, and the nearest enclosing merge.
 */
export function repeatReplacementRange(
  xml: string, table: TableNode, selected: [number, number], columns: number[],
): [number, number] {
  const [first, last] = selected;
  if (first !== last) return selected;
  const cells = table.rows.flatMap((r) => r.cells);
  const owners = (r: number) => cells.filter((c) => c.addr.row <= r && r < c.addr.row + c.span.rows);
  const containers = owners(first).filter((c) => c.span.rows > 1);
  const low = Math.max(0, ...containers.map((c) => c.addr.row));
  const high = Math.min(table.rows.length - 1, ...containers.map((c) => c.addr.row + c.span.rows - 1));
  const shape = (r: number) => owners(r).map((c) =>
    `${c.addr.col}:${c.span.cols}:${c.span.rows > 1 ? `${c.start}` : 'cell'}`,
  ).sort().join('|');
  const signature = shape(first);
  const isBoundary = (r: number) => table.rows[r].cells.some((c) => {
    const open = xml.slice(c.start, xml.indexOf('>', c.start) + 1);
    return /\bheader="1"/.test(open) || /^(합계|총계|소계|총액|계)(?:\s|[:：]|$)/.test(c.text.trim());
  }) || (r === 0 && table.rows[r].cells.some((c) => /^(월|주|차시|활동|내용|시기|순|순번|연번|번호|일시|기간|구분|비고|항목|품목|단원|수량|금액)$/.test(c.text.trim())));
  const compatible = (r: number) => !isBoundary(r) && shape(r) === signature
    && columns.every((col) => owners(r).some((c) => c.addr.col <= col && col < c.addr.col + c.span.cols));
  let a = first;
  let b = last;
  while (a > low && compatible(a - 1)) a--;
  while (b < high && compatible(b + 1)) b++;
  return [a, b];
}
