import { useIpsiHubFeed, type IpsiHubFeedType } from './useIpsiHubFeed';

export type IpsiHubFilters = {
  type: IpsiHubFeedType;
  category?: string;
  query?: string;
  page: number;
  pageSize: number;
};

/**
 * ipsi-hub 통합 피드 (서버 페이지네이션).
 * 실제 데이터 로딩은 useIpsiHubFeed(RPC get_ipsi_hub_feed)가 담당하며,
 * 이 hook은 IpsiHubFeed 컴포넌트가 쓰는 인터페이스를 유지하는 얇은 어댑터다.
 */
export const useIpsiHub = (filters: IpsiHubFilters) => {
  const feed = useIpsiHubFeed({
    type: filters.type,
    category: filters.category,
    query: filters.query,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  return {
    items: feed.items,
    totalCount: feed.totalCount,
    videoCount: feed.videoCount,
    newsCount: feed.newsCount,
    loading: feed.loading,
    isFetching: feed.isFetching,
    refetch: feed.refetch,
  };
};
