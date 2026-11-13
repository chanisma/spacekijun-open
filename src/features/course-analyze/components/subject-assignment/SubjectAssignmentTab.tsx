import React, { useState, useRef } from 'react';
import { useCourseAnalyzeData } from '../../context';
import { useSubjectAssignment } from '../../hooks/useSubjectAssignment';
import { SubjectConfigPanel } from './SubjectConfigPanel';
import { SubjectClassCard } from './SubjectClassCard';
import { AnalysisPageHeader } from '../common/AnalysisPageHeader';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LayoutGrid, Undo2, Redo2, Download, Upload, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SubjectAssignmentTab: React.FC = () => {
  const { currentStudents } = useCourseAnalyzeData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    enrollmentSummary,
    config,
    updateConfig,
    subjectConfigs,
    updateSubjectConfig,
    addSubjectConfig,
    removeSubjectConfig,
    autoConfigureSubjects,
    assignments,
    runAssignment,
    moveStudent,
    canUndo,
    canRedo,
    undo,
    redo,
    exportToExcel,
    importFromExcel,
    reset,
  } = useSubjectAssignment(currentStudents);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importFromExcel(file);
    e.target.value = '';
  };

  const rightContent = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={undo}
        disabled={!canUndo}
        className="h-8"
      >
        <Undo2 className="h-4 w-4 mr-1.5" />
        실행 취소
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={redo}
        disabled={!canRedo}
        className="h-8"
      >
        <Redo2 className="h-4 w-4 mr-1.5" />
        다시 실행
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        onChange={handleImport}
        className="hidden"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => fileInputRef.current?.click()}
        className="h-8"
      >
        <Upload className="h-4 w-4 mr-1.5" />
        가져오기
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={exportToExcel}
        disabled={assignments.length === 0}
        className="h-8"
      >
        <Download className="h-4 w-4 mr-1.5" />
        내보내기
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        size="sm"
        onClick={() => runAssignment(currentStudents)}
        disabled={subjectConfigs.length === 0}
        className="h-8"
      >
        <Play className="h-4 w-4 mr-1.5" />
        전체 실행
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={reset}
        className="h-8"
      >
        <RotateCcw className="h-4 w-4 mr-1.5" />
        초기화
      </Button>
    </div>
  );

  return (
    <div className="glass-panel p-6">
      <AnalysisPageHeader
        icon={LayoutGrid}
        title="과목별 반 배정"
        description="과목 선택 결과를 바탕으로 과목별 반을 자동 배정합니다"
        rightContent={rightContent}
      />

      <div className="flex gap-6 mt-6">
        {/* Left: Config Panel */}
        <div className="w-80 shrink-0">
          <SubjectConfigPanel
            config={config}
            enrollmentSummary={enrollmentSummary}
            onUpdateConfig={updateConfig}
            subjectConfigs={subjectConfigs}
            onUpdateSubjectConfig={updateSubjectConfig}
            onAddSubjectConfig={addSubjectConfig}
            onRemoveSubjectConfig={removeSubjectConfig}
            onAutoConfig={autoConfigureSubjects}
          />
        </div>

        {/* Right: Results */}
        <div className="flex-1 min-w-0">
          {assignments.length === 0 ? (
            <div className="bg-white/40 backdrop-blur-sm rounded-xl border border-slate-100/60 p-12 text-center">
              <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">
                배정 결과가 없습니다. 왼쪽에서 과목을 설정하고 배정을 실행하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => (
                <SubjectClassCard
                  key={`${assignment.subjectName}-${assignment.semester}`}
                  assignment={assignment}
                  onMoveStudent={moveStudent}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
