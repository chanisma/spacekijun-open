import {
  applyEdits, editCellAttribute, editSetRowCnt, parseHwpxSection,
  renumberRowXml, type CellNode, type Edit, type TableNode,
} from './hwpxIndex';

function cellHeight(xml: string, cell: CellNode): number | undefined {
  const own = applyEdits(xml.slice(cell.start, cell.end), cell.tables
    .filter((t) => !cell.tables.some((parent) => parent !== t && parent.start < t.start && t.end < parent.end))
    .map((t) => ({ start: t.start - cell.start, end: t.end - cell.start, text: '' })));
  const match = /<hp:cellSz\b[^>]*\bheight="(\d+)"/.exec(own);
  return match ? Number(match[1]) : undefined;
}

/** Every logical position must have exactly one owner, including merged cells. */
export function validateTableGrid(table: TableNode): void {
  if (!Number.isInteger(table.colCnt) || table.colCnt < 1 || table.rowCnt !== table.rows.length) {
    throw new Error('표의 행·열 개수가 실제 구조와 일치하지 않습니다.');
  }
  const occupied = new Set<string>();
  table.rows.forEach((row, index) => row.cells.forEach((cell) => {
    const { row: r, col: c } = cell.addr;
    const { rows, cols } = cell.span;
    if (![r, c, rows, cols].every(Number.isInteger) || r !== index || c < 0 || rows < 1 || cols < 1
      || r + rows > table.rowCnt || c + cols > table.colCnt) {
      throw new Error(`표 셀 주소 또는 병합 범위 오류: (${r}, ${c})`);
    }
    for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) {
      const key = `${y},${x}`;
      if (occupied.has(key)) throw new Error(`표의 병합 셀이 겹칩니다: (${y}, ${x})`);
      occupied.add(key);
    }
  }));
  if (occupied.size !== table.rowCnt * table.colCnt) throw new Error('표에 셀이 덮지 않는 빈 영역이 있습니다.');
}

