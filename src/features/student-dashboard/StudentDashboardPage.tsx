import React, { useCallback, useMemo, useState } from 'react';
import { useStudentDashboard, StudentDashboardData, useAfterSchoolCounts } from '@/hooks/useStudentDashboard';
import { StudentListSidebar } from './components/StudentListSidebar';
import { StudentDetailPanel } from './components/StudentDetailPanel';
import { ClassViewPanel } from './components/ClassViewPanel';
import { ClassStatsPanel } from './components/ClassStatsPanel';
import { AnalysisPanel } from './components/analysis/AnalysisPanel';
import { useDebounce } from '@/hooks/use-debounce';
import { MainLayout } from './components/layout/MainLayout';
import { Header, DashboardViewMode } from './components/layout/Header';
import { Layout } from '@/components/layout/Layout';
import { StudentDashboardProvider, useStudentDashboardContext } from './context/StudentDashboardContext';
import { useAuth } from '@/components/auth/AuthProvider';
import { useStudentDeepLink } from '@/hooks/useStudentDeepLink';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';

import './index.css';

const StudentDashboardContent: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const {
    grade, classNum, searchTerm, selectedStudentCode,
    setGrade, setClassNum, setSearchTerm, setSelectedStudentCode, clearFilters
  } = useStudentDashboardContext();

  const [viewMode, setViewMode] = useState<DashboardViewMode>('student');

  // 헤더 통합 검색 딥링크 (?student=학생코드): 학년/반 필터를 맞추고 학생 선택
  useStudentDeepLink(useCallback(async (code: string) => {
    try {
      const { data, error } = await supabase
        .from('student_basic_info' as any)
        .select('id, grade, class_num')
        .eq('id', code)
        .maybeSingle();
      if (error) throw error;
      const info = data as { id: string; grade: number | null; class_num: number | null } | null;
      if (!info?.grade) {
        toast.error('학생 정보를 찾을 수 없습니다.');
        return;
      }
      // setGrade/setClassNum이 선택을 초기화하므로 setSelectedStudentCode를 마지막에 호출
      setSearchTerm('');
      setGrade(info.grade);
      setClassNum(info.class_num ?? undefined);
      setSelectedStudentCode(code);
      setViewMode('student');
    } catch (err) {
      console.error('Failed to load student from deep link:', err);
      toast.error('학생 정보를 불러오지 못했습니다.');
    }
  }, [setSearchTerm, setGrade, setClassNum, setSelectedStudentCode]));

  const debouncedSearch = useDebounce(searchTerm, 300);

  // 데이터 페칭
  const { data: students = [] } = useStudentDashboard({
    grade,
    classNum,
    searchTerm: debouncedSearch || undefined,
  });

  // 방과후 수강 개수 조회 (학급별 보기용)
  const studentCodes = useMemo(() => students.map(s => s.student_code), [students]);
  const { data: afterschoolCounts } = useAfterSchoolCounts(studentCodes);

  // 선택된 학생 객체 찾기
  const selectedStudent = useMemo(() =>
    students.find(s => s.student_code === selectedStudentCode) || null
    , [students, selectedStudentCode]);

  // 학생 선택 (사이드바 트리/검색 결과, 학급별 보기 어디서든 공통) — 학생별 보기로 전환하며
  // 그 학생의 학년/반도 함께 선택해 두어 이후 "학급별 보기"/"통계" 탭과 상태가 어긋나지 않게 한다.
  const handleStudentSelect = (student: StudentDashboardData) => {
    setGrade(student.grade);
    setClassNum(student.class_num);
    setSelectedStudentCode(student.student_code);
    setViewMode('student');
  };

  // 뷰 모드 변경
  const handleViewModeChange = (mode: DashboardViewMode) => {
    setViewMode(mode);
    // 학급별 보기/통계/분석으로 전환 시 선택된 학생 초기화
    if (mode === 'class' || mode === 'stats' || mode === 'analysis') {
      setSelectedStudentCode(null);
    }
  };

  return (
    <Layout>
      <div className="student-dashboard-wrapper h-[calc(100vh-120px)] md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 overflow-hidden">
        <MainLayout
          header={
            <Header
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              hasData={true}
              isAdmin={isAdmin}
            />
          }
          leftPanel={
            <div className="h-full bg-card/50">
              <StudentListSidebar
                grade={grade}
                classNum={classNum}
                searchTerm={searchTerm}
                onGradeChange={setGrade}
                onClassNumChange={setClassNum}
                onSearchTermChange={setSearchTerm}
                onClearFilters={clearFilters}
                onClassSelected={() => {
                  setSelectedStudentCode(null);
                  setViewMode('class');
                }}
                students={students}
                selectedStudentCode={selectedStudentCode || undefined}
                onStudentClick={handleStudentSelect}
              />
            </div>
          }
          centerPanel={
            // flex-col 이어야 빈 상태가 `flex-1` 로 칸 높이를 채워 가운데에 선다 — `min-h-full` 만으로는
            // 높이가 auto 라 자식의 `h-full` 이 풀리지 않는다(시험 결과 분석과 같은 위치)
            <div className="student-dashboard-wrapper flex min-h-full flex-col">
              {viewMode === 'student' && (
                <StudentDetailPanel student={selectedStudent} />
              )}
              {viewMode === 'class' && (
                <ClassViewPanel
                  students={students}
                  grade={grade}
                  classNum={classNum}
                  afterschoolCounts={afterschoolCounts}
                  onStudentClick={handleStudentSelect}
                />
              )}
              {viewMode === 'stats' && (
                <ClassStatsPanel
                  students={students}
                  grade={grade}
                  classNum={classNum}
                  afterschoolCounts={afterschoolCounts}
                />
              )}
              {viewMode === 'analysis' && (
                <AnalysisPanel />
              )}
            </div>
          }
        />
      </div>
    </Layout>
  );
};

export const StudentDashboardPage: React.FC = () => {
  return (
    <StudentDashboardProvider>
      <StudentDashboardContent />
    </StudentDashboardProvider>
  );
};

export default StudentDashboardPage;


