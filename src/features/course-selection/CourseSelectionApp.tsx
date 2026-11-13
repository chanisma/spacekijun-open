/**
 * Course Selection — 진입점. useAuth().isStudentView 기준으로 자동 분기.
 */

import React from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import CourseSelectionStudentApp from './components/student/CourseSelectionStudentApp';
import CourseSelectionAdminApp from './components/admin/CourseSelectionAdminApp';
import { T } from './utils/tokens';

export default function CourseSelectionApp() {
  const { isStudentView, isAdmin, profile } = useAuth();

  // 학생 시점 (admin이 학생으로 미리보기하는 경우 포함)
  if (isStudentView) {
    return (
      <div className="h-[calc(100vh-120px)] md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 overflow-hidden">
        <CourseSelectionStudentApp />
      </div>
    );
  }

  // 교사·관리자: 운영 화면. admin은 "학생 미리보기"와 "운영 화면" 사이를 전환 가능.
  return (
    <div className="h-[calc(100vh-120px)] md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 overflow-hidden">
      <CourseSelectionAdminApp />
    </div>
  );
}
