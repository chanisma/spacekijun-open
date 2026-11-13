/**
 * Analysis Content Component - 분석 콘텐츠
 * 탭별 콘텐츠 표시 (네비게이션은 Header에서 처리)
 */

import React from 'react';
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
import { ClassManagementTab } from './analysis/ClassManagementTab';

interface AnalysisContentProps {
  tab: AnalysisTab;
}

export function AnalysisContent({ tab }: AnalysisContentProps) {
  return (
    <div className="w-full md:h-full md:overflow-y-auto custom-scrollbar p-3 sm:p-4 md:p-6">
      <TabContent tab={tab} />
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
    case 'class-management':
      return <ClassManagementTab />;
    default:
      return null;
  }
}
