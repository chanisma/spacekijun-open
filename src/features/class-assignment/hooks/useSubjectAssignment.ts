/**
 * Subject Assignment Hook - 과목별 반 배정 관리
 * 과목별 학생 반 배정 및 이력 관리
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import type {
  Student,
  SubjectAssignmentAlgorithm,
  SubjectConfig,
  SubjectAssignment,
  SubjectAssignmentConfig,
  SubjectAssignmentHistoryEntry
} from '../types/subject-assignment.types';
import {
  assignStudentsToSubject,
  assignAllSubjects,
  getSubjectEnrollmentSummary,
  getEnrolledStudents
} from '../utils/subjectAssignment';
import {
  exportSubjectAssignmentsToExcel,
  importSubjectAssignmentsFromExcel
} from '../utils/subjectAssignmentExcel';

// ============================================================================
// Types
// ============================================================================

export interface UseSubjectAssignmentReturn {
  // Source data (from course-analyze context)
  enrollmentSummary: { subject: string; semester: 'semester1' | 'semester2'; count: number }[];

  // Configuration
  config: SubjectAssignmentConfig;
  updateConfig: (updates: Partial<SubjectAssignmentConfig>) => void;
  subjectConfigs: SubjectConfig[];
  updateSubjectConfig: (index: number, updates: Partial<SubjectConfig>) => void;
  addSubjectConfig: (config: SubjectConfig) => void;
  removeSubjectConfig: (index: number) => void;
  autoConfigureSubjects: (minEnrollment?: number, defaultClassSize?: number) => void;

  // Assignment Results
  assignments: SubjectAssignment[];

  // Operations
  runAssignment: (students: Student[]) => void;
  runSingleSubjectAssignment: (students: Student[], subjectIndex: number) => void;
  moveStudent: (subjectName: string, semester: 'semester1' | 'semester2', studentId: string | number, fromClass: number, toClass: number) => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Export/Import
  exportToExcel: () => void;
  importFromExcel: (file: File) => Promise<{ success: boolean; errors?: string[] }>;

  // Reset
  reset: () => void;
}

// ============================================================================
// Session Storage Keys
// ============================================================================

const SESSION_KEYS = {
  CONFIG: 'course-analyze-subject-assignment-config',
  ASSIGNMENTS: 'course-analyze-subject-assignment-results',
};

// ============================================================================
// Session Storage Helpers
// ============================================================================

function saveConfigToSession(config: SubjectAssignmentConfig) {
  try {
    sessionStorage.setItem(SESSION_KEYS.CONFIG, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save subject assignment config to session storage:', e);
  }
}

function loadConfigFromSession(): SubjectAssignmentConfig {
  try {
    const stored = sessionStorage.getItem(SESSION_KEYS.CONFIG);
    if (stored) {
      return JSON.parse(stored) as SubjectAssignmentConfig;
    }
  } catch (e) {
    console.warn('Failed to load subject assignment config from session storage:', e);
  }
  return {
    globalAlgorithm: 'balanced',
    balanceGrades: true,
    subjectConfigs: [],
  };
}

function saveAssignmentsToSession(assignments: SubjectAssignment[]) {
  try {
    sessionStorage.setItem(SESSION_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
  } catch (e) {
    console.warn('Failed to save subject assignments to session storage:', e);
  }
}

function loadAssignmentsFromSession(): SubjectAssignment[] {
  try {
    const stored = sessionStorage.getItem(SESSION_KEYS.ASSIGNMENTS);
    if (stored) {
      return JSON.parse(stored) as SubjectAssignment[];
    }
  } catch (e) {
    console.warn('Failed to load subject assignments from session storage:', e);
  }
  return [];
}

function clearAllSessionStorage() {
  Object.values(SESSION_KEYS).forEach(key => {
    try {
      sessionStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove ${key} from session storage:`, e);
    }
  });
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSubjectAssignment(students: Student[]): UseSubjectAssignmentReturn {
  const { toast } = useToast();

  // State - Initialize from sessionStorage
  const [config, setConfigState] = useState<SubjectAssignmentConfig>(() => loadConfigFromSession());
  const [assignments, setAssignmentsState] = useState<SubjectAssignment[]>(() => loadAssignmentsFromSession());
  const [history, setHistory] = useState<SubjectAssignmentHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Wrapped setters to persist to sessionStorage
  const setConfig = useCallback((configOrUpdater: SubjectAssignmentConfig | ((prev: SubjectAssignmentConfig) => SubjectAssignmentConfig)) => {
    setConfigState(prev => {
      const newConfig = typeof configOrUpdater === 'function' ? configOrUpdater(prev) : configOrUpdater;
      saveConfigToSession(newConfig);
      return newConfig;
    });
  }, []);

  const setAssignments = useCallback((assignmentsOrUpdater: SubjectAssignment[] | ((prev: SubjectAssignment[]) => SubjectAssignment[])) => {
    setAssignmentsState(prev => {
      const newAssignments = typeof assignmentsOrUpdater === 'function' ? assignmentsOrUpdater(prev) : assignmentsOrUpdater;
      saveAssignmentsToSession(newAssignments);
      return newAssignments;
    });
  }, []);

  // Computed enrollment summary
  const enrollmentSummary = useMemo(() => {
    return getSubjectEnrollmentSummary(students);
  }, [students]);

  // Configuration Management
  const updateConfig = useCallback((updates: Partial<SubjectAssignmentConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, [setConfig]);

  const subjectConfigs = useMemo(() => config.subjectConfigs, [config.subjectConfigs]);

  const updateSubjectConfig = useCallback((index: number, updates: Partial<SubjectConfig>) => {
    setConfig(prev => {
      const newConfigs = [...prev.subjectConfigs];
      if (index >= 0 && index < newConfigs.length) {
        newConfigs[index] = { ...newConfigs[index], ...updates };
      }
      return { ...prev, subjectConfigs: newConfigs };
    });
  }, [setConfig]);

  const addSubjectConfig = useCallback((subjectConfig: SubjectConfig) => {
    setConfig(prev => ({
      ...prev,
      subjectConfigs: [...prev.subjectConfigs, subjectConfig],
    }));
  }, [setConfig]);

  const removeSubjectConfig = useCallback((index: number) => {
    setConfig(prev => ({
      ...prev,
      subjectConfigs: prev.subjectConfigs.filter((_, i) => i !== index),
    }));
  }, [setConfig]);

  const autoConfigureSubjects = useCallback((minEnrollment = 10, defaultClassSize = 30) => {
    const summary = getSubjectEnrollmentSummary(students);

    const newConfigs: SubjectConfig[] = summary
      .filter(s => s.count >= minEnrollment)
      .map(s => ({
        subject: s.subject,
        semester: s.semester,
        enrollmentCount: s.count,
        classCount: Math.ceil(s.count / defaultClassSize),
        algorithm: config.globalAlgorithm,
      }));

    setConfig(prev => ({
      ...prev,
      subjectConfigs: newConfigs,
    }));

    toast({
      title: '자동 설정 완료',
      description: `${newConfigs.length}개 과목이 자동으로 설정되었습니다.`,
    });
  }, [students, config.globalAlgorithm, setConfig, toast]);

  // History Management
  const addToHistory = useCallback((newAssignments: SubjectAssignment[], description: string) => {
    setHistory(prev => {
      // Truncate history after current index
      const truncated = prev.slice(0, historyIndex + 1);

      const newEntry: SubjectAssignmentHistoryEntry = {
        assignments: JSON.parse(JSON.stringify(newAssignments)), // Deep clone
        timestamp: new Date(),
        description,
      };

      // Keep max 30 entries
      const newHistory = [...truncated, newEntry].slice(-30);
      return newHistory;
    });

    setHistoryIndex(prev => {
      const newIndex = Math.min(prev + 1, 29);
      return newIndex;
    });
  }, [historyIndex]);

  const canUndo = useMemo(() => historyIndex > 0, [historyIndex]);
  const canRedo = useMemo(() => historyIndex < history.length - 1, [historyIndex, history.length]);

  const undo = useCallback(() => {
    if (!canUndo) return;

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setAssignments(history[newIndex].assignments);

    toast({
      title: '실행 취소',
      description: `이전 상태로 되돌렸습니다.`,
    });
  }, [canUndo, historyIndex, history, setAssignments, toast]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setAssignments(history[newIndex].assignments);

    toast({
      title: '다시 실행',
      description: `다음 상태로 이동했습니다.`,
    });
  }, [canRedo, historyIndex, history, setAssignments, toast]);

  // Assignment Operations
  const runAssignment = useCallback((studentData: Student[]) => {
    if (config.subjectConfigs.length === 0) {
      toast({
        title: '설정 필요',
        description: '과목 설정이 필요합니다. 자동 설정을 실행하거나 수동으로 추가하세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const newAssignments = assignAllSubjects(
        studentData,
        config.subjectConfigs,
        config.globalAlgorithm
      );

      setAssignments(newAssignments);
      addToHistory(newAssignments, '전체 과목 배정');

      toast({
        title: '배정 완료',
        description: `${newAssignments.length}개 과목이 배정되었습니다.`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '배정 중 오류가 발생했습니다.';
      toast({
        title: '배정 오류',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [config, setAssignments, addToHistory, toast]);

  const runSingleSubjectAssignment = useCallback((studentData: Student[], subjectIndex: number) => {
    if (subjectIndex < 0 || subjectIndex >= config.subjectConfigs.length) {
      toast({
        title: '잘못된 인덱스',
        description: '유효하지 않은 과목 인덱스입니다.',
        variant: 'destructive',
      });
      return;
    }

    const subjectConfig = config.subjectConfigs[subjectIndex];

    try {
      const enrolledStudents = getEnrolledStudents(
        studentData,
        subjectConfig.subject,
        subjectConfig.semester
      );

      const newAssignment = assignStudentsToSubject({
        students: enrolledStudents,
        subject: subjectConfig.subject,
        semester: subjectConfig.semester,
        classCount: subjectConfig.classCount,
        algorithm: subjectConfig.algorithm || config.globalAlgorithm
      });

      setAssignments(prev => {
        // Replace existing assignment for this subject+semester if it exists
        const filtered = prev.filter(
          a => !(a.subjectName === subjectConfig.subject && a.semester === subjectConfig.semester)
        );
        const updated = [...filtered, newAssignment];
        return updated;
      });

      addToHistory([...assignments, newAssignment], `${subjectConfig.subject} (${subjectConfig.semester === 'semester1' ? '1학기' : '2학기'}) 배정`);

      toast({
        title: '과목 배정 완료',
        description: `${subjectConfig.subject}가 ${subjectConfig.classCount}개 반으로 배정되었습니다.`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '배정 중 오류가 발생했습니다.';
      toast({
        title: '배정 오류',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [config, assignments, setAssignments, addToHistory, toast]);

  const moveStudent = useCallback((
    subjectName: string,
    semester: 'semester1' | 'semester2',
    studentId: string | number,
    fromClass: number,
    toClass: number
  ) => {
    setAssignments(prev => {
      const newAssignments = prev.map(assignment => {
        if (assignment.subjectName !== subjectName || assignment.semester !== semester) {
          return assignment;
        }

        // Find student in fromClass
        const fromClassObj = assignment.classes.find(c => c.classNum === fromClass);
        const studentToMove = fromClassObj?.students.find(s => s.id === studentId);

        if (!studentToMove) {
          return assignment;
        }

        // Create updated classes
        const updatedClasses = assignment.classes.map(classObj => {
          if (classObj.classNum === fromClass) {
            // Remove student from fromClass
            return {
              ...classObj,
              students: classObj.students.filter(s => s.id !== studentId),
            };
          } else if (classObj.classNum === toClass) {
            // Add student to toClass
            return {
              ...classObj,
              students: [...classObj.students, studentToMove],
            };
          }
          return classObj;
        });

        return {
          ...assignment,
          classes: updatedClasses,
        };
      });

      addToHistory(newAssignments, `학생 이동: ${subjectName}`);
      return newAssignments;
    });

    toast({
      title: '학생 이동 완료',
      description: `${fromClass}반에서 ${toClass}반으로 이동했습니다.`,
    });
  }, [setAssignments, addToHistory, toast]);

  // Export/Import
  const exportToExcel = useCallback(() => {
    if (assignments.length === 0) {
      toast({
        title: '내보내기 오류',
        description: '내보낼 배정 결과가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      exportSubjectAssignmentsToExcel(assignments);

      toast({
        title: '내보내기 완료',
        description: '과목별 배정 결과가 엑셀 파일로 다운로드되었습니다.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '내보내기 중 오류가 발생했습니다.';
      toast({
        title: '내보내기 오류',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [assignments, toast]);

  const importFromExcel = useCallback(async (file: File): Promise<{ success: boolean; errors?: string[] }> => {
    try {
      const result = await importSubjectAssignmentsFromExcel(file);

      if (result.valid && result.assignments) {
        setAssignments(result.assignments);
        addToHistory(result.assignments, '엑셀 파일 가져오기');

        toast({
          title: '가져오기 완료',
          description: `${result.assignments.length}개 과목 배정을 불러왔습니다.`,
        });

        return { success: true };
      } else {
        toast({
          title: '가져오기 실패',
          description: result.errors?.join('\n') || '파일 형식이 올바르지 않습니다.',
          variant: 'destructive',
        });

        return { success: false, errors: result.errors };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '가져오기 중 오류가 발생했습니다.';
      toast({
        title: '가져오기 오류',
        description: errorMessage,
        variant: 'destructive',
      });

      return { success: false, errors: [errorMessage] };
    }
  }, [setAssignments, addToHistory, toast]);

  // Reset
  const reset = useCallback(() => {
    clearAllSessionStorage();
    setConfigState({
      globalAlgorithm: 'balanced',
      balanceGrades: true,
      subjectConfigs: [],
    });
    setAssignmentsState([]);
    setHistory([]);
    setHistoryIndex(-1);

    toast({
      title: '초기화 완료',
      description: '모든 설정과 배정 결과가 초기화되었습니다.',
    });
  }, [toast]);

  return {
    // Source data
    enrollmentSummary,

    // Configuration
    config,
    updateConfig,
    subjectConfigs,
    updateSubjectConfig,
    addSubjectConfig,
    removeSubjectConfig,
    autoConfigureSubjects,

    // Assignment Results
    assignments,

    // Operations
    runAssignment,
    runSingleSubjectAssignment,
    moveStudent,

    // History
    canUndo,
    canRedo,
    undo,
    redo,

    // Export/Import
    exportToExcel,
    importFromExcel,

    // Reset
    reset,
  };
}
