import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { highlightSegments, splitSearchTerms } from '../utils/search';
import type { FeedItemMatch } from '../types/feed';

/**
 * 지금 검색어를 카드·목록 행에 내려 준다. 행 부품마다 prop 으로 받게 하면 FeedCard →
 * VideoCard/NewsCard → ListView 의 두 행까지 다섯 곳을 뚫어야 해서 문맥으로 둔다.
 */
const SearchTermsContext = createContext<string[]>([]);

export function SearchTermsProvider({ query, children }: { query: string; children: ReactNode }) {
  const terms = useMemo(() => splitSearchTerms(query), [query]);
  return <SearchTermsContext.Provider value={terms}>{children}</SearchTermsContext.Provider>;
}

/** 검색어와 일치하는 부분을 형광펜으로 칠한 글. 검색 중이 아니면 글 그대로. */
export function HighlightText({ text }: { text: string | null | undefined }) {
  const terms = useContext(SearchTermsContext);
  if (!text) return null;
  if (terms.length === 0) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, terms).map((segment, index) =>
        segment.hit ? (
          <mark key={index} className="rounded-sm bg-yellow-200/80 px-0.5 text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * 제목·요약에 안 보이는 검색어를 어디서 찾았는지 — 서버가 준 발췌를 한 줄로.
 * 본문·자막에서만 찾은 결과가 "왜 나왔는지"를 말해 준다(없으면 사용자는 결과를 의심한다).
 */
export function MatchSnippet({ match, className = '' }: { match?: FeedItemMatch | null; className?: string }) {
  if (!match?.snippet) return null;
  return (
    <p className={`line-clamp-2 text-[11px] leading-relaxed text-slate-500 ${className}`}>
      <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-600">{match.field}</span>
      <HighlightText text={match.snippet} />
    </p>
  );
}
