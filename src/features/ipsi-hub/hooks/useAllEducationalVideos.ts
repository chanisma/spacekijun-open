import { useState, useEffect } from 'react';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import type { EducationalVideo } from './useEducationalVideos';

// educational_videos가 아직 supabase types.ts에 반영되지 않아 from() 오버로드 매칭이 실패함.
// 도메인 타입은 EducationalVideo로 별도 관리하므로 클라이언트만 느슨하게 캐스팅한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

/**
 * 전체 educational_videos 목록 조회 (조회 전용).
 *
 * 메인 피드는 서버 페이지네이션(useIpsiHubFeed)을 쓰지만,
 * AI 분석 패널은 "분석할 자료 선택"을 위해 전체 영상 풀이 필요하다.
 * useEducationalNews와 대칭되는 전용 조회 hook이다.
 *
 * 페이지네이션 도입 시 useEducationalVideos에서 조회 기능을 떼어내면서
 * AI 패널이 의존하던 videos 배열이 사라졌던 회귀를 복구한다.
 */
export const useAllEducationalVideos = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [videos, setVideos] = useState<EducationalVideo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVideos = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('educational_videos')
        .select(`
          *,
          profiles!educational_videos_created_by_fkey(name)
        `)
        .order('article_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('동영상 조회 오류:', error);
        toast({
          title: '오류',
          description: '동영상을 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      const videosWithCreator = (data || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (video: any) => ({
          ...video,
          created_by_name: video.profiles?.name || '알 수 없음',
          profiles: undefined,
        })
      );

      setVideos(videosWithCreator as EducationalVideo[]);
    } catch (error) {
      console.error('동영상 조회 중 오류:', error);
      toast({
        title: '오류',
        description: '동영상을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchVideos();
    // fetchVideos는 매 렌더 새로 생성되므로 의존성에서 의도적으로 제외 (user 변경 시에만 조회)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { videos, loading, fetchVideos };
};
