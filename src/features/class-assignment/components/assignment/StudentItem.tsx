/**
 * Student Item Component
 * 드래그 가능한 학생 아이템
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { StudentData } from '../../types/class-assignment.types';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { cn } from '@/lib/utils';

export interface StudentItemProps {
  student: StudentData;
  index: number;
  classNum: number;
  isLocked: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

export function StudentItem({
  student,
  index,
  classNum,
  isLocked,
  isSelected,
  onClick,
}: StudentItemProps) {
  const { lockStudent, unlockStudent } = useClassAssignmentContext();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: student.student_code,
    data: {
      student,
      fromClass: classNum,
    },
    disabled: isLocked,
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 100 : undefined,
  } : undefined;

  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocked) {
      unlockStudent(student.student_code);
    } else {
      lockStudent(student.student_code, classNum);
    }
  };

  const avgGrade = (student as any).averageGrade;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 p-2 rounded-md text-sm transition-colors group',
        isDragging && 'opacity-50 bg-muted',
        isSelected && 'bg-primary/10 ring-1 ring-primary',
        isLocked && 'bg-amber-50 dark:bg-amber-950/20',
        !isLocked && !isSelected && 'hover:bg-muted/50',
      )}
      onClick={onClick}
    >
      {/* 드래그 핸들 */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'cursor-grab text-muted-foreground',
          isLocked && 'cursor-not-allowed opacity-30',
        )}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* 번호 */}
      <span className="w-5 text-center text-muted-foreground">{index}</span>

      {/* 학생 정보 */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{student.name}</div>
        <div className="text-xs text-muted-foreground">
          {student.class_num}반 {student.number}번
          {avgGrade && ` · ${avgGrade.toFixed(1)}등급`}
        </div>
      </div>

      {/* 잠금 버튼 */}
      <Button
        size="icon"
        variant="ghost"
        className={cn(
          'h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity',
          isLocked && 'opacity-100',
        )}
        onClick={handleLockToggle}
      >
        {isLocked ? (
          <Lock className="h-3.5 w-3.5 text-amber-600" />
        ) : (
          <Unlock className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
