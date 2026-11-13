// '담당자 아님' 표시의 판정 단일 출처 (2026-09-21).
//
// 담당자가 "제 담당 할 일이 아닙니다"를 누르면 `task.meta.assignmentIssues[내 resource id]` 에
// 사유가 남는다(`report_task_assignment_issue` RPC). 매니저가 담당자를 고치기 전까지 그 사람은
// **여전히 `meta.assignees` 에 들어 있으므로** `get_my_tasks_jsonb` 의 `assigned_tasks` 에 계속 온다.
//
// 그래서 화면이 둘로 갈린다(사용자 결정):
//   · **홈 대시보드** — 보이지 않는다. "오늘 할 일"에 내 일이 아니라고 밝힌 것이 남으면 소음이다.
//   · **내 할 일** — 보인다. 단 표시했다는 사실이 행에 드러나야 한다(숨기면 매니저가 고쳤는지
//     확인할 길이 없고, 실수로 눌렀을 때 취소할 자리도 사라진다).
// 판정을 화면마다 다시 쓰지 말 것 — 키가 resource id 라는 것을 한 곳만 알면 된다.

interface AssignmentIssueLike {
  meta?: { assignmentIssues?: Record<string, unknown> | null } | null;
}

/** 내가 이 할 일에 '담당자 아님'을 표시해 두었는가 */
export function hasReportedNotMine(
  task: AssignmentIssueLike,
  myResourceId: string | null | undefined,
): boolean {
  if (!myResourceId) return false;
  const issues = task.meta?.assignmentIssues;
  return !!issues && typeof issues === 'object' && issues[myResourceId] != null;
}

/** 홈 대시보드용 — '담당자 아님'을 표시한 할 일을 뺀다. id 를 모르면 아무것도 빼지 않는다 */
export function withoutReportedNotMine<T extends AssignmentIssueLike>(
  tasks: readonly T[] | null | undefined,
  myResourceId: string | null | undefined,
): T[] {
  const list = tasks ?? [];
  if (!myResourceId) return [...list];
  return list.filter((task) => !hasReportedNotMine(task, myResourceId));
}
