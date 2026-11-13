import type { Work, Task } from '@/types/tasks';
import { getMyTaskStatus } from '@/lib/taskStatus';
import { getTaskDeadlines, pendingDeadlinesForAssignee, pendingDeadlinesForWork } from '@/lib/taskDeadlines';

export type InboxFilter = 'todo' | 'completed' | 'all';
export type InboxGroup = 'overdue' | 'today' | 'upcoming' | 'undated' | 'waiting' | 'completed' | 'cancelled';
export const inboxGroups: { id: InboxGroup; label: string }[] = [
  { id: 'overdue', label: '마감이 지났어요' },
  { id: 'today', label: '오늘까지' },
  { id: 'upcoming', label: '다가오는 할 일' },
  { id: 'undated', label: '마감일 없는 할 일' },
  { id: 'waiting', label: '시작 대기' },
  { id: 'completed', label: '완료한 할 일' },
  { id: 'cancelled', label: '취소된 할 일' },
];

export interface InboxTask {
  task: Task;
  status: string;
  group: InboxGroup;
  due: string | null;
}

/** RPC의 담당 할 일만 입력받는다. 관리자라는 이유로 다른 사람의 할 일을 섞지 않는다. */
export function buildMyTaskInbox(tasks: Task[], works: Work[], resourceId: string, today: string): InboxTask[] {
  const workMap = new Map(works.map(work => [work.id, work]));
  return tasks.map(original => {
    const work = workMap.get(original.event_id);
    const task = {
      ...original,
      event_name: work?.name ?? original.event_name,
      meta: {
        ...original.meta,
        assignees: original.meta?.assignees ?? original.assignees_jsonb ?? [],
      },
    };
    const status = work?.status === 'cancelled' ? 'cancelled'
      : work?.status === 'completed' ? 'completed' : getMyTaskStatus(task, resourceId);
    const deadlines = status === 'completed' || status === 'cancelled'
      ? getTaskDeadlines(task) : pendingDeadlinesForAssignee(task, resourceId);
    const due = deadlines[0] ?? null;
    const group: InboxGroup = status === 'cancelled' ? 'cancelled'
      : status === 'completed' ? 'completed'
      // 업무 「대기」는 은퇴했다(2026-10-05) — 옛 대기 업무의 할 일도 보통 할 일로 본다.
      // 담당자에게서 숨기는 일은 이제 할 일의 «보이는 날»(서버 get_my_tasks_jsonb)이 한다.
      : !due ? 'undated' : due < today ? 'overdue' : due === today ? 'today' : 'upcoming';
    return { task, status, group, due };
  }).sort((a, b) =>
    // 완료한 할 일은 최근에 완료한 것이 위 — 마감일 순이면 오래전에 끝낸 것이 맨 위에 온다
    (a.group === 'completed' && b.group === 'completed'
      ? completedAtOf(b.task, resourceId).localeCompare(completedAtOf(a.task, resourceId))
      : (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    || a.task.title.localeCompare(b.task.title, 'ko')
  );
}

/**
 * 완료 시각(ISO 문자열, 모르면 ''). 내 담당자 기록 → 내 회차 기록 중 가장 늦은 것 →
 * 할 일 수정 시각 순. 마지막 폴백은 매니저가 할 일을 직접 완료로 바꿔 내 기록이 없는 경우다.
 */
export function completedAtOf(task: Task, resourceId: string): string {
  const mine = (task.meta?.assignees ?? []).find(assignee => assignee.id === resourceId);
  if (mine?.status === 'completed' && mine.completed_at) return mine.completed_at;
  const rounds = Object.values(task.meta?.deadlineProgress ?? {})
    .map(byAssignee => byAssignee?.[resourceId]?.completed_at ?? '')
    .filter(Boolean)
    .sort();
  return rounds.at(-1) ?? task.updated_at ?? '';
}

interface TaskPlannerEntry {
  task: Task;
  date: string | null;
  isManager: boolean;
}

/** 관리 할 일은 내 개인 완료 여부가 아닌 할 일 전체/회차 전체의 완료 여부로 표시한다. */
export function buildTaskPlanner(assignedTasks: Task[], managedTasks: Task[], works: Work[], resourceId: string, today: string) {
  const assigned = buildMyTaskInbox(assignedTasks, works, resourceId, today);
  const managed = buildMyTaskInbox(managedTasks, works, '', today);
  const tasks = new Map(assigned.map(item => [item.task.id, { item, isManager: false }]));
  for (const item of managed) tasks.set(item.task.id, { item, isManager: true });
  return [...tasks.values()]
    .filter(({ item }) => !['completed', 'cancelled', 'waiting'].includes(item.group))
    .flatMap<TaskPlannerEntry>(({ item, isManager }) => {
      const deadlines = isManager ? pendingDeadlinesForWork(item.task) : pendingDeadlinesForAssignee(item.task, resourceId);
      if (!getTaskDeadlines(item.task).length) return [{ task: item.task, date: null, isManager }];
      return deadlines.map(date => ({ task: item.task, date, isManager }));
    })
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.task.title.localeCompare(b.task.title, 'ko'));
}

export interface CompletedWorkGroup {
  /** 업무 id(없으면 '') */
  key: string;
  workName: string;
  items: InboxTask[];
  /** 이 업무에서 가장 최근에 완료한 시각(ISO, 모르면 '') */
  lastCompletedAt: string;
}

/**
 * 완료한 할 일을 업무별로 묶는다(2026-09-24). 흩어진 완료 목록은 업무가 뒤섞여 정리가 안 돼 보였다.
 * 순서 = **최근에 완료한 할 일이 든 업무가 위**(사용자 결정), 업무 안에서도 최근 완료가 위.
 */
export function groupCompletedByWork(items: InboxTask[], resourceId: string): CompletedWorkGroup[] {
  const groups = new Map<string, CompletedWorkGroup>();
  for (const item of items) {
    const key = item.task.event_id ?? '';
    const at = completedAtOf(item.task, resourceId);
    const group = groups.get(key) ?? { key, workName: item.task.event_name || '업무 없음', items: [], lastCompletedAt: '' };
    group.items.push(item);
    if (at > group.lastCompletedAt) group.lastCompletedAt = at;
    groups.set(key, group);
  }
  const byRecent = (a: InboxTask, b: InboxTask) =>
    completedAtOf(b.task, resourceId).localeCompare(completedAtOf(a.task, resourceId));
  return [...groups.values()]
    .map((group) => ({ ...group, items: [...group.items].sort(byRecent) }))
    .sort((a, b) => b.lastCompletedAt.localeCompare(a.lastCompletedAt) || a.workName.localeCompare(b.workName, 'ko'));
}

/**
 * 완료 시각 → 'MM.DD'(로컬 날짜, 모르면 ''). 문자열을 자르지 않는다 — completed_at 은 UTC 로 저장돼
 * 자정 무렵(KST 00~09시)에 완료한 것이 전날로 보인다.
 */
export function shortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export interface WeekProgress {
  /** 이번 주(월~일)에 마감이 있는 내 할 일 수 — 취소·시작 대기 제외 */
  total: number;
  /** 그중 완료한 수 */
  done: number;
}

/**
 * 이번 주 진행률 — 목록 카드 위 액센트 바를 장식이 아니라 정보로 쓴다(2026-10-05).
 * 분모는 **이번 주에 마감이 있는 할 일**이다. 전체 누적 비율은 시간이 갈수록 100%에 붙어 아무것도 말하지 않는다.
 * 완료한 할 일의 마감은 `buildMyTaskInbox` 가 첫 회차로 잡으므로 다중 마감은 첫 회차가 이번 주일 때만 든다.
 */
export function weekProgress(items: InboxTask[], weekStart: string, weekEnd: string): WeekProgress {
  const inWeek = items.filter(item =>
    item.group !== 'cancelled' && item.group !== 'waiting' && !!item.due && item.due >= weekStart && item.due <= weekEnd);
  return { total: inWeek.length, done: inWeek.filter(item => item.group === 'completed').length };
}
