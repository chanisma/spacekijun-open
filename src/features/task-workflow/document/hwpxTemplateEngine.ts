import JSZip from 'jszip';
import { reorderAndExport } from '@/features/issue-register/hwpx/generateVolunteerHwpx';
import type { TaskActionDocumentTemplateField } from '../types';

export const HWPX_MIME_TYPE = 'application/hwp+zip';
export const HWPX_MAX_FILE_SIZE = 20 * 1024 * 1024;

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z][a-z0-9_.-]{0,63})\s*\}\}/gi;

export type HwpxTemplateField = TaskActionDocumentTemplateField;

export interface HwpxTemplateFieldMapping {
  sourceText: string;
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
}

export interface HwpxTemplateInspection {
  fields: HwpxTemplateField[];
  previewText: string;
  sectionCount: number;
  warnings: string[];
}

export interface PreparedHwpxTemplate extends HwpxTemplateInspection {
  blob: Blob;
}

export interface FilledHwpxTemplate {
  blob: Blob;
  replacedFields: number;
  replacementCount: number;
  remainingPlaceholders: string[];
  sectionCount: number;
}

function localName(element: Element): string {
  return (element.localName || element.tagName.split(':').pop() || '').toLowerCase();
}

function parseXml(xmlText: string, sectionPath: string): XMLDocument {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`${sectionPath} XML을 해석하지 못했습니다.`);
  }
  return xml;
}

function serializeXml(xml: XMLDocument, original: string): string {
  const serialized = new XMLSerializer().serializeToString(xml);
  const declaration = original.match(/^\s*(<\?xml[^?]*\?>)/i)?.[1];
  if (!declaration || /^\s*<\?xml/i.test(serialized)) return serialized;
  return `${declaration}\n${serialized}`;
}

function sectionPaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => /^Contents\/section\d+\.xml$/i.test(path))
    .sort((left, right) => {
      const leftIndex = Number(left.match(/section(\d+)/i)?.[1] ?? 0);
      const rightIndex = Number(right.match(/section(\d+)/i)?.[1] ?? 0);
      return leftIndex - rightIndex;
    });
}

function paragraphTextElements(paragraph: Element): Element[] {
  return Array.from(paragraph.getElementsByTagName('*')).filter(
    (element) => localName(element) === 't'
  );
}

function documentParagraphs(xml: XMLDocument): Element[] {
  return Array.from(xml.getElementsByTagName('*')).filter(
    (element) => localName(element) === 'p'
  );
}

function combinedText(elements: Element[]): string {
  return elements.map((element) => element.textContent ?? '').join('');
}

function replaceRange(
  elements: Element[],
  start: number,
  end: number,
  replacement: string
): void {
  const ranges: Array<{ element: Element; start: number; end: number; text: string }> = [];
  let offset = 0;

  elements.forEach((element) => {
    const text = element.textContent ?? '';
    ranges.push({ element, start: offset, end: offset + text.length, text });
    offset += text.length;
  });

  const startIndex = ranges.findIndex((range) => start >= range.start && start < range.end);
  const endPosition = Math.max(start, end - 1);
  const endIndex = ranges.findIndex(
    (range) => endPosition >= range.start && endPosition < range.end
  );
  if (startIndex < 0 || endIndex < 0) return;

  const startRange = ranges[startIndex];
  const endRange = ranges[endIndex];
  const startOffset = start - startRange.start;
  const endOffset = end - endRange.start;

  if (startIndex === endIndex) {
    startRange.element.textContent =
      startRange.text.slice(0, startOffset) +
      replacement +
      startRange.text.slice(endOffset);
    return;
  }

  startRange.element.textContent =
    startRange.text.slice(0, startOffset) + replacement;
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    ranges[index].element.textContent = '';
  }
  endRange.element.textContent = endRange.text.slice(endOffset);
}

function replaceExactText(paragraph: Element, search: string, replacement: string): number {
  if (!search) return 0;
  const elements = paragraphTextElements(paragraph);
  const text = combinedText(elements);
  const positions: number[] = [];
  let cursor = 0;

  while (cursor <= text.length - search.length) {
    const found = text.indexOf(search, cursor);
    if (found < 0) break;
    positions.push(found);
    cursor = found + search.length;
  }

  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const start = positions[index];
    replaceRange(elements, start, start + search.length, replacement);
  }

  return positions.length;
}

function replacePlaceholders(
  paragraph: Element,
  values: Map<string, string>,
  replacements: Map<string, number>
): void {
  const elements = paragraphTextElements(paragraph);
  const text = combinedText(elements);
  const matches = Array.from(text.matchAll(new RegExp(PLACEHOLDER_PATTERN.source, 'gi')));

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const key = match[1].toLowerCase();
    if (!values.has(key) || match.index === undefined) continue;
    replaceRange(elements, match.index, match.index + match[0].length, values.get(key) ?? '');
    replacements.set(key, (replacements.get(key) ?? 0) + 1);
  }
}

