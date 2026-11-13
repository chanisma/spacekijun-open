import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Student } from '../types/course.types';

export interface RosterRow {
  /** student_basic_info.id (학생코드, "00-00702") — 신청 저장 키 */
  studentCode: string | null;
  name: string;
  number: number;
  grade: number;
  classNum: number;
  /** 현재 차수에 신청 데이터가 있는가 */
  hasSubmission: boolean;
  semester1: string[];
  semester2: string[];
  /** 매칭된 course-analyze Student (편집 모달 prefill용) */
  student: Student | null;
}

interface BasicInfoRow {
  id: string;
  name: string;
  number: number | null;
  grade: number | null;
  class_num: number | null;
}

/**
 * 학급 전체 명단 ⟕ 현재 차수 신청.
 * @param grade  대상 학년
 * @param classNum 대상 반
 * @param currentStudents course-analyze 컨텍스트의 현재 차수 학생들 (신청자)
 */
export function useClassRoster(
  grade: number | null,
  classNum: number | null,
  currentStudents: Student[],
) {
  const rosterQ = useQuery({
    queryKey: ['ca-class-roster', grade, classNum],
    queryFn: async (): Promise<BasicInfoRow[]> => {
      if (grade == null || classNum == null) return [];
      const { data, error } = await supabase
        .from('student_basic_info')
        .select('id, name, number, grade, class_num')
        .eq('grade', grade)
        .eq('class_num', classNum)
        .order('number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BasicInfoRow[];
    },
    enabled: grade != null && classNum != null,
    staleTime: 5 * 60_000,
  });

  const rows = useMemo<RosterRow[]>(() => {
    const roster = rosterQ.data ?? [];
    // 신청자 인덱스: studentCode(우선) + (이름|번호) 폴백
    const byCode = new Map<string, Student>();
    const byNameNo = new Map<string, Student>();
    for (const s of currentStudents) {
      if (s.class !== classNum) continue;
      const code = s.realID ?? (typeof s.id === 'string' && s.id.includes('-') ? s.id : null);
      if (code) byCode.set(code, s);
      byNameNo.set(`${s.name}|${s.number}`, s);
    }

    return roster.map((r) => {
      const matched =
        byCode.get(r.id) ?? byNameNo.get(`${r.name}|${r.number ?? -1}`) ?? null;
      return {
        studentCode: r.id,
        name: matched?.name ?? r.name,
        number: r.number ?? matched?.number ?? 0,
        grade: r.grade ?? grade ?? 0,
        classNum: r.class_num ?? classNum ?? 0,
        hasSubmission: !!matched,
        semester1: matched?.semester1 ?? [],
        semester2: matched?.semester2 ?? [],
        student: matched,
      };
    });
  }, [rosterQ.data, currentStudents, classNum, grade]);

  return { rows, isLoading: rosterQ.isLoading, error: rosterQ.error };
}
