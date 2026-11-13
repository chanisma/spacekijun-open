// ========================================
// 할 일 카드에서 여는 실행(실질 작업) 모달 (2026-08-12)
// 카드의 렌치 버튼 → 워크플로 탭으로 이동하는 대신 이 모달로 TaskActionPanel을 띄운다.
// 연결·실행·이력·검수 로직은 전부 TaskActionPanel(캔버스 인스펙터와 동일 컴포넌트)이 담당.
// ========================================

import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { TaskActionPanel } from './TaskActionPanel';

interface TaskActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  /**
   * 소속 워크플로. 워크플로 캔버스 밖(대시보드·할 일 상세)에서 열 때 노드가
   * 없으면 null이며, 이때는 소유 판정 근거가 없으므로 열람 전용으로 연다.
   */
  workflowId: string | null;
  /**
   * 이 창에서 작업을 연결·해제할 수 있는가 (2026-10-01 사용자 요청: 연결된 작업에서 작업 추가).
   * 호출부가 **그 업무의 매니저**라고 판정했을 때만 true — 내 업무 관리·업무 검색 표의 매니저 행.
   * 워크플로 소유와 무관하다(작업 연결은 할 일 단위이고 서버는 `created_by = 나`만 본다).
   * 해제는 서버가 만든 사람에게만 허락하므로 남이 연결한 작업의 해제는 오류로 알린다.
   */
  manageable?: boolean;
}

export function TaskActionDialog({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  workflowId,
  manageable = false,
}: TaskActionDialogProps) {
  const { user, isAdmin } = useAuth();

  // readOnly 판정 = TaskWorkflowTab의 canEditWorkflow와 동일 규칙(소유자 ∨ admin).
  // 소유 확인 전에는 보수적으로 읽기 전용 — 서버가 거부할 버튼을 잠깐이라도 보이지 않게.
  const { data: ownerId } = useQuery({
    queryKey: ['task-workflow', 'owner', workflowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_workflow')
        .select('owner_id')
        .eq('id', workflowId!)
        .single();
      if (error) throw error;
      return (data as { owner_id: string }).owner_id;
    },
    enabled: open && Boolean(workflowId),
    staleTime: 60_000,
  });
  // workflowId가 없으면(노드 삭제 등) 소유를 확인할 길이 없으므로 읽기 전용.
  // 공유 실행 종류(document.spec_fill)는 readOnly에서도 실행 버튼이 나온다.
  const readOnly = manageable
    ? false
    : !(workflowId && user && ownerId && (ownerId === user.id || isAdmin));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-0 max-w-3xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Wrench className="h-3.5 w-3.5" />
            </span>
            연결된 작업
          </DialogTitle>
          <DialogDescription className="text-left">{taskTitle}</DialogDescription>
        </DialogHeader>
        <TaskActionPanel
          taskId={taskId}
          taskTitle={taskTitle}
          workflowId={workflowId}
          readOnly={readOnly}
          // 할 일 목록(상세·대시보드)에서 연다 = 하러 왔다 → 사용 보기뿐(2026-09-23 사용자 결정).
          // 예외 = 관리 화면의 매니저 행(manageable) — 그 자리에서 작업을 추가한다(2026-10-01 사용자 요청).
          defaultMode={manageable ? 'manage' : 'use'}
          allowManage={manageable}
        />
      </DialogContent>
    </Dialog>
  );
}
