// ========================================
// 업무 목록의 «작업 줄» 조회 (2026-10-06) — 펼친 업무 하나의 할 일 전부를 한 번에.
// 행마다 조회하지 않는다(N+1). 판정·글은 utils/actionOverview.ts.
//
// 키를 일부러 기존 접두 아래 둔다 — 연결·해제는 `taskActionKeys.all`(['task-action']),
// 요청 보내기·마감은 [COLLECT_KEY] 를 무효화하므로 줄이 저절로 따라간다.
// ========================================

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listActionRequestStates } from '../services/collectInputService';
import {
  buildActionLines,
  countRequestPeople,
  REQUEST_ACTION_TYPES,
  type ActionLine,
  type ActionRequestState,
} from '../utils/actionOverview';
import { COLLECT_KEY } from './useCollectInput';
import { useTaskActionsForTasks } from './useTaskActions';

interface OverviewTask {
  id: string;
  meta?: unknown;
}

/**
 * @param canSeeRequests 이 할 일의 요청 상태를 읽을 수 있는가(책임자) — 못 읽는 사람에게 «요청 전»을 그리지 않는다
 * @param enabled 업무를 펼쳤을 때만 조회한다
 */
export function useWorkActionOverview(
  tasks: readonly OverviewTask[],
  canSeeRequests: (taskId: string) => boolean,
  enabled = true,
): { lines: Map<string, ActionLine[]>; isLoading: boolean } {
  const taskIds = enabled ? tasks.map((task) => task.id) : [];
  const { data: actions = [], isLoading } = useTaskActionsForTasks(taskIds);

  const requestActionIds = actions
    .filter((action) => REQUEST_ACTION_TYPES.has(action.action_type) && action.task_id && canSeeRequests(action.task_id))
    .map((action) => action.id)
    .sort();
  const { data: states } = useQuery({
    queryKey: [COLLECT_KEY, 'states', requestActionIds.join('|')],
    queryFn: () => listActionRequestStates(requestActionIds),
    enabled: requestActionIds.length > 0,
  });

  const metaKey = tasks.map((task) => task.id).join('|');
  const lines = useMemo(() => {
    const people = countRequestPeople(states?.targets ?? []);
    const requests = new Map<string, ActionRequestState>(
      (states?.requests ?? []).map((row) => [row.action_id, { status: row.status, people: people.get(row.action_id) ?? 0 }]),
    );
    return buildActionLines(actions, new Map(tasks.map((task) => [task.id, task.meta])), requests, canSeeRequests);
    // canSeeRequests 는 매 렌더 새 함수라 의존성에서 뺀다 — 판정 입력(할 일·작업·상태)이 바뀌면 다시 계산한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, states, metaKey, tasks]);

  return { lines, isLoading: enabled && isLoading };
}
