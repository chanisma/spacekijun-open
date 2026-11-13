// 할 일에 «연결된 작업»이 있는가 — 업무 관리 표의 렌치 색 판정 단일 출처 (2026-10-01).
//
// 연결된 작업은 `task_action` 행 하나에 산다 — 입력 받기·제출 받기·메시지·나이스 화면·문서 양식 …
// (`listConnectedTaskIds`). 종전엔 옛 제출 받기(`task.meta.submission`)도 함께 봤지만, 그 경로는
// 2026-10-05 에 화면에서 걷어 냈다(운영 0건 — 제출은 「제출 받기」 작업이다).
import type { Task } from '@/types/tasks';

export function hasConnectedActions(
  task: Pick<Task, 'id' | 'meta'>,
  connectedTaskIds: ReadonlySet<string> | null | undefined,
): boolean {
  return Boolean(connectedTaskIds?.has(task.id));
}
