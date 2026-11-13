import React from 'react';
import { SubjectClassCard } from './SubjectClassCard';
import { LayoutGrid } from 'lucide-react';
import type { SubjectAssignment } from '../../types/subject-assignment.types';

interface SubjectResultsGridProps {
  assignments: SubjectAssignment[];
  onMoveStudent: (
    subjectName: string,
    semester: 'semester1' | 'semester2',
    studentId: string | number,
    fromClass: number,
    toClass: number
  ) => void;
}

export const SubjectResultsGrid: React.FC<SubjectResultsGridProps> = ({
  assignments,
  onMoveStudent,
}) => {
  if (assignments.length === 0) {
    return (
      <div className="bg-white/40 backdrop-blur-sm rounded-xl border border-slate-100/60 p-12 text-center">
        <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500 text-sm">
          배정 결과가 없습니다. 왼쪽에서 과목을 설정하고 배정을 실행하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {assignments.map((assignment) => (
        <SubjectClassCard
          key={`${assignment.subjectName}-${assignment.semester}`}
          assignment={assignment}
          onMoveStudent={onMoveStudent}
        />
      ))}
    </div>
  );
};

/** @deprecated Use SubjectResultsGrid instead */
export const SubjectAssignmentTab = SubjectResultsGrid;
