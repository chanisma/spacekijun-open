// ========================================
// 할 일 상태 "표시" 판정 단일 출처 (2026-08-22)
//
// 규칙: **task 전체가 종료(completed/cancelled)면 그것이 이긴다.** 그다음이 담당자 개인 상태,
// 마지막이 task.status.
//
// 왜 task 쪽이 이겨야 하나(2026-08-22 사용자 결정): 업무 매니저는 task 상태를 직접 바꿀 수
// 있고, **담당자들이 제출하지 않았더라도 매니저가 완료로 바꾸면 그 할 일은 끝난 것**이다.
// 이때 담당자 개인 상태를 완료로 바꿔 줄 필요는 없지만, 끝난 할 일이 담당자들의 '나의 할 일'에
// 기한 초과로 계속 남아서는 안 된다. 종전 규칙(`담당자 상태 ?? task.status`)은 개인 상태가
// 항상 우선해 정확히 그 증상을 냈다.
//
// **과제 단위 할 일에서도 같은 규칙이 맞다**: task 완료 = 모든 단위 완료이고, 단위를 하나도
// 맡지 않은 범주(pool) 담당자는 설계상 'pending'으로 남는다(CLAUDE.md "범주에만 있는 사람은
// 완료를 안 막음"). 그들에게 남은 일은 없으므로 화면에서 빠지는 것이 옳다.
// 라이브 실측: 완료된 평가운영계획 2건이 각각 단위 28·36개 전부 완료 상태였다.
//
// 이 파일은 React에 의존하지 않는 순수 모듈이다(대시보드·할 일 목록·회귀 테스트가 함께 쓴다).
// ========================================

/** 판정에 필요한 최소 형태 — 화면마다 task 타입이 조금씩 달라 구조적 타입으로 받는다 */
export interface TaskStatusLike {
  status?: string | null;
  /** 할 일이 든 업무의 상태 — get_my_tasks_jsonb 가 담당 목록에 싣는다(2026-10-05) */
  event_status?: string | null;
  meta?: {
    assignees?: ({ id?: string | null; status?: string | null } | null)[] | null;
  } | null;
}

/**
 * 이 사용자에게 보여줄 할 일 상태.
 * @param myResourceId 내 resource id. 없으면(담당자 아님·미해석) task.status를 따른다.
 */
/** task 자체가 끝났음을 뜻하는 상태 — 개인 상태보다 우선한다 */
const TERMINAL_TASK_STATUSES = new Set(['completed', 'cancelled']);

export function getMyTaskStatus(
  task: TaskStatusLike | null | undefined,
  myResourceId?: string | null,
): string {
  // 업무가 끝났으면 그 안의 할 일도 끝난 것이다(«매니저가 끝내면 끝난 것» — 위와 같은 원리, 2026-10-05).
  // 서버도 완료된 업무의 할 일을 status='completed' 로 싣지만, 다른 출처의 행을 위해 여기서도 본다.
  const workStatus = task?.event_status ?? undefined;
  if (workStatus && TERMINAL_TASK_STATUSES.has(workStatus)) return workStatus;
  const taskStatus = task?.status ?? undefined;
  if (taskStatus && TERMINAL_TASK_STATUSES.has(taskStatus)) return taskStatus;

  const assignee = myResourceId
    ? task?.meta?.assignees?.find((item) => item?.id === myResourceId)
    : undefined;

  // 담당자 항목이 있는데 status가 비어 있으면 'pending'이다 — task.status로 새지 않는다.
  // (task.status는 'active' 같은 **할 일 단위** 어휘라 개인 행에 그대로 쓰면 뜻이 어긋난다.
  //  구 구현 둘이 이 지점에서 서로 달랐다: 할 일 목록=pending, 대시보드=task.status)
  if (assignee) return assignee.status || 'pending';

  return taskStatus || 'pending';
}

/** 내 화면에서 이 할 일을 "끝난 것"으로 볼지 — 목록 필터·타임라인 표시의 기준 */
export function isMyTaskCompleted(
  task: TaskStatusLike | null | undefined,
  myResourceId?: string | null,
): boolean {
  return getMyTaskStatus(task, myResourceId) === 'completed';
}

/**
 * 이 할 일이 든 업무가 끝났는가(완료·취소). 내 할 일 담당 목록은 2026-10-05 부터 **완료된 업무의 할 일도**
 * 싣는다(«완료» 보기에서 기록이 사라지지 않게). 지금 해야 할 일만 보여 주는 곳(홈 대시보드)은 이걸로 거른다.
 */
export function isFromClosedWork(task: { event_status?: string | null } | null | undefined): boolean {
  return !!task?.event_status && TERMINAL_TASK_STATUSES.has(task.event_status);
}

/**
 * 업무를 «완료»로 바꾸기 전에 물을 문구 (2026-10-05) — 끝나지 않은 할 일이 있을 때만, 없으면 null.
 *
 * 업무 완료는 할 일·담당자 상태를 바꾸지 않지만, get_my_tasks_jsonb 가 닫힌 업무의 할 일을 담당자에게
 * «완료»로 보낸다(isFromClosedWork) — 즉 버튼 한 번에 남은 할 일이 담당자 모두의 내 할 일·홈에서 내려간다.
 * 종전엔 확인 없이 바로 바뀌었다(감사 문서 §4-8).
 */
export function workCompleteConfirmMessage(
  workName: string,
  tasks: readonly TaskStatusLike[] | null | undefined,
): string | null {
  const open = (tasks ?? []).filter((task) => {
    if (TERMINAL_TASK_STATUSES.has(task.status ?? '')) return false;
    const assignees = (task.meta?.assignees ?? []).filter(Boolean);
    return assignees.length > 0 ? !assignees.every((a) => a?.status === 'completed') : true;
  }).length;
  if (open === 0) return null;
  return `"${workName}" 업무를 완료로 바꿀까요?\n끝나지 않은 할 일 ${open}개가 담당자들의 내 할 일에서 «완료»로 넘어갑니다. 할 일 상태는 그대로이고, 진행 중으로 되돌리면 다시 나타납니다.`;
}
