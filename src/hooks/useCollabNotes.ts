import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { unifiedAuth } from '@/services/unifiedAuth';
import type { CardType, CardData } from '@/types/collabCardTypes';

export interface CollabNote {
  id: string;
  board_id: string;
  title: string;
  content: string;
  color: string;
  author_id: string;
  is_pinned: boolean;
  is_acknowledged: boolean;
  is_archived: boolean;
  archived_at: string | null;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
  updated_at: string;
  // 노트 자체 수정 시간, 최신 댓글 시간, 최신 플러그인 갱신 시간 중 가장 최신값
  effective_updated_at?: string;
  meta: {
    card_type?: CardType;
    card_data?: CardData;
    linked_items?: import('@/types/collabCardTypes').LinkedItem[];
    [key: string]: any;
  };
  author?: {
    id: string;
    name: string | null;
  };
  comments?: CollabNoteComment[];
  comment_count?: number;
  attachments?: any[];
}

export interface CollabNoteComment {
  id: string;
  note_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    name: string | null;
  };
}

export interface CreateNoteInput {
  board_id: string;
  title: string;
  content: string;
  color?: string;
  card_type?: CardType;
  card_data?: CardData;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  color?: string;
  is_pinned?: boolean;
  is_acknowledged?: boolean;
  position_x?: number | null;
  position_y?: number | null;
  meta?: {
    card_type?: CardType;
    card_data?: CardData;
    linked_items?: import('@/types/collabCardTypes').LinkedItem[];
    [key: string]: any;
  };
}

