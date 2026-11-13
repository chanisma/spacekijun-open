/**
 * 입시 정보 검색어 처리 — 서버 RPC(`get_ipsi_hub_feed` 의 p_query)와 **같은 규칙**이어야 한다.
 *
 * 서버: `left(query, 100)` → 공백으로 나눔 → 최대 8단어 → 소문자 → 공백을 지운 문서에서 모두 포함(AND).
 * 여기서도 같은 길이·개수로 자른다. 어긋나면 서버는 앞 8단어로 찾았는데 화면은 9번째 단어까지
 * 강조하는 식으로, 결과와 표시가 조용히 달라진다.
 */

export const MAX_SEARCH_QUERY_LENGTH = 100;
export const MAX_SEARCH_TERMS = 8;

/** 입력값 → 서버에 보낼 검색어(앞뒤 공백 제거, 연속 공백 한 칸, 100자). 비면 ''. */
export function normalizeSearchQuery(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
}

/** 검색어 → 강조할 단어(대소문자 무시 중복 제거, 입력 순서 유지, 최대 8개). */
export function splitSearchTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of normalizeSearchQuery(query).split(' ')) {
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }
  return terms;
}

export type HighlightSegment = { text: string; hit: boolean };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 글을 "일치 / 불일치" 조각으로 나눈다(대소문자 무시).
 * 긴 단어를 먼저 시도해 "수능최저"와 "수능"이 함께 있으면 긴 쪽이 통째로 강조된다.
 * 띄어쓰기가 다른 일치("정시모집" ↔ "정시 모집")는 강조하지 않는다 — 서버는 찾지만
 * 글자 위치를 특정할 수 없어서다(그래서 결과에는 나오되 강조 없이 보일 수 있다).
 */
export function highlightSegments(text: string, terms: string[]): HighlightSegment[] {
  if (!text) return [];
  const usable = terms.filter(Boolean);
  if (usable.length === 0) return [{ text, hit: false }];
  const pattern = new RegExp(
    `(${[...usable].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`,
    'gi',
  );
  const segments: HighlightSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), hit: false });
    segments.push({ text: match[0], hit: true });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: false });
  return segments;
}
