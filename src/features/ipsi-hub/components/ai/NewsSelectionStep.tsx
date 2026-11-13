import { useMemo, useState } from 'react';
import { Search, Check, ListChecks, ChevronRight, Tv, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  SelectableContent,
  SelectableNews,
  SelectableVideo,
} from '../../types/aiAnalysis';
import { NEWS_SOURCES as ALL_NEWS_SOURCES, newsSourceMeta } from '../../utils/newsSources';

type Props = {
  items: SelectableContent[];
  loading: boolean;
  selectedKeys: Set<string>; // `${kind}:${id}` 형태
  onToggle: (key: string) => void;
  onClear: () => void;
  onNext: () => void;
};


function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d)
    .toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
    .replace(/\s/g, '');
}

function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type KindFilter = 'all' | 'news' | 'video';
const KINDS: KindFilter[] = ['all', 'news', 'video'];
const KIND_LABEL: Record<KindFilter, string> = {
  all: '전체',
  news: '뉴스',
  video: '영상',
};

const NEWS_SOURCES: Array<SelectableNews['source'] | 'all'> = ['all', ...ALL_NEWS_SOURCES];

export function NewsSelectionStep({
  items,
  loading,
  selectedKeys,
  onToggle,
  onClear,
  onNext,
}: Props) {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SelectableNews['source'] | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      if (kindFilter !== 'all' && it.kind !== kindFilter) return false;
      if (it.kind === 'news' && sourceFilter !== 'all' && it.source !== sourceFilter) return false;
      if (!q) return true;
      const titleHit = it.title.toLowerCase().includes(q);
      const summaryHit = it.headlineSummary?.toLowerCase().includes(q) ?? false;
      const categoryHit = it.category?.toLowerCase().includes(q) ?? false;
      const channelHit =
        it.kind === 'video' && (it.channelLabel?.toLowerCase().includes(q) ?? false);
      return titleHit || summaryHit || categoryHit || channelHit;
    });
  }, [items, query, kindFilter, sourceFilter]);

  const newsCount = items.filter(i => i.kind === 'news').length;
  const videoCount = items.filter(i => i.kind === 'video').length;
  const selectedNewsCount = items.filter(
    i => i.kind === 'news' && selectedKeys.has(`news:${i.id}`)
  ).length;
  const selectedVideoCount = items.filter(
    i => i.kind === 'video' && selectedKeys.has(`video:${i.id}`)
  ).length;

  return (
    <div className="flex h-full flex-col">
      {/* 컨트롤 */}
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-white px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="제목·요약·분류·채널로 검색"
            className="h-8 pl-8 text-xs"
          />
        </div>
        {/* 콘텐츠 종류 토글 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {KINDS.map(k => {
            const active = kindFilter === k;
            const count =
              k === 'all' ? items.length : k === 'news' ? newsCount : videoCount;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {k === 'news' && <Newspaper className="h-3 w-3" />}
                {k === 'video' && <Tv className="h-3 w-3" />}
                {KIND_LABEL[k]} {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
        {/* 뉴스 출처 필터 (뉴스 모드 또는 전체일 때만) */}
        {kindFilter !== 'video' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {NEWS_SOURCES.map(s => {
              const label = s === 'all' ? '뉴스 전체' : newsSourceMeta(s, 'soft').label;
              const active = sourceFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSourceFilter(s)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <ListChecks className="h-3.5 w-3.5" />
          <span>
            선택{' '}
            <span className="font-semibold text-blue-600">{selectedKeys.size}</span> (뉴스{' '}
            {selectedNewsCount} / 영상 {selectedVideoCount}) · 표시 {filtered.length}건
          </span>
          {selectedKeys.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              선택 해제
            </button>
          )}
        </div>
      </div>

      {/* 표 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400">자료를 불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            조건에 맞는 자료가 없습니다.
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="w-20 px-2 py-2 text-left">종류/출처</th>
                <th className="px-2 py-2 text-left">제목</th>
                <th className="hidden w-20 px-2 py-2 text-left sm:table-cell">분류</th>
                <th className="w-20 px-2 py-2 text-right">일자</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => {
                const key = `${it.kind}:${it.id}`;
                const checked = selectedKeys.has(key);
                return (
                  <tr
                    key={key}
                    onClick={() => onToggle(key)}
                    className={`cursor-pointer border-b border-slate-100 transition-colors ${
                      checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          checked
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top">
                      {it.kind === 'news' ? (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${newsSourceMeta(it.source, 'soft').classes}`}
                        >
                          {newsSourceMeta(it.source, 'soft').label}
                        </span>
                      ) : (
                        <span
                          className="line-clamp-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700"
                          title={it.channelLabel ?? '영상'}
                        >
                          <Tv className="h-2.5 w-2.5" />
                          {it.channelLabel ?? '영상'}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="line-clamp-2 font-medium leading-snug text-slate-800">
                        {it.title}
                      </div>
                      {it.headlineSummary && (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                          {it.headlineSummary}
                        </div>
                      )}
                      {it.kind === 'video' && it.durationSeconds && (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          길이 {formatDuration(it.durationSeconds)}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-2 py-2 align-top text-[11px] text-slate-500 sm:table-cell">
                      {it.category ?? '—'}
                    </td>
                    <td className="px-2 py-2 text-right align-top text-[11px] text-slate-500">
                      {formatDate(it.articleDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 푸터 */}
      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <Button
          onClick={onNext}
          disabled={selectedKeys.size === 0}
          className="w-full gap-2"
        >
          선택한 {selectedKeys.size}건으로 검토 단계 진행
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// 미사용 타입 제거 방지를 위한 re-export (다른 곳에서 import할 수 있도록)
export type { SelectableVideo };