function inspectXmlDocuments(
  documents: Array<{ path: string; xml: XMLDocument }>
): HwpxTemplateInspection {
  const fieldCounts = new Map<string, number>();
  const previewParts: string[] = [];

  documents.forEach(({ xml }) => {
    documentParagraphs(xml).forEach((paragraph) => {
      const text = combinedText(paragraphTextElements(paragraph));
      if (!text) return;
      previewParts.push(text);
      Array.from(text.matchAll(new RegExp(PLACEHOLDER_PATTERN.source, 'gi'))).forEach(
        (match) => {
          const key = match[1].toLowerCase();
          fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
        }
      );
    });
  });

  return {
    fields: Array.from(fieldCounts.entries())
      .map(([key, occurrences]) => ({
        key,
        label: key,
        required: true,
        occurrences,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    previewText: previewParts.join('\n').slice(0, 6000),
    sectionCount: documents.length,
    warnings: [],
  };
}

async function loadTemplate(source: Blob): Promise<{
  zip: JSZip;
  documents: Array<{ path: string; original: string; xml: XMLDocument }>;
}> {
  if (source.size === 0) throw new Error('빈 HWPX 파일은 사용할 수 없습니다.');
  if (source.size > HWPX_MAX_FILE_SIZE) {
    throw new Error('HWPX 템플릿은 20MB 이하만 등록할 수 있습니다.');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await source.arrayBuffer());
  } catch {
    throw new Error('HWPX 압축 구조를 읽지 못했습니다.');
  }

  if (!zip.file('mimetype')) {
    throw new Error('HWPX mimetype 항목을 찾지 못했습니다.');
  }

  const paths = sectionPaths(zip);
  if (paths.length === 0) {
    throw new Error('HWPX 본문 section XML을 찾지 못했습니다.');
  }

  const documents = await Promise.all(
    paths.map(async (path) => {
      const original = await zip.files[path].async('string');
      return { path, original, xml: parseXml(original, path) };
    })
  );

  return { zip, documents };
}

function normalizeMappings(mappings: HwpxTemplateFieldMapping[]): HwpxTemplateFieldMapping[] {
  const keys = new Set<string>();
  const sources = new Set<string>();

  return mappings.map((mapping) => {
    const key = mapping.key.trim().toLowerCase();
    const sourceText = mapping.sourceText.trim();
    const label = mapping.label.trim() || key;

    if (!FIELD_KEY_PATTERN.test(key)) {
      throw new Error(`필드 키 "${mapping.key}" 형식이 올바르지 않습니다.`);
    }
    if (!sourceText) throw new Error(`${label} 필드의 기존 문구를 입력해주세요.`);
    if (keys.has(key)) throw new Error(`필드 키 "${key}"가 중복되었습니다.`);
    if (sources.has(sourceText)) throw new Error(`기존 문구 "${sourceText}"가 중복되었습니다.`);

    keys.add(key);
    sources.add(sourceText);
    return {
      ...mapping,
      key,
      sourceText,
      label,
      defaultValue: mapping.defaultValue?.trim() || undefined,
    };
  });
}

export async function inspectHwpxTemplate(source: Blob): Promise<HwpxTemplateInspection> {
  const { documents } = await loadTemplate(source);
  return inspectXmlDocuments(documents);
}

export async function prepareHwpxTemplate(
  source: Blob,
  mappings: HwpxTemplateFieldMapping[]
): Promise<PreparedHwpxTemplate> {
  const normalizedMappings = normalizeMappings(mappings);
  const { zip, documents } = await loadTemplate(source);

  normalizedMappings.forEach((mapping) => {
    const token = `{{${mapping.key}}}`;
    if (mapping.sourceText === token) return;

    let count = 0;
    documents.forEach(({ xml }) => {
      documentParagraphs(xml).forEach((paragraph) => {
        count += replaceExactText(paragraph, mapping.sourceText, token);
      });
    });
    if (count === 0) {
      throw new Error(`"${mapping.sourceText}" 문구를 HWPX 본문에서 찾지 못했습니다.`);
    }
  });

  documents.forEach(({ path, original, xml }) => {
    zip.file(path, serializeXml(xml, original));
  });

  const inspection = inspectXmlDocuments(documents);
  const configuredFields = inspection.fields.map((field) => {
    const mapping = normalizedMappings.find((item) => item.key === field.key);
    return mapping
      ? {
          ...field,
          label: mapping.label,
          required: mapping.required,
          defaultValue: mapping.defaultValue,
        }
      : field;
  });

  if (configuredFields.length === 0) {
    throw new Error(
      '치환 필드가 없습니다. HWPX에 {{필드키}}를 입력하거나 기존 문구 매핑을 추가해주세요.'
    );
  }

  return {
    ...inspection,
    fields: configuredFields,
    blob: await reorderAndExport(zip),
  };
}

export async function fillHwpxTemplate(
  source: Blob,
  fields: HwpxTemplateField[],
  values: Record<string, string>
): Promise<FilledHwpxTemplate> {
  const missing = fields.filter((field) => {
    const value = values[field.key] ?? field.defaultValue ?? '';
    return field.required && !value.trim();
  });
  if (missing.length > 0) {
    throw new Error(`필수 값을 입력해주세요: ${missing.map((field) => field.label).join(', ')}`);
  }

  const { zip, documents } = await loadTemplate(source);
  const resolvedValues = new Map(
    fields.map((field) => [
      field.key.toLowerCase(),
      values[field.key] ?? field.defaultValue ?? '',
    ])
  );
  const replacements = new Map<string, number>();

  documents.forEach(({ xml }) => {
    documentParagraphs(xml).forEach((paragraph) => {
      replacePlaceholders(paragraph, resolvedValues, replacements);
    });
  });

  documents.forEach(({ path, original, xml }) => {
    zip.file(path, serializeXml(xml, original));
  });

  const remaining = inspectXmlDocuments(documents).fields.map((field) => field.key);
  return {
    blob: await reorderAndExport(zip),
    replacedFields: replacements.size,
    replacementCount: Array.from(replacements.values()).reduce(
      (total, count) => total + count,
      0
    ),
    remainingPlaceholders: remaining,
    sectionCount: documents.length,
  };
}

export async function sha256Hex(source: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await source.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
