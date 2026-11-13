/**
 * 분석 탭 전용 데이터 fetch hook
 * student_basic_info 직접 쿼리 (mock_result, section1_personal_info 포함)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Section6Record, MockExamResult, AttendanceRecord, VolunteerRecord, ReadingRecord } from '../utils/analysisUtils';

export interface AnalysisStudentData {
  id: string;        // student_code
  name: string;
  grade: number;
  class_num: number;
  number: number;
  section1_personal_info: {
    middleSchool?: string;
    admissionYear?: string;
    [key: string]: unknown;
  } | null;
  academic_development: Section6Record[] | null;
  mock_result: MockExamResult[] | null;
  attendance: AttendanceRecord[] | null;
  volunteer: VolunteerRecord[] | null;
  reading: ReadingRecord[] | null;
}

export function useAnalysisData(grade?: number) {
  return useQuery({
    queryKey: ['analysis-data', grade ?? 'all'],
    queryFn: async (): Promise<AnalysisStudentData[]> => {
      let query = (supabase
        .from('student_basic_info' as any)
        .select('id, name, grade, class_num, number, section1_personal_info, academic_development, mock_result, attendance, volunteer, reading') as any);

      if (grade !== undefined) {
        query = query.eq('grade', grade);
      }

      const { data, error } = await query.order('grade').order('class_num').order('number');

      if (error) {
        console.error('Analysis data fetch error:', error);
        throw new Error('분석 데이터를 불러올 수 없습니다.');
      }

      return (data as AnalysisStudentData[]) || [];
    },
    staleTime: 10 * 60 * 1000, // 10분
  });
}
