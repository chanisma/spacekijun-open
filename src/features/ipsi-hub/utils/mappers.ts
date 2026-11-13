import type { FeedItem, FeedItemMatch, VideoFeedItem, NewsFeedItem, TimestampedHighlight } from '../types/feed';

function asMatch(row: Record<string, unknown>): FeedItemMatch | null {
  return typeof row.match_field === 'string' && typeof row.match_snippet === 'string' && row.match_snippet
    ? { field: row.match_field, snippet: row.match_snippet }
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asHighlights(value: unknown): TimestampedHighlight[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const rec = entry as Record<string, unknown>;
      const time = typeof rec.time_sec === 'number' ? rec.time_sec : Number(rec.time_sec);
      const note = typeof rec.note === 'string' ? rec.note : '';
      if (!Number.isFinite(time) || !note) return null;
      return { timeSec: Math.max(0, Math.floor(time)), note };
    })
    .filter((v): v is TimestampedHighlight => v !== null);
}

export function toVideoFeedItem(row: any): VideoFeedItem {
  const meta = (row.meta ?? {}) as Record<string, any>;
  return {
    kind: 'video',
    id: row.id,
    title: row.title,
    url: row.url,
    date: row.article_date ?? row.collected_at ?? row.created_at,
    category: row.category,
    thumbnail: row.thumbnail ?? null,
    likes: row.likes ?? 0,
    isLikedByUser: row.isLikedByUser ?? false,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    channelLabel: row.channel_label ?? null,
    durationSeconds:
      typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    viewCount: typeof meta.view_count === 'number' ? meta.view_count : null,
    description: typeof meta.description === 'string' ? meta.description : null,
    headlineSummary: row.headline_summary ?? null,
    corePoints: asStringArray(meta.core_points),
    strategyImplications: asStringArray(meta.strategy_implications),
    cautions: asStringArray(meta.cautions),
    keyConcepts: asStringArray(meta.key_concepts),
    timestampedHighlights: asHighlights(meta.timestamped_highlights),
    analyzedAt: row.analyzed_at ?? null,
    match: asMatch(row),
  };
}

export function toNewsFeedItem(row: any): NewsFeedItem {
  const meta = row.meta ?? {};
  return {
    kind: 'news',
    id: row.id,
    title: row.title,
    url: row.url,
    date: row.article_date ?? row.collected_at ?? row.created_at,
    category: row.category ?? '기타',
    source: row.source,
    headlineSummary: row.headline_summary ?? null,
    corePoints: asStringArray(row.core_points),
    strategyImplications: asStringArray(row.strategy_implications),
    dataPoints: asStringArray(row.data_points ?? meta.data_points),
    cautions: asStringArray(row.cautions ?? meta.cautions),
    academicYear: row.academic_year ?? null,
    analysisStatus: row.analysis_status ?? null,
    match: asMatch(row),
  };
}

export type { FeedItem };
