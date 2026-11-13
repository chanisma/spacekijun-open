/**
 * Class Card Component
 * 개별 반 카드 - 학생 목록 표시
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RefreshCw, Users, ExternalLink, BookOpen, Target, GripVertical } from 'lucide-react';
import { StudentItem } from './StudentItem';
import type { ClassAssignment, StudentData } from '../../types/class-assignment.types';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getStudentSubjects, matchesSubjectCombination } from '../../utils/algorithms/subjectBased';

export interface ClassCardProps {
  classData: ClassAssignment;
  onStudentSelect?: (student: StudentData) => void;
  selectedStudentCode?: string;
  onOpenDetail?: () => void;
}

export function ClassCard({ classData, onStudentSelect, selectedStudentCode, onOpenDetail }: ClassCardProps) {
  const { lockedStudents, reassignClass, statistics, specialClassMode, subjectCombinations } = useClassAssignmentContext();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `class-${classData.classNum}`,
    data: { type: 'class', classNum: classData.classNum },
  });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 평균 성적 계산
  const avgGrade = classData.students.length > 0
    ? classData.students.reduce((sum, s) => sum + ((s as any).averageGrade ?? 5), 0) / classData.students.length
    : 0;

  // 잠긴 학생 수
  const lockedCount = classData.students.filter(s => lockedStudents.has(s.student_code)).length;

  // 과목 데이터가 있는 학생 수
  const studentsWithCourses = classData.students.filter(s => {
    const subjects = getStudentSubjects(s);
    return subjects.length > 0;
  }).length;

  // 과목 조합별 매칭 학생 수 계산 (combination 모드일 때만)
  const combinationMatches = useMemo(() => {
    if (specialClassMode !== 'combination' || subjectCombinations.length === 0) {
      return [];
    }

    return subjectCombinations.map(combo => ({
      id: combo.id,
      name: combo.name,
      count: classData.students.filter(s => matchesSubjectCombination(s, combo)).length,
      targetClassNum: combo.targetClassNum,
    })).filter(m => m.count > 0);
  }, [specialClassMode, subjectCombinations, classData.students]);

  // 클러스터/특수반 설명 생성
  const getSpecialClassDescription = (name: string, subjects?: string[]): string => {
    if (name === '이과중점') return '과학 탐구 과목 선택자';
    if (name === '문과중점') return '사회 탐구 과목 선택자';
    if (name === '예체능') return '예술·체육 과목 선택자';
    if (name === '교차선택') return '과학+사회 교차 선택자';
    if (name === '일반') return '다양한 과목 선택자';
    if (subjects && subjects.length > 0) {
      return subjects.slice(0, 2).join(', ') + ' 선택자';
    }
    return '';
  };

  return (
    <Card
      ref={setNodeRef}
      style={sortableStyle}
      className={`transition-all ${isOver ? 'ring-2 ring-primary bg-primary/5' : ''} ${isDragging ? 'opacity-50 shadow-lg z-50' : ''}`}
      {...attributes}
    >
      <CardHeader className="pb-2 space-y-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-none"
              tabIndex={-1}
              aria-label="반 순서 드래그"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              {classData.classNum}반
              {classData.specialClass && classData.specialConfig && (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="secondary" className="text-xs cursor-help hover:bg-secondary/80">
                        {classData.specialConfig.name || '특수반'}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs z-50">
                      <div className="space-y-1.5 p-1">
                        <p className="font-medium text-sm">
                          {getSpecialClassDescription(classData.specialConfig.name, classData.specialConfig.targetSubjects)}
                        </p>
                        {classData.specialConfig.targetSubjects && classData.specialConfig.targetSubjects.length > 0 && (
                          <div className="text-xs space-y-1">
                            <span className="text-muted-foreground block">클러스터링 과목:</span>
                            <div className="flex flex-wrap gap-1">
                              {classData.specialConfig.targetSubjects.map((subject, idx) => (
                                <span key={idx} className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                  {subject}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {onOpenDetail && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onOpenDetail}
                title="상세 보기"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => reassignClass(classData.classNum)}
              title="이 반만 재배정"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {classData.students.length}명
          </span>
          <span>평균 {avgGrade.toFixed(1)}등급</span>
          {studentsWithCourses > 0 && (
            <span className="flex items-center gap-1 text-blue-600">
              <BookOpen className="h-3 w-3" />
              {studentsWithCourses}
            </span>
          )}
          {lockedCount > 0 && (
            <Badge variant="outline" className="text-xs">
              잠금 {lockedCount}
            </Badge>
          )}
        </div>
        {/* 과목 조합 매칭 결과 */}
        {combinationMatches.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {combinationMatches.map(match => (
              <Badge
                key={match.id}
                variant={match.targetClassNum === classData.classNum ? 'default' : 'secondary'}
                className="text-xs flex items-center gap-1"
              >
                <Target className="h-3 w-3" />
                {match.name}: {match.count}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {[...classData.students].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((student, idx) => (
            <StudentItem
              key={student.student_code}
              student={student}
              index={idx + 1}
              classNum={classData.classNum}
              isLocked={lockedStudents.has(student.student_code)}
              isSelected={selectedStudentCode === student.student_code}
              onClick={() => onStudentSelect?.(student)}
            />
          ))}
          {classData.students.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">
              배정된 학생이 없습니다
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
