import type { ReactNode } from 'react';
import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Sparkles } from 'lucide-react';

type Props = {
  canAdd: boolean;
  canAnalyze: boolean;
  onAddVideo: () => void;
  onOpenAnalysis: () => void;
  onRefresh: () => void;
  loading: boolean;
  /** 모바일 헤더 상단 줄의 왼쪽 영역(예: Type 필터 아이콘 버튼) */
  mobileLeadingSlot?: ReactNode;
  /** 모바일 헤더 상단 줄의 액션 버튼 앞쪽 영역(예: ViewModeToggle) */
  mobileTrailingSlot?: ReactNode;
  /** 모바일 헤더 하단 줄 왼쪽(태그 드롭다운). 검색창과 같은 줄에 선다 */
  mobileFilterSlot?: ReactNode;
  /** 검색창 — 데스크톱은 버튼과 같은 줄 왼쪽, 모바일은 아래 줄(태그 드롭다운 옆). 한 번만 그린다 */
  searchSlot?: ReactNode;
};

/**
 * 입시 정보 머리글 — **기능명·아이콘을 쓰지 않는다**(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1).
 * 건수는 바로 아래 종류 칩(`전체 (N)`·`동영상 (N)`·`뉴스 (N)`)이 이미 말한다.
 */

export function IpsiHubHeader({
  canAdd,
  canAnalyze,
  onAddVideo,
  onOpenAnalysis,
  onRefresh,
  loading,
  mobileLeadingSlot,
  mobileTrailingSlot,
  mobileFilterSlot,
  searchSlot,
}: Props) {
  return (
    <div className="mb-4">
      <ImprovedCard className="shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
        <CardHeader className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
          {/*
            한 줄 flex-wrap + order 로 배치한다. 검색창을 **한 번만** 그리려는 것이다 —
            데스크톱(sm↑)은 검색 | 버튼 한 줄, 모바일은 [종류][…][버튼] 아래에
            [태그 ▾][검색] 줄이 따로 선다(검색 줄이 w-full 이라 줄바꿈된다).
          */}
          <div className="flex flex-wrap items-center gap-2">
              {/* 모바일 전용 좌측 슬롯: Type 필터 아이콘 */}
              {mobileLeadingSlot && (
                <div className="order-1 flex items-center sm:hidden">{mobileLeadingSlot}</div>
              )}

              {(searchSlot || mobileFilterSlot) && (
                <div className="order-3 flex w-full items-center gap-2 border-t border-slate-100 pt-2 sm:order-2 sm:w-auto sm:flex-1 sm:border-0 sm:pt-0">
                  {mobileFilterSlot && <div className="shrink-0 sm:hidden">{mobileFilterSlot}</div>}
                  {searchSlot && <div className="min-w-0 flex-1 sm:max-w-md">{searchSlot}</div>}
                </div>
              )}

              <div className="order-2 ml-auto flex flex-shrink-0 items-center gap-2 sm:order-3">
                {/* 모바일 전용 액션 직전 슬롯: ViewModeToggle */}
                {mobileTrailingSlot && (
                  <div className="flex items-center sm:hidden">{mobileTrailingSlot}</div>
                )}
                {canAnalyze && (
                  <Button
                    variant="default"
                    size="icon"
                    onClick={onOpenAnalysis}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-sm transition-all hover:from-indigo-600 hover:to-blue-700 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm"
                    title="AI 분석"
                    aria-label="AI 분석"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">AI 분석</span>
                  </Button>
                )}
                {canAdd && (
                  <Button
                    variant="default"
                    size="icon"
                    onClick={onAddVideo}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-all hover:bg-blue-700 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm"
                    title="동영상 추가"
                    aria-label="동영상 추가"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">동영상 추가</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={loading}
                  className="flex h-8 items-center gap-1.5 rounded-lg border-slate-200 bg-white/50 px-2 text-xs transition-all hover:border-slate-300 hover:bg-white sm:px-3 sm:text-sm"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">새로고침</span>
                </Button>
              </div>
          </div>
        </CardHeader>
      </ImprovedCard>
    </div>
  );
}
