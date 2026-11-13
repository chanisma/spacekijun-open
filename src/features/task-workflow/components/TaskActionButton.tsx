// ========================================
// 할 일 카드·상세에서 여는 "연결된 작업" 버튼 (2026-08-14)
// 홈 대시보드 '나의 할 일' 행과 할 일 상세 모달(TaskDetailDialog)이 공유한다.
//
// 연결 여부 판정은 호출부가 `useTaskActionEntries`로 **목록 단위 배치 조회**해서
// 넘긴다 — 버튼이 스스로 쿼리를 걸면 행 수만큼 요청이 나간다.
// 실제 연결·실행·이력·검수 로직은 전부 TaskActionDialog → TaskActionPanel이 담당.
// ========================================

import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TaskActionDialog } from './TaskActionDialog';

interface TaskActionButtonProps {
  taskId: string;
  taskTitle: string;
  /** 소속 워크플로 — RUN 기록·편집 권한 판정용. 노드가 없으면 null(열람 전용으로 열린다) */
  workflowId: string | null;
  /**
   * icon = 렌치만 / compact = 렌치 + «작업»(업무 목록 표 — 아이콘만이면 진행·수정·상세와 구분이 안 됐다, 2026-10-06)
   * / label = 모달 푸터(«연결된 작업»)
   */
  variant?: 'icon' | 'compact' | 'label';
  className?: string;
  /**
   * 연결된 작업이 있는가 (2026-10-01). false 면 렌치를 흐리게 그린다 — 내 업무 관리 표는
   * 연결이 없어도 아이콘을 늘 두므로(열면 매니저는 그 자리에서 연결한다) 있고 없음이 색으로 갈려야 한다.
   */
  connected?: boolean;
  /** 매니저 행 — 창에서 작업을 추가·해제할 수 있다(TaskActionDialog.manageable) */
  manageable?: boolean;
}

export function TaskActionButton({
  taskId,
  taskTitle,
  workflowId,
  variant = 'icon',
  className,
  connected = true,
  manageable = false,
}: TaskActionButtonProps) {
  const [open, setOpen] = useState(false);
  const title = connected ? `${taskTitle}에 연결된 작업 열기` : `${taskTitle} — 연결된 작업 없음`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={variant === 'icon' ? 'icon' : 'sm'}
        title={title}
        // 텍스트가 보이는 label 변형은 보이는 이름을 그대로 접근성 이름으로 둔다
        // (aria-label로 덮으면 음성 입력이 화면의 글자로 누를 수 없게 된다)
        aria-label={variant === 'label' ? undefined : title}
        onClick={(event) => {
          // 카드 행 전체가 클릭 영역인 곳에서도 상세 모달이 함께 열리지 않게
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'shrink-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700',
          !connected && 'text-slate-300',
          variant === 'icon' ? 'h-8 w-8 rounded-full'
            : variant === 'compact' ? 'h-7 gap-1 rounded-full px-2 text-[11px]'
            : 'h-8 gap-1.5 px-3 text-xs',
          className
        )}
      >
        <Wrench className="h-3.5 w-3.5" />
        {variant === 'label' && '연결된 작업'}
        {variant === 'compact' && '작업'}
      </Button>

      {open && (
        <TaskActionDialog
          open
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
          taskId={taskId}
          taskTitle={taskTitle}
          workflowId={workflowId}
          manageable={manageable}
        />
      )}
    </>
  );
}
