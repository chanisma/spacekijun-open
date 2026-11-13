/**
 * `profiles.role` 값과 화면 게이트에서 쓰는 역할 묶음.
 *
 * DB CHECK(`profiles_role_check`)와 같은 집합이다.
 */
export type AppRole = 'student' | 'teacher' | 'staff' | 'admin';

/**
 * 교직원(교사 + 행정 직원) + admin.
 *
 * **서버의 `is_staff_teacher_or_admin()`과 짝이다** — 한쪽만 바꾸면 화면은 열려 있는데
 * RLS가 0행을 주거나(빈 화면), 반대로 메뉴가 없는데 API로는 열리는 상태가 된다.
 *
 * 적용 범위 = 학교 공통(일정·공지·전화번호부) + 문서·행정(서류함·결재·구매·발급번호)
 * + 업무·협업. 학생 정보·교무 화면에는 쓰지 말 것 → {@link TEACHER_ROLES}.
 */
export const FACULTY_ROLES: AppRole[] = ['teacher', 'staff', 'admin'];

/**
 * 교사 + admin 전용. 직원(staff)은 제외된다.
 *
 * 서버의 `is_teacher_or_admin()`과 짝이다. 생기부·모의고사·학생 대시보드·교과분석·
 * 시간표·시험 감독·교육과정처럼 **학생 개인정보나 교무 업무**를 다루는 화면에 쓴다.
 */
export const TEACHER_ROLES: AppRole[] = ['teacher', 'admin'];

/** 해당 역할이 교직원(교사·직원·admin)인가. */
export const isFacultyRole = (role: string | null | undefined): boolean =>
  FACULTY_ROLES.includes(role as AppRole);
