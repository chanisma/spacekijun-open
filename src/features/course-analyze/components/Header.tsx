/**
 * Header Component - 상단 헤더
 * evalog 스타일 디자인 적용
 */

import React, { useState } from 'react';
import { BarChart3, Settings, Printer, Users } from 'lucide-react';
import { useCourseAnalyzeData } from '../context';
import { useClassManagementAccess } from '../hooks/useClassManagementAccess';
import type { AnalysisTab } from '../types/course.types';
import { PrintSlipsDialog } from './PrintSlipsDialog';
import { useLeftPanelControl } from './layout/MainLayout';

// Tab configuration
const tabs: { id: AnalysisTab; label: string; icon?: React.ReactNode }[] = [
  { id: 'subject-count', label: '과목별 선택' },
  { id: 'combination-search', label: '조합 검색' },
  { id: 'in-depth', label: '간단 분석' },
  { id: 'class-view', label: '학급별 보기' },
  { id: 'estimated-grade', label: '과목별 예상등급' },
  { id: 'student-estimated-grade', label: '학생별 예상등급' },
  { id: 'grade-distribution', label: '등급 분포' },
  { id: 'round-comparison', label: '차수 비교' },
];

interface HeaderProps {
  activeTab: AnalysisTab;
  onTabChange: (tab: AnalysisTab) => void;
  onAdminClick?: () => void;
}

export function Header({ activeTab, onTabChange, onAdminClick }: HeaderProps) {
  const {
    students,
    cacheInfo,
    currentStudents,
    currentGrade,
    currentRound,
    availableRounds,
  } = useCourseAnalyzeData();
  const access = useClassManagementAccess();
  const hasData = students.length > 0;
  const hasCurrentSelection = availableRounds.includes(currentRound);
  const [printOpen, setPrintOpen] = useState(false);
  const leftPanel = useLeftPanelControl();

  // 담임/부장/admin 에게만 "학급 관리" 탭 노출
  const visibleTabs = access.canManage
    ? [...tabs, { id: 'class-management' as const, label: '학급 관리' }]
    : tabs;

  return (
    <header className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white/60 backdrop-blur-md border-b border-white/20 relative z-40 supports-[backdrop-filter]:bg-white/60 shrink-0">
      {/* 적응형: 첫 줄 = 제목 | 정보, 둘째 줄 = 탭(가운데 정렬).
          모바일(md 미만)은 탭이 여러 줄로 접혀 전부 보인다 — 가로 스크롤은 뒤쪽 탭이 있다는
          사실 자체를 감춘다. 데스크톱은 한 줄 알약 그대로(폭이 모자라면 그 줄만 가로 스크롤). */}
      <div className="flex flex-wrap items-center justify-between w-full gap-x-4 gap-y-2">
        {/* 왼쪽 섹션: 타이틀 - evalog 타이포그래피 */}
        <div className="flex items-center gap-6 shrink-0 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2.5 py-1 rounded-md text-xs font-bold shadow-sm tracking-wide whitespace-nowrap flex items-center gap-1.5">
              <BarChart3 size={12} />
              ANALYZE
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <span className="text-slate-800 text-sm font-bold tracking-tight whitespace-nowrap truncate">
                선택과목 분석 도우미
              </span>
            </div>
          </div>
        </div>

        {/* 중앙 섹션: 탭 메뉴 */}
        {hasData && (
          <div className="order-last basis-full min-w-0 flex justify-center">
            <nav className="flex flex-wrap md:flex-nowrap items-center justify-center gap-1 max-w-full md:overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-white/50 backdrop-blur-sm px-1.5 md:px-2 py-1 rounded-2xl md:rounded-full border border-white/40 shadow-sm">
              {visibleTabs.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`
                      shrink-0 px-3 py-2 md:py-1.5 text-xs font-medium whitespace-nowrap rounded-full transition-all duration-200
                      ${isActive
                        ? 'text-white bg-gradient-to-r from-brand-500 to-brand-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/80'
                      }
                    `}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {/* 오른쪽 섹션: 정보 - evalog 타이포그래피 */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0 justify-end ml-auto">
          {/* 데이터 현황 카드 — 현재 선택된 학년/차수 기준 */}
          {cacheInfo && (
            <div className="flex items-center gap-2 sm:gap-3 bg-white/50 px-2.5 sm:px-3 py-1 rounded-full border border-white/40 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="hidden md:inline text-slate-500 font-medium scale-90 origin-right whitespace-nowrap">학생현황</span>
                <div className="flex items-baseline gap-0.5 whitespace-nowrap">
                  <span className="font-bold text-brand-600">
                    {hasCurrentSelection ? currentStudents.length : cacheInfo.totalStudents}
                  </span>
                  <span className="text-slate-400 text-xs">명</span>
                </div>
              </div>

              <div className="w-px h-2.5 bg-slate-200 shrink-0"></div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="hidden md:inline text-slate-500 font-medium scale-90 origin-right whitespace-nowrap">학년</span>
                <span className="font-bold text-brand-600 whitespace-nowrap">
                  {currentGrade}학년
                </span>
              </div>

              {hasCurrentSelection && (
                <>
                  <div className="w-px h-2.5 bg-slate-200 shrink-0"></div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="hidden md:inline text-slate-500 font-medium scale-90 origin-right whitespace-nowrap">차수</span>
                    <span className="font-bold text-brand-600 whitespace-nowrap">
                      {currentRound}차
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 휴대폰: 학생 목록(학년도·학년·차수 선택 포함) 서랍 입구 */}
          {leftPanel?.isNarrow && (
            <button
              type="button"
              onClick={leftPanel.openLeftPanel}
              aria-label="학생 목록"
              title="학년도·학년·차수 선택과 학생 목록"
              className="h-9 w-9 -mx-1 rounded-lg text-slate-500 hover:text-slate-800 active:bg-slate-100 flex items-center justify-center"
            >
              <Users size={16} />
            </button>
          )}

          {hasData && hasCurrentSelection && (
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              className="text-slate-500 hover:text-slate-800 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
              title="반을 골라 학생별 과목 선택 확인표를 A4로 출력합니다"
              aria-label="출력"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">출력</span>
            </button>
          )}

          <div className="w-px h-3 bg-slate-200 mx-1 shrink-0"></div>

          {onAdminClick && (
            <button
              onClick={onAdminClick}
              aria-label="Admin"
              className="text-slate-500 hover:text-slate-800 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
            >
              <Settings size={14} />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}
        </div>
      </div>
      <PrintSlipsDialog open={printOpen} onOpenChange={setPrintOpen} />
    </header>
  );
}
