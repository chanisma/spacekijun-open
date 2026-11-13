import type { DocumentBlock, DocumentChunk, ParsedSchoolDocument } from '../types';

const DEFAULT_MAX_CHARS = 12_000;

function serializeBlock(block: DocumentBlock): string {
  const location = [
    block.source.page ? `p.${block.source.page}` : null,
    block.source.path ?? null,
  ].filter(Boolean).join(' ');
  return `[block:${block.id}${location ? ` ${location}` : ''}]\n${block.text}`;
}

function splitTextWithOverlap(value: string, maxChars: number): string[] {
  if (value.length <= maxChars) return [value];
  const overlap = Math.min(300, Math.floor(maxChars / 10));
  const step = Math.max(1, maxChars - overlap);
  const parts: string[] = [];
  for (let start = 0; start < value.length; start += step) {
    parts.push(value.slice(start, Math.min(value.length, start + maxChars)));
    if (start + maxChars >= value.length) break;
  }
  return parts;
}

export function chunkDocument(
  document: ParsedSchoolDocument,
  maxChars = DEFAULT_MAX_CHARS
): DocumentChunk[] {
  if (maxChars < 1_000) throw new Error('문서 청크 크기는 최소 1,000자여야 합니다.');

  const chunks: DocumentChunk[] = [];
  let currentBlocks: DocumentBlock[] = [];
  let currentLength = 0;
  let currentPath: string[] = [];

  const flush = () => {
    if (currentBlocks.length === 0) return;
    const id = `chunk-${String(chunks.length).padStart(4, '0')}`;
    const text = currentBlocks.map(serializeBlock).join('\n\n');
    chunks.push({
      id,
      titlePath: [...currentPath],
      blockIds: currentBlocks.map((block) => block.id),
      text,
      characterCount: text.length,
    });
    currentBlocks = [];
    currentLength = 0;
  };

  const pushStandaloneChunk = (text: string, blockIds: string[], titlePath: string[]) => {
    const id = `chunk-${String(chunks.length).padStart(4, '0')}`;
    chunks.push({
      id,
      titlePath: [...titlePath],
      blockIds,
      text,
      characterCount: text.length,
    });
  };

  const pushOversizedBlock = (block: DocumentBlock) => {
    const prefix = serializeBlock({ ...block, text: '' }).trimEnd();
    const availableChars = Math.max(500, maxChars - prefix.length - 40);
    const parts = splitTextWithOverlap(block.text, availableChars);
    parts.forEach((part, index) => pushStandaloneChunk(
      `${prefix} fragment:${index + 1}/${parts.length}\n${part}`,
      [block.id],
      block.sectionPath
    ));
  };

  const pushOversizedTable = (block: DocumentBlock) => {
    const rows = block.children ?? [];
    if (rows.length === 0) {
      pushOversizedBlock(block);
      return;
    }
    const tableHeader = serializeBlock({ ...block, text: '' }).trimEnd();
    const availableChars = Math.max(500, maxChars - tableHeader.length - 40);
    let rowParts: string[] = [];
    let rowPartsLength = 0;

    const flushRows = () => {
      if (rowParts.length === 0) return;
      pushStandaloneChunk(
        `${tableHeader}\n${rowParts.join('\n\n')}`,
        [block.id],
        block.sectionPath
      );
      rowParts = [];
      rowPartsLength = 0;
    };

    for (const row of rows) {
      const serializedRow = serializeBlock(row);
      if (serializedRow.length > availableChars) {
        flushRows();
        const rowPrefix = serializeBlock({ ...row, text: '' }).trimEnd();
        const rowAvailableChars = Math.max(500, availableChars - rowPrefix.length - 40);
        const parts = splitTextWithOverlap(row.text, rowAvailableChars);
        parts.forEach((part, index) => pushStandaloneChunk(
          `${tableHeader}\n${rowPrefix} fragment:${index + 1}/${parts.length}\n${part}`,
          [block.id],
          block.sectionPath
        ));
        continue;
      }
      if (rowParts.length > 0 && rowPartsLength + serializedRow.length + 2 > availableChars) flushRows();
      rowParts.push(serializedRow);
      rowPartsLength += serializedRow.length + 2;
    }
    flushRows();
  };

  for (const block of document.blocks) {
    if (!block.text.trim()) continue;
    const serializedLength = serializeBlock(block).length + 2;
    if (serializedLength > maxChars) {
      flush();
      if (block.kind === 'table') pushOversizedTable(block);
      else pushOversizedBlock(block);
      continue;
    }
    const wouldOverflow = currentBlocks.length > 0 && currentLength + serializedLength > maxChars;
    if (wouldOverflow) flush();

    if (currentBlocks.length === 0) currentPath = [...block.sectionPath];
    currentBlocks.push(block);
    currentLength += serializedLength;

  }

  flush();
  return chunks;
}