/** Replace a row interval while keeping vertical labels as single cells. */
export function replaceTableRows(
  xml: string, table: TableNode, range: [number, number], keepRows: number[],
  templateOffset: number, count: number, writableColumns: number[],
  fill: (fragment: string, index: number, mergedIndexes?: number[]) => string,
  repeatUnit: 'block' | 'row' = 'block',
  selectedRange?: [number, number],
): string {
  validateTableGrid(table);
  const [a, b] = range;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= table.rows.length || a > b) {
    throw new Error('기존 예시 대체 구간이 표 범위를 벗어났습니다.');
  }
  const kept = [...new Set(keepRows)].filter((r) => r >= a && r <= b).sort((x, y) => x - y);
  const templateRange = selectedRange ?? range;
  if (templateRange[0] < a || templateRange[1] > b || templateRange[0] > templateRange[1]) {
    throw new Error('반복 원본은 기존 예시 대체 구간 안에 있어야 합니다.');
  }
  const template = templateRange[0] + templateOffset;
  if (!Number.isInteger(template) || template < a || template > b || kept.includes(template)) {
    throw new Error('반복 원본 행은 보존 행을 제외한 반복 구간 안에 있어야 합니다.');
  }
  const dataOrigins = table.rows.map((_, i) => i).filter((i) => i >= a && i <= b && !kept.includes(i));
  const templateOrigins = dataOrigins.filter((i) => i >= templateRange[0] && i <= templateRange[1]);
  const inputCount = count;
  // A selected region is one complete repeat unit, including every internal merge.
  const blockSize = repeatUnit === 'row' || kept.length ? 1 : templateOrigins.length;
  count = Math.ceil(count / blockSize) * blockSize;
  const fixedShape = count === dataOrigins.length && kept.length === 0 && templateOrigins.length === dataOrigins.length;
  const shared: CellNode[] = [];
  const grouped: CellNode[] = [];
  for (const cell of table.rows.flatMap((r) => r.cells)) {
    const start = cell.addr.row;
    const end = start + cell.span.rows - 1;
    if (cell.span.rows === 1 || end < a || start > b) continue;
    if (start <= a && end >= b && (start < templateRange[0] || end > templateRange[1] || kept.length > 0)) {
      shared.push(cell);
    } else {
      if (!fixedShape && (start < a || end > b)) {
        throw new Error('반복 구간이 병합 영역의 일부만 포함합니다. 병합 영역 전체를 지정해 주세요.');
      }
      if (!fixedShape && kept.some((r) => start <= r && r <= end)) {
        throw new Error('병합 묶음 안의 일부 행을 보존 행으로 이동할 수 없습니다.');
      }
      grouped.push(cell);
    }
  }
  // Internal merges define a multi-row pattern. Replay the original interval,
  // rather than cloning a single row and losing the continuation rows.
  const usePattern = blockSize > 1 || grouped.length > 0;
  const origins = [
    ...table.rows.slice(0, a).map((_, i) => i),
    ...Array.from({ length: count }, (_, i) => fixedShape ? dataOrigins[i] : usePattern ? templateOrigins[i % templateOrigins.length] : template),
    ...kept,
    ...table.rows.slice(b + 1).map((_, i) => b + 1 + i),
  ];
  // Use measurable row heights only; a fully merged row has no independent height.
  const heights = table.rows.map((r) => {
    const values = r.cells.filter((c) => c.span.rows === 1).map((c) => cellHeight(xml, c));
    return values.length && values.every((h) => h !== undefined) ? Math.max(...values as number[]) : undefined;
  });
  const oldHeights = dataOrigins.map((r) => heights[r]);
  const newHeights = origins.slice(a, a + count).map((r) => heights[r]);
  const heightDelta = [...oldHeights, ...newHeights].every((h) => h !== undefined)
    ? (newHeights as number[]).reduce((s, h) => s + h, 0) - (oldHeights as number[]).reduce((s, h) => s + h, 0)
    : undefined;
  const sharedCells = new Set([...shared, ...grouped]);
  const projections: { cell: CellNode; covered: number[] }[] = [];
  for (const cell of sharedCells) {
    const isShared = shared.includes(cell);
    let covered: number[] = [];
    for (let dest = 0; dest < origins.length; dest++) {
      const source = origins[dest];
      const generated = dest >= a && dest < a + count;
      const owns = (isShared && generated) || (source >= cell.addr.row && source < cell.addr.row + cell.span.rows);
      const previous = covered[covered.length - 1];
      // The next cycle must start a new grouped cell even if it touches the last one.
      if (covered.length && (!owns || (!isShared && source !== origins[previous] + 1))) {
        projections.push({ cell, covered });
        covered = [];
      }
      if (owns) covered.push(dest);
    }
    if (covered.length) projections.push({ cell, covered });
  }
  const output = origins.map((origin, destination) => {
    const row = table.rows[origin];
    const localEdits: Edit[] = row.cells.filter((cell) => sharedCells.has(cell)).map((cell) => ({
      start: cell.start - row.start, end: cell.end - row.start, text: '',
    }));
    let fragment = applyEdits(xml.slice(row.start, row.end), localEdits);
    if (destination >= a && destination < a + count) fragment = fill(fragment, destination - a);
    // A shared cell can originate before the selected interval, or in a different template row.
    const insertions: { col: number; xml: string }[] = [];
    for (const { cell, covered } of projections) {
      if (covered[0] !== destination) continue;
      const cellXml = xml.slice(cell.start, cell.end);
      const relative = { ...cell, start: 0, end: cellXml.length,
        tables: cell.tables.map((t) => ({ ...t, start: t.start - cell.start, end: t.end - cell.start })) };
      const metadataEdits = [
        editCellAttribute(cellXml, relative, 'cellSpan', 'rowSpan', covered.length),
      ];
      const height = cellHeight(xml, cell);
      const oldCellHeights = heights.slice(cell.addr.row, cell.addr.row + cell.span.rows);
      const newCellHeights = covered.map((dest) => heights[origins[dest]]);
      if (height !== undefined && [...oldCellHeights, ...newCellHeights].every((h) => h !== undefined)) {
        const delta = (newCellHeights as number[]).reduce((sum, h) => sum + h, 0)
          - (oldCellHeights as number[]).reduce((sum, h) => sum + h, 0);
        if (delta) metadataEdits.push(editCellAttribute(cellXml, relative, 'cellSz', 'height', Math.max(1, height + delta)));
      }
      let rebuiltCell = applyEdits(cellXml, metadataEdits);
      const dataIndexes = covered.filter((dest) => dest >= a && dest < a + inputCount).map((dest) => dest - a);
      if (covered.some((dest) => dest >= a && dest < a + count) && writableColumns.includes(cell.addr.col)) {
        const filled = fill(`<hp:tr>${rebuiltCell}</hp:tr>`, dataIndexes[0] ?? inputCount, dataIndexes);
        const filledCell = parseHwpxSection(filled).orphanRows[0]?.cells[0];
        if (!filledCell) throw new Error('병합 셀의 생성 내용을 해석하지 못했습니다.');
        rebuiltCell = filled.slice(filledCell.start, filledCell.end);
      }
      insertions.push({ col: cell.addr.col, xml: rebuiltCell });
    }
    // Insert in logical column order without touching the row's other XML.
    for (const insertion of insertions.sort((x, y) => y.col - x.col)) {
      const cells = parseHwpxSection(fragment).orphanRows[0]?.cells ?? [];
      const at = cells.find((c) => c.addr.col > insertion.col)?.start ?? fragment.lastIndexOf('</hp:tr>');
      fragment = fragment.slice(0, at) + insertion.xml + fragment.slice(at);
    }
    return renumberRowXml(fragment, destination);
  });
  const edits: Edit[] = [{ start: table.rows[0].start, end: table.rows[table.rows.length - 1].end, text: output.join('') }];
  const countEdit = editSetRowCnt(xml, table, output.length);
  if (countEdit) edits.push(countEdit);
  const prefix = xml.slice(table.start, table.rows[0].start);
  const size = /<hp:sz\b[^>]*\bheight="(\d+)"/.exec(prefix);
  if (size && heightDelta !== undefined && heightDelta !== 0) {
    const start = table.start + size.index + size[0].lastIndexOf('"') - size[1].length;
    edits.push({ start, end: start + size[1].length, text: String(Math.max(1, Number(size[1]) + heightDelta)) });
  }
  // Cell zones also use row coordinates. Remap them only when their relation to the
  // repeated block is unambiguous, just as for vertical merges.
  const zones = /<hp:cellZone\b[^>]*>/g;
  let zone: RegExpExecArray | null;
  while ((zone = zones.exec(prefix))) {
    const startMatch = /\bstartRowAddr="(\d+)"/.exec(zone[0]);
    const endMatch = /\bendRowAddr="(\d+)"/.exec(zone[0]);
    if (!startMatch || !endMatch) continue;
    const startRow = Number(startMatch[1]);
    const endRow = Number(endMatch[1]);
    if (!fixedShape && startRow <= b && endRow >= a && (startRow > a || endRow < b)) {
      throw new Error('반복 구간이 셀 영역 서식의 일부에 걸쳐 있습니다. 영역 전체를 지정해 주세요.');
    }
    const covered = origins.flatMap((source, dest) => source >= startRow && source <= endRow ? [dest] : []);
    if (!covered.length) throw new Error('셀 영역 서식 전체를 삭제하는 반복 변경은 지원하지 않습니다.');
    for (const [match, value] of [[startMatch, covered[0]], [endMatch, covered[covered.length - 1]]] as const) {
      const start = table.start + zone.index + match.index;
      edits.push({ start, end: start + match[0].length, text: match[0].replace(/"\d+"/, `"${value}"`) });
    }
  }
  const result = applyEdits(xml, edits);
  const updated = parseHwpxSection(result).tables.find((t) => t.start === table.start);
  if (!updated) throw new Error('변경된 표를 해석하지 못했습니다.');
  validateTableGrid(updated);
  return result;
}
