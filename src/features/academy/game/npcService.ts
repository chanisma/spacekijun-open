import { supabase } from '@/integrations/supabase/client';
import type { NpcIdentity, NpcReply, NpcTurn } from '../../../../supabase/functions/_shared/academyNpc';

export async function talkToNpc(npc: NpcIdentity, message: string, history: NpcTurn[], newsId: number | null = null): Promise<NpcReply> {
  const { data, error } = await supabase.functions.invoke('academy-npc', { body: { npc, message, history: history.slice(-8), newsId } });
  if (error) {
    let text = '대화를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (error.context instanceof Response) {
      try { const body = await error.context.clone().json(); if (typeof body.error === 'string') text = body.error; } catch { /* retain fallback */ }
    }
    throw new Error(text);
  }
  if (!data?.result?.reply || data.error) throw new Error(data?.error || '인물의 답변을 읽지 못했어요.');
  return data.result;
}
