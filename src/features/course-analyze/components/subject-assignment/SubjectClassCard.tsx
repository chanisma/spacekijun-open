import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SubjectAssignment } from '../../types/course.types';
import { formatGrade } from '../../utils/gradeFormat';
import { PartialAverageMark } from '../common/PartialAverageMark';

interface SubjectClassCardProps {
  assignment: SubjectAssignment;
  onMoveStudent: (
    subjectName: string,
    semester: 'semester1' | 'semester2',
    studentId: string | number,
    fromClass: number,
    toClass: number
  ) => void;
}

const algorithmLabels: Record<string, string> = {
  stratified: '계층화 배정',
  serpentine: '뱀식 배정',
  balanced: '성적순 배정',
  random: '무작위 배정',
};

export const SubjectClassCard: React.FC<SubjectClassCardProps> = ({
  assignment,
  onMoveStudent,
}) => {
  const [expanded, setExpanded] = useState(false);

  const totalStudents = assignment.classes.reduce(
    (sum, cls) => sum + cls.students.length,
    0
  );

  const algorithmLabel = algorithmLabels[assignment.algorithm] || assignment.algorithm;

  return (
    <div className="bg-white/40 backdrop-blur-sm rounded-xl border border-slate-100/60 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            'h-5 w-5 text-slate-400 transition-transform',
            expanded && 'rotate-90'
          )}
        />
        <div className="flex-1 text-left">
          <span className="font-semibold text-slate-700">{assignment.subjectName}</span>
          <span className="text-xs text-slate-400 ml-2">
            {assignment.semester === 'semester1' ? '1학기' : '2학기'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{totalStudents}명</span>
          <span>{assignment.classCount}개 반</span>
          <Badge variant="secondary" className="text-xs">
            {algorithmLabel}
          </Badge>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100/60">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
            {assignment.classes.map((cls) => {
              const sortedStudents = [...cls.students].sort((a, b) =>
                a.name.localeCompare(b.name, 'ko')
              );

              // 평균은 성적이 있는 학생만으로 계산된다. 카드 머리에는 분반 전체 인원이
              // 적혀 있으므로, 두 수가 다르면 아래에서 '부분' 표식으로 분모를 밝힌다.
              const validGrades = cls.students
                .map((s) => s.grade)
                .filter((g) => g > 0);
              const avgGrade =
                validGrades.length > 0
                  ? validGrades.reduce((sum, g) => sum + g, 0) / validGrades.length
                  : 0;

              return (
                <div
                  key={cls.classNum}
                  className="bg-slate-50/50 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-slate-700">
                      {cls.classNum}반
                    </span>
                    <span className="text-xs text-slate-400">
                      {cls.students.length}명
                    </span>
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {sortedStudents.map((student, idx) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-2 text-xs py-0.5"
                      >
                        <span className="text-slate-400 w-4 text-right">
                          {idx + 1}
                        </span>
                        <span className="text-slate-700 font-medium">
                          {student.name}
                        </span>
                        <span className="text-slate-400">
                          {student.class}-{student.number}
                        </span>
                        {student.grade > 0 && (
                          <span className="ml-auto text-slate-400">
                            {formatGrade(student.grade)}등급
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {avgGrade > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-400">
                      평균 {formatGrade(avgGrade)}등급
                      <PartialAverageMark
                        covered={validGrades.length}
                        total={cls.students.length}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
