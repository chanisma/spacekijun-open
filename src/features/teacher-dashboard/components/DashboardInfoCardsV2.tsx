import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cake,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  MessageSquareText,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAllCardItems, useDashboardInfoList, useTodayBirthdays } from '@/hooks/useDashboardInfo';
import type { DashboardInfoBox } from '@/types/dashboardInfo';
import { DashboardCardShell, DashboardCardSkeleton } from './DashboardCardShell';

interface DashboardInfoCardsV2Props {
  excludeTitles?: string[];
  cardClassName?: string;
  includeStandaloneContent?: boolean;
}

interface DashboardDocument {
  id: string;
  title: string | null;
  file_name: string | null;
  storage_path: string | null;
}

function normalizeTitle(title: string) {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

const TODAY_INFORMATION_TITLE = normalizeTitle('오늘의 정보');

function TodayInformationCarousel({
  items,
  renderItem,
}: {
  items: DashboardInfoBox[];
  renderItem: (item: DashboardInfoBox) => ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setActiveIndex((current) => (items.length > 0 ? current % items.length : 0));
  }, [items.length]);

  useEffect(() => {
    if (isPaused || items.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [activeIndex, isPaused, items.length]);

  const currentItem = items[activeIndex];
  if (!currentItem) return null;

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + items.length) % items.length);
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsPaused(false);
        }
      }}
    >
      <div className="min-h-36">{renderItem(currentItem)}</div>

      {items.length > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => move(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="이전 오늘의 정보"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5" aria-label={`${activeIndex + 1}/${items.length}`}>
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex
                    ? 'w-6 bg-indigo-500'
                    : 'w-1.5 bg-slate-200 hover:bg-slate-300'
                }`}
                aria-label={`${index + 1}번째 오늘의 정보 보기`}
                aria-current={index === activeIndex ? 'true' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => move(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="다음 오늘의 정보"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function DashboardInfoCardsV2({
  excludeTitles = [],
  cardClassName,
  includeStandaloneContent = false,
}: DashboardInfoCardsV2Props) {
  const { data: allInfoBoxes = [], isLoading: loadingBoxes } = useDashboardInfoList();
  const { data: allItems = {}, isLoading: loadingItems } = useAllCardItems();
  const { data: birthdays = [], isLoading: loadingBirthdays } = useTodayBirthdays();
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const excludedTitles = useMemo(
    () => new Set(excludeTitles.map(normalizeTitle)),
    [excludeTitles],
  );

  const activeCards = useMemo(() => (
    allInfoBoxes
      .filter((box) => box.is_active)
      .filter((box) => !excludedTitles.has(normalizeTitle(box.title)))
      .map((box) => ({
        ...box,
        items: (includeStandaloneContent && box.content_type !== 'card' ? [box] : (allItems[box.id] ?? []))
          .filter((item) => item.is_active)
          .filter((item) => (
            normalizeTitle(box.title) === TODAY_INFORMATION_TITLE
            || item.content_type !== 'birthday'
            || birthdays.length > 0
          ))
          .sort((a, b) => a.display_order - b.display_order),
      }))
      .filter((box) => box.items.length > 0)
  ), [allInfoBoxes, allItems, birthdays.length, excludedTitles, includeStandaloneContent]);

  const documentIds = useMemo(() => Array.from(new Set(
    activeCards.flatMap((box) => (
      box.items
        .filter((item) => item.content_type === 'document')
        .map((item) => item.content)
        .filter(Boolean)
    )),
  )), [activeCards]);

  const { data: documents = [] } = useQuery({
    queryKey: ['teacher-dashboard', 'documents', documentIds],
    queryFn: async (): Promise<DashboardDocument[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, file_name, storage_path')
        .in('id', documentIds);

      if (error) throw error;
      return data ?? [];
    },
    enabled: documentIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const documentsById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  );

  if (loadingBoxes || loadingItems) {
    return (
      <DashboardCardShell title="대시보드 정보" icon={Info} accent="indigo" className={cardClassName}>
        <DashboardCardSkeleton rows={2} />
      </DashboardCardShell>
    );
  }

  if (activeCards.length === 0) {
    return null;
  }

  const renderItem = (item: DashboardInfoBox) => {
    if (item.content_type === 'image') {
      return (
        <figure key={item.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
          <img
            src={item.content}
            alt={item.title || '대시보드 안내 이미지'}
            className="max-h-72 w-full object-contain"
          />
          {item.title && (
            <figcaption className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-2 text-xs font-medium text-slate-600">
              <ImageIcon className="h-3.5 w-3.5 text-indigo-500" /> {item.title}
            </figcaption>
          )}
        </figure>
      );
    }

    if (item.content_type === 'birthday') {
      return (
        <div key={item.id} className="rounded-xl border border-pink-200 bg-pink-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-pink-800">
            <Cake className="h-4 w-4" /> {item.title || '오늘의 생일'}
          </div>
          <div className="mt-2 space-y-1.5">
            {loadingBirthdays ? (
              <div className="h-8 animate-pulse rounded bg-pink-100" />
            ) : birthdays.length === 0 ? (
              <p className="py-3 text-center text-xs text-pink-600">오늘 생일인 학생이 없습니다.</p>
            ) : birthdays.map((student) => (
              <div key={`${student.grade}-${student.class}-${student.number}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-pink-900">{student.displayName}</span>
                <span className="text-pink-600">{student.grade}학년 {student.class}반 {student.number}번</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (item.content_type === 'document') {
      const document = documentsById.get(item.content);
      const label = item.title || document?.title || document?.file_name || '첨부 문서';

      return (
        <button
          key={item.id}
          type="button"
          disabled={!document?.storage_path}
          onClick={() => {
            if (!document?.storage_path) return;
            const newWindow = window.open(document.storage_path, '_blank', 'noopener,noreferrer');
            if (newWindow) newWindow.opener = null;
          }}
          className="teacher-dashboard-row flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600">
            <FileText className="h-4 w-4" />
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{label}</span>
          <ExternalLink className="h-4 w-4 flex-shrink-0 text-indigo-500" />
        </button>
      );
    }

    return (
      <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500" />
          <div className="min-w-0">
            {item.title && <p className="text-sm font-semibold text-slate-800">{item.title}</p>}
            <p className={`${item.title ? 'mt-1' : ''} whitespace-pre-wrap text-sm leading-6 text-slate-600`}>
              {item.content}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {activeCards.map((card) => {
        const expanded = expandedCards[card.id] ?? false;
        const visibleItems = expanded ? card.items : card.items.slice(0, 4);
        const isTodayInformation = normalizeTitle(card.title) === TODAY_INFORMATION_TITLE;

        return (
          <DashboardCardShell
            key={card.id}
            title={card.title}
            icon={Info}
            accent="indigo"
            description={isTodayInformation
              ? '오늘의 생일과 말씀을 10초마다 번갈아 보여 줍니다.'
              : `운영자가 등록한 안내 ${card.items.length}개를 유형별로 정리했습니다.`}
            className={cardClassName}
          >
            {isTodayInformation ? (
              <TodayInformationCarousel items={card.items} renderItem={renderItem} />
            ) : (
              <div className="space-y-3">
                {visibleItems.map(renderItem)}
                {card.items.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setExpandedCards((current) => ({
                      ...current,
                      [card.id]: !expanded,
                    }))}
                    className="w-full rounded-lg py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  >
                    {expanded ? '접기' : `나머지 ${card.items.length - 4}개 정보 보기`}
                  </button>
                )}
              </div>
            )}
          </DashboardCardShell>
        );
      })}
    </>
  );
}
