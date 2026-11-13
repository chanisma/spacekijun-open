import { getDocument, GlobalWorkerOptions, type TextItem } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import type { DocumentBlock, ParsedSchoolDocument } from '../types';
import {
  DOCUMENT_PARSER_VERSION,
  finalizeDocument,
  guessHeading,
  makeBlockId,
  normalizeWhitespace,
} from './parserUtils';

GlobalWorkerOptions.workerPort ??= new PdfWorker();

interface PositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function toLines(items: PositionedText[]): PositionedText[] {
  const sorted = [...items].sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
  const lines: PositionedText[] = [];

  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2, item.height * 0.35));
    if (!line) {
      lines.push({ ...item });
      continue;
    }
    const gap = item.x - (line.x + line.width);
    line.text += `${gap > Math.max(3, item.height * 0.25) ? ' ' : ''}${item.text}`;
    line.width = Math.max(line.width, item.x + item.width - line.x);
    line.height = Math.max(line.height, item.height);
  }

  return lines.sort((a, b) => b.y - a.y);
}

export async function parsePdfDocument(file: File): Promise<ParsedSchoolDocument> {
  const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  const blocks: DocumentBlock[] = [];
  const warnings: string[] = [];
  const sectionPath: string[] = [];
  let order = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is TextItem => 'str' in item && Boolean(item.str.trim()))
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: Math.abs(item.height || item.transform[3] || 10),
      }));

    if (items.length === 0) {
      warnings.push(`${pageNumber}쪽에 추출 가능한 텍스트가 없습니다. OCR이 필요할 수 있습니다.`);
    }

    for (const line of toLines(items)) {
      const text = normalizeWhitespace(line.text);
      if (!text) continue;
      const heading = guessHeading(text);
      if (heading.isHeading) {
        sectionPath.splice(Math.max(heading.level - 1, 0));
        sectionPath[heading.level - 1] = text;
      }
      const id = makeBlockId('pdf', order);
      blocks.push({
        id,
        kind: heading.isHeading ? 'heading' : /^[-*•◦▪▸]\s*/.test(text) ? 'list_item' : 'paragraph',
        text,
        order,
        level: heading.isHeading ? heading.level : undefined,
        sectionPath: [...sectionPath],
        source: {
          blockId: id,
          page: pageNumber,
          path: `page:${pageNumber}/line:${order}`,
          bbox: [line.x, viewport.height - line.y - line.height, line.width, line.height],
        },
      });
      order += 1;
    }
  }

  const lowTextPages = warnings.length;
  if (lowTextPages > 0 && lowTextPages === pdf.numPages) {
    warnings.push('문서 전체가 이미지 기반일 가능성이 높습니다. OCR 분석 경로를 사용해야 합니다.');
  }

  return finalizeDocument({
    parserVersion: DOCUMENT_PARSER_VERSION,
    fileName: file.name,
    mimeType: file.type || 'application/pdf',
    format: 'pdf',
    title: blocks.find((block) => block.kind === 'heading')?.text ?? blocks.find((block) => block.text)?.text ?? null,
    pageCount: pdf.numPages,
    blocks,
    warnings,
  });
}

