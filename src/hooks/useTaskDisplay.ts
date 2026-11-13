// ========================================
// Task Display Hook
// Handles task display status, styling, and user relationship
// ========================================

import { useMemo, useCallback } from 'react';
import type { Task } from '@/types/tasks';
import { getMyTaskStatus } from '@/lib/taskStatus';

// ----------------------------------------
// Types
// ----------------------------------------

export interface TaskAssignee {
  id: string;
  name?: string;
  status: string;
}

export interface TaskDisplayOptions {
  filter?: 'all' | 'active' | 'completed' | 'pending';
  assignedTaskIds?: string[];
  managedTaskIds?: string[];
}

export interface TaskDisplayResult {
  displayStatus: string;
  style: string;
  statusIcon: string | null;
  isRelatedTask: boolean;
  isCurrentUserAssigned: boolean;
}

// ----------------------------------------
// Style Configuration
// ----------------------------------------

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-500 text-white border-green-500 shadow-sm',
  cancelled: 'bg-red-500 text-white border-red-500 shadow-sm',
  pending: 'bg-white text-gray-700 border-gray-300 hover:border-gray-400',
  active: 'bg-blue-500 text-white border-blue-500 shadow-sm',
};

const STATUS_ICONS: Record<string, string | null> = {
  completed: '✓',
  cancelled: '✕',
  pending: null,
  active: null,
};

// ----------------------------------------
// Helper Functions
// ----------------------------------------

/**
 * Get the base style for a task status
 */
export function getTaskStatusStyle(status: string): string {
  return STATUS_STYLES[status] || STATUS_STYLES.pending;
}

/**
 * Get the icon for a task status
 */
export function getTaskStatusIcon(status: string): string | null {
  return STATUS_ICONS[status] ?? null;
}

/**
 * Calculate display status for a task
 * Priority: localState > task 전체 종료(completed/cancelled) > meta.assignees[me].status > task.status
 */
export function calculateDisplayStatus(
  task: Task,
  currentUserResourceId: string | null,
  localStatusOverride?: string
): string {
  // Local state override takes highest priority (for immediate UI feedback)
  if (localStatusOverride) {
    return localStatusOverride;
  }

  // 판정 규칙은 `src/lib/taskStatus.ts` 단일 출처 — task 전체 종료가 개인 상태를 이긴다
  // (매니저가 완료 처리한 업무가 담당자 화면에 계속 미완료로 남던 문제, 그 파일 주석 참조)
  return getMyTaskStatus(task, currentUserResourceId);
}

/**
 * Check if task is related to current user
 */
export function isTaskRelatedToUser(
  taskId: string,
  assignedTaskIds: string[],
  managedTaskIds: string[]
): boolean {
  return assignedTaskIds.includes(taskId) || managedTaskIds.includes(taskId);
}

// ----------------------------------------
// Hook
// ----------------------------------------

/**
 * Hook to get display properties for a single task
 */
export function useTaskDisplay(
  task: Task,
  currentUserResourceId: string | null,
  localStatusOverride?: string,
  options: TaskDisplayOptions = {}
): TaskDisplayResult {
  const {
    filter = 'all',
    assignedTaskIds = [],
    managedTaskIds = [],
  } = options;

  const displayStatus = useMemo(() => {
    return calculateDisplayStatus(task, currentUserResourceId, localStatusOverride);
  }, [task, currentUserResourceId, localStatusOverride]);

  const isRelatedTask = useMemo(() => {
    // For non-filtered views, assume related
    if (filter !== 'all' && filter !== 'completed' && filter !== 'pending') {
      return true;
    }
    return isTaskRelatedToUser(task.id, assignedTaskIds, managedTaskIds);
  }, [task.id, filter, assignedTaskIds, managedTaskIds]);

  const isCurrentUserAssigned = useMemo(() => {
    const metaAssignees = task.meta?.assignees;
    if (!metaAssignees || !Array.isArray(metaAssignees) || !currentUserResourceId) {
      return false;
    }
    return metaAssignees.some((a: TaskAssignee) => a.id === currentUserResourceId);
  }, [task, currentUserResourceId]);

  const style = useMemo(() => {
    const baseStyle = getTaskStatusStyle(displayStatus);
    return isRelatedTask ? baseStyle : `${baseStyle} opacity-60 cursor-default`;
  }, [displayStatus, isRelatedTask]);

  const statusIcon = useMemo(() => {
    return getTaskStatusIcon(displayStatus);
  }, [displayStatus]);

  return {
    displayStatus,
    style,
    statusIcon,
    isRelatedTask,
    isCurrentUserAssigned,
  };
}

/**
 * Hook to get display helper functions (for use in map loops)
 */
export function useTaskDisplayHelpers(
  currentUserResourceId: string | null,
  taskStatuses: Record<string, string>,
  options: TaskDisplayOptions = {}
) {
  const {
    filter = 'all',
    assignedTaskIds = [],
    managedTaskIds = [],
  } = options;

  const getTaskDisplayStatus = useCallback(
    (task: Task): string => {
      return calculateDisplayStatus(
        task,
        currentUserResourceId,
        taskStatuses[task.id]
      );
    },
    [currentUserResourceId, taskStatuses]
  );

  const getTaskStyle = useCallback(
    (task: Task, status?: string): string => {
      const displayStatus = status ?? getTaskDisplayStatus(task);
      const baseStyle = getTaskStatusStyle(displayStatus);

      const isRelated =
        filter !== 'all' && filter !== 'completed' && filter !== 'pending'
          ? true
          : isTaskRelatedToUser(task.id, assignedTaskIds, managedTaskIds);

      return isRelated ? baseStyle : `${baseStyle} opacity-60 cursor-default`;
    },
    [filter, assignedTaskIds, managedTaskIds, getTaskDisplayStatus]
  );

  const getStatusIcon = useCallback((status: string): string | null => {
    return getTaskStatusIcon(status);
  }, []);

  const isRelated = useCallback(
    (taskId: string): boolean => {
      if (filter !== 'all' && filter !== 'completed' && filter !== 'pending') {
        return true;
      }
      return isTaskRelatedToUser(taskId, assignedTaskIds, managedTaskIds);
    },
    [filter, assignedTaskIds, managedTaskIds]
  );

  return {
    getTaskDisplayStatus,
    getTaskStyle,
    getStatusIcon,
    isRelated,
  };
}
