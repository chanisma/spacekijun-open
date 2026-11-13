import type { DocumentFormat, ParsedSchoolDocument } from '../types';
import { parseHwpxDocument } from './hwpxParser';
import { parsePdfDocument } from './pdfParser';
import { parseTextDocument } from './textParser';

export class UnsupportedDocumentError extends Error {
  constructor(
    message: string,
    public readonly format: DocumentFormat,
    public readonly code: 'conversion_required' | 'unsupported_format'
  ) {
    super(message);
    this.name = 'UnsupportedDocumentError';
  }
}

export function detectDocumentFormat(file: Pick<File, 'name' | 'type'>): DocumentFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'hwpx' || /hwpx/i.test(file.type)) return 'hwpx';
  if (extension === 'hwp' || /haansofthwp|x-hwp/i.test(file.type)) return 'hwp';
  if (extension === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (extension === 'txt' || extension === 'md' || file.type.startsWith('text/')) return 'text';
  return 'unknown';
}

export async function parseSchoolDocument(file: File): Promise<ParsedSchoolDocument> {
  const format = detectDocumentFormat(file);
  if (format === 'hwpx') return parseHwpxDocument(file);
  if (format === 'pdf') return parsePdfDocument(file);
  if (format === 'text') return parseTextDocument(file);
  if (format === 'hwp') {
    throw new UnsupportedDocumentError(
      '구형 HWP 문서는 안전한 HWPX 또는 PDF 변환 후 분석해야 합니다.',
      'hwp',
      'conversion_required'
    );
  }
  throw new UnsupportedDocumentError('지원하지 않는 문서 형식입니다.', 'unknown', 'unsupported_format');
}

