import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import type { CardData, NoticeCardData, RandomCardData } from '@/types/collabCardTypes';

// 범용 card_data 업데이트 hook
export function useUpdateNoteCardData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      cardData,
    }: {
      noteId: string;
      cardData: CardData;
    }) => {
      // 현재 노트의 meta 가져오기
      const { data: currentNote, error: fetchError } = await supabase
        .from('collab_notes')
        .select('meta, board_id')
        .eq('id', noteId)
        .single();

      if (fetchError) throw fetchError;

      // meta.card_data 업데이트
      const updatedMeta = {
        ...currentNote.meta,
        card_data: cardData,
      };

      const { error } = await supabase
        .from('collab_notes')
        .update({
          meta: updatedMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId);

      if (error) throw error;
      return { id: noteId, board_id: currentNote.board_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collab-notes', data.board_id] });
      queryClient.invalidateQueries({ queryKey: ['collab-note', data.id] });
    },
  });
}

// 공지 카드 확인 hook
export function useAcknowledgeNotice() {
  const { mutate: updateCardData } = useUpdateNoteCardData();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ noteId, resourceId }: { noteId: string; resourceId: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 현재 노트 가져오기
      const { data: note, error: fetchError } = await supabase
        .from('collab_notes')
        .select('meta')
        .eq('id', noteId)
        .single();

      if (fetchError) throw fetchError;

      const cardData = note.meta.card_data as NoticeCardData;

      // acknowledgements 업데이트
      const updatedCardData: NoticeCardData = {
        ...cardData,
        acknowledgements: {
          ...cardData.acknowledgements,
          [resourceId]: {
            acknowledged: true,
            acknowledged_at: new Date().toISOString(),
          },
        },
      };

      // updateCardData mutation 실행
      return new Promise((resolve, reject) => {
        updateCardData(
          { noteId, cardData: updatedCardData },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });
    },
  });
}

// 랜덤 선택 실행 hook
export function useExecuteRandomSelection() {
  const { mutate: updateCardData } = useUpdateNoteCardData();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ noteId }: { noteId: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 현재 노트 가져오기
      const { data: note, error: fetchError } = await supabase
        .from('collab_notes')
        .select('meta')
        .eq('id', noteId)
        .single();

      if (fetchError) throw fetchError;

      const cardData = note.meta.card_data as RandomCardData;

      // 랜덤 선택 실행
      const shuffled = [...cardData.target_members].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, cardData.selection_count);

      const updatedCardData: RandomCardData = {
        ...cardData,
        selected_members: selected,
        selected_at: new Date().toISOString(),
      };

      // updateCardData mutation 실행
      return new Promise((resolve, reject) => {
        updateCardData(
          { noteId, cardData: updatedCardData },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });
    },
  });
}
