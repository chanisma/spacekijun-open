import { useState } from 'react';
import { RefreshCw, Trash2, ChevronDown, ChevronUp, Lightbulb, TrendingUp, Target, AlertTriangle, FileText, ExternalLink, Loader2, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CompoundAnalysisRecord } from '../../types/aiAnalysis';

type Props = {
  items: CompoundAnalysisRecord[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onLoadSources: (ids: string[]) => Promise<any[]>;
  onLoadVideoSources: (ids: string[]) => Promise<any[]>;
};

function formatDateTime(s: string): string {
  return new Date(s)
    .toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(/\s/g, '');
}

export function HistoryStep({ items, loading, onRefresh, onDelete, onLoadSources, onLoadVideoSources }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [sourcesById, setSourcesById] = useState<Record<string, any[]>>({});
  const [videoSourcesById, setVideoSourcesById] = useState<Record<string, any[]>>({});
  const [loadingSourcesId, setLoadingSourcesId] = useState<string | null>(null);

  const toggleOpen = async (rec: CompoundAnalysisRecord) => {
    if (openId === rec.id) {
      setOpenId(null);
      return;
    }
    setOpenId(rec.id);
    const needNews = !sourcesById[rec.id] && rec.sourceNewsIds.length > 0;
    const needVideos = !videoSourcesById[rec.id] && rec.sourceVideoIds.length > 0;
    if (needNews || needVideos) {
      setLoadingSourcesId(rec.id);
      try {
        const [newsRows, videoRows] = await Promise.all([
          needNews ? onLoadSources(rec.sourceNewsIds) : Promise.resolve(sourcesById[rec.id] ?? []),
          needVideos ? onLoadVideoSources(rec.sourceVideoIds) : Promise.resolve(videoSourcesById[rec.id] ?? []),
        ]);
        if (needNews) setSourcesById(prev => ({ ...prev, [rec.id]: newsRows }));
        if (needVideos) setVideoSourcesById(prev => ({ ...prev, [rec.id]: videoRows }));
      } finally {
        setLoadingSourcesId(null);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-2">
        <span className="text-xs text-slate-500">총 {items.length}건의 분석 결과</span>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="h-7 gap-1 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            저장된 분석 결과가 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map(rec => {
              const open = openId === rec.id;
              const sources = sourcesById[rec.id];
              const videoSources = videoSourcesById[rec.id];
              const sourcesLoading = loadingSourcesId === rec.id;
              const totalSources = rec.sourceNewsIds.length + rec.sourceVideoIds.length;
              return (
                <li key={rec.id} className="bg-white">
                  <button
                    type="button"
                    onClick={() => toggleOpen(rec)}
                    className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    {open ? (
                      <ChevronUp className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    ) : (
                      <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">
                          총 {totalSources}건
                        </span>
                        {rec.sourceNewsIds.length > 0 && (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-600">
                            뉴스 {rec.sourceNewsIds.length}
                          </span>
                        )}
                        {rec.sourceVideoIds.length > 0 && (
                          <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-600">
                            영상 {rec.sourceVideoIds.length}
                          </span>
                        )}
                        {rec.perspective && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5">
                            {rec.perspective}
                          </span>
                        )}
                        <span className="ml-auto">{formatDateTime(rec.createdAt)}</span>
                      </div>
                      <h4 className="mt-1 line-clamp-2 text-xs font-semibold text-slate-800">
                        {rec.title}
                      </h4>
                      {rec.summary && !open && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                          {rec.summary}
                        </p>
                      )}
                    </div>
                  </button>

                  {open && (
                    <div className="space-y-3 border-t border-slate-100 bg-slate-50/40 px-4 py-3">
                      {rec.summary && (
                        <Section
                          label="종합 총평"
                          Icon={FileText}
                          tone="text-slate-700"
                          bg="bg-white border-slate-200"
                        >
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                            {rec.summary}
                          </p>
                        </Section>
                      )}
                      {rec.keyFindings.length > 0 && (
                        <BulletSection
                          label="핵심 발견"
                          Icon={Lightbulb}
                          tone="text-amber-700"
                          bg="bg-amber-50/70 border-amber-200"
                          items={rec.keyFindings}
                        />
                      )}
                      {rec.trends.length > 0 && (
                        <BulletSection
                          label="트렌드"
                          Icon={TrendingUp}
                          tone="text-blue-700"
                          bg="bg-blue-50/70 border-blue-200"
                          items={rec.trends}
                        />
                      )}
                      {rec.strategy.length > 0 && (
                        <BulletSection
                          label="전략 시사점"
                          Icon={Target}
                          tone="text-emerald-700"
                          bg="bg-emerald-50/70 border-emerald-200"
                          items={rec.strategy}
                        />
                      )}
                      {rec.cautions.length > 0 && (
                        <BulletSection
                          label="유의사항"
                          Icon={AlertTriangle}
                          tone="text-rose-700"
                          bg="bg-rose-50/70 border-rose-200"
                          items={rec.cautions}
                        />
                      )}

                      {/* 출처 기사 */}
                      {rec.sourceNewsIds.length > 0 && (
                        <Section
                          label={`사용된 기사 (${rec.sourceNewsIds.length}건)`}
                          Icon={FileText}
                          tone="text-slate-700"
                          bg="bg-white border-slate-200"
                        >
                          {sourcesLoading ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              기사 정보 불러오는 중…
                            </div>
                          ) : sources && sources.length > 0 ? (
                            <ul className="space-y-1.5">
                              {sources.map((s: any) => (
                                <li key={s.id} className="flex items-start gap-1.5 text-[11px]">
                                  <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="line-clamp-1 flex-1 text-slate-700 hover:text-blue-600 hover:underline"
                                  >
                                    {s.title}
                                  </a>
                                  <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-400" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-[11px] text-slate-400">
                              연결된 기사를 찾지 못했습니다 (삭제됐을 수 있음).
                            </div>
                          )}
                        </Section>
                      )}

                      {/* 출처 영상 */}
                      {rec.sourceVideoIds.length > 0 && (
                        <Section
                          label={`사용된 영상 (${rec.sourceVideoIds.length}건)`}
                          Icon={Tv}
                          tone="text-rose-700"
                          bg="bg-white border-rose-200"
                        >
                          {sourcesLoading ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              영상 정보 불러오는 중…
                            </div>
                          ) : videoSources && videoSources.length > 0 ? (
                            <ul className="space-y-1.5">
                              {videoSources.map((v: any) => (
                                <li key={v.id} className="flex items-start gap-1.5 text-[11px]">
                                  <Tv className="mt-0.5 h-3 w-3 flex-shrink-0 text-rose-400" />
                                  <div className="min-w-0 flex-1">
                                    <a
                                      href={v.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="line-clamp-1 text-slate-700 hover:text-rose-600 hover:underline"
                                    >
                                      {v.title}
                                    </a>
                                    {v.channel_label && (
                                      <span className="text-[10px] text-slate-400">
                                        {v.channel_label}
                                      </span>
                                    )}
                                  </div>
                                  <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-400" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-[11px] text-slate-400">
                              연결된 영상을 찾지 못했습니다 (삭제됐을 수 있음).
                            </div>
                          )}
                        </Section>
                      )}

                      <div className="flex justify-end pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('이 분석 결과를 삭제하시겠습니까?')) {
                              onDelete(rec.id);
                            }
                          }}
                          className="h-7 gap-1 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3 w-3" />
                          삭제
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  Icon,
  tone,
  bg,
  children,
}: {
  label: string;
  Icon: typeof Lightbulb;
  tone: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-lg border p-3 ${bg}`}>
      <h3 className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </h3>
      {children}
    </section>
  );
}

function BulletSection({
  label,
  Icon,
  tone,
  bg,
  items,
}: {
  label: string;
  Icon: typeof Lightbulb;
  tone: string;
  bg: string;
  items: string[];
}) {
  return (
    <Section label={label} Icon={Icon} tone={tone} bg={bg}>
      <ul className="space-y-1.5">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="relative pl-3 text-xs leading-relaxed text-slate-700 before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-slate-400"
          >
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}
