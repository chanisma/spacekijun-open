// ========================================
// 메시지 보내기(message.send) 서버 호출 + 초안 생성
// ========================================

import { supabase } from '@/integrations/supabase/client';
import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import {
  MESSAGE_DRAFT_SYSTEM_PROMPT,
  buildMessageDraftPrompt,
  parseMessageDraft,
  type TaskMessageSend,
} from '@/lib/taskMessage';

function fail(error: { message?: string } | null): never {
  throw new Error(error?.message ?? '요청을 처리하지 못했습니다.');
}

export async function updateMessageConfig(actionId: string, config: Record<string, unknown>) {
  const { error } = await supabase.rpc('update_message_config', { p_action_id: actionId, p_config: config as never });
  if (error) fail(error);
}

export interface SendTaskMessageResult {
  send_id: string;
  notified: number;
  recipient_names: string[];
  unlinked_names: string[];
}

export async function sendTaskMessage(actionId: string): Promise<SendTaskMessageResult> {
  const { data, error } = await supabase.rpc('send_task_message', { p_action_id: actionId });
  if (error) fail(error);
  return data as unknown as SendTaskMessageResult;
}

export async function listTaskMessageSends(actionId: string): Promise<TaskMessageSend[]> {
  const { data, error } = await supabase
    .from('task_message_send')
    .select('id, sent_at, sender_name, title, body, recipient_names, unlinked_names')
    .eq('action_id', actionId)
    .order('sent_at', { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []) as TaskMessageSend[];
}

/**
 * 게이트웨이(약 150초)보다 낮게 — 504 대신 우리 메시지가 나가게(공지 초안과 같은 부류).
 */
const MESSAGE_DRAFT_TIMEOUT_MS = 120000;

export async function generateMessageDraft(input: Parameters<typeof buildMessageDraftPrompt>[0], signal?: AbortSignal) {
  if (!input.request.trim()) throw new Error('무엇을 알릴지 한 줄이라도 적어 주세요.');
  const raw = await aiChat({
    systemPrompt: MESSAGE_DRAFT_SYSTEM_PROMPT,
    userPrompt: buildMessageDraftPrompt(input),
    temperature: 0.3,
    reasoningEffort: reasoningEffortFor('generation'),
    timeoutMs: MESSAGE_DRAFT_TIMEOUT_MS,
    signal,
    errorPrefix: '메시지 초안 생성 실패',
  });
  return parseMessageDraft(raw);
}
