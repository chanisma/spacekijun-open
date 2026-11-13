// Locator 해석: 구조 주소 시도 → 지문 검증 → 지문 재바인딩 → 실패 시 stale.
// 재편집을 거친 문서에서도 안전하게 대상을 찾기 위한 이중화 계층.

import type { CellAddr, Locator } from './types';
import type { CellNode, HwpxIndex, ParaNode, TableNode } from './hwpxIndex';

export interface ResolvedCell {
  kind: 'cell';
  section: number;
  cell: CellNode;
  table: TableNode;
}
export interface ResolvedText {
  kind: 'text';
  section: number;
  paras: ParaNode[];
  anchor: string;
  occurrence: number;
  position: 'replace' | 'after';
  /** 블록 구간의 끝 앵커(있으면 anchor~endAnchor 전체가 대상) */
  endAnchor?: string;
}
export interface ResolvedRows {
  kind: 'rows';
  section: number;
  table: TableNode;
  dataRows: [number, number];
  keepRows: number[];
}
/** 표 전체(tableGroup: 표를 감싼 문단째 복제) */
export interface ResolvedTable {
  kind: 'table';
  section: number;
  table: TableNode;
}
export interface ResolvedStale {
  kind: 'stale';
  reason: string;
}
export type Resolved = ResolvedCell | ResolvedText | ResolvedRows | ResolvedTable | ResolvedStale;

const FP_LEN = 48;

function fp(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, FP_LEN);
}

function fingerprintMatches(expected: string | undefined, actual: string): boolean {
  if (!expected) return true;
  return fp(actual).startsWith(fp(expected)) || fp(expected).startsWith(fp(actual));
}

function findTable(indexes: HwpxIndex[], loc: Locator): { table: TableNode; section: number } | null {
  const wantIdx = loc.table?.index;
  const wantFp = loc.table?.fingerprint;
  const sections = loc.section != null ? [loc.section] : indexes.map((_, i) => i);
  // 1) 구조 주소(문서 전역 표 순번)
  if (wantIdx != null) {
    let counter = 0;
    for (const si of sections) {
      for (const t of indexes[si].tables) {
        if (counter === wantIdx) {
          if (fingerprintMatches(wantFp, t.headerFingerprint)) return { table: t, section: si };
          counter++;
          continue; // 지문 불일치 → 재바인딩으로
        }
        counter++;
      }
    }
  }
  // 2) 지문 재바인딩
  if (wantFp) {
    for (const si of sections) {
      for (const t of indexes[si].tables) {
        if (fingerprintMatches(wantFp, t.headerFingerprint)) return { table: t, section: si };
      }
    }
  }
  return null;
}

function cellByPath(table: TableNode, path: CellAddr[]): CellNode | null {
  let cur: TableNode = table;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const cell = cur.rows.flatMap((r) => r.cells).find((c) => c.addr.row === a.row && c.addr.col === a.col);
    if (!cell) return null;
    if (i === path.length - 1) return cell;
    if (!cell.tables.length) return null;
    cur = cell.tables[0];
  }
  return null;
}

export function resolveLocator(indexes: HwpxIndex[], loc: Locator): Resolved {
  const sections = loc.section != null ? [loc.section] : indexes.map((_, i) => i);

  if (loc.kind === 'clickhere') {
    for (const si of sections) {
      const f = indexes[si].fields.find((f) => f.type === 'CLICK_HERE' && (!loc.fieldId || f.fieldId === loc.fieldId));
      if (f) {
        // ClickHere 내부 텍스트를 앵커로 하는 text locator로 위임
        return { kind: 'text', section: si, paras: indexes[si].allParagraphs, anchor: f.innerText, occurrence: 1, position: 'replace' };
      }
    }
    return { kind: 'stale', reason: `clickhere field not found (${loc.fieldId ?? 'any'})` };
  }

  if (loc.kind === 'text') {
    if (!loc.anchor) return { kind: 'stale', reason: 'text locator without anchor' };
    for (const si of sections) {
      if (indexes[si].fullText.includes(loc.anchor)) {
        if (loc.endAnchor && !indexes[si].fullText.includes(loc.endAnchor)) {
          return { kind: 'stale', reason: `end anchor not found: ${loc.endAnchor.slice(0, 30)}` };
        }
        return {
          kind: 'text', section: si, paras: indexes[si].allParagraphs,
          anchor: loc.anchor, occurrence: loc.occurrence ?? 1, position: loc.position ?? 'replace',
          endAnchor: loc.endAnchor,
        };
      }
    }
    return { kind: 'stale', reason: `text anchor not found: ${loc.anchor.slice(0, 30)}` };
  }

  const found = findTable(indexes, loc);
  if (!found) return { kind: 'stale', reason: `table not found (index=${loc.table?.index}, fp=${loc.table?.fingerprint?.slice(0, 20)})` };
  const { table, section } = found;

  if (loc.kind === 'cell') {
    const path = loc.cellPath ?? (loc.addr ? [loc.addr] : null);
    if (!path) return { kind: 'stale', reason: 'cell locator without addr/cellPath' };
    let cell = cellByPath(table, path);
    if (cell && !fingerprintMatches(loc.fingerprint, cell.text)) cell = null;
    if (!cell && loc.fingerprint) {
      // 지문 재바인딩: 같은 표에서 지문 일치 셀 탐색
      cell = table.rows.flatMap((r) => r.cells).find((c) => fingerprintMatches(loc.fingerprint, c.text)) ?? null;
    }
    if (!cell) return { kind: 'stale', reason: `cell not resolved (fp=${loc.fingerprint?.slice(0, 20) ?? 'none'})` };
    return { kind: 'cell', section, cell, table };
  }

  if (loc.kind === 'table') return { kind: 'table', section, table };

  if (loc.kind === 'rowGroup' || loc.kind === 'cellRange') {
    if (!loc.rows) return { kind: 'stale', reason: `${loc.kind} without rows` };
    const [a, b] = loc.rows;
    if (a < 0 || b >= table.rows.length || a > b) {
      return { kind: 'stale', reason: `row range [${a},${b}] out of table rows ${table.rows.length}` };
    }
    return { kind: 'rows', section, table, dataRows: [a, b], keepRows: loc.keepRows ?? [] };
  }

  return { kind: 'stale', reason: `unknown locator kind` };
}

/** keep 검증용: locator가 가리키는 구역의 정규화 텍스트 */
export function resolvedRegionText(res: Resolved, indexes: HwpxIndex[]): string {
  if (res.kind === 'cell') return res.cell.text;
  if (res.kind === 'table') {
    return res.table.rows.map((r) => r.cells.map((c) => c.text).join('|')).join('\n');
  }
  if (res.kind === 'rows') {
    return res.table.rows
      .slice(res.dataRows[0], res.dataRows[1] + 1)
      .map((r) => r.cells.map((c) => c.text).join('|'))
      .join('\n');
  }
  if (res.kind === 'text') {
    const i = indexes[res.section].fullText.indexOf(res.anchor);
    return i >= 0 ? indexes[res.section].fullText.slice(i, i + 200) : '';
  }
  return '';
}
