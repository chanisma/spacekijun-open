/**
 * 현재 로그인한 사용자의 신원·역할 통합 helper.
 *
 * - 학생: profiles.email prefix = student_basic_info.id (student_code)
 * - 교사/관리자: profile.role 기반
 * - 데이터 권한은 useAuth().isAdmin / isAdminUI / isStudentView 그대로 활용
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface CurrentActor {
  authUserId: string;
  role: 'admin' | 'teacher' | 'student';
  name: string;
  // 학생일 때 채워짐
  studentCode: string | null;
  studentGrade: number | null;
  studentClass: number | null;
  studentNo: number | null;
  studentResourceId: string | null;
  /** 학번 prefix "26-XXXXX" → 2026. 학생이 아니거나 추론 실패 시 null */
  studentAdmissionYear: number | null;
}

/**
 * 학번에서 입학연도 추출 — 패턴 강화.
 *  - "00-00646" → 2026
 *  - "26_10101" / "26.10101" → 2026
 *  - "2000-00646" / "20261010" → 2026
 */
export function inferAdmissionYearFromStudentCode(code: string | null | undefined): number | null {
  if (!code) return null;
  // 2자리 prefix + separator
  let m = code.match(/^(\d{2})[-_.]/);
  if (m) {
    const yy = parseInt(m[1], 10);
    return 2000 + yy;
  }
  // 4자리 prefix
  m = code.match(/^(\d{4})/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 2000 && y <= 2099) return y;
  }
  return null;
}

/**
 * 현재 사용자 신원 + (학생이면) student_basic_info / resource 매칭 정보까지.
 */
export function useCurrentActor() {
  const { user, profile, isStudentView, viewAsStudentId } = useAuth();
  const studentCodeGuess = (profile?.role === 'admin' && isStudentView ? viewAsStudentId : null)
    || user?.email?.split('@')[0] || null;

  return useQuery({
    queryKey: ['cs-current-actor', user?.id, profile?.role, isStudentView, studentCodeGuess],
    queryFn: async (): Promise<CurrentActor | null> => {
      if (!user || !profile) return null;

      const role: CurrentActor['role'] = isStudentView
        ? 'student'
        : profile.role === 'admin'
        ? 'admin'
        : 'teacher';

      const name = profile.name || user.email || '익명';

      if (role !== 'student' || !studentCodeGuess) {
        return {
          authUserId: user.id,
          role,
          name,
          studentCode: null,
          studentGrade: null,
          studentClass: null,
          studentNo: null,
          studentResourceId: null,
          studentAdmissionYear: null,
        };
      }

      // 학생: student_basic_info + resource 동시 조회
      const [sbi, res] = await Promise.all([
        supabase
          .from('student_basic_info' as any)
          .select('id, name, grade, class_num, number')
          .eq('id', studentCodeGuess)
          .maybeSingle(),
        supabase
          .from('resource')
          .select('id, name, meta')
          .filter('meta->>id', 'eq', studentCodeGuess)
          .maybeSingle(),
      ]);

      if (sbi.error) throw sbi.error;
      if (res.error) throw res.error;
      const sbiRow = sbi.data as any;
      const resRow = res.data as any;

      return {
        authUserId: user.id,
        role,
        name: sbiRow?.name || name,
        studentCode: studentCodeGuess,
        studentGrade: sbiRow?.grade ?? null,
        studentClass: sbiRow?.class_num ?? null,
        studentNo: sbiRow?.number ?? null,
        studentResourceId: resRow?.id ?? null,
        studentAdmissionYear: inferAdmissionYearFromStudentCode(studentCodeGuess),
      };
    },
    enabled: !!user && !!profile,
    staleTime: 5 * 60_000,
  });
}
