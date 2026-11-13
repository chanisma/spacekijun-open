import type { DocumentBlock, ParsedSchoolDocument } from '../types';

export const DOCUMENT_PARSER_VERSION = 'document-intelligence/0.1.0';

export function normalizeWhitespace(value: string): string {
  return value.replace(/[\t\u00a0]+/g, ' ').replace(/ +/g, ' ').trim();
}

export function makeBlockId(prefix: string, order: number): string {
  return `${prefix}-${String(order).padStart(5, '0')}`;
}

export function finalizeDocument(
  document: Omit<ParsedSchoolDocument, 'characterCount' | 'plainText'>
): ParsedSchoolDocument {
  const contentBlocks = flattenBlocks(document.blocks).filter(
    (block) => block.kind !== 'table' && block.kind !== 'table_row'
  );
  const plainText = contentBlocks
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n');

  return {
    ...document,
    characterCount: plainText.length,
    plainText,
  };
}

export function flattenBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const result: DocumentBlock[] = [];
  for (const block of blocks) {
    result.push(block);
    if (block.children?.length) result.push(...flattenBlocks(block.children));
  }
  return result;
}

export function guessHeading(text: string): { isHeading: boolean; level: number } {
  const normalized = normalizeWhitespace(text);
  if (!normalized || normalized.length > 80) return { isHeading: false, level: 0 };

  if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*\.?\s*\S+/.test(normalized)) {
    return { isHeading: true, level: 1 };
  }
  if (/^\d+\.\s*\S+/.test(normalized)) return { isHeading: true, level: 2 };
  if (/^[가-하]\.\s*\S+/.test(normalized)) return { isHeading: true, level: 3 };
  if (/^[□■◆◇]\s*\S+/.test(normalized)) return { isHeading: true, level: 3 };

  return { isHeading: false, level: 0 };
}

