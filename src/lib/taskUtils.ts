// ========================================
// Task Utilities
// Shared helpers for task-related components
// ========================================

import type { Task, TaskAssignee } from '@/types/tasks';

// ----------------------------------------
// Status Helpers
// ----------------------------------------

export type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'active';
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface StatusConfig {
  label: string;
  badgeVariant: BadgeVariant;
  bgColor: string;
  textColor: string;
}

const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  completed: {
    label: '완료',
    badgeVariant: 'default',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  cancelled: {
    label: '취소',
    badgeVariant: 'destructive',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
  },
  // 미완료 = «진행 중» 하나 (2026-10-05 사용자 결정 — 진행중·진행·활성·대기가 섞여 있었다).
  // 업무의 대기(pending)는 같은 날 은퇴해 진행 중과 같게 보인다(숨김은 할 일의 «보이는 날»).
  pending: {
    label: '진행 중',
    badgeVariant: 'secondary',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  },
  active: {
    label: '진행 중',
    badgeVariant: 'outline',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
};

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status as TaskStatus] || STATUS_CONFIG.pending;
}

export function getStatusLabel(status: string): string {
  return getStatusConfig(status).label;
}

/**
 * task.status 표시 라벨: pending = «진행 중» (2026-08-13 «진행» → 2026-10-05 «진행 중»으로 통일).
 * 업무 상태(getStatusLabel)도 같은 이름을 쓴다 — 업무·할 일·노드가 한 낱말로 미완료를 말한다.
 */
export function getTaskStatusLabel(status: string): string {
  return status === 'pending' ? '진행 중' : getStatusLabel(status);
}

export function getStatusBadgeVariant(status: string): BadgeVariant {
  return getStatusConfig(status).badgeVariant;
}

export function getStatusColorClass(status: string): string {
  const config = getStatusConfig(status);
  return `${config.bgColor} ${config.textColor}`;
}

// ----------------------------------------
// Task Type Helpers
// ----------------------------------------

export type TaskType = 'procedural' | 'one_time';

export function getTaskTypeLabel(type: string): string {
  return type === 'procedural' ? '절차적 할 일' : '일회성 할 일';
}

// ----------------------------------------
// User Role Helpers
// ----------------------------------------

export type UserRole = 'assigned' | 'manager' | 'both' | 'none';

export interface RoleIconConfig {
  colorClass: string;
  ariaLabel: string;
}

const ROLE_ICON_CONFIG: Record<UserRole, RoleIconConfig> = {
  assigned: {
    colorClass: 'text-blue-600',
    ariaLabel: '내 담당 할 일',
  },
  manager: {
    colorClass: 'text-green-600',
    ariaLabel: '내 관리 할 일',
  },
  both: {
    colorClass: 'text-purple-600',
    ariaLabel: '담당+관리',
  },
  none: {
    colorClass: 'text-gray-400',
    ariaLabel: '',
  },
};

export function getRoleIconConfig(role: UserRole): RoleIconConfig {
  return ROLE_ICON_CONFIG[role];
}

export function determineUserRole(
  isManager: boolean,
  hasAssignedTasks: boolean
): UserRole {
  if (isManager && hasAssignedTasks) return 'both';
  if (isManager) return 'manager';
  if (hasAssignedTasks) return 'assigned';
  return 'none';
}

export function isUserRelatedToWork(role: UserRole): boolean {
  return role !== 'none';
}

// ----------------------------------------
// Assignee Helpers
// ----------------------------------------

export function extractAssigneeIds(task: Task): string[] {
  if (task.meta?.assignees && task.meta.assignees.length > 0) {
    return task.meta.assignees.map((assignee) => assignee.id);
  }
  if (task.assigned_to) {
    return [task.assigned_to];
  }
  return [];
}

export function getAssigneeCount(task: Task): number {
  const assignees = task.meta?.assignees || [];
  return assignees.length > 0 ? assignees.length : 1;
}

export function getCompletedAssigneeCount(task: Task): number {
  const assignees = task.meta?.assignees || [];
  if (assignees.length === 0) {
    return task.status === 'completed' ? 1 : 0;
  }
  return assignees.filter((a) => a.status === 'completed').length;
}

export function areAllAssigneesCompleted(task: Task): boolean {
  const assignees = task.meta?.assignees || [];
  if (assignees.length === 0) return false;
  return assignees.every((a) => a.status === 'completed');
}

export function findCurrentUserAssignee(
  task: Task,
  currentUserResourceId: string | null
): TaskAssignee | undefined {
  if (!currentUserResourceId) return undefined;
  const assignees = task.meta?.assignees || [];
  return assignees.find((a) => a.id === currentUserResourceId);
}

export function getCurrentUserStatus(
  task: Task,
  currentUserResourceId: string | null
): string {
  const assignee = findCurrentUserAssignee(task, currentUserResourceId);
  return assignee?.status || 'pending';
}

// ----------------------------------------
// Event Manager Check
// ----------------------------------------

export interface EventMeta {
  managers?: Array<{ id: string; name: string }>;
  department?: string;
  [key: string]: unknown;
}

export function isWorkManager(
  managerId: string | null | undefined,
  meta: EventMeta | null | undefined,
  currentUserResourceId: string | null
): boolean {
  if (!currentUserResourceId) return false;

  if (managerId === currentUserResourceId) return true;

  if (meta?.managers && Array.isArray(meta.managers)) {
    return meta.managers.some((manager) => manager.id === currentUserResourceId);
  }

  return false;
}

// ----------------------------------------
// Progress Calculation
// ----------------------------------------

export function calculateProgressPercentage(
  completedCount: number,
  totalCount: number
): number {
  if (totalCount === 0) return 0;
  return Math.round((completedCount / totalCount) * 100);
}

export function getProgressColorClass(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500';
  if (percentage >= 50) return 'bg-blue-500';
  if (percentage >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

// ----------------------------------------
// Due Date Helpers
// ----------------------------------------

export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function isDueSoon(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const dueDateMs = new Date(dueDate).getTime();
  const nowMs = new Date().getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return dueDateMs - nowMs > 0 && dueDateMs - nowMs < oneDayMs;
}

export function getDueDateVariant(
  dueDate: string | null | undefined,
  status: string
): BadgeVariant {
  if (status === 'completed') return 'outline';
  if (isOverdue(dueDate) && status !== 'completed') return 'destructive';
  if (isDueSoon(dueDate)) return 'secondary';
  return 'outline';
}

// ----------------------------------------
// Name Initials
// ----------------------------------------

export function getInitials(name: string, length: number = 2): string {
  if (!name) return '';
  return name.slice(0, length);
}

// ----------------------------------------
// Task Sorting
// ----------------------------------------

export function sortTasksByOrder(tasks: Task[]): Task[] {
  const proceduralTasks = tasks
    .filter((task) => task.type === 'procedural')
    .sort((a, b) => {
      const aIndex = a.order_index ?? 9999;
      const bIndex = b.order_index ?? 9999;
      if (aIndex === bIndex) {
        return a.id.localeCompare(b.id);
      }
      return aIndex - bIndex;
    });

  const oneTimeTasks = tasks
    .filter((task) => task.type === 'one_time')
    .sort((a, b) => {
      const aDate = new Date(a.created_at || 0);
      const bDate = new Date(b.created_at || 0);
      return aDate.getTime() - bDate.getTime();
    });

  return [...proceduralTasks, ...oneTimeTasks];
}
