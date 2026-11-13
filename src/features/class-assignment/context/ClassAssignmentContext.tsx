/**
 * Class Assignment Context - 전역 상태 공유
 * 학급 배정 데이터와 설정을 컴포넌트 간 공유
 */

import React, { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  StudentData,
  ClassAssignmentConfig,
  AssignmentResult,
  ClassAssignment,
  AssignmentStatistics,
  AssignmentHistoryEntry,
  AlgorithmType,
  SpecialClassMode,
} from '../types/class-assignment.types';
import type { SubjectCombination } from '../utils/algorithms/subjectBased';
import { executeAssignment, executeAssignmentWithSpecialClass } from '../utils/algorithms';
import { calculateStatistics, calculateQualityScore } from '../utils/statistics';

const MAX_HISTORY = 50;

export interface ClassAssignmentContextValue {
  // Source Data
  sourceStudents: StudentData[];
  setSourceStudents: (students: StudentData[]) => void;

  // Configuration
  config: ClassAssignmentConfig;
  setConfig: (config: ClassAssignmentConfig) => void;
  updateConfig: (partial: Partial<ClassAssignmentConfig>) => void;

  // Special Class Settings
  specialClassMode: SpecialClassMode;
  setSpecialClassMode: (mode: SpecialClassMode) => void;
  subjectCombinations: SubjectCombination[];
  setSubjectCombinations: (combinations: SubjectCombination[]) => void;
  clusteringOptions: {
    clusterCount: number;
    minClusterSize: number;
    balanceGrades: boolean;
    centroidThreshold: number;
  };
  setClusteringOptions: (options: { clusterCount: number; minClusterSize: number; balanceGrades: boolean; centroidThreshold: number }) => void;

  // Assignment Results
  assignments: ClassAssignment[];
  statistics: AssignmentStatistics | null;
  qualityScore: ReturnType<typeof calculateQualityScore> | null;

  // Locked Students
  lockedStudents: Map<string, number>;
  setLockedStudentsMap: (map: Map<string, number>) => void;
  lockStudent: (studentCode: string, classNum: number) => void;
  unlockStudent: (studentCode: string) => void;

  // History (Undo/Redo)
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Class Order (DnD)
  classOrder: number[];
  reorderClasses: (fromIndex: number, toIndex: number) => void;

  // Actions
  runAssignment: () => void;
  moveStudent: (studentCode: string, fromClass: number, toClass: number) => void;
  swapStudents: (studentCode1: string, studentCode2: string) => void;
  reassignClass: (classNum: number) => void;
  reset: () => void;
  setAssignments: (assignments: ClassAssignment[]) => void;

  // UI State
  isAssigning: boolean;
}

const ClassAssignmentContext = createContext<ClassAssignmentContextValue | null>(null);

export interface ClassAssignmentProviderProps {
  children: ReactNode;
}

const DEFAULT_CONFIG: ClassAssignmentConfig = {
  grade: 1,
  classCount: 9,
  algorithm: 'stratified',
  constraints: {
    balanceGender: false,  // 여학교이므로 불필요
    balancePerformance: true,
    keepFriendsTogether: false,
    separateList: [],
    excludedStudents: [],
    separateSameNames: false,
  },
  specialClasses: [],
};

