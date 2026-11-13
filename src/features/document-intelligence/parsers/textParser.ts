import type { DocumentBlock, ParsedSchoolDocument } from '../types';
import {
  DOCUMENT_PARSER_VERSION,
  finalizeDocument,
  guessHeading,
  makeBlockId,
  normalizeWhitespace,
} from './parserUtils';

export async function parseTextDocument(file: File): Promise<ParsedSchoolDocument> {
  const raw = await file.text();
  const segments = raw
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|\n/)
    .map(normalizeWhitespace)
    .filter(Boolean);

  const blocks: DocumentBlock[] = [];
  const sectionPath: string[] = [];

  for (const text of segments) {
    const order = blocks.length;
    const heading = guessHeading(text);
    if (heading.isHeading) {
      sectionPath.splice(Math.max(heading.level - 1, 0));
      sectionPath[heading.level - 1] = text;
    }

    blocks.push({
      id: makeBlockId('txt', order),
      kind: heading.isHeading ? 'heading' : /^[-*•◦▪▸]\s*/.test(text) ? 'list_item' : 'paragraph',
      text,
      order,
      level: heading.isHeading ? heading.level : undefined,
      sectionPath: [...sectionPath],
      source: { blockId: makeBlockId('txt', order), path: `line:${order + 1}` },
    });
  }

  return finalizeDocument({
    parserVersion: DOCUMENT_PARSER_VERSION,
    fileName: file.name,
    mimeType: file.type || 'text/plain',
    format: 'text',
    title: blocks.find((block) => block.kind === 'heading')?.text ?? blocks[0]?.text ?? null,
    pageCount: null,
    blocks,
    warnings: [],
  });
}

