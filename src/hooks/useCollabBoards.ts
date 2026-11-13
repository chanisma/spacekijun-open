import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { unifiedAuth } from '@/services/unifiedAuth';
import { BOARD_CATEGORY_META_KEY, normalizeCategory } from '@/lib/collabCategories';
import {
  BOARD_PALETTE_META_KEY,
  serializePalette,
  type NotePaletteEntry,
} from '@/lib/collabNoteColors';

export type BoardVisibility = 'public' | 'read_only' | 'private';

export interface CollabBoard {
  id: string;
  title: string;
  description: string | null;
  color: string;
  visibility: BoardVisibility;
  is_archived: boolean;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  meta: Record<string, any>;
  note_count?: number;
  member_count?: number;
  /**
   * 목록 조회가 함께 가져오는 멤버 행. 화면이 "내가 이 보드의 멤버인가"를
   * 이 배열로 판정하므로 RLS 가 이 행을 숨기면 초대받은 사람에게도
   * 보드가 사라진다(2026-09-09 학생 사고의 직접 원인).
   */
  collab_board_members?: { id: string; user_id: string }[];
}

export interface CreateBoardInput {
  title: string;
  description?: string;
  color?: string;
  visibility?: BoardVisibility;
  member_ids?: string[];
  /** 자유 입력 카테고리. `meta.category` 에 저장된다(별도 표 없음). */
  category?: string | null;
}

export interface UpdateBoardInput {
  title?: string;
  description?: string;
  color?: string;
  visibility?: BoardVisibility;
  /**
   * `undefined` = 건드리지 않음, `null`/`''` = 카테고리 지움.
   * meta 전체를 덮어쓰지 않고 이 키만 병합한다(아래 mergeBoardMeta 참고).
   */
  category?: string | null;
}

/**
 * `collab_boards.meta` 는 **통째로 교체**되는 jsonb 다. 카테고리만 바꾼다고
 * `{ meta: { category } }` 를 보내면 같은 보드의 색 팔레트가 조용히 사라진다.
 * 그래서 쓰기 직전에 현재 meta 를 읽어 필요한 키만 얹는다.
 */
async function mergeBoardMeta(
  boardId: string,
  patch: Record<string, unknown>,
): Promise<Json> {
  const { data, error } = await supabase
    .from('collab_boards')
    .select('meta')
    .eq('id', boardId)
    .single();

  if (error) throw error;

  const current = (data?.meta ?? {}) as Record<string, unknown>;
  const next = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as Json;
}

