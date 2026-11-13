import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** club_info.students 한 명 — import된 동아리원 학적 스냅샷. */
export interface ClubStudent {
  resource_id: string;
  code?: string;     // 'YY-GCCNN'
  name: string;
  grade?: number;
  class?: number;
  number?: number;
}

export interface Club {
  id: string;
  name: string;
  category: string | null;
  teacher_name: string | null;
  teacher_resource_id: string | null;
  grade: number | null;
  students: ClubStudent[];
  student_count: number;
  academic_year: number;
  /** status: 'inactive' = 지금은 없는 동아리(명칭 변경·교체, 2026-09-24) — 기록은 남는다 */
  meta?: { status?: string; inactive_reason?: string; place?: string } | null;
}

/** 지금 있는 동아리인가 — meta.status 가 없으면 있는 것으로 본다 */
export function isClubActive(club: Pick<Club, 'meta'>): boolean {
  return club.meta?.status !== 'inactive';
}

/**
 * 동아리 목록 — club_info에서 (기본) 올해 동아리를 이름순으로 로드한다.
 * 동아리 봉사 발급 시 학생 명단·담당교사 자동 채움의 출처.
 */
export function useClubs(academicYear?: number) {
  const year = academicYear ?? new Date().getFullYear();
  const { data = [], isLoading } = useQuery({
    queryKey: ['issue-register', 'clubs', year],
    queryFn: async () => {
      // club_info는 아직 생성 타입에 없어 클라이언트를 캐스팅 (issueService 패턴과 동일)
      const sb = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: number) => {
              order: (col: string, opt: { ascending: boolean }) =>
                Promise<{ data: Club[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
      const { data, error } = await sb.from('club_info')
        .select('id, name, category, teacher_name, teacher_resource_id, grade, students, student_count, academic_year, meta')
        .eq('academic_year', year)
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);
      // 지금 있는 동아리가 먼저, 지금은 없는 동아리는 뒤로(발급할 지난 기록 때문에 목록에는 남긴다)
      return ((data ?? []) as Club[]).sort((a, b) => Number(!isClubActive(a)) - Number(!isClubActive(b)));
    },
    staleTime: 5 * 60 * 1000,
  });

  return { clubs: data, isLoading };
}
