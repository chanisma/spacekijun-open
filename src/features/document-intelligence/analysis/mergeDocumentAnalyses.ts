import type {
  CandidateEvidence,
  DocumentAnalysisResult,
  DocumentCandidate,
  ExtractedDate,
  ParsedSchoolDocument,
} from '../types';

const MAX_MERGED_CANDIDATES = 500;

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(/\s+/).filter((token) => token.length >= 2));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dateKey(date: ExtractedDate): string {
  return [date.raw, date.start, date.end, date.precision, date.recurrence].join('|');
}

function evidenceKey(evidence: CandidateEvidence): string {
  return `${evidence.blockId}|${normalizeText(evidence.quote)}`;
}

function exactDayKeys(candidate: DocumentCandidate): Set<string> {
  return new Set(candidate.dates
    .map((date) => date.start?.slice(0, 10) ?? '')
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
}

function hasConflictingExactDays(left: DocumentCandidate, right: DocumentCandidate): boolean {
  const leftDays = exactDayKeys(left);
  const rightDays = exactDayKeys(right);
  if (leftDays.size === 0 || rightDays.size === 0) return false;
  return !Array.from(leftDays).some((date) => rightDays.has(date));
}

function sharesContext(left: DocumentCandidate, right: DocumentCandidate): boolean {
  const leftContext = new Set([
    ...left.actors,
    ...left.audiences,
    ...left.deliverables,
    ...left.dates.flatMap((date) => [date.raw, date.start ?? '']),
  ].map(normalizeText).filter(Boolean));
  return [
    ...right.actors,
    ...right.audiences,
    ...right.deliverables,
    ...right.dates.flatMap((date) => [date.raw, date.start ?? '']),
  ].map(normalizeText).some((value) => Boolean(value) && leftContext.has(value));
}

function shouldMergeCandidates(left: DocumentCandidate, right: DocumentCandidate): boolean {
  if (left.type !== right.type || hasConflictingExactDays(left, right)) return false;
  const leftTitle = normalizeText(left.title);
  const rightTitle = normalizeText(right.title);
  const contextShared = sharesContext(left, right);

  if (leftTitle === rightTitle) {
    return leftTitle.replace(/\s/g, '').length >= 4 || contextShared
      || jaccard(tokens(left.description), tokens(right.description)) >= 0.4;
  }

  const titleSimilarity = jaccard(tokens(left.title), tokens(right.title));
  if (titleSimilarity >= 0.75) return true;
  const contentSimilarity = jaccard(
    tokens(`${left.title} ${left.description}`),
    tokens(`${right.title} ${right.description}`)
  );
  return contextShared && titleSimilarity >= 0.45 && contentSimilarity >= 0.4;
}

function mergeUniqueBy<T>(left: T[], right: T[], key: (value: T) => string): T[] {
  const result = [...left];
  const seen = new Set(left.map(key));
  for (const value of right) {
    const valueKey = key(value);
    if (seen.has(valueKey)) continue;
    seen.add(valueKey);
    result.push(value);
  }
  return result;
}

function mergeCandidate(
  target: DocumentCandidate,
  incoming: DocumentCandidate,
  warnings: string[]
): DocumentCandidate {
  const obligations = new Set([target.obligation, incoming.obligation].filter((value) => value !== 'unknown'));
  if (obligations.size > 1) {
    warnings.push(`‘${target.title}’ 후보의 의무성 판단이 청크마다 달라 높은 신뢰도 결과를 유지했습니다.`);
  }
  if (target.location && incoming.location && normalizeText(target.location) !== normalizeText(incoming.location)) {
    warnings.push(`‘${target.title}’ 후보에 서로 다른 장소가 있어 원문 근거 검토가 필요합니다.`);
  }
  const preferred = incoming.confidence > target.confidence ? incoming : target;
  return {
    ...target,
    title: preferred.title,
    description: incoming.description.length > target.description.length ? incoming.description : target.description,
    actors: uniqueStrings([...target.actors, ...incoming.actors]),
    audiences: uniqueStrings([...target.audiences, ...incoming.audiences]),
    deliverables: uniqueStrings([...target.deliverables, ...incoming.deliverables]),
    location: target.location ?? incoming.location,
    dates: mergeUniqueBy(target.dates, incoming.dates, dateKey),
    obligation: preferred.obligation,
    conditions: uniqueStrings([...target.conditions, ...incoming.conditions]),
    confidence: Math.max(target.confidence, incoming.confidence),
    evidence: mergeUniqueBy(target.evidence, incoming.evidence, evidenceKey),
  };
}

function mostFrequent(values: Array<string | null>, fallback: string): string {
  const counts = new Map<string, { value: string; count: number }>();
  for (const value of values) {
    if (!value) continue;
    const key = normalizeText(value);
    if (!key || key === normalizeText('미분류')) continue;
    const current = counts.get(key);
    counts.set(key, { value, count: (current?.count ?? 0) + 1 });
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count)[0]?.value ?? fallback;
}

function blockOrderMap(document: ParsedSchoolDocument): Map<string, number> {
  const result = new Map<string, number>();
  const visit = (candidate: ParsedSchoolDocument['blocks'][number]) => {
    result.set(candidate.id, candidate.order);
    candidate.children?.forEach(visit);
  };
  document.blocks.forEach(visit);
  return result;
}

export function mergeDocumentAnalyses(
  document: ParsedSchoolDocument,
  results: DocumentAnalysisResult[],
  failedChunkIds: string[] = []
): DocumentAnalysisResult {
  if (results.length === 0) throw new Error('병합할 문서 분석 결과가 없습니다.');
  const warnings: string[] = [];
  const mergedCandidates: DocumentCandidate[] = [];

  for (const result of results) {
    for (const candidate of result.candidates) {
      const existingIndex = mergedCandidates.findIndex((existing) => shouldMergeCandidates(existing, candidate));
      if (existingIndex >= 0) {
        mergedCandidates[existingIndex] = mergeCandidate(mergedCandidates[existingIndex], candidate, warnings);
      } else {
        mergedCandidates.push(candidate);
      }
    }
  }

  const blockOrder = blockOrderMap(document);
  mergedCandidates.sort((left, right) => {
    const leftOrder = Math.min(...left.evidence.map((item) => blockOrder.get(item.blockId) ?? Number.MAX_SAFE_INTEGER));
    const rightOrder = Math.min(...right.evidence.map((item) => blockOrder.get(item.blockId) ?? Number.MAX_SAFE_INTEGER));
    return leftOrder - rightOrder;
  });

  const candidateOverflow = Math.max(0, mergedCandidates.length - MAX_MERGED_CANDIDATES);
  const candidates = mergedCandidates.slice(0, MAX_MERGED_CANDIDATES);
  const summaries = uniqueStrings(results.map((result) => result.summary).filter(Boolean));

  return {
    schemaVersion: '1.0',
    documentTitle: mostFrequent(
      results.map((result) => result.documentTitle),
      document.title ?? document.fileName
    ),
    documentType: mostFrequent(results.map((result) => result.documentType), '미분류'),
    issuingOrganization: mostFrequent(results.map((result) => result.issuingOrganization), '') || null,
    summary: summaries.join(' ').slice(0, 2_000),
    candidates,
    unresolvedQuestions: uniqueStrings(results.flatMap((result) => result.unresolvedQuestions)),
    warnings: uniqueStrings([
      ...document.warnings,
      ...results.flatMap((result) => result.warnings),
      ...warnings,
      ...(failedChunkIds.length > 0
        ? [`${failedChunkIds.length}개 청크 분석에 실패해 결과가 일부 누락될 수 있습니다: ${failedChunkIds.join(', ')}`]
        : []),
      ...(candidateOverflow > 0
        ? [`후보가 너무 많아 근거 순서 기준 ${MAX_MERGED_CANDIDATES}건만 유지했습니다.`]
        : []),
    ]),
  };
}
