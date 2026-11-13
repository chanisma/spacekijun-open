import JSZip from 'jszip';
import type { DocumentBlock, ParsedSchoolDocument } from '../types';
import {
  DOCUMENT_PARSER_VERSION,
  finalizeDocument,
  guessHeading,
  makeBlockId,
  normalizeWhitespace,
} from './parserUtils';

function localName(element: Element): string {
  return (element.localName || element.tagName.split(':').pop() || '').toLowerCase();
}

function directChildren(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => localName(child) === name);
}

function descendantText(element: Element): string {
  return normalizeWhitespace(
    Array.from(element.getElementsByTagName('*'))
      .filter((child) => localName(child) === 't')
      .map((child) => child.textContent ?? '')
      .join('')
  );
}

function paragraphElements(root: Element): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((element) => localName(element) === 'p');
}

function hasTableAncestor(element: Element): boolean {
  let current = element.parentElement;
  while (current) {
    if (localName(current) === 'tbl') return true;
    current = current.parentElement;
  }
  return false;
}

function parseTable(
  table: Element,
  section: number,
  sectionPath: string[],
  nextOrder: () => number
): DocumentBlock {
  const tableOrder = nextOrder();
  const tableId = makeBlockId('hwpx', tableOrder);
  const rows = Array.from(table.getElementsByTagName('*')).filter((element) => localName(element) === 'tr');
  const rowBlocks: DocumentBlock[] = rows.map((row, rowIndex) => {
    const rowOrder = nextOrder();
    const rowId = makeBlockId('hwpx', rowOrder);
    const cells = directChildren(row, 'tc');
    const cellBlocks = cells.map((cell, cellIndex) => {
      const cellOrder = nextOrder();
      const cellId = makeBlockId('hwpx', cellOrder);
      const text = descendantText(cell);
      return {
        id: cellId,
        kind: 'table_cell' as const,
        text,
        order: cellOrder,
        parentId: rowId,
        sectionPath: [...sectionPath],
        source: {
          blockId: cellId,
          section,
          path: `section:${section}/table:${tableOrder}/row:${rowIndex}/cell:${cellIndex}`,
        },
        meta: { row: rowIndex, column: cellIndex },
      };
    });

    return {
      id: rowId,
      kind: 'table_row' as const,
      text: cellBlocks.map((cell) => cell.text).filter(Boolean).join(' | '),
      order: rowOrder,
      parentId: tableId,
      sectionPath: [...sectionPath],
      source: { blockId: rowId, section, path: `section:${section}/table:${tableOrder}/row:${rowIndex}` },
      children: cellBlocks,
      meta: { row: rowIndex },
    };
  });

  return {
    id: tableId,
    kind: 'table',
    text: rowBlocks.map((row) => row.text).filter(Boolean).join('\n'),
    order: tableOrder,
    sectionPath: [...sectionPath],
    source: { blockId: tableId, section, path: `section:${section}/table:${tableOrder}` },
    children: rowBlocks,
    meta: { rowCount: rowBlocks.length },
  };
}

export async function parseHwpxDocument(file: File): Promise<ParsedSchoolDocument> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sectionPaths = Object.keys(zip.files)
    .filter((path) => /^Contents\/section\d+\.xml$/i.test(path))
    .sort((a, b) => {
      const aNum = Number(a.match(/section(\d+)/i)?.[1] ?? 0);
      const bNum = Number(b.match(/section(\d+)/i)?.[1] ?? 0);
      return aNum - bNum;
    });

  if (sectionPaths.length === 0) {
    throw new Error('HWPX 본문 section XML을 찾지 못했습니다. 손상되었거나 지원하지 않는 문서입니다.');
  }

  const blocks: DocumentBlock[] = [];
  const warnings: string[] = [];
  const sectionPath: string[] = [];
  let order = 0;
  const nextOrder = () => order++;

  for (let sectionIndex = 0; sectionIndex < sectionPaths.length; sectionIndex += 1) {
    const xmlText = await zip.files[sectionPaths[sectionIndex]].async('string');
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.querySelector('parsererror')) {
      warnings.push(`${sectionPaths[sectionIndex]} XML 파싱에 실패했습니다.`);
      continue;
    }

    const root = xml.documentElement;
    const topLevelTables = Array.from(root.getElementsByTagName('*')).filter((element) => {
      if (localName(element) !== 'tbl') return false;
      let parent = element.parentElement;
      while (parent) {
        if (localName(parent) === 'tbl') return false;
        parent = parent.parentElement;
      }
      return true;
    });

    const flowElements = [
      ...paragraphElements(root).filter((paragraph) => !hasTableAncestor(paragraph)),
      ...topLevelTables,
    ].sort((a, b) => {
      if (a === b) return 0;
      // DOCUMENT_POSITION_FOLLOWING = 4. Numeric use keeps this parser usable
      // in DOM-compatible test environments that do not expose global Node.
      return a.compareDocumentPosition(b) & 4 ? -1 : 1;
    });

    for (const element of flowElements) {
      if (localName(element) === 'tbl') {
        blocks.push(parseTable(element, sectionIndex, sectionPath, nextOrder));
        continue;
      }

      const text = descendantText(element);
      if (!text) continue;
      const heading = guessHeading(text);
      if (heading.isHeading) {
        sectionPath.splice(Math.max(heading.level - 1, 0));
        sectionPath[heading.level - 1] = text;
      }
      const blockOrder = nextOrder();
      const id = makeBlockId('hwpx', blockOrder);
      blocks.push({
        id,
        kind: heading.isHeading ? 'heading' : /^[-*•◦▪▸➊-➒]\s*/.test(text) ? 'list_item' : 'paragraph',
        text,
        order: blockOrder,
        level: heading.isHeading ? heading.level : undefined,
        sectionPath: [...sectionPath],
        source: { blockId: id, section: sectionIndex, path: `section:${sectionIndex}/paragraph:${blockOrder}` },
      });
    }
  }

  blocks.sort((a, b) => a.order - b.order);

  return finalizeDocument({
    parserVersion: DOCUMENT_PARSER_VERSION,
    fileName: file.name,
    mimeType: file.type || 'application/vnd.hancom.hwpx',
    format: 'hwpx',
    title: blocks.find((block) => block.kind === 'heading')?.text ?? blocks.find((block) => block.text)?.text ?? null,
    pageCount: null,
    blocks,
    warnings,
  });
}
