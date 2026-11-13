import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SearchX } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { useIpsiHub } from '../hooks/useIpsiHub';
import { normalizeSearchQuery, splitSearchTerms } from '../utils/search';
import { FeedSearchInput } from './FeedSearchInput';
import { CategoryFilterSelect } from './CategoryFilterSelect';
import { SearchTermsProvider } from './SearchHighlight';
import { FeedCard } from './FeedCard';
import { IpsiHubHeader } from './IpsiHubHeader';
import { TypeFilterChips, type FeedType } from './TypeFilterChips';
import { CategoryFilterChips } from './CategoryFilterChips';
import { ViewModeToggle, type ViewMode } from './ViewModeToggle';
import { ListView } from './ListView';
import type { VideoFeedItem } from '../types/feed';

const PAGE_SIZE = { card: 20, list: 30 } as const;

type Props = {
  canAdd: boolean;
  canAnalyze: boolean;
  onAddVideo: () => void;
  onOpenAnalysis: () => void;
  onPlayVideo: (item: VideoFeedItem) => void;
  onEditVideo: (item: VideoFeedItem) => void;
  onDeleteVideo: (id: string) => void;
  onToggleLike: (id: string, isLikedByUser: boolean) => void;
};

const VALID_VIEW_MODES: ViewMode[] = ['card', 'list'];

/** 입력을 멈춘 뒤 이만큼 기다렸다 찾는다 — 검색 한 번이 서버에서 수백 ms 라 글자마다 부르지 않는다 */
const SEARCH_DEBOUNCE_MS = 300;

