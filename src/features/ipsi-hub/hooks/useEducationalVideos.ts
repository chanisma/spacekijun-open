import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { extractYouTubeId } from '../utils/youtube';
import { IPSI_HUB_FEED_KEY } from './useIpsiHubFeed';

export interface EducationalVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  category: string;
  likes: number;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  article_date?: string | null;
  collected_at?: string | null;
  channel_label?: string | null;
  duration_seconds?: number | null;
  headline_summary?: string | null;
  meta?: Record<string, any>;
  isLikedByUser?: boolean;
}

/**
 * educational_videos CRUD 전용 hook.
 *
 * 조회(목록 로딩)는 더 이상 여기서 하지 않는다 — 서버 페이지네이션은 useIpsiHubFeed가 담당.
 * 모든 mutation은 성공 후 ipsi-hub 피드 쿼리를 무효화해 화면을 갱신한다.
 * 재생/수정 모달이 DB raw 형태(EducationalVideo)를 요구하므로, 단건 조회 getVideoById를 제공한다.
 */
export const useEducationalVideos = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateFeed = () => {
    queryClient.invalidateQueries({ queryKey: IPSI_HUB_FEED_KEY });
  };

  // 재생/수정 모달용 단건 조회 (현재 페이지 밖 영상도 안전하게 가져옴 + per-user 좋아요 상태)
  const getVideoById = async (id: string): Promise<EducationalVideo | null> => {
    if (!user) return null;
    try {
      const { data, error } = await (supabase as any)
        .from('educational_videos' as any)
        .select(`*, profiles!educational_videos_created_by_fkey(name)`)
        .eq('id', id)
        .single();

      if (error || !data) {
        console.error('동영상 단건 조회 오류:', error);
        return null;
      }

      const { data: like } = await (supabase as any)
        .from('video_likes' as any)
        .select('video_id')
        .eq('user_id', user.id)
        .eq('video_id', id)
        .maybeSingle();

      return {
        ...data,
        created_by_name: data.profiles?.name || '알 수 없음',
        isLikedByUser: !!like,
        profiles: undefined,
      } as EducationalVideo;
    } catch (err) {
      console.error('동영상 단건 조회 중 오류:', err);
      return null;
    }
  };

  const addVideo = async (title: string, url: string, category: string) => {
    if (!user) return null;

    try {
      const videoId = extractYouTubeId(url);
      if (!videoId) {
        toast({
          title: '오류',
          description: '유효한 YouTube URL을 입력해주세요.',
          variant: 'destructive',
        });
        return null;
      }

      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      const { data, error } = await (supabase as any)
        .from('educational_videos' as any)
        .insert([{
          title,
          url,
          thumbnail,
          category,
          created_by: user.id,
        }])
        .select()
        .single();

      if (error) {
        console.error('동영상 추가 오류:', error);
        toast({
          title: '오류',
          description: '동영상 추가에 실패했습니다.',
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: '성공',
        description: '동영상이 추가되었습니다.',
      });

      invalidateFeed();
      return data;
    } catch (error) {
      console.error('동영상 추가 중 오류:', error);
      toast({
        title: '오류',
        description: '동영상 추가에 실패했습니다.',
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateVideo = async (id: string, title: string, url: string, category: string) => {
    if (!user) return null;

    try {
      const videoId = extractYouTubeId(url);
      if (!videoId) {
        toast({
          title: '오류',
          description: '유효한 YouTube URL을 입력해주세요.',
          variant: 'destructive',
        });
        return null;
      }

      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      const { data, error } = await (supabase as any)
        .from('educational_videos' as any)
        .update({
          title,
          url,
          thumbnail,
          category,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('동영상 수정 오류:', error);
        toast({
          title: '오류',
          description: '동영상 수정에 실패했습니다.',
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: '성공',
        description: '동영상이 수정되었습니다.',
      });

      invalidateFeed();
      return data;
    } catch (error) {
      console.error('동영상 수정 중 오류:', error);
      toast({
        title: '오류',
        description: '동영상 수정에 실패했습니다.',
        variant: 'destructive',
      });
      return null;
    }
  };

  const deleteVideo = async (id: string) => {
    if (!user) return false;

    try {
      const { error } = await (supabase as any)
        .from('educational_videos' as any)
        .delete()
        .eq('id', id);

      if (error) {
        console.error('동영상 삭제 오류:', error);
        toast({
          title: '오류',
          description: '동영상 삭제에 실패했습니다.',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: '성공',
        description: '동영상이 삭제되었습니다.',
      });

      invalidateFeed();
      return true;
    } catch (error) {
      console.error('동영상 삭제 중 오류:', error);
      toast({
        title: '오류',
        description: '동영상 삭제에 실패했습니다.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const toggleLike = async (id: string, currentlyLiked: boolean) => {
    if (!user) return false;

    try {
      if (currentlyLiked) {
        const { error } = await (supabase as any)
          .from('video_likes' as any)
          .delete()
          .eq('user_id', user.id)
          .eq('video_id', id);

        if (error) {
          console.error('좋아요 취소 오류:', error);
          toast({
            title: '오류',
            description: '좋아요 취소에 실패했습니다.',
            variant: 'destructive',
          });
          return false;
        }
      } else {
        const { error } = await (supabase as any)
          .from('video_likes' as any)
          .insert({
            user_id: user.id,
            video_id: id,
          });

        if (error) {
          if (error.code === '23505') {
            toast({
              title: '알림',
              description: '이미 좋아요를 누르셨습니다.',
            });
            return false;
          }

          console.error('좋아요 오류:', error);
          toast({
            title: '오류',
            description: '좋아요 처리에 실패했습니다.',
            variant: 'destructive',
          });
          return false;
        }
      }

      invalidateFeed();
      return true;
    } catch (error) {
      console.error('좋아요 처리 중 오류:', error);
      toast({
        title: '오류',
        description: '좋아요 처리에 실패했습니다.',
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    getVideoById,
    addVideo,
    updateVideo,
    deleteVideo,
    toggleLike,
  };
};
