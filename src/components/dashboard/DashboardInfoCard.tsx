import { ImprovedCard } from '@/components/ui/improved-card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info, Image as ImageIcon, Cake, ChevronLeft, ChevronRight, File, ExternalLink } from 'lucide-react';
import { useDashboardInfoList, useTodayBirthdays, useAllCardItems } from '@/hooks/useDashboardInfo';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DashboardInfoCardProps {
  /** Box titles to hide (case-sensitive exact match). */
  excludeTitles?: string[];
}

export function DashboardInfoCard({ excludeTitles = [] }: DashboardInfoCardProps = {}) {
  const { data: allInfoBoxes = [], isLoading } = useDashboardInfoList();
  const { data: birthdays = [], isLoading: loadingBirthdays } = useTodayBirthdays();
  const { data: allItems = {} } = useAllCardItems();

  // Fetch documents for document type items
  const { data: documents = [] } = useQuery({
    queryKey: ['documents-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, file_name, storage_path')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // 각 카드별 아이템 인덱스를 관리 (카드 ID를 키로 사용)
  const [cardItemIndexes, setCardItemIndexes] = useState<Record<string, number>>({});
  const itemTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Filter active info boxes and exclude birthday type with no birthdays
  const activeInfoBoxes = useMemo(() => {
    const excludeSet = new Set(excludeTitles);
    return allInfoBoxes
      .filter(info => info.is_active)
      .filter(info => !excludeSet.has(info.title))
      .filter(info => {
        // Exclude birthday type if no birthdays today
        if (info.content_type === 'birthday' && birthdays.length === 0) {
          return false;
        }
        return true;
      });
  }, [allInfoBoxes, birthdays, excludeTitles]);

  // Handle document click
  const handleDocumentClick = (documentId: string) => {
    const doc = documents.find(d => d.id === documentId);
    if (doc?.storage_path) {
      window.open(doc.storage_path, '_blank');
    }
  };

  // 특정 카드의 아이템 인덱스 가져오기
  const getCardItemIndex = (cardId: string) => {
    return cardItemIndexes[cardId] || 0;
  };

  // 특정 카드의 아이템 인덱스 설정
  const setCardItemIndex = (cardId: string, index: number) => {
    setCardItemIndexes(prev => ({ ...prev, [cardId]: index }));
  };

  // 특정 카드의 다음 아이템으로 이동
  const goToNextItem = (cardId: string, itemsLength: number) => {
    if (itemsLength > 0) {
      const currentIndex = getCardItemIndex(cardId);
      setCardItemIndex(cardId, (currentIndex + 1) % itemsLength);
    }
  };

  // 특정 카드의 이전 아이템으로 이동
  const goToPrevItem = (cardId: string, itemsLength: number) => {
    if (itemsLength > 0) {
      const currentIndex = getCardItemIndex(cardId);
      setCardItemIndex(cardId, (currentIndex - 1 + itemsLength) % itemsLength);
    }
  };

  // 각 카드의 아이템 자동 전환 (10초)
  useEffect(() => {
    // 기존 타이머 모두 정리
    Object.values(itemTimersRef.current).forEach(timer => clearInterval(timer));
    itemTimersRef.current = {};

    // 각 카드별로 아이템이 2개 이상인 경우에만 타이머 설정
    activeInfoBoxes.forEach(infoBox => {
      if (infoBox.content_type === 'card') {
        const items = (allItems[infoBox.id] || []).sort((a, b) => a.display_order - b.display_order);
        if (items.length > 1) {
          itemTimersRef.current[infoBox.id] = setInterval(() => {
            goToNextItem(infoBox.id, items.length);
          }, 10000);
        }
      }
    });

    return () => {
      Object.values(itemTimersRef.current).forEach(timer => clearInterval(timer));
    };
  }, [activeInfoBoxes, allItems, cardItemIndexes]);

  if (isLoading) {
    return (
      <ImprovedCard>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
            <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
              <Info className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent hover:from-indigo-500 hover:to-indigo-600 transition-all duration-200 truncate">
              대시보드 정보
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </ImprovedCard>
    );
  }

  if (activeInfoBoxes.length === 0) {
    return (
      <ImprovedCard>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
            <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
              <Info className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent hover:from-indigo-500 hover:to-indigo-600 transition-all duration-200 truncate">
              대시보드 정보
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>표시할 정보가 없습니다.</p>
          </div>
        </CardContent>
      </ImprovedCard>
    );
  }

  return (
    <>
      {activeInfoBoxes.map((infoBox) => {
        const cardItems = infoBox.content_type === 'card'
          ? (allItems[infoBox.id] || []).sort((a, b) => a.display_order - b.display_order)
          : [];
        const currentItemIndex = getCardItemIndex(infoBox.id);
        const currentItem = cardItems[currentItemIndex];

        return (
          <ImprovedCard key={infoBox.id}>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-bold">
                <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer">
                  <Info className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <span className="bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent hover:from-indigo-500 hover:to-indigo-600 transition-all duration-200 truncate">
                  {infoBox.title}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full">
                {infoBox.content_type === 'card' ? (
                  <div className="space-y-4">
                    {cardItems.length > 0 ? (
                      <>
                        {(() => {
                          if (!currentItem) return null;

                          return (
                            <div key={currentItem.id}>
                              {currentItem.title && (
                                <h4 className="font-semibold text-sm mb-2 text-indigo-700">{currentItem.title}</h4>
                              )}
                              {currentItem.content_type === 'text' && (
                                <div className="prose prose-sm max-w-none">
                                  <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
                                    {currentItem.content}
                                  </p>
                                </div>
                              )}
                              {currentItem.content_type === 'image' && (
                                <div className="rounded-lg overflow-hidden border border-gray-200">
                                  <img
                                    src={currentItem.content}
                                    alt={currentItem.title || 'Card image'}
                                    className="w-full h-auto object-contain max-h-64"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const errorMsg = document.createElement('div');
                                      errorMsg.className = 'text-center py-4 text-muted-foreground';
                                      errorMsg.innerHTML = '<p class="text-sm">이미지를 불러올 수 없습니다</p>';
                                      e.currentTarget.parentElement?.appendChild(errorMsg);
                                    }}
                                  />
                                </div>
                              )}
                              {currentItem.content_type === 'birthday' && (
                                <div className="space-y-2">
                                  {loadingBirthdays ? (
                                    <div className="animate-pulse space-y-2">
                                      {Array.from({ length: 2 }).map((_, i) => (
                                        <div key={i} className="h-14 bg-gray-200 rounded"></div>
                                      ))}
                                    </div>
                                  ) : birthdays.length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground">
                                      <Cake className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                      <p className="text-sm">오늘 생일인 학생이 없습니다.</p>
                                    </div>
                                  ) : (
                                    birthdays.map((student, index) => (
                                      <div
                                        key={index}
                                        className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-pink-50 to-pink-100 border-pink-200"
                                      >
                                        <div className="p-1.5 rounded-lg bg-pink-500">
                                          <Cake className="h-4 w-4 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-semibold text-xs text-pink-900">
                                            {student.displayName}
                                          </p>
                                          <p className="text-xs text-pink-700">
                                            {student.grade}학년 {student.class}반 {student.number}번
                                          </p>
                                        </div>
                                        <div className="text-xs font-medium text-pink-600 bg-pink-200 px-2 py-0.5 rounded-full">
                                          생일 축하!
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                              {currentItem.content_type === 'document' && (
                                <Button
                                  variant="outline"
                                  className="w-full justify-start hover:bg-indigo-50"
                                  onClick={() => handleDocumentClick(currentItem.content)}
                                >
                                  <File className="h-4 w-4 mr-2 text-indigo-600" />
                                  <span className="flex-1 text-left">
                                    {documents.find(d => d.id === currentItem.content)?.title ||
                                     documents.find(d => d.id === currentItem.content)?.file_name ||
                                     '문서'}
                                  </span>
                                  <ExternalLink className="h-4 w-4 ml-2 text-indigo-600" />
                                </Button>
                              )}
                            </div>
                          );
                        })()}

                        {/* Carousel indicators - 아이템이 2개 이상일 때만 표시 */}
                        {cardItems.length > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-4">
                            <button
                              onClick={() => goToPrevItem(infoBox.id, cardItems.length)}
                              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                              aria-label="Previous item"
                            >
                              <ChevronLeft className="h-4 w-4 text-gray-600" />
                            </button>
                            <div className="flex items-center gap-1">
                              {cardItems.map((_, index) => (
                                <button
                                  key={index}
                                  onClick={() => setCardItemIndex(infoBox.id, index)}
                                  className={`h-2 rounded-full transition-all ${
                                    index === currentItemIndex
                                      ? 'w-6 bg-indigo-600'
                                      : 'w-2 bg-gray-300 hover:bg-gray-400'
                                  }`}
                                  aria-label={`Go to item ${index + 1}`}
                                />
                              ))}
                            </div>
                            <button
                              onClick={() => goToNextItem(infoBox.id, cardItems.length)}
                              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                              aria-label="Next item"
                            >
                              <ChevronRight className="h-4 w-4 text-gray-600" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <p className="text-sm">카드에 아이템이 없습니다.</p>
                      </div>
                    )}
                  </div>
                ) : infoBox.content_type === 'text' ? (
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
                      {infoBox.content}
                    </p>
                  </div>
                ) : infoBox.content_type === 'birthday' ? (
                  <div className="space-y-3">
                    {loadingBirthdays ? (
                      <div className="animate-pulse space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="h-16 bg-gray-200 rounded"></div>
                        ))}
                      </div>
                    ) : birthdays.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Cake className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>오늘 생일인 학생이 없습니다.</p>
                      </div>
                    ) : (
                      birthdays.map((student, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-pink-50 to-pink-100 border-pink-200 shadow-sm hover:shadow-md transition-all duration-200"
                        >
                          <div className="p-2 rounded-lg bg-pink-500 shadow-sm">
                            <Cake className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-pink-900">
                              {student.displayName}
                            </p>
                            <p className="text-xs text-pink-700">
                              {student.grade}학년 {student.class}반 {student.number}번
                            </p>
                          </div>
                          <div className="text-xs font-medium text-pink-600 bg-pink-200 px-3 py-1 rounded-full">
                            생일 축하합니다!
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={infoBox.content}
                      alt={infoBox.title}
                      className="w-full h-auto object-contain max-h-96"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const errorMsg = document.createElement('div');
                        errorMsg.className = 'text-center py-8 text-muted-foreground';
                        errorMsg.innerHTML = `
                          <div class="flex flex-col items-center gap-2">
                            <svg class="h-12 w-12 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p>이미지를 불러올 수 없습니다</p>
                          </div>
                        `;
                        e.currentTarget.parentElement?.appendChild(errorMsg);
                      }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </ImprovedCard>
        );
      })}
    </>
  );
}
