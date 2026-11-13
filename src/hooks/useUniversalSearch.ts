import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { NewsSource } from '@/features/ipsi-hub/utils/newsSources';

export interface SearchResult {
  id: string;
  type: 'meeting' | 'document' | 'event' | 'task' | 'video' | 'news' | 'collab_note';
  title: string;
  description?: string;
  created_at: string;
  relevance_score?: number;
  // 각 타입별 추가 정보
  meeting?: {
    kind: string;
    starts_at: string;
    ends_at: string;
    status?: string;
    meta?: any;
  };
  document?: {
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
  };
  event?: {
    name: string;
    status: string;
    meta?: any;
  };
  task?: {
    status: string;
    meta?: any;
    event_id: string;
  };
  video?: {
    url: string;
    thumbnail: string | null;
    category: string;
    likes: number;
  };
  news?: {
    url: string;
    source: NewsSource;
    category: string | null;
    article_date: string | null;
    headline_summary: string | null;
  };
  collab_note?: {
    board_id: string;
    board_title: string;
    color: string;
    is_pinned: boolean;
    author_name?: string;
  };
}

export interface UniversalSearchParams {
  query: string;
  enabled?: boolean;
  limit?: number;
}

async function searchInAllTables(query: string, limit: number = 50): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const searchTerm = `%${query.trim()}%`;
  const results: SearchResult[] = [];

  try {
    // Meeting 테이블 검색 (title과 description은 meta JSONB 필드에 있음)
    const { data: meetings } = await supabase
      .from('meeting')
      .select(`
        id, kind, starts_at, ends_at, status, meta, created_at
      `)
      .or(`meta->>title.ilike.${searchTerm},meta->>description.ilike.${searchTerm}`)
      .limit(limit);

    if (meetings) {
      meetings.forEach(meeting => {
        const title = (meeting.meta as any)?.title || `${meeting.kind} 일정`;
        const description = (meeting.meta as any)?.description || '';

        results.push({
          id: meeting.id,
          type: 'meeting',
          title,
          description,
          created_at: meeting.created_at,
          meeting: {
            kind: meeting.kind,
            starts_at: meeting.starts_at,
            ends_at: meeting.ends_at,
            status: meeting.status,
            meta: meeting.meta,
          }
        });
      });
    }

    // Documents 테이블 검색 (title, file_name, meta 필드, keywords 포함)
    // 1. 기본 필드 검색
    const { data: documents1 } = await supabase
      .from('documents')
      .select(`
        id, title, file_name, file_type, file_size, storage_path, meta, created_at
      `)
      .or(`title.ilike.${searchTerm},file_name.ilike.${searchTerm},meta->>category.ilike.${searchTerm},meta->>department.ilike.${searchTerm}`)
      .limit(limit);

    // 2. keywords 배열 검색 (meta.keywords에서 검색)
    const { data: documents2 } = await supabase
      .from('documents')
      .select(`
        id, title, file_name, file_type, file_size, storage_path, meta, created_at
      `)
      .contains('meta', { keywords: [query.trim()] })
      .limit(limit);

    // 두 결과 합치기 (중복 제거)
    const documentMap = new Map();
    const allDocuments = [...(documents1 || []), ...(documents2 || [])];

    allDocuments.forEach((doc: any) => {
      if (!documentMap.has((doc as any).id)) {
        documentMap.set((doc as any).id, doc);
      }
    });

    documentMap.forEach(doc => {
      results.push({
        id: doc.id,
        type: 'document',
        title: doc.title || doc.file_name,
        created_at: doc.created_at,
        document: {
          file_name: doc.file_name,
          file_type: doc.file_type,
          file_size: doc.file_size,
          storage_path: doc.storage_path,
        }
      });
    });

    // Event 테이블 검색 (name, description, meta.department, keywords 포함)
    // 1. 기본 필드 검색
    const { data: events1 } = await (supabase as any)
      .from('work')
      .select(`
        id, name, description, created_at, status, meta, keywords
      `)
      .or(`name.ilike.${searchTerm},description.ilike.${searchTerm},meta->>department.ilike.${searchTerm}`)
      .limit(limit);

    // 2. keywords 배열 검색 (contains 연산자 사용)
    const { data: events2 } = await (supabase as any)
      .from('work')
      .select(`
        id, name, description, created_at, status, meta, keywords
      `)
      .contains('keywords', [query.trim()])
      .limit(limit);

    // 두 결과 합치기 (중복 제거)
    const eventMap = new Map();
    const allEvents = [...(events1 || []), ...(events2 || [])];

    allEvents.forEach((event: any) => {
      if (!eventMap.has((event as any).id)) {
        eventMap.set((event as any).id, event);
      }
    });

    eventMap.forEach(event => {
      results.push({
        id: event.id,
        type: 'event',
        title: event.name,
        description: event.description,
        created_at: event.created_at,
        event: {
          name: event.name,
          status: event.status,
          meta: event.meta,
        }
      });
    });

    // Task 테이블 검색 (title, description, keywords 포함)
    const { data: tasks } = await (supabase as any)
      .from('task')
      .select(`
        id, title, description, created_at, status, meta, event_id, keywords
      `)
      .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
      .limit(limit);

    if (tasks) {
      tasks.forEach((task: any) => {
        results.push({
          id: (task as any).id,
          type: 'task',
          title: task.title,
          description: task.description,
          created_at: task.created_at,
          task: {
            status: task.status,
            meta: task.meta,
            event_id: task.event_id,
          }
        });
      });
    }

    // Educational Videos 테이블 검색 (title, category 포함)
    const { data: videos } = await (supabase as any)
      .from('educational_videos')
      .select(`
        id, title, url, thumbnail, category, likes, created_at,
        profiles!educational_videos_created_by_fkey(name)
      `)
      .or(`title.ilike.${searchTerm},category.ilike.${searchTerm}`)
      .limit(limit);

    if (videos) {
      videos.forEach((video: any) => {
        results.push({
          id: video.id,
          type: 'video',
          title: video.title,
          created_at: video.created_at,
          description: video.profiles?.name ? `업로드: ${video.profiles.name}` : undefined,
          video: {
            url: video.url,
            thumbnail: video.thumbnail,
            category: video.category,
            likes: video.likes,
          }
        });
      });
    }

    // Educational News 테이블 검색 (title, headline_summary, category 포함)
    const { data: newsRows } = await (supabase as any)
      .from('educational_news')
      .select(`
        id, title, url, source, category, article_date, headline_summary, created_at
      `)
      .or(`title.ilike.${searchTerm},headline_summary.ilike.${searchTerm},category.ilike.${searchTerm}`)
      .limit(limit);

    if (newsRows) {
      newsRows.forEach((row: any) => {
        results.push({
          id: row.id,
          type: 'news',
          title: row.title,
          description: row.headline_summary || undefined,
          created_at: row.created_at,
          news: {
            url: row.url,
            source: row.source,
            category: row.category,
            article_date: row.article_date,
            headline_summary: row.headline_summary,
          },
        });
      });
    }

    // Collaboration Notes 테이블 검색 (title, content 포함)
    const { data: collabNotes } = await supabase
      .from('collab_notes')
      .select(`
        id, title, content, color, is_pinned, created_at, board_id,
        collab_boards!inner(id, title),
        resource!collab_notes_author_id_fkey(name)
      `)
      .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
      .eq('is_archived', false)
      .limit(limit);

    if (collabNotes) {
      collabNotes.forEach((note: any) => {
        results.push({
          id: note.id,
          type: 'collab_note',
          title: note.title || '제목 없음',
          description: note.content ? note.content.substring(0, 100) : undefined,
          created_at: note.created_at,
          collab_note: {
            board_id: note.board_id,
            board_title: note.collab_boards?.title || '보드 제목 없음',
            color: note.color,
            is_pinned: note.is_pinned,
            author_name: note.resource?.name,
          }
        });
      });
    }

    // 생성일 기준으로 최신순 정렬
    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return results.slice(0, limit);
  } catch (error) {
    console.error('Error searching in all tables:', error);
    throw error;
  }
}

export function useUniversalSearch({ query, enabled = true, limit = 50 }: UniversalSearchParams) {
  return useQuery({
    queryKey: ['universal-search', query, limit],
    queryFn: () => searchInAllTables(query, limit),
    enabled: enabled && !!query.trim(),
    staleTime: 1000 * 60 * 5, // 5분간 캐시
  });
}

export function useUniversalSearchMutation() {
  return {
    searchAll: searchInAllTables,
  };
}