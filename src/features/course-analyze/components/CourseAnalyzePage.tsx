/**
 * Course Analyze Page Component - 메인 페이지
 * 전체 레이아웃 및 상태 관리
 * evalog 스타일 레이아웃 적용
 */

import React, { useEffect, useRef } from 'react';
import { CourseAnalyzeProvider, AdminProvider, useCourseAnalyze, useCourseAnalyzeData, useAdmin } from '../context';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { WelcomePage } from './WelcomePage';
import { AnalysisContent } from './AnalysisContent';
import { AdminDashboard } from './admin';
import MainLayout from './layout/MainLayout';
import '../index.css';

// DB에서 자동 데이터 로드 여부 (true: DB 자동 로드, false: WelcomePage 표시)
const AUTO_LOAD_FROM_DATABASE = true;

// SessionStorage에 저장된 학생 데이터가 있는지 확인
function hasSessionData(): boolean {
  try {
    const stored = sessionStorage.getItem('course-analyze-students');
    if (stored) {
      const students = JSON.parse(stored);
      return Array.isArray(students) && students.length > 0;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

export function CourseAnalyzePage() {
  return (
    <CourseAnalyzeProvider>
      <AdminProvider>
        <div className="course-analyze-wrapper md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 md:overflow-hidden">
          <CourseAnalyzeContent />
        </div>
      </AdminProvider>
    </CourseAnalyzeProvider>
  );
}

function CourseAnalyzeContent() {
  const { courseData, activeTab, setActiveTab } = useCourseAnalyze();
  const { loadFromDatabase, fetchDatabaseGrades, databaseGrades, isFetchingDbGrades, isLoading } = useCourseAnalyzeData();
  const { openDashboard } = useAdmin();
  const hasData = courseData.students.length > 0;
  const loadAttempted = useRef(false);
  const gradesAttempted = useRef(false);
  // SessionStorage 데이터 존재 여부 (컴포넌트 마운트 시점에 확인)
  const hadSessionData = useRef(hasSessionData());

  // 자동 데이터 로드: DB → 실패 시 WelcomePage 표시
  // SessionStorage에 이미 데이터가 있으면 자동 로드 생략
  useEffect(() => {
    if (AUTO_LOAD_FROM_DATABASE && !hasData && !isLoading && !loadAttempted.current && !hadSessionData.current) {
      loadAttempted.current = true;
      loadFromDatabase();
    }
  }, [hasData, isLoading, loadFromDatabase]);

  // 학생 데이터 로드 후 DB 성적 자동 fetch
  // (학교 내부 모드에서는 GradeSourceSelector UI가 숨겨져 있으므로 자동 트리거 필수)
  // 4개 분석 탭(예상등급·학생예상등급·등급분포·간단분석)이 정상 동작하려면 필요
  useEffect(() => {
    if (
      hasData &&
      databaseGrades.size === 0 &&
      !isFetchingDbGrades &&
      !gradesAttempted.current
    ) {
      gradesAttempted.current = true;
      // 자동 로드 시나리오 — 토스트 생략 (사용자가 수동 트리거한 게 아님)
      fetchDatabaseGrades(true);
    }
  }, [hasData, databaseGrades.size, isFetchingDbGrades, fetchDatabaseGrades]);

  // 자동 로드 중일 때 로딩 표시
  if (AUTO_LOAD_FROM_DATABASE && isLoading && !hasData) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50/50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">DB에서 신청 데이터 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <MainLayout
        header={
          <Header
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onAdminClick={openDashboard}
          />
        }
        leftPanel={<Sidebar />}
        centerPanel={
          <div className="h-full">
            {hasData ? <AnalysisContent tab={activeTab} /> : <WelcomePage />}
            {/* Admin Dashboard Modal */}
            <AdminDashboard />
          </div>
        }
      />
    </>
  );
}
