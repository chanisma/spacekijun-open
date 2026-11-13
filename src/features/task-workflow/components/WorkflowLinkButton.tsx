import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Workflow, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { taskPagePath } from '@/lib/taskTabs';
import { TaskActionDialog } from './TaskActionDialog';
import type { TaskWorkflowEntityLink } from '../types';

interface WorkflowLinkButtonProps {
  link: TaskWorkflowEntityLink;
  className?: string;
  /**
   * 이 할 일에 실질 작업이 연결돼 있는가 — 같은 슬롯의 아이콘을 렌치로 승급하고,
   * 클릭 동작이 워크플로 이동 대신 실행 모달(TaskActionDialog) 열기로 바뀐다
   * (캔버스 태스크 노드 헤더의 "연결=파란 렌치" 기호와 동일). 별도 버튼을 추가하지
   * 않는 이유: 카드 우측 버튼이 3개가 되면 공간이 부족하다.
   * 렌치 모드에는 workTaskId·workTaskTitle이 함께 필요하다.
   */
  workConnected?: boolean;
  workTaskId?: string;
  workTaskTitle?: string;
}

function getWorkflowUrl(link: TaskWorkflowEntityLink): string {
  // 업무 흐름은 2026-10-05 부터 자기 페이지다(구 `/tasks?tab=workflow` 도 넘겨 주기는 한다)
  const params = new URLSearchParams({ workflow: link.workflowId });
  if (link.departmentId) params.set('department', link.departmentId);
  return `${taskPagePath('workflow')}?${params.toString()}`;
}

// 링·배경 없이 아이콘만 — 옆의 상세 보기(대각선 화살표) 버튼과 같은 무장식 스타일
const BUTTON_CLASS = 'h-8 w-8 shrink-0 rounded-full border-0 bg-transparent p-0 shadow-none';

export function WorkflowLinkButton({
  link,
  className,
  workConnected = false,
  workTaskId,
  workTaskTitle,
}: WorkflowLinkButtonProps) {
  const [workOpen, setWorkOpen] = useState(false);
  const workMode = workConnected && Boolean(workTaskId);

  if (workMode) {
    const label = `${workTaskTitle ?? '이 할 일'}에 연결된 작업 열기`;
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label}
          title={label}
          onClick={event => {
            event.stopPropagation();
            setWorkOpen(true);
          }}
          className={cn(BUTTON_CLASS, 'text-blue-600 hover:bg-blue-50 hover:text-blue-700', className)}
        >
          <Wrench className="h-3.5 w-3.5" />
        </Button>
        {workOpen && (
          <TaskActionDialog
            open
            onOpenChange={open => {
              if (!open) setWorkOpen(false);
            }}
            taskId={workTaskId!}
            taskTitle={workTaskTitle ?? ''}
            workflowId={link.workflowId}
          />
        )}
      </>
    );
  }

  return (
    <Button
      asChild
      type="button"
      variant="ghost"
      size="sm"
      className={cn(BUTTON_CLASS, 'text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700', className)}
    >
      <Link
        to={getWorkflowUrl(link)}
        aria-label={`${link.workflowName} 업무 흐름 보기`}
        title={`${link.workflowName} 업무 흐름 보기`}
        onClick={event => event.stopPropagation()}
      >
        {/* 접근성 이름은 위 aria-label이 담당한다. sr-only 텍스트를 함께 두면 이름에는
            기여하지 못하면서(aria-label 우선) position:absolute라 위치 지정된 조상이 없을 때
            컨테이닝 블록이 문서가 되어, 스크롤 컨테이너를 뚫고 문서 높이를 늘린다. */}
        <Workflow className="h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}
