/**
 * Admin Dashboard - 관리자 대시보드 메인 컴포넌트
 * 4단계 워크플로우: 파일 등록 → 내용 확인 → 과목 설정 → 파일 추출
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { DialogFooter,
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Database } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useCourseAnalyzeData } from '../../context/CourseAnalyzeContext';
import type { AdminStep } from '../../types/admin.types';

// Step components
import { FileRegistration } from './steps/FileRegistration';
import { FileContentDisplay } from './steps/FileContentDisplay';
import { SubjectCategorization } from './steps/SubjectCategorization';
import { FileExtract } from './steps/FileExtract';

// Step configuration - 간결한 아이콘
const steps: { step: AdminStep; label: string }[] = [
  { step: 1, label: '파일 등록' },
  { step: 2, label: '내용 확인' },
  { step: 3, label: '과목 설정' },
  { step: 4, label: '파일 추출' },
];

export function AdminDashboard() {
  const { state, closeDashboard, setStep, statistics } = useAdmin();
  const courseData = useCourseAnalyzeData();

  // 메인 시스템에 로드된 데이터가 있는지 확인
  const hasMainSystemData = courseData.students.length > 0;
  const mainSystemStats = {
    totalStudents: courseData.students.length,
    fileName: courseData.fileName,
    availableGrades: courseData.availableGrades,
    availableRounds: courseData.availableRounds,
  };

  return (
    <Dialog open={state.isOpen} onOpenChange={(open) => !open && closeDashboard()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header - 모던하고 깔끔한 디자인 */}
        <div className="pl-6 pr-12 py-4 flex-shrink-0 border-b bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between">
            {/* 제목 + 통계 */}
            <div className="flex items-center gap-4 min-w-0">
              <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                관리자
              </h1>
              <div className="flex items-center gap-3 text-xs text-slate-500 whitespace-nowrap">
                <span>파일 <strong className="text-slate-700 dark:text-slate-300">{statistics.totalFiles}</strong></span>
                <span>학생 <strong className="text-slate-700 dark:text-slate-300">{statistics.totalStudents}</strong></span>
                <span>과목 <strong className="text-slate-700 dark:text-slate-300">{statistics.totalUniqueSubjects}</strong></span>
                <span className="text-green-600">분류 <strong>{statistics.categorizedSubjects}</strong></span>
              </div>
              {hasMainSystemData && (
                <span className="flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded whitespace-nowrap">
                  <Database className="w-3 h-3" />
                  {mainSystemStats.totalStudents}명
                </span>
              )}
            </div>

            {/* Step Navigation - 간결한 탭 스타일 */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {steps.map((s) => {
                const isActive = state.currentStep === s.step;
                const isCompleted = state.currentStep > s.step;
                const isClickable = s.step <= state.currentStep || canNavigateToStep(s.step, state, hasMainSystemData);

                return (
                  <button
                    key={s.step}
                    onClick={() => isClickable && setStep(s.step)}
                    disabled={!isClickable}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-md transition-all whitespace-nowrap',
                      isActive && 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-medium',
                      isCompleted && !isActive && 'text-green-600 dark:text-green-400',
                      !isActive && !isCompleted && 'text-slate-500 dark:text-slate-400',
                      isClickable && !isActive && 'hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer',
                      !isClickable && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    {isCompleted && !isActive && '✓ '}{s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
          <StepContent step={state.currentStep} />
        </div>

        {/* Footer - 간결한 네비게이션 */}
        <div className="px-6 py-3 border-t bg-white dark:bg-slate-900 flex-shrink-0">
          <DialogFooter className="flex items-center justify-end gap-2">
            {state.currentStep > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((state.currentStep - 1) as AdminStep)}
                className="gap-1 text-slate-600"
              >
                <ChevronLeft className="h-4 w-4" />
                이전
              </Button>
            )}
            {state.currentStep < 4 && (
              <Button
                size="sm"
                onClick={() => setStep((state.currentStep + 1) as AdminStep)}
                disabled={!canNavigateToStep((state.currentStep + 1) as AdminStep, state, hasMainSystemData)}
                className="gap-1"
              >
                다음
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Step content router
function StepContent({ step }: { step: AdminStep }) {
  switch (step) {
    case 1:
      return <FileRegistration />;
    case 2:
      return <FileContentDisplay />;
    case 3:
      return <SubjectCategorization />;
    case 4:
      return <FileExtract />;
    default:
      return null;
  }
}

// Helper function to check if navigation to a step is allowed
function canNavigateToStep(
  targetStep: AdminStep,
  state: { files: Map<string, unknown>; currentStep: AdminStep },
  hasMainSystemData: boolean
): boolean {
  // Step 1 is always accessible
  if (targetStep === 1) return true;

  // Step 2-4 require at least one file uploaded OR main system data loaded
  const hasData = state.files.size > 0 || hasMainSystemData;
  if (targetStep >= 2 && !hasData) {
    return false;
  }

  // If main system data is loaded, allow access to all steps (2, 3, 4)
  // Otherwise, progressive navigation (can only go one step forward)
  if (hasMainSystemData) {
    return true;  // All steps accessible when main data is loaded
  }

  // Progressive navigation for admin files only
  return targetStep <= state.currentStep + 1;
}
