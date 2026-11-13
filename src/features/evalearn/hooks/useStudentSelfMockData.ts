import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useStudentStore } from './useStudentStore';
import type { EvalearnStudent } from '../types';

/**
 * 학생 모드에서 자기 자신의 mock_marking/mock_result만 로드하는 hook.
 * RLS(student_basic_info_select)가 학생을 자기 행으로만 격리하지만,
 * 명시적으로 자기 학번(이메일 prefix)으로 .eq() 필터를 거는 게 의도가 분명하고
 * 인덱스 경로도 좁아짐.
 *
 * - admin이 학생 시점으로 미리보기할 때는 viewAsStudentId 사용
 * - store는 reset → 본인 1명만 students로 설정 → selectedStudentId 자동 지정
 */
export function useStudentSelfMockData(enabled: boolean = true) {
  const { user, viewAsStudentId } = useAuth();
  const setStudents = useStudentStore((s) => s.setStudents);
  const setSelectedStudentId = useStudentStore((s) => s.setSelectedStudentId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<EvalearnStudent | null>(null);

  const effectiveStudentId = viewAsStudentId || (user?.email?.split('@')[0] || '');

  useEffect(() => {
    if (!enabled || !effectiveStudentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: dbErr } = await supabase
          .from('student_basic_info' as any)
          .select('id, name, grade, class_num, number, mock_marking, mock_result')
          .eq('id', effectiveStudentId)
          .single();

        if (cancelled) return;

        if (dbErr) {
          if (dbErr.code === 'PGRST116') {
            setError('본인 정보를 찾을 수 없습니다. 데이터가 아직 등록되지 않았을 수 있습니다.');
            setStudent(null);
            setStudents([]);
            setSelectedStudentId(null);
            return;
          }
          throw dbErr;
        }

        const row = data as any;
        const self: EvalearnStudent = {
          id: row.id,
          name: row.name,
          grade: row.grade,
          classNum: row.class_num,
          number: row.number,
          mock_marking: row.mock_marking ?? null,
          mock_result: row.mock_result ?? null,
        };

        setStudent(self);
        setStudents([self]);
        setSelectedStudentId(self.id);
      } catch (err: any) {
        if (cancelled) return;
        console.error('학생 본인 모의고사 데이터 로드 실패:', err);
        setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [effectiveStudentId, enabled, setStudents, setSelectedStudentId]);

  return { student, loading, error };
}
