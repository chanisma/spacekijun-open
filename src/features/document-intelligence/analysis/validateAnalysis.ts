import type {
  CandidateEvidence,
  DocumentAnalysisResult,
  DocumentCandidate,
  DocumentCandidateType,
  ExtractedDate,
  Obligation,
  ParsedSchoolDocument,
} from '../types';

const CANDIDATE_TYPES = new Set<DocumentCandidateType>([
  'event', 'task', 'submission', 'approval', 'constraint', 'information',
]);
const OBLIGATIONS = new Set<Obligation>([
  'required', 'recommended', 'optional', 'prohibited', 'informational', 'unknown',
]);
const DATE_PRECISIONS = new Set([
  'exact', 'day', 'month', 'month_end', 'range', 'recurring', 'unknown',
]);

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNullableString(value: unknown): string | null {
  const text = asString(value);
  return text || null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : [];
}

function normalizeDate(value: unknown): ExtractedDate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const raw = asString(record.raw);
  if (!raw) return null;
  const precision = DATE_PRECISIONS.has(asString(record.precision))
    ? asString(record.precision) as ExtractedDate['precision']
    : 'unknown';
  return {
    raw,
    start: asNullableString(record.start),
    end: asNullableString(record.end),
    precision,
    isConfirmed: record.isConfirmed === true,
    recurrence: asNullableString(record.recurrence),
    inferredYear: record.inferredYear === true,
  };
}

/**
 * 모델이 적어 온 근거 식별자를 **문서에 실재하는 block ID 로 해석**한다.
 *
 * 프롬프트는 블록을 `[block:p1 p.1]` 로 직렬화하는데(`chunkDocument.serializeBlock`),
 * 모델은 대괄호 안을 **통째로** 옮겨 적는 일이 잦다 — 실측(2026-09-23, solar-pro4)에서
 * 정확히 추출한 후보 3건의 `blockId` 가 전부 `"block:p1 p.1"` 이었다. 종전 구현은 정확
 * 일치만 인정했으므로 **후보 전부가 조용히 버려졌다**(오류가 아니라 "후보 0건"으로
 * 보인다). 페이지 번호가 붙는 PDF 가 정확히 이 형태다.
 *
 * **환각 방지는 그대로 유지한다** — 여기서 하는 일은 장식을 걷어내고 **실재하는 id 에
 * 맞춰 보는 것**뿐이고, 없는 블록을 만들어 내지 않는다. 맞는 것이 없으면 종전처럼 버린다.
 */
function resolveBlockId(raw: string, validBlockIds: Set<string>): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (validBlockIds.has(trimmed)) return trimmed;
  // `[block:p1 p.1]` · `block:p1` · `[p1]` · `p1 p.1` → 첫 토큰만 남긴다.
  const stripped = trimmed.match(/^\[?\s*(?:block\s*:\s*)?([^\s\]]+)/i)?.[1];
  if (stripped && validBlockIds.has(stripped)) return stripped;
  return null;
}

function normalizeEvidence(
  value: unknown,
  validBlockIds: Set<string>
): CandidateEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const quote = asString(record.quote);
  const blockId = resolveBlockId(asString(record.blockId), validBlockIds);
  if (!blockId || !quote) return null;
  return {
    blockId,
    quote,
    page: typeof record.page === 'number' ? record.page : null,
    path: asNullableString(record.path),
  };
}

function normalizeCandidate(
  value: unknown,
  index: number,
  validBlockIds: Set<string>
): DocumentCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = asString(record.title);
  if (!title) return null;
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.map((item) => normalizeEvidence(item, validBlockIds)).filter((item): item is CandidateEvidence => item !== null)
    : [];
  if (evidence.length === 0) return null;

  const rawType = asString(record.type) as DocumentCandidateType;
  const rawObligation = asString(record.obligation) as Obligation;
  return {
    localId: asString(record.localId, `candidate-${index + 1}`),
    type: CANDIDATE_TYPES.has(rawType) ? rawType : 'information',
    title,
    description: asString(record.description),
    actors: asStringArray(record.actors),
    audiences: asStringArray(record.audiences),
    deliverables: asStringArray(record.deliverables),
    location: asNullableString(record.location),
    dates: Array.isArray(record.dates)
      ? record.dates.map(normalizeDate).filter((item): item is ExtractedDate => item !== null)
      : [],
    obligation: OBLIGATIONS.has(rawObligation) ? rawObligation : 'unknown',
    conditions: asStringArray(record.conditions),
    confidence: typeof record.confidence === 'number'
      ? Math.min(1, Math.max(0, record.confidence))
      : 0,
    evidence,
  };
}

export function validateDocumentAnalysis(
  value: unknown,
  document: ParsedSchoolDocument
): DocumentAnalysisResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('문서 분석 결과가 JSON 객체가 아닙니다.');
  }
  const record = value as Record<string, unknown>;
  const validBlockIds = new Set(document.blocks.flatMap((block) => [
    block.id,
    ...(block.children ?? []).flatMap((row) => [row.id, ...(row.children ?? []).map((cell) => cell.id)]),
  ]));
  const rawCandidates = Array.isArray(record.candidates) ? record.candidates : [];
  const candidates = rawCandidates
    .map((candidate, index) => normalizeCandidate(candidate, index, validBlockIds))
    .filter((candidate): candidate is DocumentCandidate => candidate !== null);

  const rejectedCount = rawCandidates.length - candidates.length;
  return {
    schemaVersion: '1.0',
    documentTitle: asString(record.documentTitle, document.title ?? document.fileName),
    documentType: asString(record.documentType, '미분류'),
    issuingOrganization: asNullableString(record.issuingOrganization),
    summary: asString(record.summary),
    candidates,
    unresolvedQuestions: asStringArray(record.unresolvedQuestions),
    warnings: Array.from(new Set([
      ...document.warnings,
      ...asStringArray(record.warnings),
      ...(rejectedCount > 0 ? [`근거가 없거나 스키마가 잘못된 후보 ${rejectedCount}건을 제외했습니다.`] : []),
    ])),
  };
}

export function parseJsonResponse(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('AI 응답에서 JSON 객체를 찾지 못했습니다.');
  }
}
