import { Building2, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';

/**
 * 헤더의 **직원(staff) 시점 미리보기** 토글.
 *
 * 학생 미리보기(대상 학생 선택)나 교사 미리보기(역할 태그 선택)와 달리 고를 것이
 * 없어 팝오버 없이 단순 토글이다 — 직원은 태그로 갈라지지 않는다.
 *
 * 켜면 admin·교사 전용 UI가 숨고 `ProtectedRoute`가 staff 기준으로 판정하므로,
 * 교무 화면(생기부·시험 감독 등)에 들어가면 홈으로 되돌아간다. 그게 직원이
 * 실제로 겪는 동작이라 미리보기의 요점이다.
 */
export function StaffPreviewControl() {
  // isAdmin은 미리보기 중 false가 되므로 여기선 쓰면 안 된다 — 나가기 칩이 사라진다.
  const { isRealAdmin, isStaffView, setViewAsStaff } = useAuth();

  if (!isRealAdmin) return null;

  if (!isStaffView) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setViewAsStaff(true)}
        className="h-7 w-7 rounded-full text-muted-foreground hover:bg-violet-50 hover:text-violet-600"
        title="행정 직원 화면 미리보기"
      >
        <Building2 className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1">
      <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-violet-600" />
      <span className="text-xs font-medium text-violet-700">행정 직원</span>
      <button
        type="button"
        onClick={() => setViewAsStaff(false)}
        className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-violet-200"
        title="관리자 화면으로 돌아가기"
      >
        <X className="h-3 w-3 text-violet-600" />
      </button>
    </div>
  );
}
