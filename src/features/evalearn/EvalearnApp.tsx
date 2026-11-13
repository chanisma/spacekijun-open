import { useCallback, useState } from 'react';
import './index.css';
import { Layout } from '@/components/layout/Layout';
import MainLayout from './components/layout/MainLayout';
import Header from './components/layout/Header';
import StudentList from './components/student/StudentList';
import AnalysisPanel from './components/analysis/AnalysisPanel';
import WritingPanel from './components/writing/WritingPanel';
import CohortAnalysisPanel from './components/analysis/CohortAnalysisPanel';
import { useStudentState } from './hooks/useStudentState';
import { useStudentStore } from './hooks/useStudentStore';
import { useStudentSelfMockData } from './hooks/useStudentSelfMockData';
import { useAuth } from '@/components/auth/AuthProvider';
import { useStudentDeepLink } from '@/hooks/useStudentDeepLink';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';

function EvalearnApp() {
  const { isStudentView } = useAuth();
  const isStudent = isStudentView;

  // ─────────────────────────────────────────────────────────
  // 학생 모드: 본인 데이터만 로드.
  // ─────────────────────────────────────────────────────────
  const selfData = useStudentSelfMockData(isStudent);

  if (isStudent) {
    const { student: selfStudent, loading: selfLoading, error: selfError } = selfData;
    return (
      <Layout>
        <div className="evalearn-wrapper h-[calc(100vh-120px)] md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 overflow-hidden">
          <div className="flex flex-col h-full bg-gray-50">
            <Header student={selfStudent} studentCount={selfStudent ? 1 : 0} />

            {selfLoading ? (
              <div className="flex items-center justify-center flex-1">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : selfError ? (
              <div className="flex items-center justify-center flex-1">
                <div className="text-center text-muted-foreground p-8">
                  <p className="text-lg font-medium mb-2">데이터를 불러올 수 없습니다</p>
                  <p className="text-sm">{selfError}</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto custom-scrollbar bg-white">
                <AnalysisPanel student={selfStudent} />
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // ─────────────────────────────────────────────────────────
  // 교사/관리자 모드: 기존 3-패널 레이아웃
  // ─────────────────────────────────────────────────────────
  return <TeacherView />;
}

function TeacherView() {
  const {
    students,
    selectedStudent,
    loading,
    handleSelectStudent,
    loadStudents,
    searchTerm,
    setSearchTerm,
    searchResults,
    searching,
  } = useStudentState();

  /*
    집단(학년/반) 분석 대상. 학생을 고르면 해제되어 개인 분석으로 돌아간다.

    ## 스토어에 둔다 — 마지막 화면이 복원되어야 한다 (2026-09-05 사용자 지적)
    종전엔 `useState` 라 새로고침하면 사라졌고, 저장된 `selectedStudentId` 만 남아
    **항상 개인 화면으로 돌아왔다**. "3학년 전체"나 "3학년 5반"을 보고 있었다면
    그 화면이 복원되어야 한다. 배타 규칙(학생 선택 시 해제)은 스토어가 갖는다.
  */
  const cohort = useStudentStore(st => st.selectedCohort);
  const setCohort = useStudentStore(st => st.setSelectedCohort);

  // 헤더 통합 검색 딥링크 (?student=학생코드): 학년/반 필터를 맞춘 뒤 학생 선택.
  // 재학생 명단 기준(resource)으로 조회 — student_basic_info는 졸업/전출/자퇴생도
  // 포함하므로 "현재" 학년/반 조회에는 쓰지 않는다.
  useStudentDeepLink(useCallback(async (code: string) => {
    try {
      const { data, error } = await supabase
        .from('resource')
        .select('meta')
        .eq('type', 'student')
        .eq('status', 'active')
        .eq('meta->>id', code)
        .maybeSingle();
      if (error) throw error;
      const meta = data?.meta as { grade?: number; class?: number } | undefined;
      if (!meta?.grade || !meta?.class) {
        toast.error('학생 정보를 찾을 수 없습니다.');
        return;
      }
      // 필터가 다를 때만 변경 (setter가 학생 목록을 초기화하므로 동일 값 재설정 금지)
      const store = useStudentStore.getState();
      if (store.filterGrade !== meta.grade) store.setFilterGrade(meta.grade);
      if (useStudentStore.getState().filterClass !== meta.class) {
        useStudentStore.getState().setFilterClass(meta.class);
      }
      // 목록 로드가 끝나면 selectedStudentId 기준으로 자동 매칭됨
      useStudentStore.getState().setSelectedStudentId(code);
    } catch (err) {
      console.error('Failed to load student from deep link:', err);
      toast.error('학생 정보를 불러오지 못했습니다.');
    }
  }, []));

  return (
    <Layout>
      <div className="evalearn-wrapper h-[calc(100vh-120px)] md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 overflow-hidden">
        <MainLayout
          header={
            <Header
              student={selectedStudent}
              studentCount={students.length}
              cohort={cohort}
            />
          }
          leftPanel={
            <StudentList
              selectedStudentId={selectedStudent?.id ?? null}
              /* 집단 해제는 `setSelectedStudentId` 가 함께 처리한다(스토어의 배타 규칙) */
              onSelectStudent={handleSelectStudent}
              onRefresh={loadStudents}
              loading={loading}
              onSelectCohort={(grade, classNum) => setCohort({ grade, classNum })}
              selectedCohort={cohort}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              searchResults={searchResults}
              searching={searching}
            />
          }
          centerPanel={
            // 집단(학년/반)을 고르면 집단 분석, 학생을 고르면 개인 분석
            cohort
              ? (
                <CohortAnalysisPanel
                  grade={cohort.grade}
                  classNum={cohort.classNum}
                  /* 학생 목록의 이름 → 개인 분석. 학년/반 필터를 맞춘 뒤 선택하므로 집단은 스토어가 해제한다 */
                  onOpenStudent={handleSelectStudent}
                />
              )
              : <AnalysisPanel student={selectedStudent} />
          }
          rightPanel={
            <WritingPanel student={selectedStudent} />
          }
        />
      </div>
    </Layout>
  );
}

export default EvalearnApp;
