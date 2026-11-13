// ========================================
// 업무 이름의 가까움 — 글자 2-gram 겹침 (2026-11-12, 공문 제안 `docSuggestion.ts` 에서 옮김)
//
// 쓰는 곳: 공문 [내 일로]의 후보 업무 정렬 · «참고해서 시작»의 원본 정렬(작년 같은 일·비슷한 일).
// 형태소 분석 없이 붙여 쓴 한글 2-gram 의 겹침 / 짧은 쪽 크기 — «2025년 정보공시» ↔ «정보공시 자료 제출» 처럼
// 어순·조사·연도가 달라도 핵심 낱말이 겹치면 높게 나온다. 0~1.
// ========================================

export function bigrams(text: string): Set<string> {
  const s = text
    .replace(/\s+/g, '')
    .replace(/(?<!\d)20\d{2}(?:년|학년도)?/g, '') // 연도는 같은 일을 가르지 않는다
    .replace(/[()[\]«»"'.,·\-_/]/g, '');
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  for (const g of a) if (b.has(g)) n++;
  return n / Math.min(a.size, b.size);
}

/** 이름이 힌트들 중 가장 가까운 것과 얼마나 겹치나(0~1) */
export function similarityToHints(name: string, hints: readonly string[]): number {
  const n = bigrams(name);
  return hints.reduce((m, h) => Math.max(m, overlap(bigrams(h), n)), 0);
}
