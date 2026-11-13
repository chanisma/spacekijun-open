import { useEffect, useMemo, useState } from 'react';
import { withoutReportedNotMine } from '@/lib/taskAssignmentIssue';
import { isFromClosedWork } from '@/lib/taskStatus';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/auth/AuthProvider';
import { useCurrentUserResourceId } from '../hooks/usePermissions';
import { useMyTasksJsonb } from '../hooks/useTasksJsonb';
import { useNotifications } from '../hooks/useNotifications';
import { useDateChangeDetector } from '../hooks/useDateChangeDetector';
import { Layout } from '../components/layout/Layout';
import { RoleGate } from '../components/auth/RoleGate';
import { StudentHome } from '../components/dashboard/StudentHome';
import { TeacherHome } from '../components/dashboard/TeacherHome';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Info, X } from 'lucide-react';

/** 차단돼 홈으로 돌아온 경우 라우트 가드가 넘겨주는 state */
interface BlockedState {
  blockedFrom?: string;
  blockedReason?: 'role' | 'menu';
}

const Index = () => {
  const { loading: authLoading } = useAuth();
  const { data: currentResourceId, isLoading: isCurrentResourceLoading } = useCurrentUserResourceId();
  const location = useLocation();
  const navigate = useNavigate();

  // 라우트 가드가 홈으로 보낸 이유를 **한 번만** 알려준다. 종전엔 아무 흔적 없이 튕겨
  // 사용자가 클릭이 먹지 않았다고 오해하고 같은 링크를 반복했다.
  const blocked = (location.state ?? null) as BlockedState | null;
  const [notice, setNotice] = useState<BlockedState | null>(null);

  useEffect(() => {
    if (!blocked?.blockedFrom) return;
    setNotice(blocked);
    // state 를 즉시 비운다 — 안 그러면 뒤로가기·새로고침마다 같은 배너가 되살아난다.
    navigate(location.pathname, { replace: true, state: null });
  }, [blocked?.blockedFrom, blocked?.blockedReason, location.pathname, navigate]);

  useDateChangeDetector();

  const { data: rawMyTasksData, isLoading: loadingTasks } = useMyTasksJsonb(true);
  // '담당자 아님'을 표시한 할 일은 홈에 올리지 않는다(내 할 일 화면에는 표시와 함께 남는다).
  // 끝난 업무(완료·취소)의 할 일도 올리지 않는다 — 서버가 2026-10-05 부터 «내 할 일 › 완료» 기록을 위해
  // 함께 싣는데, 홈은 종전대로 지금 진행 중인 업무의 할 일만 본다.
  // 카드 여섯 곳이 전부 이 값 하나를 읽으므로 **여기서 한 번** 거른다 — 카드마다 거르면
  // 새 카드를 붙일 때 빠뜨린다.
  const myTasksData = useMemo(
    () =>
      rawMyTasksData
        ? {
            ...rawMyTasksData,
            assigned_tasks: withoutReportedNotMine(
              (rawMyTasksData.assigned_tasks ?? []).filter((task) => !isFromClosedWork(task)),
              currentResourceId,
            ),
          }
        : rawMyTasksData,
    [rawMyTasksData, currentResourceId],
  );
  const { data: notifications = [], isLoading: loadingNotifications } = useNotifications(currentResourceId as any);

  if (authLoading || isCurrentResourceLoading) {
    return (
      <Layout>
        {/* min-h-screen 을 쓰면 Layout 의 헤더·패딩 위에 한 화면이 더 얹혀 스피너가
            접힘선 아래로 밀린다. 화면이 아니라 이 영역의 높이를 기준으로 잡는다. */}
        <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
          <div className="h-16 w-16 animate-spin rounded-full border-b-2 border-primary" />
          <span className="sr-only">불러오는 중</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-4">
        {notice?.blockedFrom && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <code className="break-all font-mono text-xs">{notice.blockedFrom}</code>
                {notice.blockedReason === 'menu'
                  ? ' 은(는) 현재 사용할 수 없어 홈으로 돌아왔습니다. 관리자가 이 메뉴를 꺼 두었습니다.'
                  : ' 에 접근할 권한이 없어 홈으로 돌아왔습니다. 필요하면 관리자에게 문의해 주세요.'}
              </span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="알림 닫기"
                className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          <RoleGate role="student">
            <StudentHome />
          </RoleGate>

          <RoleGate not="student">
            <TeacherHome
              myTasksData={myTasksData}
              currentResourceId={currentResourceId as any}
              loadingTasks={loadingTasks}
              notifications={notifications}
              loadingNotifications={loadingNotifications}
            />
          </RoleGate>
        </div>
      </div>
    </Layout>
  );
};

export default Index;
