/**
 * Export/Import Hook
 * Excel 및 JSON 내보내기/불러오기
 */

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { ClassAssignment, StudentData, AssignmentStatistics, ClassAssignmentConfig } from '../types/class-assignment.types';
import { exportToExcel, exportToJson, type ExportOptions } from '../utils/excelExport';
import { importStudentsFromExcel, importAssignmentsFromJson, type ImportValidationResult } from '../utils/excelImport';

export interface UseExportImportReturn {
  // State
  isExporting: boolean;
  isImporting: boolean;
  importResult: ImportValidationResult | null;

  // Export Actions
  exportExcel: (assignments: ClassAssignment[], statistics: AssignmentStatistics, options?: ExportOptions) => void;
  exportJson: (assignments: ClassAssignment[], statistics: AssignmentStatistics, config: ClassAssignmentConfig) => void;

  // Import Actions
  importStudents: (file: File, gradeFilter?: number) => Promise<StudentData[]>;
  importAssignments: (file: File) => Promise<{ assignments: ClassAssignment[]; config?: ClassAssignmentConfig } | null>;

  // Utils
  clearImportResult: () => void;
}

export function useExportImport(): UseExportImportReturn {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportValidationResult | null>(null);

  // Excel 내보내기
  const exportExcel = useCallback((
    assignments: ClassAssignment[],
    statistics: AssignmentStatistics,
    options?: ExportOptions
  ) => {
    setIsExporting(true);

    try {
      exportToExcel(assignments, statistics, options);

      toast({
        title: '내보내기 완료',
        description: 'Excel 파일이 다운로드되었습니다.',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: '내보내기 실패',
        description: '파일 생성 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  }, [toast]);

  // JSON 내보내기
  const exportJsonHandler = useCallback((
    assignments: ClassAssignment[],
    statistics: AssignmentStatistics,
    config: ClassAssignmentConfig
  ) => {
    setIsExporting(true);

    try {
      exportToJson(assignments, statistics, config);

      toast({
        title: '내보내기 완료',
        description: 'JSON 파일이 다운로드되었습니다.',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: '내보내기 실패',
        description: '파일 생성 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  }, [toast]);

  // 학생 데이터 불러오기
  const importStudents = useCallback(async (file: File, gradeFilter?: number): Promise<StudentData[]> => {
    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await importStudentsFromExcel(file, { gradeFilter });
      setImportResult(result);

      if (!result.valid) {
        toast({
          title: '불러오기 실패',
          description: result.errors[0] || '유효하지 않은 파일입니다.',
          variant: 'destructive',
        });
        return [];
      }

      if (result.warnings.length > 0) {
        toast({
          title: '불러오기 완료 (경고 있음)',
          description: `${result.students.length}명 로드, ${result.warnings.length}개 경고`,
        });
      } else {
        toast({
          title: '불러오기 완료',
          description: `${result.students.length}명의 학생 데이터를 불러왔습니다.`,
        });
      }

      return result.students;
    } catch (error) {
      console.error('Import failed:', error);
      toast({
        title: '불러오기 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsImporting(false);
    }
  }, [toast]);

  // 배정 결과 불러오기
  const importAssignments = useCallback(async (file: File): Promise<{
    assignments: ClassAssignment[];
    config?: ClassAssignmentConfig;
  } | null> => {
    setIsImporting(true);

    try {
      const result = await importAssignmentsFromJson(file);

      if (!result.valid || !result.assignments) {
        toast({
          title: '불러오기 실패',
          description: result.error || '유효하지 않은 파일입니다.',
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: '불러오기 완료',
        description: `${result.assignments.length}개 반의 배정 결과를 불러왔습니다.`,
      });

      return {
        assignments: result.assignments,
        config: result.config,
      };
    } catch (error) {
      console.error('Import failed:', error);
      toast({
        title: '불러오기 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsImporting(false);
    }
  }, [toast]);

  const clearImportResult = useCallback(() => {
    setImportResult(null);
  }, []);

  return {
    isExporting,
    isImporting,
    importResult,
    exportExcel,
    exportJson: exportJsonHandler,
    importStudents,
    importAssignments,
    clearImportResult,
  };
}
