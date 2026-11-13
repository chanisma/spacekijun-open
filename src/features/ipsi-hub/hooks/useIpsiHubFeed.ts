import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toVideoFeedItem, toNewsFeedItem } from '../utils/mappers';
import { normalizeSearchQuery } from '../utils/search';
import type { FeedItem } from '../types/feed';

// get_ipsi_hub_feed RPC가 아직 supabase types.ts에 반영되지 않아 rpc() 오버로드 매칭이 실패함.
// 반환 타입은 IpsiHubFeedResult로 별도 관리하므로 클라이언트만 느슨하게 캐스팅한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;

export type IpsiHubFeedType = 'all' | 'video' | 'news';

export type UseIpsiHubFeedParams = {
  type: IpsiHubFeedType;
  category?: string;
  /** 검색어 — 제목·요약·본문·자막 전체에서 찾는다(서버). 비면 검색 안 함 */
  query?: string;
  page: number;
  pageSize: number;
};

export type IpsiHubFeedResult = {
  items: FeedItem[];
  totalCount: number;
  videoCount: number;
  newsCount: number;
};

const FEED_KEY = ['ipsi-hub-feed'] as const;

// RPC가 내려주는 raw row(snake_case)를 매퍼가 기대하는 형태로 정규화한다.
// - 매퍼는 video의 isLikedByUser(camelCase)를 읽으므로 is_liked_by_user를 매핑
// - created_by_name은 RPC에 없으므로 매퍼 fallback('알 수 없음' 등 호출부 처리)에 맡긴다
function mapRow(row: Record<string, unknown>): FeedItem {
  if (row.kind === 'video') {
    return toVideoFeedItem({
      ...row,
      // sort_date를 article_date 자리로 넘겨 매퍼의 날짜 우선순위 로직을 그대로 활용
      article_date: row.sort_date,
      isLikedByUser: row.is_liked_by_user ?? false,
    });
  }
  return toNewsFeedItem({
    ...row,
    article_date: row.sort_date,
  });
}

/**
 * ipsi-hub 통합 피드를 서버 페이지네이션으로 조회한다.
 * get_ipsi_hub_feed RPC가 정렬·필터·total_count·per-user 좋아요 상태를 모두 DB에서 처리한다.
 */
export const useIpsiHubFeed = (params: UseIpsiHubFeedParams) => {
  const { user } = useAuth();
  const { type, category, page, pageSize } = params;
  const normalizedCategory = !category || category === '전체' ? null : category;
  const searchQuery = normalizeSearchQuery(params.query);
  const offset = (page - 1) * pageSize;

  const query = useQuery({
    queryKey: [...FEED_KEY, { type, category: normalizedCategory, query: searchQuery, page, pageSize }],
    enabled: !!user,
    placeholderData: keepPreviousData, // 페이지 전환 시 깜빡임 방지
    queryFn: async (): Promise<IpsiHubFeedResult> => {
      const { data, error } = await supabase.rpc('get_ipsi_hub_feed', {
        p_type: type,
        p_category: normalizedCategory,
        p_limit: pageSize,
        p_offset: offset,
        // 검색할 때만 보낸다 — 검색하지 않는 요청은 종전과 똑같이 둔다
        ...(searchQuery ? { p_query: searchQuery } : {}),
      });

      if (error) throw error;

      const payload = (data ?? {}) as {
        items?: Record<string, unknown>[];
        total_count?: number;
        video_count?: number;
        news_count?: number;
      };

      return {
        items: (payload.items ?? []).map(mapRow),
        totalCount: payload.total_count ?? 0,
        videoCount: payload.video_count ?? 0,
        newsCount: payload.news_count ?? 0,
      };
    },
  });

  return {
    items: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    videoCount: query.data?.videoCount ?? 0,
    newsCount: query.data?.newsCount ?? 0,
    loading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
};

// mutation 후 피드 전체를 무효화하기 위한 키 (CRUD hook에서 사용)
export const IPSI_HUB_FEED_KEY = FEED_KEY;
