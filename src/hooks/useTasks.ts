// ========================================
// Task Management React Hooks (DEPRECATED)
// ⚠️ DEPRECATED: This file is being phased out in favor of useTasksJsonb.ts
// Legacy table functions have been removed. Only utility functions remain.
// New development should use useTasksJsonb.ts
// ========================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ========================================
// DEPRECATED NOTICE
// ========================================
// The following functions have been removed and migrated to useTasksJsonb.ts:
// - useWorks -> useWorksJsonb
// - useWork -> use task_event table directly
// - useWorkDetail -> useWorkDetailJsonb
// - useCreateWork -> useCreateWorkJsonb
// - useUpdateWork -> useUpdateWorkJsonb
// - useDeleteWork -> useDeleteWorkJsonb
// - useMyTasks -> useMyTasksJsonb
// - useEnhancedMyTasks -> useMyTasksJsonb (enhanced by default)
// - useCreateTask -> useCreateTaskJsonb
// - useUpdateTask -> useUpdateTaskJsonb
// - useUpdateTaskStatus -> useUpdateTaskStatusJsonb
// - useDeleteTask -> useDeleteTaskJsonb
// - useTaskSearch -> useTaskSearchJsonb
// - usePopularKeywords -> usePopularKeywordsJsonb
// - useKeywordAnalytics -> useKeywordAnalyticsJsonb
// - useDuplicateAnalysis -> useDuplicateAnalysisJsonb
// - useTaskStats -> useTaskStatsJsonb
// - useToggleAssigneeStatus -> useToggleAssigneeStatusJsonb

// ========================================
// Utility Functions (Still Available)
// These functions don't reference legacy assignee tables
// ========================================

export function useResources(type?: string) {
  return useQuery({
    queryKey: ['resources', type],
    queryFn: async () => {
      let query = supabase
        .from('resource')
        .select('*')
        .order('name');

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource')
        .select('*')
        .eq('type', 'teacher')
        .order('name');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useTaskHistory(taskId: string) {
  return useQuery({
    queryKey: ['task-history', taskId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('task_status_history')
        .select(`
          *,
          changed_by:resource!fk_task_status_user(id, name, type)
        `)
        .eq('task_id', taskId)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ========================================
// MIGRATION INSTRUCTIONS
// ========================================
// To complete the migration:
// 1. Replace imports in components:
//    import { useMyTasks } from '@/hooks/useTasks'
//    -> import { useMyTasksJsonb } from '@/hooks/useTasksJsonb'
//
// 2. Update hook usage:
//    useMyTasks() -> useMyTasksJsonb()
//    useCreateTask() -> useCreateTaskJsonb()
//    etc.
//
// 3. All JSONB hooks have equivalent or enhanced functionality
// ========================================