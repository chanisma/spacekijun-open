import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, Play, ThumbsUp, Edit, ExternalLink, Tv } from 'lucide-react';
import type { VideoFeedItem } from '../types/feed';
import { extractYouTubeId } from '../utils/youtube';
import { AnalysisDrawer, hasAnalysisContent } from './NewsDetailDrawer';
import { HighlightText, MatchSnippet } from './SearchHighlight';

type Props = {
  item: VideoFeedItem;
  canAdd: boolean;
  onPlay: (item: VideoFeedItem) => void;
  onEdit: (item: VideoFeedItem) => void;
  onDelete: (id: string) => void;
  onToggleLike: (id: string, isLikedByUser: boolean) => void;
};

function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function formatDate(date: string | null): string {
  if (!date) return '날짜 없음';
  return new Date(date)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\s/g, '');
}

export function VideoCard({ item, canAdd, onPlay, onEdit, onDelete, onToggleLike }: Props) {
  const [open, setOpen] = useState(false);
  const duration = formatDuration(item.durationSeconds);
  const hasAnalysis = hasAnalysisContent(
    {
      corePoints: item.corePoints,
      strategyImplications: item.strategyImplications,
      cautions: item.cautions,
    },
    item.timestampedHighlights
  );

  const openOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  const playFromAnalysis = () => {
    setOpen(false);
    onPlay(item);
  };

  return (
    <>
      <div className="group flex h-full flex-col rounded-md border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md pt-3.5 pb-6">
        <button
          type="button"
          onClick={() => onPlay(item)}
          className="relative aspect-video w-full overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-blue-400"
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
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white">
              <Play className="h-6 w-6" />
            </span>
          </div>
          {duration && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {duration}
            </span>
          )}
        </button>

        <div className="flex flex-1 flex-col px-3 pt-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex-1 text-left"
              title="분석 내용 보기"
            >
              <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors hover:text-blue-600">
                <HighlightText text={item.title} />
              </h4>
            </button>
            {canAdd && (
              <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}
                  title="수정"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-red-50 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {item.headlineSummary ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-left"
              title="분석 내용 보기"
            >
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground hover:text-foreground">
                <HighlightText text={item.headlineSummary} />
              </p>
            </button>
          ) : null}
          <MatchSnippet match={item.match} className="mt-1.5" />

          <div className="mt-auto space-y-2 pt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="rounded-full bg-accent px-2 py-1">{item.category}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-auto gap-1 p-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLike(item.id, item.isLikedByUser);
                }}
              >
                <ThumbsUp
                  className={`h-3.5 w-3.5 transition-colors ${
                    item.isLikedByUser
                      ? 'fill-current text-blue-600'
                      : 'text-gray-400 hover:text-blue-500'
                  }`}
                />
                <span
                  className={`text-xs ${
                    item.isLikedByUser ? 'text-blue-600 font-medium' : 'text-gray-600'
                  }`}
                >
                  {item.likes}
                </span>
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="line-clamp-1 text-xs text-gray-600" title={item.channelLabel ?? undefined}>
                {item.channelLabel || item.createdByName || '알 수 없음'}
              </span>
              <span className="text-xs">{formatDate(item.date)}</span>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                영상
              </span>
              {item.channelLabel && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Tv className="h-3 w-3" />
                  {item.channelLabel}
                </span>
              )}
              {duration && (
                <span className="text-[11px] text-muted-foreground">{duration}</span>
              )}
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                {item.category}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">{formatDate(item.date)}</span>
            </div>
            <DialogTitle className="text-left text-base leading-snug">{item.title}</DialogTitle>
            {item.headlineSummary && (
              <DialogDescription className="text-left leading-relaxed">
                {item.headlineSummary}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="mt-2 space-y-3">
            {!hasAnalysis && (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-muted-foreground">
                아직 분석된 상세 정보가 없습니다.
              </div>
            )}
            <AnalysisDrawer
              sections={{
                corePoints: item.corePoints,
                strategyImplications: item.strategyImplications,
                cautions: item.cautions,
              }}
              highlights={item.timestampedHighlights}
              onJumpToTimestamp={() => playFromAnalysis()}
            />
          </div>

          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button variant="outline" onClick={openOriginal} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              YouTube에서 보기
            </Button>
            <Button onClick={playFromAnalysis} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              영상 재생
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
