import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchStudentSubjects, fetchStudentMock, fetchStudentMockRounds } from '../services/wishlist';
import { isFiveTierByCode } from '../utils/naesinScale';

export interface StudentNaesin {
  /** 전 학기·교과군 weighted_avg 평균 = 내신 평균 등급 (그 학생 척도 기준) */
  avgGrade: number | null;
  /**
   * 5등급제 여부. 여기서는 **학번 접두사 기반 1차 판정**이라 전입생은 틀릴 수 있다.
   * 화면에서는 WishlistView 가 과목 기록으로 `resolveIsFiveTier` 확정 보정을 거친다.
   */
  isFiveTier: boolean;
  /** 평균에 반영된 정량 과목 수 (5등급→9등급 환산 정밀도에 사용) */
  subjectCount: number | null;
}

async function fetchNaesin(studentCode: string): Promise<StudentNaesin> {
  // 학번 접두사 기반 1차 판정. 전입생은 접두사가 입학연도가 아닐 수 있으므로
  // 과목 기록이 있으면 WishlistView 가 resolveIsFiveTier 로 확정 보정한다.
  const isFiveTier = isFiveTierByCode(studentCode);

  // get_wishlist_naesin: SECURITY DEFINER + 위시리스트 동일 권한 게이트.
  // (이전엔 get_student_grade_trajectory(INVOKER)를 호출했으나 그 함수가 읽는
  //  student_academic_flat MV 에 authenticated SELECT 권한이 없어 항상 실패 →
  //  naesin=null → 적합도 항상 '판정불가' 였다.)
  const { data, error } = await supabase.rpc('get_wishlist_naesin', {
    p_student_code: studentCode,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as { avg_grade: number | null; subject_count: number } | undefined;
  const avgGrade =
    row && row.avg_grade != null && Number.isFinite(Number(row.avg_grade))
      ? Number(row.avg_grade)
      : null;
  const subjectCount =
    row && Number.isFinite(Number(row.subject_count)) && Number(row.subject_count) > 0
      ? Number(row.subject_count)
      : null;
  return { avgGrade, isFiveTier, subjectCount };
}

/** 학생 내신 평균 등급 + 등급 척도 (적합도 판정 입력) */
export function useStudentNaesin(studentCode: string | null) {
  return useQuery({
    queryKey: ['admission-wishlist', 'naesin', studentCode],
    queryFn: () => fetchNaesin(studentCode!),
    enabled: !!studentCode,
    staleTime: 5 * 60 * 1000,
  });
}

/** 학생 과목별 기록 (전형 맞춤 내신 계산용 — 학생당 1회 fetch, 모든 카드가 공유) */
export function useStudentSubjects(studentCode: string | null) {
  return useQuery({
    queryKey: ['admission-wishlist', 'subjects', studentCode],
    queryFn: () => fetchStudentSubjects(studentCode!),
    enabled: !!studentCode,
    staleTime: 5 * 60 * 1000,
  });
}

/** 학생 최근 모의고사 영역별 등급 (수능최저 판정용 — 학생당 1회 fetch) */
export function useStudentMock(studentCode: string | null) {
  return useQuery({
    queryKey: ['admission-wishlist', 'mock', studentCode],
    queryFn: () => fetchStudentMock(studentCode!),
    enabled: !!studentCode,
    staleTime: 5 * 60 * 1000,
  });
}

/** 학생 전 회차 모의고사 (RightPanel 회차 탐색·추세 표시용 — 최신→과거 순) */
export function useStudentMockRounds(studentCode: string | null) {
  return useQuery({
    queryKey: ['admission-wishlist', 'mock-rounds', studentCode],
    queryFn: () => fetchStudentMockRounds(studentCode!),
    enabled: !!studentCode,
    staleTime: 5 * 60 * 1000,
  });
}
