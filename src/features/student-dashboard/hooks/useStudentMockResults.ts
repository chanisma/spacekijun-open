/**
 * 학생 1명의 모의고사 성적(student_basic_info.mock_result) 조회.
 *
 * 목록 RPC(`get_student_dashboard_data`)는 mock_result를 반환하지 않고, 분석 탭의
 * `useAnalysisData`는 학년 전체를 통째로 읽는다. 상세 패널은 선택된 학생 한 명만 필요하므로
 * 해당 행의 mock_result만 얇게 읽는다.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MockExamResult } from '../utils/analysisUtils';

export function useStudentMockResults(studentCode: string | null) {
  return useQuery({
    queryKey: ['student-dashboard', 'mock-result', studentCode],
    queryFn: async (): Promise<MockExamResult[]> => {
      const { data, error } = await supabase
        .from('student_basic_info')
        .select('mock_result')
        .eq('id', studentCode as string)
        .maybeSingle();

      if (error) {
        console.error('Mock exam result fetch error:', error);
        throw new Error('모의고사 성적을 불러올 수 없습니다.');
      }

      // 컬럼은 Json이라 배열 보장이 없다 — 형태가 어긋나면 빈 배열로 낮춘다
      const raw = data?.mock_result as unknown as MockExamResult[] | null | undefined;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!studentCode,
    staleTime: 10 * 60 * 1000, // 10분
  });
}
