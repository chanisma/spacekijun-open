// ========================================
// 협업보드 접근 권한 확인 (공지 링크 전용 어댑터)
//
// 판정 규칙 자체는 `src/lib/collabBoardAccess.ts` 단일 출처에 있다.
// 여기 남는 것은 "보드 id 로 조회해서 판정한다"는 공지 링크 쪽 사정뿐이다.
// ========================================

import { supabase } from '@/integrations/supabase/client';
import {
  hasCollabViewAccess,
  boardAccessFieldsFromList,
  type BoardAccessFields,
} from '@/lib/collabBoardAccess';

export type CollabAccessResult = 'ok' | 'denied' | 'missing';

export type { BoardAccessFields };
export { hasCollabViewAccess };

/** 보드 id로 조회해 접근 판정 (비동기) — 링크 클릭 시 사용 */
export async function checkCollabBoardAccess(
  boardId: string,
  resourceId: string | null | undefined,
  isAdmin: boolean
): Promise<CollabAccessResult> {
  const { data: board, error } = await supabase
    .from('collab_boards')
    .select('id, visibility, created_by, collab_board_members(user_id)')
    .eq('id', boardId)
    .maybeSingle();

  if (error || !board) return 'missing';

  return hasCollabViewAccess(boardAccessFieldsFromList(board), resourceId, isAdmin)
    ? 'ok'
    : 'denied';
}
