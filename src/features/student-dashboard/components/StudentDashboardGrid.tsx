import React from 'react';
import { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { StudentCard } from './StudentCard';
import { Filter, Loader2, Users } from 'lucide-react';

interface StudentDashboardGridProps {
  students: StudentDashboardData[];
  isLoading: boolean;
  selectedStudentCode?: string;
  onStudentClick: (student: StudentDashboardData) => void;
  hasRequiredFilters?: boolean; // 필수 필터 선택 여부
}

export const StudentDashboardGrid: React.FC<StudentDashboardGridProps> = ({
  students,
  isLoading,
  selectedStudentCode,
  onStudentClick,
  hasRequiredFilters = true,
}) => {
  // 필수 필터 미선택 상태
  if (!hasRequiredFilters) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <div className="p-4 bg-muted rounded-full">
            <Filter className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">학년/반을 선택하거나 이름을 검색하세요</p>
            <p className="text-sm text-muted-foreground mt-1">
              학생 정보를 조회하려면 학년과 반을 선택하거나 이름으로 검색해주세요
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">학생 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 빈 상태
  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Users className="h-12 w-12" />
          <p className="text-sm">검색 결과가 없습니다</p>
          <p className="text-xs text-muted-foreground">필터를 조정해 보세요</p>
        </div>
      </div>
    );
  }

  // 그리드 렌더링
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {students.map((student) => (
        <StudentCard
          key={student.student_code}
          student={student}
          isSelected={selectedStudentCode === student.student_code}
          onClick={() => onStudentClick(student)}
        />
      ))}
    </div>
  );
};

// 스켈레톤 로더 (선택적 사용)
export const StudentCardSkeleton: React.FC = () => (
  <div className="p-4 bg-background/60 rounded-xl border border-border animate-pulse">
    <div className="flex items-center gap-3 mb-3">
      <div className="h-12 w-12 rounded-full bg-slate-200" />
      <div className="flex-1">
        <div className="h-4 w-20 bg-slate-200 rounded mb-1" />
        <div className="h-3 w-28 bg-slate-100 rounded" />
      </div>
    </div>
    <div className="flex gap-2 mb-3">
      <div className="h-5 w-16 bg-slate-100 rounded" />
      <div className="h-5 w-12 bg-slate-100 rounded" />
    </div>
    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
      <div className="h-10 bg-slate-50 rounded" />
      <div className="h-10 bg-slate-50 rounded" />
    </div>
  </div>
);

export default StudentDashboardGrid;
