/**
 * Analysis Tabs Component - 분석 탭 컨테이너
 * 7개 분석 탭 관리
 * evalog 스타일 디자인 적용
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useCourseAnalyze } from '../context';
import type { AnalysisTab } from '../types/course.types';

// Analysis tab components
import { SubjectCountTab } from './analysis/SubjectCountTab';
import { CombinationSearchTab } from './analysis/CombinationSearchTab';
import { InDepthTab } from './analysis/InDepthTab';
import { ClassViewTab } from './analysis/ClassViewTab';
import { EstimatedGradeTab } from './analysis/EstimatedGradeTab';
import { StudentEstimatedGradeTab } from './analysis/StudentEstimatedGradeTab';
import { GradeDistributionTab } from './analysis/GradeDistributionTab';
import { RoundComparisonTab } from './analysis/RoundComparisonTab';

// Tab configuration
const tabs: { id: AnalysisTab; label: string }[] = [
  { id: 'subject-count', label: '과목별 선택 학생 수' },
  { id: 'combination-search', label: '과목 조합 검색' },
  { id: 'in-depth', label: '간단 분석' },
  { id: 'class-view', label: '학급별 보기' },
  { id: 'estimated-grade', label: '과목별 예상 등급' },
  { id: 'student-estimated-grade', label: '학생별 예상 등급' },
  { id: 'grade-distribution', label: '등급 분포' },
  { id: 'round-comparison', label: '차수별 비교 분석' },
];

export function AnalysisTabs() {
  const { activeTab, setActiveTab } = useCourseAnalyze();

  return (
    <div className="h-full w-full flex flex-col">
      {/* Tab Navigation - evalog 스타일 */}
      <div className="bg-white/60 backdrop-blur-md border-b border-gray-200 px-4 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-1">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-lg transition-all duration-200",
                  "relative",
                  isActive
                    ? "text-brand-600 bg-brand-50/80 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/80"
                )}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50">
        <TabContent tab={activeTab} />
      </div>
    </div>
  );
}

// Tab content router
function TabContent({ tab }: { tab: AnalysisTab }) {
  switch (tab) {
    case 'subject-count':
      return <SubjectCountTab />;
    case 'combination-search':
      return <CombinationSearchTab />;
    case 'in-depth':
      return <InDepthTab />;
    case 'class-view':
      return <ClassViewTab />;
    case 'estimated-grade':
      return <EstimatedGradeTab />;
    case 'student-estimated-grade':
      return <StudentEstimatedGradeTab />;
    case 'grade-distribution':
      return <GradeDistributionTab />;
    case 'round-comparison':
      return <RoundComparisonTab />;
    default:
      return null;
  }
}
