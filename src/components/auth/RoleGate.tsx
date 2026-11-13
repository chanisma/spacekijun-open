import { useAuth } from '@/components/auth/AuthProvider';

type Role = 'student' | 'teacher' | 'staff' | 'admin';

interface RoleGateProps {
  /**
   * 허용할 역할. **모든 케이스에서 admin 미리보기 모드를 존중합니다.**
   * - 'student': 학생 + admin이 학생 미리보기 중일 때 → true
   * - 'teacher': 실제 교사 + admin 비미리보기 → true
   * - 'admin': 실제 admin 비미리보기 → true (미리보기 중이면 false로 admin 전용 UI를 숨김)
   * - 배열: OR 조건
   *
   * preview를 무시하고 raw role 체크가 필요하면 RoleGate가 아니라
   * `useAuth().isAdmin` / `profile.role`을 직접 쓰세요.
   */
  role?: Role | Role[];
  /**
   * 차단할 역할 (role과 동시 사용 금지).
   */
  not?: Role | Role[];
  /**
   * 조건 불일치 시 렌더할 대체 콘텐츠.
   */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 컴포넌트 레벨 역할 게이트.
 *
 * ProtectedRoute는 라우트 전체를 리다이렉트로 막지만, RoleGate는 컴포넌트
 * 단위로 자식을 숨기거나 fallback을 보여줍니다.
 *
 * 학생 판별은 AuthProvider의 `isStudentView`를 사용해 admin이 학생 시점으로
 * 미리보기하는 모드도 포함합니다.
 *
 * @example
 *   <RoleGate role="student">
 *     <MealCard />
 *   </RoleGate>
 *
 * @example
 *   <RoleGate role={['teacher', 'admin']}>
 *     <MyTasksCard />
 *   </RoleGate>
 *
 * @example
 *   <RoleGate role="student" fallback={<TeacherDashboard />}>
 *     <StudentDashboard />
 *   </RoleGate>
 */
export const RoleGate = ({ role, not, fallback = null, children }: RoleGateProps) => {
  const { user, profile, loading, effectiveRole, isAdmin } = useAuth();

  if (role && not) {
    if (import.meta.env.DEV) {
      console.warn('[RoleGate] role과 not은 동시에 사용할 수 없습니다. role을 우선합니다.');
    }
  }

  // 역할 미결정 상태(세션 로딩 중 또는 user가 있는데 profile이 아직 안 들어온
  // 구간)에서는 fallback만 렌더한다. 그렇지 않으면 `not="student"`가 true로 평가돼
  // 교사 UI가 잠깐 노출되는 FOUC가 발생한다.
  if (loading || (user && !profile)) {
    return <>{fallback}</>;
  }

  // 판정 기준은 실효 역할(미리보기 반영)이다. isAdmin도 미리보기 중엔 false.
  const matchesRole = (target: Role): boolean => {
    if (target === 'student') return effectiveRole === 'student';
    // admin 전용 UI: 미리보기 중이면 숨김
    if (target === 'admin') return isAdmin;
    // teacher: 실제 교사 OR 미리보기 아닌 admin.
    // 직원(staff)은 제외된다 — 교사 전용 UI는 학생 정보·교무 기능을 담는다.
    // 직원까지 포함하려면 role={['teacher', 'staff']}로 명시할 것.
    if (target === 'teacher') return effectiveRole === 'teacher' || isAdmin;
    if (target === 'staff') return effectiveRole === 'staff';
    return false;
  };

  const matchesAny = (roles: Role | Role[]): boolean => {
    const list = Array.isArray(roles) ? roles : [roles];
    return list.some(matchesRole);
  };

  let allowed: boolean;
  if (role) {
    allowed = matchesAny(role);
  } else if (not) {
    allowed = !matchesAny(not);
  } else {
    allowed = true;
  }

  return <>{allowed ? children : fallback}</>;
};
