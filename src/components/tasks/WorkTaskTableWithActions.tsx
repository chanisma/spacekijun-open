/**
 * 업무 목록의 할 일 표 + 작업 줄 (2026-10-06) — `WorkTaskTable` 에 «할 일 아래 작업 줄»을 채워 준다.
 *
 * 표 자체는 그리기만 하고(행 자료를 받는다), 조회(`useWorkActionOverview`)와 [열기]가 띄울 창은 여기서 맡는다 —
 * 업무 목록의 두 범위(내가 책임자인 업무 `IntegratedTaskView` · 전체 업무 `WorkCard`)가 같은 규칙을 쓰게.
 * 훅은 업무 카드의 map 안에서 부를 수 없으므로 컴포넌트로 뺐다.
 *
 * [열기]: 책임자 → 그 작업의 설정·현황 화면(관리 창의 [열기]와 같은 `TaskActionRunnerDialog`).
 *   책임자가 아니거나(전체 업무 범위) 관리자 전용 작업을 일반 교사가 열면 → 종전 렌치와 같은 «연결된 작업» 창(사용 보기).
 */
import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { getTaskActionDefinition } from '@/features/task-workflow/actionRegistry';
import { TaskActionDialog } from '@/features/task-workflow/components/TaskActionDialog';
import { TaskActionRunnerDialog } from '@/features/task-workflow/components/TaskActionPanel';
import { useWorkActionOverview } from '@/features/task-workflow/hooks/useWorkActionOverview';
import type { ActionLine } from '@/features/task-workflow/utils/actionOverview';
import type { Task } from '@/types/tasks';
import { WorkTaskTable, type WorkTaskTableProps } from './WorkTaskTable';

interface Props extends Omit<WorkTaskTableProps, 'actionLines' | 'onOpenAction'> {
  /** 이 할 일의 책임자인가 — 요청 상태를 읽을 수 있고 [열기]가 설정 화면으로 간다 */
  canManage: (task: Task) => boolean;
  /** 할 일이 올라간 업무 흐름 — 실행 기록의 맥락(없으면 null) */
  workflowIdOf: (taskId: string) => string | null;
}

type Opened = { task: Task; actionId: string; mode: 'runner' | 'panel' };

export function WorkTaskTableWithActions({ canManage, workflowIdOf, ...tableProps }: Props) {
  const { isAdmin } = useAuth();
  const tasks = tableProps.rows.map((row) => row.task);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const { lines } = useWorkActionOverview(
    tasks.map((task) => ({ id: task.id, meta: task.meta })),
    (taskId) => {
      const task = byId.get(taskId);
      return task ? canManage(task) : false;
    },
  );
  const [opened, setOpened] = useState<Opened | null>(null);

  const openAction = (task: Task, line: ActionLine) => {
    const definition = getTaskActionDefinition(line.action.action_type);
    const usable = canManage(task) && Boolean(definition) && (!definition!.adminOnly || isAdmin);
    setOpened({ task, actionId: line.action.id, mode: usable ? 'runner' : 'panel' });
  };

  // 열린 작업은 매번 최신 조회에서 찾는다 — 연 순간의 사본을 쥐고 있으면 자동 저장 뒤에도 낡은 설정을 보인다
  const openedAction = opened
    ? (lines.get(opened.task.id) ?? []).find((line) => line.action.id === opened.actionId)?.action ?? null
    : null;

  return (
    <>
      <WorkTaskTable {...tableProps} actionLines={lines} onOpenAction={openAction} />
      {opened?.mode === 'runner' && openedAction && (
        <TaskActionRunnerDialog
          action={openedAction}
          taskTitle={opened.task.title}
          workflowId={workflowIdOf(opened.task.id)}
          open
          onOpenChange={(next) => { if (!next) setOpened(null); }}
        />
      )}
      {opened?.mode === 'panel' && (
        <TaskActionDialog
          open
          onOpenChange={(next) => { if (!next) setOpened(null); }}
          taskId={opened.task.id}
          taskTitle={opened.task.title}
          workflowId={workflowIdOf(opened.task.id)}
        />
      )}
    </>
  );
}
