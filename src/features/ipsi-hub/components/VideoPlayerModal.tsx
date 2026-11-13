import { useEffect, useMemo, useRef, useState } from 'react';
import type { EducationalVideo } from '../hooks/useEducationalVideos';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { X, ExternalLink, Tv, Clock, Lightbulb, Target, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extractYouTubeId } from '../utils/youtube';
import { hasAnalysisContent } from './NewsDetailDrawer';
import type { TimestampedHighlight } from '../types/feed';

interface VideoPlayerModalProps {
  video: EducationalVideo | null;
  onClose: () => void;
}

function formatDuration(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">데이터가 없습니다.</p>
    );
  }
  return (
    <ul className="space-y-1 pl-1">
      {items.map((line, idx) => (
        <li
          key={idx}
          className="relative pl-3 text-xs leading-relaxed text-gray-700 before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-gray-400"
        >
          {line}
        </li>
      ))}
    </ul>
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asHighlights(value: unknown): TimestampedHighlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const rec = entry as Record<string, unknown>;
      const time = typeof rec.time_sec === 'number' ? rec.time_sec : Number(rec.time_sec);
      const note = typeof rec.note === 'string' ? rec.note : '';
      if (!Number.isFinite(time) || !note) return null;
      return { timeSec: Math.max(0, Math.floor(time)), note };
    })
    .filter((v): v is TimestampedHighlight => v !== null);
}

export function VideoPlayerModal({ video, onClose }: VideoPlayerModalProps) {
  const videoId = video ? extractYouTubeId(video.url) : null;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [startSec, setStartSec] = useState<number>(0);

  useEffect(() => {
    setStartSec(0);
  }, [video?.id]);

  const meta = (video?.meta ?? {}) as Record<string, any>;
  const sections = useMemo(
    () => ({
      corePoints: asStringArray(meta.core_points),
      strategyImplications: asStringArray(meta.strategy_implications),
      cautions: asStringArray(meta.cautions),
    }),
    [meta]
  );
  const highlights = useMemo(() => asHighlights(meta.timestamped_highlights), [meta]);
  const hasAnalysis = hasAnalysisContent(sections, highlights);
  const duration = formatDuration(video?.duration_seconds);

  if (!video || !videoId) return null;

  const handleOpenInNewWindow = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'pauseVideo',
          args: [],
        }),
        '*'
      );
    }

    const width = 1280;
    const height = 720;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const url = startSec > 0 ? `${video.url}${video.url.includes('?') ? '&' : '?'}t=${startSec}s` : video.url;

    window.open(
      url,
      '_blank',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  const embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1${
    startSec > 0 ? `&start=${startSec}` : ''
  }`;

  return (
    <Dialog open={!!video} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader>
          <VisuallyHidden>
            <DialogTitle>{video.title}</DialogTitle>
          </VisuallyHidden>
        </DialogHeader>
        <div className="relative">
          <div className="absolute right-2 top-2 z-10 flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={handleOpenInNewWindow}
              title="새 창에서 열기 (PIP 사용 가능)"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="aspect-video w-full">
            <iframe
              key={`${videoId}-${startSec}`}
              ref={iframeRef}
              src={embedSrc}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
          <div className="space-y-4 p-6">
            <div>
              <h2 className="text-xl font-medium text-foreground">{video.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {video.channel_label && (
                  <span className="flex items-center gap-1">
                    <Tv className="h-3.5 w-3.5" />
                    {video.channel_label}
                  </span>
                )}
                {duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {duration}
                  </span>
                )}
                <span className="rounded-full bg-accent px-2 py-1 text-xs">{video.category}</span>
                <span className="text-xs">
                  {new Date(
                    video.article_date ?? video.collected_at ?? video.created_at
                  ).toLocaleDateString('ko-KR')}
                </span>
              </div>
              {video.headline_summary && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {video.headline_summary}
                </p>
              )}
            </div>

            {hasAnalysis && (
              <div className="border-t border-gray-200 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* 1행 좌: 타임스탬프 하이라이트 */}
                  <section className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
                    <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600">
                      <Clock className="h-3.5 w-3.5" />
                      타임스탬프 하이라이트
                    </h5>
                    {highlights.length === 0 ? (
                      <p className="text-xs text-muted-foreground">데이터가 없습니다.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {highlights.map((h, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStartSec(h.timeSec);
                              }}
                              className="mt-0.5 rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-violet-700 hover:bg-violet-200"
                            >
                              {formatTimestamp(h.timeSec)}
                            </button>
                            <span className="flex-1 text-gray-700">{h.note}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* 1행 우: 핵심 포인트 */}
                  <section className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
                    <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                      <Lightbulb className="h-3.5 w-3.5" />
                      핵심 포인트
                    </h5>
                    <BulletList items={sections.corePoints} />
                  </section>

                  {/* 2행 좌: 전략 시사점 */}
                  <section className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
                    <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                      <Target className="h-3.5 w-3.5" />
                      전략 시사점
                    </h5>
                    <BulletList items={sections.strategyImplications} />
                  </section>

                  {/* 2행 우: 유의사항 */}
                  <section className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
                    <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      유의사항
                    </h5>
                    <BulletList items={sections.cautions} />
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