// Get all boards user has access to
export function useCollabBoards() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['collab-boards', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('collab_boards')
        .select(`
          *,
          collab_notes(id),
          collab_board_members(id, user_id)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return data.map((board: any) => ({
        ...board,
        note_count: board.collab_notes?.length || 0,
        member_count: board.collab_board_members?.length || 0,
      })) as CollabBoard[];
    },
    enabled: !!user?.id,
  });
}

// Get single board by ID
export function useCollabBoard(boardId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['collab-board', boardId],
    queryFn: async () => {
      if (!boardId) return null;

      const { data, error } = await supabase
        .from('collab_boards')
        .select(`
          *,
          collab_notes(id),
          collab_board_members(
            id,
            role,
            created_at,
            resource:user_id(id, name)
          ),
          owner_resource:created_by(id, name)
        `)
        .eq('id', boardId)
        .single();

      if (error) throw error;

      // Create owner member object
      const ownerMember = data.owner_resource ? {
        id: `owner-${data.id}`,
        role: 'owner' as const,
        created_at: data.created_at,
        resource: data.owner_resource
      } : null;

      // Filter out any existing owner entries from collab_board_members to avoid duplication
      const otherMembers = (data.collab_board_members || []).filter(
        (member: any) => member.role !== 'owner'
      );

      // Combine owner with other members
      const allMembers = ownerMember
        ? [ownerMember, ...otherMembers]
        : otherMembers;

      return {
        ...data,
        note_count: data.collab_notes?.length || 0,
        members: allMembers,
      };
    },
    enabled: !!boardId && !!user?.id,
  });
}

// Create new board
export function useCreateBoard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateBoardInput) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 신원 해석은 unifiedAuth 단일 출처를 쓴다.
      // user_resource 를 직접 조회하면 학생이 빠진다 — 학생은 이 표를 쓰지 않고
      // 이메일 prefix ↔ resource.meta->>'id' 로 연결된다(재학생 630명 중 링크 12명).
      const currentResourceId = await unifiedAuth.getCurrentResourceId();

      if (!currentResourceId) {
        throw new Error('내 리소스를 찾을 수 없습니다. 프로필에서 이름 등록을 먼저 완료해 주세요.');
      }

      const category = normalizeCategory(input.category);

      // Create board
      const { data: board, error: boardError } = await supabase
        .from('collab_boards')
        .insert({
          title: input.title,
          description: input.description || null,
          color: input.color || 'blue',
          visibility: input.visibility || 'public',
          created_by: currentResourceId,
          meta: category ? { [BOARD_CATEGORY_META_KEY]: category } : {},
        })
        .select()
        .single();

      if (boardError) throw boardError;

      // Add creator as owner
      const { error: memberError } = await supabase
        .from('collab_board_members')
        .insert({
          board_id: board.id,
          user_id: currentResourceId,
          role: 'owner',
        });

      if (memberError) throw memberError;

      // Add additional members if provided (member_ids are now resource.id)
      if (input.member_ids && input.member_ids.length > 0) {
        const uniqueMemberIds = input.member_ids.filter((resourceId) => resourceId !== currentResourceId);

        if (uniqueMemberIds.length > 0) {
          const members = uniqueMemberIds.map((resourceId) => ({
            board_id: board.id,
            user_id: resourceId,
            role: 'editor',
          }));

          const { error: additionalMembersError } = await supabase
            .from('collab_board_members')
            .insert(members);

          if (additionalMembersError) throw additionalMembersError;
        }
      }

      return board;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collab-boards'] });
    },
  });
}

// Update board
export function useUpdateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      boardId,
      input,
    }: {
      boardId: string;
      input: UpdateBoardInput;
    }) => {
      const { category, ...rest } = input;

      const patch: Record<string, unknown> = {
        ...rest,
        updated_at: new Date().toISOString(),
      };

      if (category !== undefined) {
        const normalized = normalizeCategory(category);
        patch.meta = await mergeBoardMeta(boardId, {
          [BOARD_CATEGORY_META_KEY]: normalized,
        });
      }

      const { data, error } = await supabase
        .from('collab_boards')
        .update(patch)
        .eq('id', boardId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collab-boards'] });
      queryClient.invalidateQueries({
        queryKey: ['collab-board', variables.boardId],
      });
    },
  });
}

/**
 * 노트 색 팔레트(= 색↔범례 이름) 저장. 보드 소유자·admin 전용 화면에서만 부른다.
 * 서버 권한은 종전대로 `collab_boards` UPDATE 정책(소유자)이 지킨다.
 */
export function useUpdateBoardPalette() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      boardId,
      palette,
    }: {
      boardId: string;
      palette: NotePaletteEntry[];
    }) => {
      const meta = await mergeBoardMeta(boardId, {
        [BOARD_PALETTE_META_KEY]: serializePalette(palette),
      });

      const { data, error } = await supabase
        .from('collab_boards')
        .update({ meta, updated_at: new Date().toISOString() })
        .eq('id', boardId)
        .select('id')
        .single();

      // RLS 차단은 오류가 아니라 0행이다 — 반환 행으로 실제 반영을 확인한다.
      if (error) throw error;
      if (!data) throw new Error('색 설정을 저장할 권한이 없습니다.');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collab-boards'] });
      queryClient.invalidateQueries({ queryKey: ['collab-board', variables.boardId] });
    },
  });
}

// Delete board
export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (boardId: string) => {
      const { error } = await supabase
        .from('collab_boards')
        .delete()
        .eq('id', boardId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collab-boards'] });
    },
  });
}

// Add member to board
export function useAddBoardMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      boardId,
      userId,
      role = 'editor',
    }: {
      boardId: string;
      userId: string;
      role?: 'owner' | 'editor' | 'viewer';
    }) => {
      const { data, error } = await supabase
        .from('collab_board_members')
        .insert({
          board_id: boardId,
          user_id: userId,
          role,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-board', variables.boardId],
      });
    },
  });
}

// Remove member from board
export function useRemoveBoardMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      boardId,
      userId,
    }: {
      boardId: string;
      userId: string;
    }) => {
      const { error } = await supabase
        .from('collab_board_members')
        .delete()
        .eq('board_id', boardId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['collab-board', variables.boardId],
      });
    },
  });
}

// Archive board
export function useArchiveBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (boardId: string) => {
      const { data, error } = await supabase
        .from('collab_boards')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
        })
        .eq('id', boardId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collab-boards'] });
    },
  });
}

// Unarchive board
export function useUnarchiveBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (boardId: string) => {
      const { data, error } = await supabase
        .from('collab_boards')
        .update({
          is_archived: false,
          archived_at: null,
        })
        .eq('id', boardId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collab-boards'] });
    },
  });
}
