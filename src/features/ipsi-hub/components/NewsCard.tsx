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
import { ExternalLink, Newspaper } from 'lucide-react';
import type { NewsFeedItem } from '../types/feed';
import { NewsDetailDrawer } from './NewsDetailDrawer';
import { HighlightText, MatchSnippet } from './SearchHighlight';
import { newsSourceMeta } from '../utils/newsSources';

type Props = {
  item: NewsFeedItem;
};


function formatDate(date: string | null): string {
  if (!date) return '날짜 없음';
  return new Date(date)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\s/g, '');
}

export function NewsCard({ item }: Props) {
  const sourceMeta = newsSourceMeta(item.source);
  const [open, setOpen] = useState(false);

  const openOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex h-full w-full flex-col rounded-md border border-gray-200 bg-white text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceMeta.classes}`}
            >
              {sourceMeta.label}
            </span>
            {item.academicYear && (
              <span className="text-[11px] text-muted-foreground">{item.academicYear}</span>
            )}
          </div>

          <h4
            className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-blue-600"
            title={item.title}
          >
            <HighlightText text={item.title} />
          </h4>

          {item.headlineSummary && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              <HighlightText text={item.headlineSummary} />
            </p>
          )}
          <MatchSnippet match={item.match} className="mt-2" />

          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-accent px-2 py-1 text-xs text-muted-foreground">
                {item.category}
              </span>
              <span className="text-xs text-gray-600">{formatDate(item.date)}</span>
            </div>
          </div>
        </div>

        <div className="absolute -top-2 -right-2 hidden">
          <Newspaper className="h-4 w-4" />
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceMeta.classes}`}
              >
                {sourceMeta.label}
              </span>
              {item.academicYear && (
                <span className="text-[11px] text-muted-foreground">{item.academicYear}</span>
              )}
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                {item.category}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {formatDate(item.date)}
              </span>
            </div>
            <DialogTitle className="text-left text-base leading-snug">{item.title}</DialogTitle>
            {item.headlineSummary && (
              <DialogDescription className="text-left leading-relaxed">
                {item.headlineSummary}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="mt-2">
            <NewsDetailDrawer item={item} />
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="gap-1.5">
              닫기
            </Button>
            <Button onClick={openOriginal} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              원문 보기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
