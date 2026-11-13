import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { convertBasicInfoToStudent } from '../services/adminService';
import { useEvaluationStore } from './useEvaluationStore';
import type { Student } from '../types';

/**
 * Hook for student self-data loading in Evalog.
 * Automatically loads the logged-in student's own data from Supabase,
 * cleans Zustand store to prevent localStorage contamination,
 * and sets the student as the only selected student.
 */
export function useStudentSelfData(enabled: boolean = true) {
  const { user, viewAsStudentId } = useAuth();
  const { resetData, setStudents, setSelectedStudentId } = useEvaluationStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);

  // Admin preview mode: use selected student ID; otherwise derive from email
  const effectiveStudentId = viewAsStudentId || (user?.email?.split('@')[0] || '');

  useEffect(() => {
    if (!enabled || !effectiveStudentId) {
      setLoading(false);
      return;
    }

    const emailPrefix = effectiveStudentId;

    const loadSelfData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Clean Zustand store to prevent localStorage contamination from other users
        resetData();

        // Fetch student_basic_info with detailed activities
        const { data: basicInfo, error: basicError } = await supabase
          .from('student_basic_info' as any)
          .select('*, student_detailed_activities(*)')
          .eq('id', emailPrefix)
          .single();

        if (basicError) {
          if (basicError.code === 'PGRST116') {
            // No data found for this student
            setError('학생 정보를 찾을 수 없습니다. 데이터가 아직 등록되지 않았을 수 있습니다.');
            setStudent(null);
            return;
          }
          throw basicError;
        }

        // Convert DB data to Student type
        const convertedStudent = convertBasicInfoToStudent(basicInfo);

        // Set as the only student in the store
        setStudents([convertedStudent]);
        setSelectedStudentId(convertedStudent.id);
        setStudent(convertedStudent);
      } catch (err: any) {
        console.error('학생 자기 데이터 로드 오류:', err);
        setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadSelfData();
  }, [effectiveStudentId, enabled, resetData, setStudents, setSelectedStudentId]);

  return { student, loading, error };
}
