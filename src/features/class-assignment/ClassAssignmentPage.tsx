import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { ClassAssignmentProvider, useClassAssignmentContext } from './context/ClassAssignmentContext';
import { ConfigPanel } from './components/config/ConfigPanel';
import { ClassAssignmentGrid } from './components/assignment/ClassAssignmentGrid';
import { PreviewPanel } from './components/preview/PreviewPanel';
import { ExportDialog } from './components/io/ExportDialog';
import { ImportDialog } from './components/io/ImportDialog';
import { useStudentData } from './hooks/useStudentData';
import { useSubjectAssignment } from './hooks/useSubjectAssignment';
import { useCourseStudentData } from './hooks/useCourseStudentData';
import { MainLayout } from './components/layout/MainLayout';
import { Header } from './components/layout/Header';
import { SubjectResultsGrid, SubjectConfigPanel } from './components/subject-assignment';
import './index.css';

// ============================================================================
// Class Mode Content
// ============================================================================

interface ModeContentProps {
  onModeChange: (mode: 'class' | 'subject') => void;
}

function ClassModeContent({ onModeChange }: ModeContentProps) {
  const {
    sourceStudents,
    setSourceStudents,
    config,
    assignments,
    canUndo,
    canRedo,
    undo,
    redo,
    runAssignment,
    reset,
    isAssigning,
  } = useClassAssignmentContext();

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const {
    students: dbStudents,
    selectionAcademicYear,
    isLoading: isLoadingStudents,
    isError,
    error,
  } = useStudentData({
    grade: config.grade,
    enabled: true,
  });

  useEffect(() => {
    if (dbStudents.length > 0) {
      setSourceStudents(dbStudents as any);
    }
  }, [dbStudents, setSourceStudents]);

  useEffect(() => {
    console.log('Class Assignment Data State:', {
      grade: config.grade,
      dbStudentsCount: dbStudents.length,
      sourceStudentsCount: sourceStudents.length,
      isLoading: isLoadingStudents,
      isError,
      error,
    });
  }, [config.grade, dbStudents.length, sourceStudents.length, isLoadingStudents, isError, error]);

  return (
    <>
      <MainLayout
        header={
          <Header
            mode="class"
            onModeChange={onModeChange}
            grade={config.grade}
            studentCount={sourceStudents.length}
            selectionAcademicYear={selectionAcademicYear}
            isLoading={isLoadingStudents}
            isError={isError}
            isAssigning={isAssigning}
            assignmentsCount={assignments.length}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onExport={() => setShowExportDialog(true)}
            onImport={() => setShowImportDialog(true)}
            onRun={runAssignment}
            onReset={reset}
          />
        }
        leftPanel={
          <div className="h-full p-4 bg-gray-50/50">
            <ConfigPanel />
          </div>
        }
        centerPanel={
          <div className="h-full">
            <ClassAssignmentGrid />
          </div>
        }
        rightPanel={
          <div className="h-full p-4 bg-gray-50/50">
            <PreviewPanel />
          </div>
        }
      />
      <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} />
      <ImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} />
    </>
  );
}

// ============================================================================
// Subject Mode Content
// ============================================================================

function SubjectModeContent({ onModeChange }: ModeContentProps) {
  const {
    currentStudents,
    currentGrade,
    setCurrentGrade,
    availableGrades,
    selectionAcademicYear,
  } = useCourseStudentData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    enrollmentSummary,
    config,
    updateConfig,
    subjectConfigs,
    updateSubjectConfig,
    addSubjectConfig,
    removeSubjectConfig,
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

  const handleImport = async () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importFromExcel(file);
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        onChange={handleFileChange}
        className="hidden"
      />
      <MainLayout
        header={
          <Header
            mode="subject"
            onModeChange={onModeChange}
            grade={currentGrade}
            studentCount={currentStudents.length}
            selectionAcademicYear={selectionAcademicYear}
            subjectCount={subjectConfigs.length}
            assignmentsCount={assignments.length}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onExport={exportToExcel}
            onImport={handleImport}
            onRun={() => runAssignment(currentStudents)}
            onReset={reset}
            runDisabled={subjectConfigs.length === 0}
            runLabel="전체 실행"
          />
        }
        leftPanel={
          <div className="h-full p-4 bg-gray-50/50">
            <SubjectConfigPanel
              config={config}
              enrollmentSummary={enrollmentSummary}
              onUpdateConfig={updateConfig}
              subjectConfigs={subjectConfigs}
              onUpdateSubjectConfig={updateSubjectConfig}
              onAddSubjectConfig={addSubjectConfig}
              onRemoveSubjectConfig={removeSubjectConfig}
              availableGrades={availableGrades}
              currentGrade={currentGrade}
              onGradeChange={setCurrentGrade}
            />
          </div>
        }
        centerPanel={
          <div className="h-full p-4">
            <SubjectResultsGrid
              assignments={assignments}
              onMoveStudent={moveStudent}
            />
          </div>
        }
      />
    </>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

function ClassAssignmentContent() {
  const [mode, setMode] = useState<'class' | 'subject'>('class');

  return (
    <Layout fullWidth={true}>
      <div className="class-assignment-wrapper">
        {mode === 'class' ? (
          <ClassModeContent onModeChange={setMode} />
        ) : (
          <SubjectModeContent onModeChange={setMode} />
        )}
      </div>
    </Layout>
  );
}

export function ClassAssignmentPage() {
  return (
    <ClassAssignmentProvider>
      <ClassAssignmentContent />
    </ClassAssignmentProvider>
  );
}

export default ClassAssignmentPage;