// Link task/event to note
export function useLinkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      item,
    }: {
      noteId: string;
      item: import('@/types/collabCardTypes').LinkedItem;
    }) => {
      // Get current note
      const { data: currentNote, error: fetchError } = await supabase
        .from('collab_notes')
        .select('meta, board_id')
        .eq('id', noteId)
        .single();

      if (fetchError) throw fetchError;

      const currentLinkedItems = (currentNote.meta?.linked_items || []) as import('@/types/collabCardTypes').LinkedItem[];

      // Check if already linked
      const alreadyLinked = currentLinkedItems.some(
        (existingItem) => existingItem.type === item.type && existingItem.id === item.id
      );

      if (alreadyLinked) {
        throw new Error('이미 연결된 항목입니다.');
      }

      // Add new item
      const updatedLinkedItems = [...currentLinkedItems, item];

      const { data, error } = await supabase
        .from('collab_notes')
        .update({
          meta: {
            ...currentNote.meta,
            linked_items: updatedLinkedItems,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return { ...data, board_id: currentNote.board_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}

// Unlink task/event from note
export function useUnlinkItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      itemId,
      itemType,
    }: {
      noteId: string;
      itemId: string;
      itemType: import('@/types/collabCardTypes').LinkedItemType;
    }) => {
      // Get current note
      const { data: currentNote, error: fetchError } = await supabase
        .from('collab_notes')
        .select('meta, board_id')
        .eq('id', noteId)
        .single();

      if (fetchError) throw fetchError;

      const currentLinkedItems = (currentNote.meta?.linked_items || []) as import('@/types/collabCardTypes').LinkedItem[];

      // Remove item
      const updatedLinkedItems = currentLinkedItems.filter(
        (item) => !(item.type === itemType && item.id === itemId)
      );

      const { data, error } = await supabase
        .from('collab_notes')
        .update({
          meta: {
            ...currentNote.meta,
            linked_items: updatedLinkedItems,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return { ...data, board_id: currentNote.board_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}

/** 노트의 실질적 최신 수정 시간을 계산합니다.
 *  기준: 노트 자체 updated_at, 댓글 updated_at, 플러그인 인스턴스 updated_at 중 최신값 */
function getEffectiveUpdatedAt(
  noteUpdatedAt: string,
  comments: { created_at: string; updated_at?: string }[],
  pluginLastUpdated?: string
): string {
  const candidates: string[] = [noteUpdatedAt];
  for (const c of comments) {
    candidates.push(c.updated_at || c.created_at);
  }
  if (pluginLastUpdated) candidates.push(pluginLastUpdated);
  return candidates.reduce((max, t) => (t > max ? t : max));
}

// Get all notes for a board
export function useCollabNotes(boardId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['collab-notes', boardId],
    queryFn: async () => {
      if (!boardId) return [];

      const { data, error } = await supabase
        .from('collab_notes')
        .select(`
          *,
          resource:author_id(id, name),
          collab_note_comments(
            id,
            content,
            created_at,
            updated_at,
            resource:author_id(id, name)
          )
        `)
        .eq('board_id', boardId)
        .order('is_pinned', { ascending: false });

      if (error) throw error;

      // 이 보드의 모든 노트에 연결된 플러그인 인스턴스의 최신 updated_at을 batch 조회
      const noteIds = data.map((n: any) => n.id);
      const pluginMaxTime: Record<string, string> = {};
      if (noteIds.length > 0) {
        const { data: pluginInstances } = await supabase
          .from('plugin_instances')
          .select('entity_id, updated_at')
          .eq('entity_type', 'collab_note')
          .in('entity_id', noteIds);

        for (const pi of pluginInstances || []) {
          if (!pluginMaxTime[pi.entity_id] || pi.updated_at > pluginMaxTime[pi.entity_id]) {
            pluginMaxTime[pi.entity_id] = pi.updated_at;
          }
        }
      }

      const mapped = data.map((note: any) => {
        const comments = note.collab_note_comments?.map((c: any) => ({
          ...c,
          author: c.resource,
        })) || [];

        return {
          ...note,
          author: note.resource,
          comments,
          comment_count: comments.length,
          effective_updated_at: getEffectiveUpdatedAt(
            note.updated_at,
            comments,
            pluginMaxTime[note.id]
          ),
        } as CollabNote;
      });

      // 고정 노트 우선, 그 다음 실질 최신 수정 시간 내림차순
      mapped.sort((a: CollabNote, b: CollabNote) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return (b.effective_updated_at ?? b.updated_at).localeCompare(
          a.effective_updated_at ?? a.updated_at
        );
      });

      return mapped as CollabNote[];
    },
    enabled: !!boardId && !!user?.id,
  });
}

// Get single note by ID
export function useCollabNote(noteId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['collab-note', noteId],
    queryFn: async () => {
      if (!noteId) return null;

      const { data, error } = await supabase
        .from('collab_notes')
        .select(`
          *,
          resource:author_id(id, name),
          collab_note_comments(
            id,
            content,
            created_at,
            updated_at,
            resource:author_id(id, name)
          )
        `)
        .eq('id', noteId)
        .single();

      if (error) throw error;

      return {
        ...data,
        author: data.resource,
        comments: data.collab_note_comments?.map((c: any) => ({
          ...c,
          author: c.resource,
        })) || [],
        comment_count: data.collab_note_comments?.length || 0,
      } as CollabNote;
    },
    enabled: !!noteId && !!user?.id,
  });
}

// Create new note
export function useCreateNote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateNoteInput) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 신원 해석은 unifiedAuth 단일 출처를 쓴다.
      // user_resource 를 직접 조회하면 학생이 빠진다 — 학생은 이 표를 쓰지 않고
      // 이메일 prefix ↔ resource.meta->>'id' 로 연결된다(재학생 630명 중 링크 12명).
      const authorResourceId = await unifiedAuth.getCurrentResourceId();

      if (!authorResourceId) {
        throw new Error('내 리소스를 찾을 수 없습니다. 프로필에서 이름 등록을 먼저 완료해 주세요.');
      }

      const { data, error } = await supabase
        .from('collab_notes')
        .insert({
          board_id: input.board_id,
          title: input.title,
          content: input.content,
          color: input.color || 'yellow',
          author_id: authorResourceId,
          meta: {
            card_type: input.card_type || 'default',
            card_data: input.card_data || null,
          },
        })
        .select(`
          *,
          resource:author_id(id, name)
        `)
        .single();

      if (error) throw error;

      return {
        ...data,
        author: data.resource,
        comments: [],
        comment_count: 0,
      } as CollabNote;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({
        queryKey: ['collab-board', data.board_id],
      });
    },
  });
}

