import type { NewsSource } from '../utils/newsSources';

/** 검색 중일 때 — 제목·요약에 안 보이는 검색어를 어디서 찾았는지(서버 `get_ipsi_hub_feed`). */
export type FeedItemMatch = {
  /** '기사 본문' · '핵심 내용' · '영상 설명' · '자막' */
  field: string;
  /** 일치 주변 약 100자 발췌 */
  snippet: string;
};

type FeedItemBase = {
  id: string;
  title: string;
  url: string;
  date: string;
  category: string;
  match?: FeedItemMatch | null;
};

export type TimestampedHighlight = {
  timeSec: number;
  note: string;
};

export type VideoFeedItem = FeedItemBase & {
  kind: 'video';
  thumbnail: string | null;
  likes: number;
  isLikedByUser: boolean;
  createdBy: string;
  createdByName?: string;
  channelLabel: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  description: string | null;
  headlineSummary: string | null;
  corePoints: string[];
  strategyImplications: string[];
  cautions: string[];
  keyConcepts: string[];
  timestampedHighlights: TimestampedHighlight[];
  analyzedAt: string | null;
};

export type NewsFeedItem = FeedItemBase & {
  kind: 'news';
  source: NewsSource;
  headlineSummary: string | null;
  corePoints: string[];
  strategyImplications: string[];
  dataPoints: string[];
  cautions: string[];
  academicYear: string | null;
  analysisStatus: string | null;
};

export type FeedItem = VideoFeedItem | NewsFeedItem;
