import { TeacherHomeLegacy } from '@/components/dashboard/legacy/TeacherHomeLegacy';
import { TeacherDashboardV2 } from '@/features/teacher-dashboard/TeacherDashboardV2';
import type { TeacherDashboardProps } from '@/features/teacher-dashboard/types';

type TeacherDashboardVariant = 'legacy' | 'v2';

function getTeacherDashboardVariant(): TeacherDashboardVariant {
  const queryVariant = new URLSearchParams(window.location.search).get('teacherDashboard');
  if (queryVariant === 'legacy' || queryVariant === 'v2') return queryVariant;

  return import.meta.env.VITE_TEACHER_DASHBOARD_VARIANT === 'legacy' ? 'legacy' : 'v2';
}

/**
 * 교사용 홈 전환점입니다.
 * - 기본: 역할별 V2
 * - 임시 개인 롤백: ?teacherDashboard=legacy
 * - 배포 전체 롤백: VITE_TEACHER_DASHBOARD_VARIANT=legacy
 */
export function TeacherHome(props: TeacherDashboardProps) {
  return getTeacherDashboardVariant() === 'legacy'
    ? <TeacherHomeLegacy {...props} />
    : <TeacherDashboardV2 {...props} />;
}