// Update note
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      input,
    }: {
      noteId: string;
      input: UpdateNoteInput;
    }) => {
      const { data, error } = await supabase
        .from('collab_notes')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .select(`
          *,
          resource:author_id(id, name)
        `)
        .single();

      if (error) throw error;

      return {
        ...data,
        author: data.resource,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}

// Delete note
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, boardId }: { noteId: string; boardId: string }) => {
      const { error } = await supabase
        .from('collab_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      return { noteId, boardId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.boardId],
      });
      queryClient.invalidateQueries({
        queryKey: ['collab-board', data.boardId],
      });
    },
  });
}

// Toggle pin status
export function useToggleNotePin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      isPinned,
    }: {
      noteId: string;
      isPinned: boolean;
    }) => {
      const { data, error } = await supabase
        .from('collab_notes')
        .update({ is_pinned: isPinned })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}

// Toggle acknowledgement status
export function useToggleNoteAcknowledgement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      isAcknowledged,
    }: {
      noteId: string;
      isAcknowledged: boolean;
    }) => {
      const { data, error } = await supabase
        .from('collab_notes')
        .update({ is_acknowledged: isAcknowledged })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}

// Create comment
export function useCreateComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      noteId,
      content,
    }: {
      noteId: string;
      content: string;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 신원 해석은 unifiedAuth 단일 출처를 쓴다.
      // user_resource 를 직접 조회하면 학생이 빠진다 — 학생은 이 표를 쓰지 않고
      // 이메일 prefix ↔ resource.meta->>'id' 로 연결된다(재학생 630명 중 링크 12명).
      const authorResourceId = await unifiedAuth.getCurrentResourceId();

      if (!authorResourceId) {
        throw new Error('내 리소스를 찾을 수 없습니다. 프로필에서 이름 등록을 먼저 완료해 주세요.');
      }

      const { data, error } = await supabase
        .from('collab_note_comments')
        .insert({
          note_id: noteId,
          author_id: authorResourceId,
          content,
        })
        .select(`
          *,
          resource:author_id(id, name)
        `)
        .single();

      if (error) throw error;

      return {
        ...data,
        author: data.resource,
      } as CollabNoteComment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.note_id] });
      // Also invalidate the notes list to update comment count
      queryClient.invalidateQueries({ queryKey: ['collab-notes'] });
    },
  });
}

// Update comment
export function useUpdateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      noteId,
      content,
    }: {
      commentId: string;
      noteId: string;
      content: string;
    }) => {
      const { data, error } = await supabase
        .from('collab_note_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select(`
          *,
          resource:author_id(id, name)
        `)
        .single();

      if (error) throw error;

      return {
        ...data,
        author: data.resource,
      } as CollabNoteComment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.note_id] });
      queryClient.invalidateQueries({ queryKey: ['collab-notes'] });
    },
  });
}

// Delete comment
export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      noteId,
    }: {
      commentId: string;
      noteId: string;
    }) => {
      const { error } = await supabase
        .from('collab_note_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      return { commentId, noteId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.noteId] });
      queryClient.invalidateQueries({ queryKey: ['collab-notes'] });
    },
  });
}

// Archive note
export function useArchiveNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await supabase
        .from('collab_notes')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}

// Unarchive note
export function useUnarchiveNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await supabase
        .from('collab_notes')
        .update({
          is_archived: false,
          archived_at: null,
        })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-notes', data.board_id],
      });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}
