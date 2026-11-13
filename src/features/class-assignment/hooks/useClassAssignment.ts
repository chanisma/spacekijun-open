/**
 * Class Assignment Hook
 * 반 배정 로직 및 상태 관리
 */

import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  StudentData,
  ClassAssignment,
  ClassAssignmentConfig,
  AssignmentStatistics,
} from '../types/class-assignment.types';
import type { AlgorithmType } from '../constants';
import { MAX_HISTORY } from '../constants';
import { executeAssignment } from '../utils/algorithms';
import { calculateStatistics, calculateQualityScore } from '../utils/statistics';

export interface AssignmentHistory {
  assignments: ClassAssignment[];
  timestamp: Date;
  description: string;
}

export interface UseClassAssignmentReturn {
  // State
  assignments: ClassAssignment[];
  statistics: AssignmentStatistics | null;
  qualityScore: ReturnType<typeof calculateQualityScore> | null;
  lockedStudents: Map<string, number>;
  isAssigning: boolean;

  // History
  history: AssignmentHistory[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  runAssignment: (students: StudentData[], config: ClassAssignmentConfig, algorithm: AlgorithmType) => void;
  reassignClass: (classNum: number, students: StudentData[], config: ClassAssignmentConfig, algorithm: AlgorithmType) => void;
  moveStudent: (studentCode: string, fromClass: number, toClass: number) => void;
  lockStudent: (studentCode: string, classNum: number) => void;
  unlockStudent: (studentCode: string) => void;
  swapStudents: (studentCode1: string, studentCode2: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  setAssignments: (assignments: ClassAssignment[]) => void;
}

export function useClassAssignment(): UseClassAssignmentReturn {
  const { toast } = useToast();

  // 배정 결과
  const [assignments, setAssignmentsState] = useState<ClassAssignment[]>([]);
  const [lockedStudents, setLockedStudents] = useState<Map<string, number>>(new Map());
  const [isAssigning, setIsAssigning] = useState(false);

  // 히스토리 (Undo/Redo)
  const [history, setHistory] = useState<AssignmentHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 통계 계산
  const statistics = useMemo(() => {
    if (assignments.length === 0) return null;
    return calculateStatistics(assignments);
  }, [assignments]);

  const qualityScore = useMemo(() => {
    if (assignments.length === 0) return null;
    return calculateQualityScore(assignments);
  }, [assignments]);

  // 히스토리에 추가
  const addToHistory = useCallback((newAssignments: ClassAssignment[], description: string) => {
    setHistory(prev => {
      // 현재 위치 이후의 히스토리 제거
      const newHistory = prev.slice(0, historyIndex + 1);

      // 새 항목 추가
      newHistory.push({
        assignments: JSON.parse(JSON.stringify(newAssignments)),
        timestamp: new Date(),
        description,
      });

      // 최대 개수 제한
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }

      return newHistory;
    });

    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  // 배정 실행
  const runAssignment = useCallback((
    students: StudentData[],
    config: ClassAssignmentConfig,
    algorithm: AlgorithmType
  ) => {
    setIsAssigning(true);

    try {
      const result = executeAssignment(algorithm, {
        students,
        classCount: config.classCount,
        constraints: config.constraints,
        lockedStudents,
      });

      setAssignmentsState(result);
      addToHistory(result, `${algorithm} 알고리즘으로 전체 배정`);

      toast({
        title: '배정 완료',
        description: `${students.length}명의 학생을 ${config.classCount}개 반에 배정했습니다.`,
      });
    } catch (error) {
      console.error('Assignment failed:', error);
      toast({
        title: '배정 실패',
        description: '배정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  }, [lockedStudents, addToHistory, toast]);

  // 특정 반만 재배정
  const reassignClass = useCallback((
    classNum: number,
    students: StudentData[],
    config: ClassAssignmentConfig,
    algorithm: AlgorithmType
  ) => {
    setIsAssigning(true);

    try {
      // 재배정할 반의 학생들만 추출
      const classStudents = assignments.find(c => c.classNum === classNum)?.students || [];

      // 해당 반 제외하고 다른 반들은 유지
      const excludeClasses = assignments
        .filter(c => c.classNum !== classNum)
        .map(c => c.classNum);

      // 재배정 대상 학생 목록
      const targetStudents = classStudents.filter(s => !lockedStudents.has(s.student_code));

      const result = executeAssignment(algorithm, {
        students: [...students.filter(s =>
          targetStudents.some(ts => ts.student_code === s.student_code) ||
          classStudents.some(cs => cs.student_code === s.student_code && lockedStudents.has(s.student_code))
        )],
        classCount: config.classCount,
        constraints: config.constraints,
        lockedStudents,
        excludeClasses,
      });

      // 기존 배정과 병합
      const merged = assignments.map(cls => {
        if (cls.classNum === classNum) {
          return result.find(r => r.classNum === classNum) || cls;
        }
        return cls;
      });

      setAssignmentsState(merged);
      addToHistory(merged, `${classNum}반 재배정`);

      toast({
        title: '재배정 완료',
        description: `${classNum}반을 재배정했습니다.`,
      });
    } catch (error) {
      console.error('Reassignment failed:', error);
      toast({
        title: '재배정 실패',
        description: '재배정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  }, [assignments, lockedStudents, addToHistory, toast]);

  // 학생 이동
  const moveStudent = useCallback((studentCode: string, fromClass: number, toClass: number) => {
    if (lockedStudents.has(studentCode)) {
      toast({
        title: '이동 불가',
        description: '잠긴 학생은 이동할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const newAssignments = assignments.map(cls => {
      if (cls.classNum === fromClass) {
        return {
          ...cls,
          students: cls.students.filter(s => s.student_code !== studentCode),
        };
      }
      if (cls.classNum === toClass) {
        const studentToMove = assignments
          .find(c => c.classNum === fromClass)
          ?.students.find(s => s.student_code === studentCode);

        if (studentToMove) {
          return {
            ...cls,
            students: [...cls.students, studentToMove],
          };
        }
      }
      return cls;
    });

    setAssignmentsState(newAssignments);
    addToHistory(newAssignments, `학생 이동: ${fromClass}반 → ${toClass}반`);
  }, [assignments, lockedStudents, addToHistory, toast]);

  // 학생 잠금
  const lockStudent = useCallback((studentCode: string, classNum: number) => {
    setLockedStudents(prev => new Map(prev).set(studentCode, classNum));
    toast({
      title: '학생 잠금',
      description: `해당 학생이 ${classNum}반에 고정되었습니다.`,
    });
  }, [toast]);

  // 학생 잠금 해제
  const unlockStudent = useCallback((studentCode: string) => {
    setLockedStudents(prev => {
      const newMap = new Map(prev);
      newMap.delete(studentCode);
      return newMap;
    });
    toast({
      title: '잠금 해제',
      description: '학생 잠금이 해제되었습니다.',
    });
  }, [toast]);

  // 두 학생 교환
  const swapStudents = useCallback((studentCode1: string, studentCode2: string) => {
    if (lockedStudents.has(studentCode1) || lockedStudents.has(studentCode2)) {
      toast({
        title: '교환 불가',
        description: '잠긴 학생은 교환할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    let class1: number | null = null;
    let class2: number | null = null;
    let student1: StudentData | null = null;
    let student2: StudentData | null = null;

    assignments.forEach(cls => {
      cls.students.forEach(s => {
        if (s.student_code === studentCode1) {
          class1 = cls.classNum;
          student1 = s;
        }
        if (s.student_code === studentCode2) {
          class2 = cls.classNum;
          student2 = s;
        }
      });
    });

    if (!class1 || !class2 || !student1 || !student2) return;

    const newAssignments = assignments.map(cls => {
      if (cls.classNum === class1) {
        return {
          ...cls,
          students: cls.students.map(s =>
            s.student_code === studentCode1 ? student2! : s
          ),
        };
      }
      if (cls.classNum === class2) {
        return {
          ...cls,
          students: cls.students.map(s =>
            s.student_code === studentCode2 ? student1! : s
          ),
        };
      }
      return cls;
    });

    setAssignmentsState(newAssignments);
    addToHistory(newAssignments, `학생 교환: ${student1.name} ↔ ${student2.name}`);
  }, [assignments, lockedStudents, addToHistory, toast]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAssignmentsState(JSON.parse(JSON.stringify(prevState.assignments)));
      setHistoryIndex(prev => prev - 1);
    }
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAssignmentsState(JSON.parse(JSON.stringify(nextState.assignments)));
      setHistoryIndex(prev => prev + 1);
    }
  }, [history, historyIndex]);

  // 초기화
  const reset = useCallback(() => {
    setAssignmentsState([]);
    setLockedStudents(new Map());
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  // 외부에서 배정 결과 설정 (import용)
  const setAssignments = useCallback((newAssignments: ClassAssignment[]) => {
    setAssignmentsState(newAssignments);
    addToHistory(newAssignments, '배정 결과 불러오기');
  }, [addToHistory]);

  return {
    assignments,
    statistics,
    qualityScore,
    lockedStudents,
    isAssigning,
    history,
    historyIndex,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    runAssignment,
    reassignClass,
    moveStudent,
    lockStudent,
    unlockStudent,
    swapStudents,
    undo,
    redo,
    reset,
    setAssignments,
  };
}
