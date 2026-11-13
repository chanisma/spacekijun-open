// 할 일 담당자 바꾸기 — 계획 단일 출처 (2026-10-01).
//
// 내 업무 관리 표의 담당자 칸에서 매니저가 담당자를 그 자리에서 고친다(마감일 칸과 짝).
// 편집 창(TaskEditDialog)과 **같은 규칙**이어야 한다 — 두 경로가 다른 답을 내면 어느 쪽으로
// 고쳤느냐에 따라 완료 기록이 갈린다:
//   · 남는 사람은 상태·완료 시각을 그대로 둔다(새 사람만 pending)
//   · 다중 마감은 회차 기록에서, 과제 단위는 단위 기록에서 상태를 다시 파생한다
//
// 편집 창과 다른 점 두 가지:
//   ① **과제 단위를 맡은 사람은 여기서 뺄 수 없다** — 편집 창은 단위 표를 함께 보므로
//      단위 담당자를 범주에 자동 합류시키지만, 이 칸은 단위 표가 없다. 빼 버리면
//      `unitProgress` 에 범주 밖 사람이 남아 "누가 이 단위를 하는가"가 조용히 어긋난다.
//   ② 뺀 사람의 '담당자 아님' 표시(`assignmentIssues`)를 지운다 — 빼는 것이 곧 그 표시의 처리다.
//      남겨 두면 나중에 다시 넣었을 때 옛 표시가 되살아난다.
//
// 이 파일은 계산만 한다(쓰기는 useUpdateTaskAssigneesJsonb).

import type { TaskAssigneeJsonb } from '@/types/tasks';
import { deriveAssigneesFromProgress, getDeadlineProgress, getTaskDeadlines } from './taskDeadlines';
import { deriveAssigneesFromUnits, getTaskUnits, getUnitProgress, unitsOfAssignee } from './taskUnits';

export interface AssigneeEditTask {
  due_date?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface AssigneeEditPerson {
  id: string;
  name: string;
}

export interface AssigneeEditPlan {
  /** 저장할 `meta.assignees` (상태 파생까지 끝난 것) */
  assignees: TaskAssigneeJsonb[];
  added: AssigneeEditPerson[];
  /** 빠지는 사람 — 완료였던 사람은 화면이 경고한다(그 완료 기록이 사라진다) */
  removed: (AssigneeEditPerson & { status: TaskAssigneeJsonb['status'] })[];
  /** 과제 단위를 맡고 있어 여기서는 뺄 수 없는 사람 — 1명이라도 있으면 저장하지 않는다 */
  blockedUnitHolders: AssigneeEditPerson[];
  /** 바꿔 써야 할 때만 값이 있다(뺀 사람의 '담당자 아님' 표시 정리) */
  assignmentIssues?: Record<string, unknown>;
  /** 담당자 구성이 바뀌는가 */
  changed: boolean;
}

function currentAssignees(task: AssigneeEditTask): TaskAssigneeJsonb[] {
  const raw = task.meta && (task.meta as { assignees?: unknown }).assignees;
  return Array.isArray(raw) ? (raw as TaskAssigneeJsonb[]).filter((a) => a && typeof a.id === 'string') : [];
}

export function planAssigneeEdit(
  task: AssigneeEditTask,
  nextIds: readonly string[],
  nameOf: (id: string) => string | undefined,
  nowIso: string = new Date().toISOString(),
): AssigneeEditPlan {
  const before = currentAssignees(task);
  const beforeById = new Map(before.map((a) => [a.id, a]));
  const ids = [...new Set(nextIds.map((id) => id?.trim()).filter((id): id is string => !!id))];
  const nextSet = new Set(ids);

  const labelOf = (id: string) => beforeById.get(id)?.name || nameOf(id) || '이름 없음';

  const units = getTaskUnits(task);
  const unitProgress = getUnitProgress(task);

  const removedRaw = before.filter((a) => !nextSet.has(a.id));
  const blockedUnitHolders = units.length > 0
    ? removedRaw
        .filter((a) => unitsOfAssignee(units, unitProgress, a.id).length > 0)
        .map((a) => ({ id: a.id, name: labelOf(a.id) }))
    : [];

  // 파생 함수들은 `[key: string]: unknown` 을 요구하는데 TaskAssigneeJsonb 는 인터페이스라 색인 서명이 없다
  type Row = TaskAssigneeJsonb & Record<string, unknown>;
  const built: Row[] = ids.map((id): Row => {
    const existing = beforeById.get(id);
    if (existing) return existing as Row;
    return {
      id,
      name: nameOf(id) || '이름 없음',
      status: 'pending',
      assigned_at: nowIso,
      completed_at: null,
    };
  });

  const assignees = units.length > 0
    ? deriveAssigneesFromUnits(units, unitProgress, built)
    : deriveAssigneesFromProgress(getTaskDeadlines(task), getDeadlineProgress(task), built);

  const issuesRaw = task.meta && (task.meta as { assignmentIssues?: unknown }).assignmentIssues;
  let assignmentIssues: Record<string, unknown> | undefined;
  if (issuesRaw && typeof issuesRaw === 'object' && !Array.isArray(issuesRaw)) {
    const entries = Object.entries(issuesRaw as Record<string, unknown>);
    const kept = entries.filter(([id]) => !removedRaw.some((a) => a.id === id));
    if (kept.length !== entries.length) assignmentIssues = Object.fromEntries(kept);
  }

  const changed =
    removedRaw.length > 0 || ids.some((id) => !beforeById.has(id));

  return {
    assignees,
    added: ids.filter((id) => !beforeById.has(id)).map((id) => ({ id, name: labelOf(id) })),
    removed: removedRaw.map((a) => ({ id: a.id, name: labelOf(a.id), status: a.status ?? 'pending' })),
    blockedUnitHolders,
    assignmentIssues,
    changed,
  };
}
