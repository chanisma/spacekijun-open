import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAnalysisData } from '../../hooks/useAnalysisData';
import { useStudentDashboardContext } from '../../context/StudentDashboardContext';
import { useStudentDashboard, useAfterSchoolCounts } from '@/hooks/useStudentDashboard';
import { MiddleSchoolAnalysis } from './MiddleSchoolAnalysis';
import { ClassComparisonAnalysis } from './ClassComparisonAnalysis';
import { AttendanceGradeCorrelation } from './AttendanceGradeCorrelation';
import { SubjectSelectionAnalysis } from './SubjectSelectionAnalysis';
import { ComprehensiveActivityAnalysis } from './ComprehensiveActivityAnalysis';
import { Loader2 } from 'lucide-react';

type AnalysisTab = 'middle-school' | 'class-comparison' | 'attendance' | 'subject-selection' | 'activity';

/**
 * 성적이 주체인 분석 4종(성취도 추이·내신-모의고사·AI 성적예측·6·9월 모평)은
 * **시험 결과 분석(/evalearn)의 학년 분석으로 옮겼다** (2026-09-03).
 * 여기 남은 것은 학생의 다른 면이 주체인 분석이다 — 출신 중학교·출결·교과 선택·비교과 활동.
 * 학급별 비교는 대시보드 전용 데이터(방과후 수강 등)에 묶여 있어 남는다.
 */
const analysisTabs: { id: AnalysisTab; label: string }[] = [
  { id: 'middle-school', label: '출신 중학교별' },
  { id: 'class-comparison', label: '학급별 비교' },
  { id: 'attendance', label: '출결-성적' },
  { id: 'subject-selection', label: '교과 선택' },
  { id: 'activity', label: '종합 활동' },
];

export const AnalysisPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('middle-school');
  const { grade, classNum } = useStudentDashboardContext();

  const { data: analysisData = [], isLoading } = useAnalysisData(grade);

  // 기존 dashboard data (자습실 정보 포함)
  const { data: dashboardStudents = [] } = useStudentDashboard({ grade, classNum });
  const studentCodes = React.useMemo(() => dashboardStudents.map(s => s.student_code), [dashboardStudents]);
  const { data: afterschoolCounts } = useAfterSchoolCounts(studentCodes);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">분석 데이터를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* 상단 요약 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">학교 운영 분석</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {grade ? `${grade}학년` : '전체 학년'} | 총 {analysisData.length}명 분석
            </p>
          </div>
        </div>
      </div>

      {/* 분석 탭 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalysisTab)}>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-2">
          <TabsList className="w-full h-auto flex flex-wrap gap-1 bg-transparent">
            {analysisTabs.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="text-xs px-3 py-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-full"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="middle-school" className="mt-4">
          <MiddleSchoolAnalysis data={analysisData} />
        </TabsContent>
        <TabsContent value="class-comparison" className="mt-4">
          <ClassComparisonAnalysis
            data={analysisData}
            dashboardStudents={dashboardStudents}
            afterschoolCounts={afterschoolCounts}
            grade={grade}
          />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceGradeCorrelation data={analysisData} />
        </TabsContent>
        <TabsContent value="subject-selection" className="mt-4">
          <SubjectSelectionAnalysis data={analysisData} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ComprehensiveActivityAnalysis
            data={analysisData}
            dashboardStudents={dashboardStudents}
            afterschoolCounts={afterschoolCounts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
