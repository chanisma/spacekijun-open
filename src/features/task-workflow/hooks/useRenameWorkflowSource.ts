// ========================================
// 업무 흐름 노드에서 원본(업무·할 일) 이름 바꾸기 (2026-09-23)
// 판정(누가·언제 묻는가)은 utils/nodeRename.ts — 여기는 쓰기만 한다.
// ========================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SourceRenameProposal } from '../utils/nodeRename';

/** 원본 이름이 보이는 쿼리들 — 업무 관리·내 할 일·상세 모달 */
const NAME_BEARING_KEYS = ['works-jsonb', 'my-tasks-jsonb', 'work', 'work-detail'];

export async function renameWorkflowSource(
  proposal: Pick<SourceRenameProposal, 'kind' | 'entityId' | 'nextName'>,
): Promise<void> {
  const { data, error } =
    proposal.kind === 'work'
      ? await supabase.from('work').update({ name: proposal.nextName }).eq('id', proposal.entityId).select('id')
      : await supabase.from('task').update({ title: proposal.nextName }).eq('id', proposal.entityId).select('id');
  if (error) throw error;
  // RLS 차단은 오류가 아니라 0행이다 — 반환 행으로 실제 반영을 확인한다
  if (!data?.length) {
    throw new Error(`${proposal.kind === 'work' ? '업무' : '할 일'} 이름을 바꾸지 못했습니다(권한 없음 또는 삭제됨).`);
  }
}

export function useRenameWorkflowSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: renameWorkflowSource,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (query) => NAME_BEARING_KEYS.includes(String(query.queryKey[0])),
      });
    },
  });
}
