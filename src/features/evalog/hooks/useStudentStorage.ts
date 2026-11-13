/**
 * 학생 데이터 저장 관리 훅
 * IndexedDB와 JSON 내보내기/가져오기를 통합 관리합니다.
 */

import { useState, useCallback } from 'react';
import { Student } from '../types';
import {
  saveStudent,
  getStudent,
  getAllStudents,
  deleteStudent,
  saveStudentsBatch,
  clearAllStudents,
  searchStudents,
  studentExists,
  updateStudent
} from '../services/studentStorage';
import {
  exportStudentsToJSON,
  exportStudentToJSON,
  exportStudentsToCSV,
  importStudentsFromJSON,
  createBackup,
  restoreBackup,
  ExportData
} from '../services/dataExport';
import {
  mergeStudentLists,
  resolveDuplicate,
  DuplicateInfo,
  MergeResult,
  MergeStrategy
} from '../services/dataMerge';

export interface UseStudentStorageReturn {
  // 저장 관련
  saveStudent: (student: Partial<Student>) => Promise<void>;
  getStudent: (examNo: string) => Promise<Partial<Student> | null>;
  getAllStudents: () => Promise<Partial<Student>[]>;
  deleteStudent: (examNo: string) => Promise<void>;
  updateStudent: (examNo: string, updates: Partial<Student>) => Promise<void>;
  studentExists: (examNo: string) => Promise<boolean>;
  clearAll: () => Promise<void>;

  // 검색 관련
  searchByName: (name: string) => Promise<Partial<Student>[]>;
  searchBySchool: (schoolName: string) => Promise<Partial<Student>[]>;
  searchByDepartment: (department: string) => Promise<Partial<Student>[]>;

  // 내보내기 관련
  exportToJSON: (students: Partial<Student>[]) => void;
  exportSingleToJSON: (student: Partial<Student>) => void;
  exportToCSV: (students: Partial<Student>[]) => void;
  createBackup: (students: Partial<Student>[]) => void;

  // 가져오기 관련
  importFromJSON: (file: File) => Promise<ImportResult>;
  restoreFromBackup: (file: File) => Promise<RestoreResult>;

  // 병합 관련
  mergeData: (
    newStudents: Partial<Student>[],
    strategy?: MergeStrategy
  ) => Promise<MergeResult>;
  handleDuplicate: (
    merged: Partial<Student>[],
    duplicate: DuplicateInfo,
    choice: 'keep-existing' | 'use-new' | 'merge'
  ) => Partial<Student>[];

  // 상태
  loading: boolean;
  error: string | null;
}

export interface ImportResult {
  success: boolean;
  data?: ExportData;
  mergeResult?: MergeResult;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  studentsRestored?: number;
  error?: string;
}

export function useStudentStorage(): UseStudentStorageReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 저장 관련 함수들
  const save = useCallback(async (student: Partial<Student>) => {
    setLoading(true);
    setError(null);
    try {
      await saveStudent(student);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback(async (studentNo: string) => {
    setLoading(true);
    setError(null);
    try {
      return await getStudent(studentNo);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      return await getAllStudents();
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (studentNo: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteStudent(studentNo);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (studentNo: string, updates: Partial<Student>) => {
    setLoading(true);
    setError(null);
    try {
      await updateStudent(studentNo, updates);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const exists = useCallback(async (studentNo: string) => {
    setLoading(true);
    setError(null);
    try {
      return await studentExists(studentNo);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await clearAllStudents();
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 검색 관련 함수들
  const searchByName = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      return await searchStudents('name', name);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const searchBySchool = useCallback(async (schoolName: string) => {
    setLoading(true);
    setError(null);
    try {
      return await searchStudents('schoolName', schoolName);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const searchByDepartment = useCallback(async (department: string) => {
    setLoading(true);
    setError(null);
    try {
      return await searchStudents('department', department);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 내보내기 함수들 (클라이언트 사이드, 비동기 아님)
  const exportToJSON = useCallback((students: Partial<Student>[]) => {
    setError(null);
    try {
      exportStudentsToJSON(students);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    }
  }, []);

  const exportSingleToJSON = useCallback((student: Partial<Student>) => {
    setError(null);
    try {
      exportStudentToJSON(student);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    }
  }, []);

  const exportToCSV = useCallback((students: Partial<Student>[]) => {
    setError(null);
    try {
      exportStudentsToCSV(students);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    }
  }, []);

  const backup = useCallback((students: Partial<Student>[]) => {
    setError(null);
    try {
      createBackup(students);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      throw err;
    }
  }, []);

  // 가져오기 함수들
  const importFromJSON = useCallback(
    async (file: File): Promise<ImportResult> => {
      setLoading(true);
      setError(null);
      try {
        // 1. JSON 파일 파싱
        const data = await importStudentsFromJSON(file);

        // 2. 기존 데이터 가져오기
        const existingStudents = await getAllStudents();

        // 3. 데이터 병합
        const mergeResult = mergeStudentLists(
          existingStudents,
          data.students,
          'ask-user' // 중복 발생 시 사용자에게 물어봄
        );

        return {
          success: true,
          data,
          mergeResult
        };
      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const restoreFromBackup = useCallback(
    async (file: File): Promise<RestoreResult> => {
      setLoading(true);
      setError(null);
      try {
        // 1. 백업 파일 검증 및 파싱
        const result = await restoreBackup(file);

        if (!result.success || !result.data) {
          return {
            success: false,
            error: result.error || '백업 복원 실패'
          };
        }

        // 2. 기존 데이터 삭제 (선택적)
        // await clearAllStudents();

        // 3. 백업 데이터 저장
        await saveStudentsBatch(result.data.students);

        return {
          success: true,
          studentsRestored: result.data.students.length
        };
      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // 병합 함수들
  const mergeData = useCallback(
    async (
      newStudents: Partial<Student>[],
      strategy: MergeStrategy = 'merge'
    ): Promise<MergeResult> => {
      setLoading(true);
      setError(null);
      try {
        const existingStudents = await getAllStudents();
        const mergeResult = mergeStudentLists(existingStudents, newStudents, strategy);

        // 병합된 데이터 저장 (중복 제외)
        if (strategy !== 'ask-user') {
          await saveStudentsBatch(mergeResult.merged);
        }

        return mergeResult;
      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleDuplicate = useCallback(
    (
      merged: Partial<Student>[],
      duplicate: DuplicateInfo,
      choice: 'keep-existing' | 'use-new' | 'merge'
    ): Partial<Student>[] => {
      setError(null);
      try {
        return resolveDuplicate(merged, duplicate, choice);
      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  return {
    // 저장 관련
    saveStudent: save,
    getStudent: get,
    getAllStudents: getAll,
    deleteStudent: remove,
    updateStudent: update,
    studentExists: exists,
    clearAll,

    // 검색 관련
    searchByName,
    searchBySchool,
    searchByDepartment,

    // 내보내기 관련
    exportToJSON,
    exportSingleToJSON,
    exportToCSV,
    createBackup: backup,

    // 가져오기 관련
    importFromJSON,
    restoreFromBackup,

    // 병합 관련
    mergeData,
    handleDuplicate,

    // 상태
    loading,
    error
  };
}