export function IpsiHubFeed(props: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = ((searchParams.get('type') as FeedType) || 'all') as FeedType;
  const category = searchParams.get('category') || '전체';
  const viewParam = searchParams.get('view') as ViewMode | null;
  const view: ViewMode = viewParam && VALID_VIEW_MODES.includes(viewParam) ? viewParam : 'list';

  // 검색어의 정본은 URL(`?q=`) — 종류·태그·보기 방식과 같다. 새로고침·링크 공유에도 남는다.
  // 입력창은 초안(draft)을 따로 들고, 입력이 멈추면 URL 로 확정한다.
  const query = normalizeSearchQuery(searchParams.get('q'));
  const [draft, setDraft] = useState(() => searchParams.get('q') ?? '');
  const debouncedDraft = useDebounce(draft, SEARCH_DEBOUNCE_MS);
  const committedRef = useRef(query);

  const commitQuery = useCallback((raw: string) => {
    const next = normalizeSearchQuery(raw);
    if (next === committedRef.current) return;
    committedRef.current = next;
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next) params.set('q', next);
      else params.delete('q');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    commitQuery(debouncedDraft);
  }, [debouncedDraft, commitQuery]);

  // URL 이 바깥에서 바뀌면(링크로 들어옴 등) 입력창을 맞춘다. 우리가 확정한 값이면 건드리지 않는다 —
  // 그 사이 사용자가 더 친 글자를 덮어쓰면 안 된다.
  useEffect(() => {
    if (query !== committedRef.current) {
      committedRef.current = query;
      setDraft(query);
    }
  }, [query]);

  const clearSearch = () => {
    setDraft('');
    commitQuery('');
  };

  const pageSize = PAGE_SIZE[view];
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [type, category, view, query]);

  const { items, totalCount, videoCount, newsCount, loading, isFetching, refetch } = useIpsiHub({
    type,
    category,
    query,
    page: currentPage,
    pageSize,
  });
  const searchPending = normalizeSearchQuery(draft) !== query;

  // 페이지네이션은 서버(get_ipsi_hub_feed RPC)에서 처리되므로 items가 곧 현재 페이지다.
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = items;

  // 데이터 감소(예: 마지막 페이지에서 삭제)로 현재 페이지가 범위를 벗어나면 클램프.
  // → 빈 페이지를 다시 요청하지 않도록 currentPage 자체를 보정한다.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const setType = (t: FeedType) => {
    const next = new URLSearchParams(searchParams);
    next.set('type', t);
    next.delete('category');
    setSearchParams(next, { replace: true });
  };

  const setCategory = (c: string) => {
    const next = new URLSearchParams(searchParams);
    if (c === '전체') next.delete('category');
    else next.set('category', c);
    setSearchParams(next, { replace: true });
  };

  const setView = (v: ViewMode) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'list') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  const showAllCategories = () => {
    const next = new URLSearchParams(searchParams);
    next.set('type', 'all');
    next.delete('category');
    setSearchParams(next, { replace: true });
  };

  const renderContent = () => {
    if (loading && items.length === 0) {
      return <div className="py-12 text-center text-muted-foreground">불러오는 중...</div>;
    }
    if (items.length === 0 && query) {
      // 배지 수(video/news)는 종류·태그와 무관한 검색 결과 수라 "다른 분류에는 있다"를 알 수 있다
      const elsewhere = videoCount + newsCount;
      const narrowed = type !== 'all' || category !== '전체';
      return (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-slate-700">
            <span className="break-all">“{query}”</span>에 맞는 자료가{' '}
            {narrowed && elsewhere > 0 ? '이 분류에는 없습니다.' : '없습니다.'}
          </p>
          {splitSearchTerms(query).length > 1 && (
            <p className="mt-1 text-xs text-slate-500">여러 단어를 넣으면 모두 들어 있는 자료만 찾습니다.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {narrowed && elsewhere > 0 && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={showAllCategories}>
                전체 분류에서 {elsewhere}건 보기
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clearSearch}>
              검색어 지우기
            </Button>
          </div>
        </div>
      );
    }
    if (items.length === 0) {
      return <div className="py-12 text-center text-muted-foreground">표시할 콘텐츠가 없습니다.</div>;
    }

    if (view === 'card') {
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {pagedItems.map((item) => (
            <FeedCard
              key={`${item.kind}-${item.id}`}
              item={item}
              canAdd={props.canAdd}
              onPlay={props.onPlayVideo}
              onEdit={props.onEditVideo}
              onDelete={props.onDeleteVideo}
              onToggleLike={props.onToggleLike}
            />
          ))}
        </div>
      );
    }

    return (
      <ListView
        items={pagedItems}
        canAdd={props.canAdd}
        onPlay={props.onPlayVideo}
        onEdit={props.onEditVideo}
        onDelete={props.onDeleteVideo}
        onToggleLike={props.onToggleLike}
      />
    );
  };

  return (
    <div className="space-y-4">
      <IpsiHubHeader
        canAdd={props.canAdd}
        canAnalyze={props.canAnalyze}
        onAddVideo={props.onAddVideo}
        onOpenAnalysis={props.onOpenAnalysis}
        onRefresh={refetch}
        loading={loading}
        mobileLeadingSlot={
          <TypeFilterChips
            active={type}
            onChange={setType}
            videoCount={videoCount}
            newsCount={newsCount}
            iconOnly
          />
        }
        mobileTrailingSlot={<ViewModeToggle active={view} onChange={setView} />}
        mobileFilterSlot={
          <CategoryFilterSelect type={type} active={category} onChange={setCategory} />
        }
        searchSlot={
          <FeedSearchInput
            value={draft}
            onChange={setDraft}
            onCommit={() => commitQuery(draft)}
            onClear={clearSearch}
            busy={searchPending || (isFetching && !!query)}
          />
        }
      />

      <div className="hidden flex-wrap items-center justify-between gap-3 sm:flex">
        <TypeFilterChips
          active={type}
          onChange={setType}
          videoCount={videoCount}
          newsCount={newsCount}
        />
        <ViewModeToggle active={view} onChange={setView} />
      </div>

      <div className="hidden sm:block">
        <CategoryFilterChips type={type} active={category} onChange={setCategory} />
      </div>

      <SearchTermsProvider query={query}>{renderContent()}</SearchTermsProvider>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentPage(1)}
            disabled={safePage === 1}
            title="첫 페이지"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            title="이전"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[96px] text-center text-xs text-muted-foreground">
            {safePage} / {totalPages} 페이지
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            title="다음"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setCurrentPage(totalPages)}
            disabled={safePage >= totalPages}
            title="마지막 페이지"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
