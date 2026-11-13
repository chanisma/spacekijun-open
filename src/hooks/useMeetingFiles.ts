import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MeetingFileService } from '@/services/meetingFileService';
import { useToast } from '@/hooks/use-toast';

export const useDeleteMeetingFile = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ meetingId, fileId }: { meetingId: string; fileId: string }) => {
      await MeetingFileService.deleteMeetingFile(meetingId, fileId);
    },
    onSuccess: (_, { meetingId }) => {
      // 관련 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-files', meetingId] });

    },
    onError: (error) => {
      console.error('파일 삭제 실패:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '파일 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
};

export const useUploadMeetingFile = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      meetingId,
      file,
      onProgress
    }: {
      meetingId: string;
      file: File;
      onProgress?: (progress: number) => void;
    }) => {
      return await MeetingFileService.uploadMeetingFile(meetingId, file, onProgress);
    },
    onSuccess: (_, { meetingId }) => {
      // 관련 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-files', meetingId] });

    },
    onError: (error) => {
      console.error('파일 업로드 실패:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '파일 업로드에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
};