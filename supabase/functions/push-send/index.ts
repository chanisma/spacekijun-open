// Web Push 발송 (2026-10-07, 다마고찌 Phase 4 — docs/features/tamagotchi.md)
//
// 방아쇠 = notification_events AFTER INSERT 트리거(push_private.on_notification)의 net.http_post.
// 인증 = 게이트웨이 JWT 가 아니라 x-push-secret(DB 가 만든 비밀, push_trigger_secret RPC 로 대조).
// 누구에게·몇 건을 보낼지는 이 함수가 정하지 않는다 — push_targets RPC 가 받는 사람·예산·조용한 시간을 판정한다.
// 이 함수는 암호화·발송·결과 기록만 한다(410 = 구독 소멸 → push_record 가 지운다).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@^0.5.0';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

let appServerPromise: Promise<webpush.ApplicationServer> | null = null;
function appServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const raw = Deno.env.get('VAPID_KEYS');
      if (!raw) throw new Error('VAPID_KEYS secret missing');
      const vapidKeys = await webpush.importVapidKeys(JSON.parse(raw), { extractable: false });
      return webpush.ApplicationServer.new({
        contactInformation: 'https://your-project-ref.supabase.co',
        vapidKeys,
      });
    })().catch((e) => { appServerPromise = null; throw e; });
  }
  return appServerPromise;
}

interface Sub { id: string; user_id: string; endpoint: string; keys: { p256dh: string; auth: string } }
interface Targets {
  subs: Sub[];
  duplicate?: boolean;
  notification?: { id: string; type: string; title: string; body: string };
}

Deno.serve(async (req) => {
  const supplied = req.headers.get('x-push-secret');
  if (!supplied) return new Response('Unauthorized', { status: 401 });
  const { data: secret, error: secretError } = await db.rpc('push_trigger_secret');
  if (secretError || supplied !== secret) return new Response('Unauthorized', { status: 401 });

  let notificationId: string | undefined;
  try {
    notificationId = (await req.json())?.notification_id;
  } catch { /* 아래에서 거른다 */ }
  if (!notificationId) return Response.json({ error: 'notification_id required' }, { status: 400 });

  const { data, error } = await db.rpc('push_targets', { p_notification: notificationId });
  if (error) {
    console.error('push_targets_failed', error.message);
    return Response.json({ error: 'targets' }, { status: 500 });
  }
  const targets = data as Targets;
  if (!targets.notification || targets.subs.length === 0) {
    return Response.json({ sent: 0, duplicate: !!targets.duplicate });
  }

  const n = targets.notification;
  // 서비스 워커(public/sw.js) 의 push 핸들러가 읽는 모양 — 목적지는 싣지 않는다(라우팅 단일 출처 = 클라이언트).
  const payload = JSON.stringify({ v: 1, id: n.id, type: n.type, title: n.title, body: n.body, tag: `notification-${n.id}` });

  const server = await appServer();
  const results = await Promise.all(targets.subs.map(async (s) => {
    try {
      await server.subscribe({ endpoint: s.endpoint, keys: s.keys }).pushTextMessage(payload, {
        ttl: 6 * 60 * 60, // 6시간 지난 알림은 버린다 — 하루 늦게 울리는 «배고파요»는 거짓말이다
        urgency: webpush.Urgency.Normal,
      });
      return { subscription_id: s.id, user_id: s.user_id, status: 'sent' };
    } catch (e) {
      // 410 = 구독 소멸(규격), 404 = FCM·Mozilla 가 만료된 엔드포인트에 주는 값 — 둘 다 다시 보낼 곳이 없다
      const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
      const gone = status === 410 || status === 404;
      // PushMessageError 는 message 가 비어 있다(super() 로 만든다) — toString() 이 상태 코드를 담는다
      const detail = e instanceof webpush.PushMessageError ? e.toString() : e instanceof Error ? e.message : String(e);
      return { subscription_id: s.id, user_id: s.user_id, status: gone ? 'gone' : 'failed', detail: detail.slice(0, 300) };
    }
  }));

  const { error: recordError } = await db.rpc('push_record', { p_notification: n.id, p_kind: n.type, p_results: results });
  if (recordError) console.error('push_record_failed', recordError.message);
  const sent = results.filter((r) => r.status === 'sent').length;
  return Response.json({ sent, failed: results.length - sent });
});
