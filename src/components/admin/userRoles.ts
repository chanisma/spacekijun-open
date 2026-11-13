import type { AppRole } from '@/lib/roles';

/**
 * 프로필 관리 화면의 역할 표시·선택 단일 출처.
 *
 * `profiles.role` 은 DB CHECK(`profiles_role_check`)상 4종이고, 목록 배지·필터 탭·통계 카드·
 * 수정 창 선택지가 모두 이 표를 읽는다. 예전에는 화면마다 교사/관리자/학생만 손으로 적어
 * 직원(staff)이 «교사»로 보였고 수정 창에서는 고를 수조차 없었다.
 */
export interface RoleMeta {
  label: string;
  /** 수정 창 선택지 설명 */
  description: string;
  badgeClass: string;
  avatarClass: string;
}

export const ROLE_ORDER: AppRole[] = ['teacher', 'staff', 'student', 'admin'];

export const ROLE_META: Record<AppRole, RoleMeta> = {
  teacher: {
    label: '교사',
    description: '학생 정보·교무 화면까지 사용',
    badgeClass: 'bg-blue-500/15 text-blue-700 hover:bg-blue-500/25',
    avatarClass: 'bg-blue-100 text-blue-700',
  },
  staff: {
    label: '직원',
    description: '학교 공통·문서·행정·업무만 — 학생 정보·교무 차단',
    badgeClass: 'bg-amber-500/15 text-amber-800 hover:bg-amber-500/25',
    avatarClass: 'bg-amber-100 text-amber-800',
  },
  student: {
    label: '학생',
    description: '학생 메뉴만 사용',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25',
    avatarClass: 'bg-emerald-100 text-emerald-700',
  },
  admin: {
    label: '관리자',
    description: '시스템의 모든 데이터와 설정에 접근',
    badgeClass: 'bg-red-500/15 text-red-700 hover:bg-red-500/25',
    avatarClass: 'bg-red-100 text-red-700',
  },
};

const STUDENT_EMAIL_PATTERN = /^\d+-\d+$/;

/**
 * 화면에 보일 역할. **저장된 `profiles.role` 이 정본**이고, 값이 비었거나 모르는 값일 때만
 * 이메일 모양(`NN-NNNNN` = 학생)으로 추정한다. 이메일을 먼저 보면 역할을 바꿔도 화면이
 * 따라오지 않는다.
 */
export const resolveDisplayRole = (u: { role?: string | null; email: string }): AppRole => {
  if (u.role && u.role in ROLE_META) return u.role as AppRole;
  return STUDENT_EMAIL_PATTERN.test(u.email.split('@')[0]) ? 'student' : 'teacher';
};
