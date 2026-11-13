import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taskActionKeys } from '@/features/task-workflow/hooks/useTaskActions';
import {
  deleteTaskAction,
  deleteTaskActionRun,
  listTaskActionRunsForActions,
} from '@/features/task-workflow/services/taskActionService';
import type { TaskAction } from '@/features/task-workflow/types';
import {
  createDocGenAction,
  fetchCreatorNames,
  fetchDocGenActionImpact,
  fetchTaskTitles,
  getDocGenAction,
  listDocGenActions,
  setDocGenActionVisibility,
  updateDocGenAction,
} from '../services/docGenService';

export const docGenKeys = {
  all: ['docgen-actions'] as const,
  detail: (id: string) => ['docgen-actions', 'detail', id] as const,
  taskTitles: (ids: string[]) => ['docgen-actions', 'task-titles', [...ids].sort().join('|')] as const,
  runs: (ids: string[]) => ['docgen-actions', 'runs', [...ids].sort().join('|')] as const,
};

/**
 * 문서 생성 목록 — **읽을 수 있는 spec_fill WORK 전부**(2026-09-08).
 * 업무 관리에서 만들어진 방식도 여기 포함된다. 분류·정렬은 `buildDocGenRows`.
 */
export function useDocGenActions() {
  return useQuery({ queryKey: docGenKeys.all, queryFn: listDocGenActions });
}

/**
 * 내 생성 방식들의 **실행 이력 전체** — 페이지 우측 서랍용.
 *
 * 서랍은 기본으로 열려 있고 카드를 고르지 않은 상태가 기본이라, 그때도 보여 줄 것이
 * 있어야 한다. 카드 선택 필터는 **받아 온 뒤 화면에서** 건다 — 서랍을 열어 둔 채
 * 카드를 옮겨 다니는 것이 기본 동작이라 선택마다 다시 받으면 목록이 깜빡인다.
 */
export function useMyDocGenRuns(workIds: string[]) {
  return useQuery({
    queryKey: docGenKeys.runs(workIds),
    queryFn: () => listTaskActionRunsForActions(workIds),
    enabled: workIds.length > 0,
    staleTime: 30 * 1000,
  });
}

/**
 * 실행·검수 이력 한 건 삭제 (2026-09-23).
 *
 * 서비스·RPC 는 러너 쪽 서랍(`ActionRunHistory`)과 **같은 것을 쓴다** — 삭제 규칙이 두
 * 벌이 되면 한쪽만 고쳐져 "여기서는 지워지는데 저기서는 안 되는" 상태가 된다.
 *
 * ⚠️ **캐시 무효화는 두 곳이다.** 러너 쪽 `useDeleteTaskActionRun` 은 `taskActionKeys.all`
 * 만 비우는데, 이 화면의 목록은 `docGenKeys.runs(...)` 로 따로 캐시된다 — 그것만 쓰면
 * **지워졌는데 목록에 그대로 남는다**(오류도 나지 않는다). 반대로 `docGenKeys` 만 비우면
 * 같은 RUN 을 보고 있는 러너 서랍이 낡은 채로 남는다.
 */
export function useDeleteDocGenRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTaskActionRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: docGenKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
}

/** 공유 카드 '만든 사람' 이름 배치 조회 */
export function useDocGenCreatorNames(userIds: string[]) {
  return useQuery({
    queryKey: [...docGenKeys.all, 'creators', [...userIds].sort().join('|')],
    queryFn: () => fetchCreatorNames(userIds),
    enabled: userIds.length > 0,
  });
}

/** 공지 딥링크로 진입한 (남의 것일 수 있는) 생성 방식 단건 */
export function useDocGenAction(id: string | null) {
  return useQuery({
    queryKey: docGenKeys.detail(id ?? ''),
    queryFn: () => getDocGenAction(id!),
    enabled: Boolean(id),
  });
}

/**
 * 삭제 확인 모달이 보여 줄 파급 — **모달이 열릴 때만** 받는다(카드마다 미리 세면
 * 목록 한 화면에 조회가 방식 수만큼 생긴다). 캐시하지 않는다: 지우기 직전의 숫자여야 한다.
 */
export function useDocGenActionImpact(action: TaskAction | null) {
  return useQuery({
    queryKey: [...docGenKeys.all, 'impact', action?.id ?? ''],
    queryFn: () => fetchDocGenActionImpact(action!),
    enabled: Boolean(action),
    staleTime: 0,
    gcTime: 0,
  });
}

export function useDocGenTaskTitles(taskIds: string[]) {
  return useQuery({
    queryKey: docGenKeys.taskTitles(taskIds),
    queryFn: () => fetchTaskTitles(taskIds),
    enabled: taskIds.length > 0,
  });
}

/** 목록 + task-action 캐시(업무 관리 쪽 WORK 버튼·패널) 동시 무효화 */
function useDocGenInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: docGenKeys.all });
    void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
  };
}

export function useCreateDocGenAction() {
  const invalidate = useDocGenInvalidate();
  return useMutation({ mutationFn: createDocGenAction, onSuccess: invalidate });
}

export function useUpdateDocGenAction() {
  const invalidate = useDocGenInvalidate();
  return useMutation({
    mutationFn: (input: { actionId: string; title?: string; description?: string | null }) =>
      updateDocGenAction(input.actionId, { title: input.title, description: input.description }),
    onSuccess: invalidate,
  });
}

export function useSetDocGenActionVisibility() {
  const invalidate = useDocGenInvalidate();
  return useMutation({
    mutationFn: (input: { actionId: string; isPublic: boolean }) =>
      setDocGenActionVisibility(input.actionId, input.isPublic),
    onSuccess: invalidate,
  });
}

/** 삭제 = 실행 이력·결과 파일까지 정리(taskActionService.deleteTaskAction 재사용) */
export function useDeleteDocGenAction() {
  const invalidate = useDocGenInvalidate();
  return useMutation({ mutationFn: deleteTaskAction, onSuccess: invalidate });
}
