import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Play,
  ThumbsUp,
  Edit,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { FeedItem, VideoFeedItem, NewsFeedItem } from '../types/feed';
import { extractYouTubeId } from '../utils/youtube';
import {
  AnalysisDrawer,
  NewsDetailDrawer,
  hasAnalysisContent,
  hasDetailContent,
} from './NewsDetailDrawer';
import { HighlightText, MatchSnippet } from './SearchHighlight';
import { newsSourceMeta } from '../utils/newsSources';

type Props = {
  items: FeedItem[];
  canAdd: boolean;
  onPlay: (item: VideoFeedItem) => void;
  onEdit: (item: VideoFeedItem) => void;
  onDelete: (id: string) => void;
  onToggleLike: (id: string, isLikedByUser: boolean) => void;
};


// 표처럼 헤더·행이 동일 grid-template-columns 사용. 모바일(<sm)에서는 세로 스택
const ROW_GRID =
  'sm:grid sm:grid-cols-[96px_minmax(0,1fr)_110px_90px] sm:gap-3 sm:items-center';

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\s/g, '');
}

function TableHeader() {
  return (
    <div
      className={`hidden rounded-t-md border border-b-0 border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${ROW_GRID}`}
    >
      <div>출처</div>
      <div>제목 / 요약</div>
      <div>분류</div>
      <div className="text-right">날짜</div>
    </div>
  );
}

function VideoRow({
  item,
  canAdd,
  isLast,
  onPlay,
  onEdit,
  onDelete,
  onToggleLike,
}: {
  item: VideoFeedItem;
  canAdd: boolean;
  isLast: boolean;
  onPlay: (item: VideoFeedItem) => void;
  onEdit: (item: VideoFeedItem) => void;
  onDelete: (id: string) => void;
  onToggleLike: (id: string, isLikedByUser: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasAnalysis = hasAnalysisContent(
    {
      corePoints: item.corePoints,
      strategyImplications: item.strategyImplications,
      cautions: item.cautions,
    },
    item.timestampedHighlights
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <div
        className={`group border-x border-b border-gray-200 bg-white transition-colors hover:bg-gray-50 ${
          isLast && !open ? 'rounded-b-md' : ''
        }`}
      >
        <div className={`${ROW_GRID} flex flex-col p-3 sm:flex-none`}>
          {/* 1열: 썸네일 (클릭 → 플레이어) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(item);
            }}
            className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded bg-muted sm:h-14 sm:w-24"
            title="영상 재생"
          >
            <img
              src={item.thumbnail || '/placeholder.svg'}
              alt={item.title}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.src = `https://img.youtube.com/vi/${extractYouTubeId(item.url)}/hqdefault.jpg`;
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Play className="h-5 w-5 text-white" />
            </div>
            <span className="absolute bottom-0.5 left-0.5 rounded bg-blue-600 px-1 py-0.5 text-[9px] font-medium text-white">
              영상
            </span>
          </button>

          {/* 2열: 제목/요약 (클릭 → 분석 서랍) + 액션 */}
          <CollapsibleTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              }}
              className="flex min-w-0 cursor-pointer flex-col gap-1 text-left"
              title={hasAnalysis ? '분석 내용 보기' : undefined}
            >
              <div className="flex items-start gap-1.5">
                <ChevronDown
                  className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
                    open ? 'rotate-180' : ''
                  } ${hasAnalysis ? '' : 'opacity-30'}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-blue-600">
                    <HighlightText text={item.title} />
                  </h4>
                  {item.headlineSummary && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      <HighlightText text={item.headlineSummary} />
                    </p>
                  )}
                  <MatchSnippet match={item.match} className="mt-1" />
                </div>
              </div>
              <div className="flex items-center gap-2 pl-5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 hover:bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLike(item.id, item.isLikedByUser);
                  }}
                >
                  <ThumbsUp
                    className={`h-3 w-3 ${
                      item.isLikedByUser ? 'fill-current text-blue-600' : 'text-gray-400'
                    }`}
                  />
                  <span
                    className={`text-[11px] ${
                      item.isLikedByUser ? 'font-medium text-blue-600' : 'text-gray-600'
                    }`}
                  >
                    {item.likes}
                  </span>
                </Button>
                {item.channelLabel && (
                  <span className="line-clamp-1 text-[11px] text-muted-foreground">
                    {item.channelLabel}
                  </span>
                )}
                {canAdd && (
                  <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-blue-50 hover:text-blue-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                      }}
                      title="수정"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-red-50 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                      title="삭제"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleTrigger>

          {/* 3열: 분류 */}
          <div>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
              {item.category}
            </span>
          </div>

          {/* 4열: 날짜 */}
          <div className="text-right text-xs text-gray-600">{formatDate(item.date)}</div>
        </div>

        <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out">
          <div className="border-t border-gray-200 bg-gray-50/40 p-3">
            <AnalysisDrawer
              sections={{
                corePoints: item.corePoints,
                strategyImplications: item.strategyImplications,
                cautions: item.cautions,
              }}
              highlights={item.timestampedHighlights}
              onJumpToTimestamp={() => {
                setOpen(false);
                onPlay(item);
              }}
            />
            <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(item);
                }}
              >
                <Play className="h-3.5 w-3.5" />
                영상 재생
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
              >
                <ChevronUp className="h-3.5 w-3.5" />
                접기
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function NewsRow({ item, isLast }: { item: NewsFeedItem; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const sourceMeta = newsSourceMeta(item.source);
  const hasDetail = hasDetailContent(item);

  const openOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <div
        className={`group border-x border-b border-gray-200 bg-white transition-colors hover:bg-gray-50 ${
          isLast && !open ? 'rounded-b-md' : ''
        }`}
      >
        <CollapsibleTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen((v) => !v);
              }
            }}
            className={`${ROW_GRID} flex cursor-pointer flex-col p-3 text-left sm:flex-none`}
          >
            {/* 1열: 출처 */}
            <div className="flex items-center gap-1.5">
              <ChevronDown
                className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
                  open ? 'rotate-180' : ''
                } ${hasDetail ? '' : 'opacity-30'}`}
                aria-hidden
              />
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sourceMeta.classes}`}
              >
                {sourceMeta.label}
              </span>
            </div>

            {/* 2열: 제목 + 요약 + 원문 */}
            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <h4 className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-foreground group-hover:text-blue-600">
                  <HighlightText text={item.title} />
                </h4>
                <button
                  onClick={openOriginal}
                  className="flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  title="원문 보기"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
              {item.headlineSummary && (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  <HighlightText text={item.headlineSummary} />
                </p>
              )}
              <MatchSnippet match={item.match} className="mt-1" />
            </div>

            {/* 3열: 분류 */}
            <div>
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                {item.category}
              </span>
            </div>

            {/* 4열: 날짜 */}
            <div className="text-right text-xs text-gray-600">{formatDate(item.date)}</div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out">
          <div className="border-t border-gray-200 bg-gray-50/40 p-3">
            <NewsDetailDrawer item={item} />
            <div className="mt-3 flex justify-center border-t border-gray-200 pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
              >
                <ChevronUp className="h-3.5 w-3.5" />
                접기
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ListView({ items, canAdd, onPlay, onEdit, onDelete, onToggleLike }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md">
      <TableHeader />
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return item.kind === 'video' ? (
          <VideoRow
            key={`video-${item.id}`}
            item={item}
            canAdd={canAdd}
            isLast={isLast}
            onPlay={onPlay}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleLike={onToggleLike}
          />
        ) : (
          <NewsRow key={`news-${item.id}`} item={item} isLast={isLast} />
        );
      })}
    </div>
  );
}
