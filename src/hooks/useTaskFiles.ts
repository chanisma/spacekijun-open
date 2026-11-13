import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskFileService } from '@/services/taskFileService';
import type { TaskFile } from '@/types/tasks';
import { useToast } from '@/hooks/use-toast';

/**
 * Task Work 파일 관리 hooks
 */
export function useWorkFiles(workId: string) {
  return useQuery({
    queryKey: ['work-files', workId],
    queryFn: () => {
      // 잘못된 workId가 들어오면 빈 배열 반환 (Supabase 쿼리 실행 안함)
      if (!workId || workId === 'disable-query' || workId.length === 0) {
        return Promise.resolve([]);
      }
      return TaskFileService.getWorkFiles(workId);
    },
    enabled: !!workId && workId !== 'disable-query' && workId.length > 0,
    staleTime: 1000 * 60 * 5, // 5분
  });
}

export function useUploadWorkFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ workId, file }: { workId: string; file: File }) => {
      return TaskFileService.uploadWorkFile(workId, file);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-files', variables.workId] });
      toast({
        title: "파일 업로드 완료",
        description: `"${data.name}" 파일이 업로드되었습니다.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "업로드 실패",
        description: error.message || '파일 업로드 중 오류가 발생했습니다.',
        variant: "destructive",
      });
    },
  });
}

export function useDeleteWorkFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ workId, fileId }: { workId: string; fileId: string }) => {
      return TaskFileService.deleteWorkFile(workId, fileId);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-files', variables.workId] });
    },
    onError: (error: any) => {
      toast({
        title: "삭제 실패",
        description: error.message || '파일 삭제 중 오류가 발생했습니다.',
        variant: "destructive",
      });
    },
  });
}

/**
 * Task 파일 관리 hooks
 */
export function useTaskFiles(taskId: string) {
  return useQuery({
    queryKey: ['task-files', taskId],
    queryFn: () => {
      // 잘못된 taskId가 들어오면 빈 배열 반환 (Supabase 쿼리 실행 안함)
      if (!taskId || taskId === 'disable-query' || taskId.length === 0) {
        return Promise.resolve([]);
      }
      return TaskFileService.getTaskFiles(taskId);
    },
    enabled: !!taskId && taskId !== 'disable-query' && taskId.length > 0,
    staleTime: 1000 * 60 * 5, // 5분
  });
}

export function useUploadTaskFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ taskId, file }: { taskId: string; file: File }) => {
      return TaskFileService.uploadTaskFile(taskId, file);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-files', variables.taskId] });
      toast({
        title: "파일 업로드 완료",
        description: `"${data.name}" 파일이 업로드되었습니다.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "업로드 실패",
        description: error.message || '파일 업로드 중 오류가 발생했습니다.',
        variant: "destructive",
      });
    },
  });
}

export function useDeleteTaskFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ taskId, fileId }: { taskId: string; fileId: string }) => {
      return TaskFileService.deleteTaskFile(taskId, fileId);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-files', variables.taskId] });
    },
    onError: (error: any) => {
      toast({
        title: "삭제 실패",
        description: error.message || '파일 삭제 중 오류가 발생했습니다.',
        variant: "destructive",
      });
    },
  });
}