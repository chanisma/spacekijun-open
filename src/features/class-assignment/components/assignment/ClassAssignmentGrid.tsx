/**
 * Class Assignment Grid
 * 반 배정 그리드 - DnD 컨텍스트 포함
 */

import React, { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { ClassCard } from './ClassCard';
import { StudentItem } from './StudentItem';
import { ClassDetailPanel } from './ClassDetailPanel';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import type { StudentData, ClassAssignment } from '../../types/class-assignment.types';

export interface ClassAssignmentGridProps {
  onStudentSelect?: (student: StudentData) => void;
  selectedStudentCode?: string;
}

export function ClassAssignmentGrid({ onStudentSelect, selectedStudentCode }: ClassAssignmentGridProps) {
  const { assignments, moveStudent, lockedStudents, classOrder, reorderClasses } = useClassAssignmentContext();
  const [activeStudent, setActiveStudent] = useState<StudentData | null>(null);
  const [activeFromClass, setActiveFromClass] = useState<number | null>(null);
  const [activeClassNum, setActiveClassNum] = useState<number | null>(null);

  // Sort assignments by classOrder
  const sortedAssignments = useMemo(() => {
    if (classOrder.length === 0) return assignments;
    const orderMap = new Map(classOrder.map((num, idx) => [num, idx]));
    return [...assignments].sort((a, b) => {
      const aIdx = orderMap.get(a.classNum) ?? a.classNum;
      const bIdx = orderMap.get(b.classNum) ?? b.classNum;
      return aIdx - bIdx;
    });
  }, [assignments, classOrder]);

  // Sortable IDs for class cards
  const sortableClassIds = useMemo(
    () => sortedAssignments.map(a => `class-${a.classNum}`),
    [sortedAssignments]
  );

  // 상세 모달 상태
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassAssignment | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as any;

    if (data?.type === 'class') {
      setActiveClassNum(data.classNum);
    } else if (data?.student) {
      setActiveStudent(data.student);
      setActiveFromClass(data.fromClass);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as any;

    if (over) {
      // Class card reordering
      if (activeData?.type === 'class') {
        const activeId = String(active.id);
        const overId = String(over.id);
        if (activeId !== overId) {
          const oldIndex = sortableClassIds.indexOf(activeId);
          const newIndex = sortableClassIds.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1) {
            reorderClasses(oldIndex, newIndex);
          }
        }
      }
      // Student drag to class card
      else if (activeFromClass !== null) {
        const overId = String(over.id);
        if (overId.startsWith('class-')) {
          const toClass = parseInt(overId.replace('class-', ''), 10);
          if (toClass !== activeFromClass) {
            moveStudent(String(active.id), activeFromClass, toClass);
          }
        }
      }
    }

    setActiveStudent(null);
    setActiveFromClass(null);
    setActiveClassNum(null);
  };

  const handleDragCancel = () => {
    setActiveStudent(null);
    setActiveFromClass(null);
    setActiveClassNum(null);
  };

  const handleOpenDetail = (classData: ClassAssignment) => {
    setSelectedClass(classData);
    setDetailModalOpen(true);
  };

  if (assignments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg">배정 결과가 없습니다</p>
          <p className="text-sm mt-1">왼쪽 패널에서 설정 후 배정을 실행해주세요</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={sortableClassIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {sortedAssignments.map((classData) => (
              <ClassCard
                key={classData.classNum}
                classData={classData}
                onStudentSelect={onStudentSelect}
                selectedStudentCode={selectedStudentCode}
                onOpenDetail={() => handleOpenDetail(classData)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeStudent && activeFromClass !== null && (
            <div className="bg-background border rounded-md shadow-lg">
              <StudentItem
                student={activeStudent}
                index={0}
                classNum={activeFromClass}
                isLocked={lockedStudents.has(activeStudent.student_code)}
              />
            </div>
          )}
          {activeClassNum !== null && (() => {
            const classData = assignments.find(a => a.classNum === activeClassNum);
            if (!classData) return null;
            return (
              <div className="bg-background border rounded-lg shadow-xl p-3 w-64 opacity-90">
                <div className="font-medium text-sm">{classData.classNum}반</div>
                <div className="text-xs text-muted-foreground mt-1">{classData.students.length}명</div>
              </div>
            );
          })()}
        </DragOverlay>
      </DndContext>

      {/* 반 상세 사이드 패널 */}
      <ClassDetailPanel
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        classAssignment={selectedClass}
      />
    </>
  );
}
