/**
 * 알림 [답장] 데이터 계층 (2026-09-22)
 *
 * 답장은 SPACEKIJUN 안의 교직원에게 알림(`notification_events`, type='direct_reply')으로 간다.
 * 쓰기는 **`send_notification_reply` RPC 전용** — 보낸 사람·인용을 서버가 유도해야 받은 사람의
 * [답장]이 위조된 id 로 되돌아가지 않는다(마이그레이션 `20260922100000` 머리말).
 * 판정(누구에게 보낼지)은 `src/lib/notificationReply.ts` 가 맡고, 이 파일은 읽기·쓰기만 한다.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ReplyPerson } from '@/lib/notificationReply';

/** 재직 교직원 명단 + SPACEKIJUN 계정 연결 여부 */
export async function fetchReplyRoster(): Promise<ReplyPerson[]> {
  const [resourceRes, linkRes] = await Promise.all([
    supabase
      .from('resource')
      .select('id, name, type')
      .in('type', ['teacher', 'staff'])
      .eq('status', 'active')
      .order('name'),
    // user_resource SELECT 는 로그인 사용자 전원에게 열려 있다 — 보내기 **전에**
    // "아직 로그인한 적 없는 분"을 알려 줄 수 있다 (교직원 연결은 수십 행이라 상한과 무관)
    supabase.from('user_resource').select('resource_id'),
  ]);
  if (resourceRes.error) throw resourceRes.error;
  if (linkRes.error) throw linkRes.error;

  const linked = new Set((linkRes.data ?? []).map((r) => r.resource_id as string));
  return (resourceRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type === 'staff' ? 'staff' : 'teacher',
    linked: linked.has(r.id),
  }));
}

export interface SendReplyInput {
  recipientResourceId: string;
  body: string;
  /** 답장 대상 알림 — 서버가 원문을 인용하고 원래 알림에 '답장함' 흔적을 남긴다 */
  replyToNotificationId?: string | null;
}

export interface SendReplyResult {
  notificationId: string;
  recipientName: string;
  /** false = 받는 분이 아직 SPACEKIJUN 에 로그인한 적이 없어 로그인해야 본다 */
  recipientLinked: boolean;
}

export async function sendNotificationReply(input: SendReplyInput): Promise<SendReplyResult> {
  const { data, error } = await supabase.rpc('send_notification_reply', {
    p_recipient_resource_id: input.recipientResourceId,
    p_body: input.body,
    ...(input.replyToNotificationId ? { p_reply_to_notification_id: input.replyToNotificationId } : {}),
  });
  if (error) {
    // 실행 권한 자체가 없다 = 세션이 없거나 만료됐다(anon 에서 회수). 서버 원문은 영어라 옮긴다
    if (/permission denied for function/i.test(error.message ?? '')) {
      throw new Error('로그인이 만료되었습니다. 다시 로그인한 뒤 보내 주세요.');
    }
    // 그 밖에는 서버가 한국어 사유를 message 에 담아 던진다(빈 본문·2000자 초과·교직원 아님 등)
    throw new Error(error.message || '답장을 보내지 못했습니다.');
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    notificationId: String(row.notification_id ?? ''),
    recipientName: String(row.recipient_name ?? ''),
    recipientLinked: row.recipient_linked !== false,
  };
}