export function ClassAssignmentProvider({ children }: ClassAssignmentProviderProps) {
  const { toast } = useToast();

  // Source data
  const [sourceStudents, setSourceStudents] = useState<StudentData[]>([]);
  const [config, setConfig] = useState<ClassAssignmentConfig>(DEFAULT_CONFIG);

  // Special class settings
  const [specialClassMode, setSpecialClassMode] = useState<SpecialClassMode>('none');
  const [subjectCombinations, setSubjectCombinations] = useState<SubjectCombination[]>([]);
  const [clusteringOptions, setClusteringOptions] = useState({
    clusterCount: DEFAULT_CONFIG.classCount,
    minClusterSize: 15,
    centroidThreshold: 0.7,
    balanceGrades: true,
  });

  // Assignment state
  const [assignments, setAssignmentsState] = useState<ClassAssignment[]>([]);
  const [classOrder, setClassOrder] = useState<number[]>([]);
  const [lockedStudents, setLockedStudents] = useState<Map<string, number>>(new Map());
  const [isAssigning, setIsAssigning] = useState(false);

  // History
  const [history, setHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Computed values
  const statistics = useMemo(() => {
    if (assignments.length === 0) return null;
    return calculateStatistics(assignments);
  }, [assignments]);

  const qualityScore = useMemo(() => {
    if (assignments.length === 0) return null;
    return calculateQualityScore(assignments);
  }, [assignments]);

  // Config update
  const updateConfig = useCallback((partial: Partial<ClassAssignmentConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  }, []);

  // Add to history
  const addToHistory = useCallback((newAssignments: ClassAssignment[], description: string, order?: number[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({
        assignments: JSON.parse(JSON.stringify(newAssignments)),
        classOrder: order ?? (classOrder.length > 0 ? [...classOrder] : newAssignments.map(a => a.classNum)),
        timestamp: new Date(),
        description,
      });
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex, classOrder]);

  // Run assignment
  const runAssignment = useCallback(() => {
    if (sourceStudents.length === 0) {
      toast({
        title: '학생 데이터 없음',
        description: '먼저 학생 데이터를 불러와주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsAssigning(true);

    try {
      // 특수반 옵션 구성
      const specialClassOptions = {
        mode: specialClassMode,
        subjectCombinations: subjectCombinations,
        clusterCount: clusteringOptions.clusterCount,
        minClusterSize: clusteringOptions.minClusterSize,
        centroidThreshold: clusteringOptions.centroidThreshold,
      };

      const result = executeAssignmentWithSpecialClass(
        config.algorithm,
        {
          students: sourceStudents,
          classCount: config.classCount,
          constraints: config.constraints,
          lockedStudents,
        },
        specialClassOptions
      );

      setAssignmentsState(result);
      setClassOrder(result.map(r => r.classNum));

      // 배정 설명 생성
      let description = `${config.algorithm} 알고리즘으로 전체 배정`;
      if (specialClassMode === 'combination' && subjectCombinations.length > 0) {
        description = `과목 조합 배정 (${subjectCombinations.map(c => c.name).join(', ')})`;
      } else if (specialClassMode === 'clustering') {
        description = '클러스터링 기반 배정';
      }
      addToHistory(result, description);

      toast({
        title: '배정 완료',
        description: `${sourceStudents.length}명의 학생을 ${config.classCount}개 반에 배정했습니다.`,
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
  }, [sourceStudents, config, lockedStudents, specialClassMode, subjectCombinations, clusteringOptions, addToHistory, toast]);

  // Move student
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

  // Swap students
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

  // Reassign single class
  const reassignClass = useCallback((classNum: number) => {
    const classStudents = assignments.find(c => c.classNum === classNum)?.students || [];
    const unlockedStudents = classStudents.filter(s => !lockedStudents.has(s.student_code));

    if (unlockedStudents.length === 0) {
      toast({
        title: '재배정 불가',
        description: '해당 반에 잠기지 않은 학생이 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    // 해당 반만 재배정 (다른 반 제외)
    const excludeClasses = assignments
      .filter(c => c.classNum !== classNum)
      .map(c => c.classNum);

    const result = executeAssignment(config.algorithm, {
      students: classStudents,
      classCount: config.classCount,
      constraints: config.constraints,
      lockedStudents,
      excludeClasses,
    });

    const newAssignments = assignments.map(cls => {
      if (cls.classNum === classNum) {
        return result.find(r => r.classNum === classNum) || cls;
      }
      return cls;
    });

    setAssignmentsState(newAssignments);
    addToHistory(newAssignments, `${classNum}반 재배정`);

    toast({
      title: '재배정 완료',
      description: `${classNum}반을 재배정했습니다.`,
    });
  }, [assignments, config, lockedStudents, addToHistory, toast]);

  // Lock/unlock students
  const lockStudent = useCallback((studentCode: string, classNum: number) => {
    setLockedStudents(prev => new Map(prev).set(studentCode, classNum));
    toast({ title: '학생 잠금', description: `해당 학생이 ${classNum}반에 고정되었습니다.` });
  }, [toast]);

  const unlockStudent = useCallback((studentCode: string) => {
    setLockedStudents(prev => {
      const newMap = new Map(prev);
      newMap.delete(studentCode);
      return newMap;
    });
    toast({ title: '잠금 해제', description: '학생 잠금이 해제되었습니다.' });
  }, [toast]);

  // Reorder classes (DnD) — 반 번호도 재배정
  const reorderClasses = useCallback((fromIndex: number, toIndex: number) => {
    // 현재 표시 순서대로 assignments 정렬
    const currentOrder = classOrder.length > 0 ? classOrder : assignments.map(a => a.classNum);
    const ordered = currentOrder.map(num => assignments.find(a => a.classNum === num)!);

    // 위치 이동
    const reordered = [...ordered];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // classNum 재배정 (position + 1) + 매핑 생성
    const classNumMap = new Map<number, number>();
    const newAssignments = reordered.map((cls, idx) => {
      const newClassNum = idx + 1;
      if (cls.classNum !== newClassNum) {
        classNumMap.set(cls.classNum, newClassNum);
      }
      return { ...cls, classNum: newClassNum };
    });

    // lockedStudents 반 번호 갱신
    if (classNumMap.size > 0) {
      setLockedStudents(prev => {
        if (prev.size === 0) return prev;
        const updated = new Map<string, number>();
        prev.forEach((oldNum, code) => {
          updated.set(code, classNumMap.get(oldNum) ?? oldNum);
        });
        return updated;
      });
    }

    const newOrder = newAssignments.map(a => a.classNum);
    setClassOrder(newOrder);
    setAssignmentsState(newAssignments);
    addToHistory(newAssignments, `반 순서 변경`, newOrder);
  }, [assignments, classOrder, addToHistory]);

  // Undo/Redo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAssignmentsState(JSON.parse(JSON.stringify(prevState.assignments)));
      if (prevState.classOrder) setClassOrder(prevState.classOrder);
      setHistoryIndex(prev => prev - 1);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAssignmentsState(JSON.parse(JSON.stringify(nextState.assignments)));
      if (nextState.classOrder) setClassOrder(nextState.classOrder);
      setHistoryIndex(prev => prev + 1);
    }
  }, [history, historyIndex]);

  // Reset
  const reset = useCallback(() => {
    setAssignmentsState([]);
    setClassOrder([]);
    setLockedStudents(new Map());
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  // Set assignments (for import)
  const setAssignments = useCallback((newAssignments: ClassAssignment[]) => {
    setAssignmentsState(newAssignments);
    setClassOrder(newAssignments.map(a => a.classNum));
    addToHistory(newAssignments, '배정 결과 불러오기');
  }, [addToHistory]);

  const contextValue = useMemo<ClassAssignmentContextValue>(() => ({
    sourceStudents,
    setSourceStudents,
    config,
    setConfig,
    updateConfig,
    specialClassMode,
    setSpecialClassMode,
    subjectCombinations,
    setSubjectCombinations,
    clusteringOptions,
    setClusteringOptions,
    assignments,
    statistics,
    qualityScore,
    lockedStudents,
    setLockedStudentsMap: setLockedStudents,
    lockStudent,
    unlockStudent,
    classOrder,
    reorderClasses,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    runAssignment,
    moveStudent,
    swapStudents,
    reassignClass,
    reset,
    setAssignments,
    isAssigning,
  }), [
    sourceStudents,
    config,
    updateConfig,
    specialClassMode,
    subjectCombinations,
    clusteringOptions,
    assignments,
    statistics,
    qualityScore,
    lockedStudents,
    lockStudent,
    unlockStudent,
    classOrder,
    reorderClasses,
    historyIndex,
    history.length,
    undo,
    redo,
    runAssignment,
    moveStudent,
    swapStudents,
    reassignClass,
    reset,
    setAssignments,
    isAssigning,
  ]);

  return (
    <ClassAssignmentContext.Provider value={contextValue}>
      {children}
    </ClassAssignmentContext.Provider>
  );
}

export function useClassAssignmentContext(): ClassAssignmentContextValue {
  const context = useContext(ClassAssignmentContext);

  if (!context) {
    throw new Error('useClassAssignmentContext must be used within a ClassAssignmentProvider');
  }

  return context;
}
