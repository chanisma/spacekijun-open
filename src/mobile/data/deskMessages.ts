/**
 * 데스크 쪽지(교사 ↔ 학생) — 데스크(NEIS_helper `app/core/desk_message.py`)와 같은 서버 함수.
 * 받은 것 = 내 알림(`notification_events`, type 'desk_message'), 보낸 것 = RPC `desk_message_sent`,
 * 보내기 = `send_desk_message_v2`, 주소록 = `desk_message_directory`(교사에게는 학생 명단), 사진 = `desk_message_image`(7일).
 * 서버 SQL 정본은 NEIS_helper `deploy/supabase/20261019_desk_message.sql` · `20261022_desk_message_images.sql`.
 */
import { supabase } from '@/integrations/supabase/client';

export const DESK_MESSAGE_TYPE = 'desk_message';
export const MESSAGE_LIMIT = 1000;            // 서버와 같은 한도
export const IMAGE_LIMIT = 4;
export const IMAGE_BYTES = 1536 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ImageRef { id: string; w: number; h: number }
export interface DeskMessage {
  id: string;
  mine: boolean;
  body: string;
  time: string;
  read: boolean;
  quote: string;
  images: ImageRef[];
  photoOnly: boolean;
  kind?: string;                               // 'session_request' · 'session_event' — 보이는 모양만. 허락 여부는 서버 표가 정한다
}
export type SessionStatus = 'none' | 'pending' | 'active' | 'declined' | 'ended';
export interface Conversation { id: string; label: string; messages: DeskMessage[]; unread: number; last: string }
export interface Person { id: string; name: string; grade?: string | null; class?: string | null; number?: string | null }

// 🚨 supabase.rpc 를 떼어 쓰면 this 를 잃어 «reading 'rest'» 로 죽는다(2026-10-30) — bind 로 붙인다
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

function images(value: unknown): ImageRef[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<{ id?: unknown; w?: unknown; h?: unknown }>)
    .filter((item): item is { id: string; w?: unknown; h?: unknown } => !!item && typeof item.id === 'string' && UUID.test(item.id))
    .map((item) => ({ id: item.id, w: Number.isInteger(item.w) ? item.w as number : 0, h: Number.isInteger(item.h) ? item.h as number : 0 }))
    .slice(0, IMAGE_LIMIT);
}

const when = (value: string) => Date.parse(value) || 0;

interface InboxRow {
  id: string; title: string | null; message: string | null; is_read: boolean; created_at: string;
  meta: { sender_resource_id?: string; sender_label?: string; sender_name?: string; quote?: string;
          images?: unknown; photo_only?: boolean; kind?: string } | null;
}
interface SentRow { id: string; to?: string; to_label?: string; body?: string; time: string; images?: unknown; photo_only?: boolean; kind?: string }

/** 받은 것·보낸 것을 상대마다 묶는다 — 최근 대화가 위, 대화 안은 오래된 것부터 (desk_message.conversations) */
export async function loadConversations(): Promise<Conversation[]> {
  const [inbox, outbox] = await Promise.all([
    supabase.from('notification_events').select('id,title,message,meta,is_read,created_at')
      .eq('type', DESK_MESSAGE_TYPE).order('created_at', { ascending: false }).limit(120),
    rpc('desk_message_sent', { p_limit: 300 }),
  ]);
  if (inbox.error) throw inbox.error;
  if (outbox.error) throw new Error(outbox.error.message);
  const threads = new Map<string, Conversation>();
  const thread = (id: string, label: string) => {
    const found = threads.get(id) ?? { id, label, messages: [], unread: 0, last: '' };
    found.label = found.label || label;
    threads.set(id, found);
    return found;
  };
  for (const row of (inbox.data ?? []) as InboxRow[]) {
    const meta = row.meta ?? {};
    if (!meta.sender_resource_id) continue;
    thread(meta.sender_resource_id, meta.sender_label || meta.sender_name || String(row.title || '').replace(/^\[메시지\] /, ''))
      .messages.push({ id: row.id, mine: false, body: row.message || '', time: row.created_at, read: !!row.is_read,
                       quote: meta.quote || '', images: images(meta.images), photoOnly: !!meta.photo_only, kind: meta.kind });
  }
  for (const row of (outbox.data ?? []) as SentRow[]) {
    if (!row?.to) continue;
    thread(row.to, row.to_label || '').messages.push({
      id: row.id, mine: true, body: row.body || '', time: row.time, read: true, quote: '',
      images: images(row.images), photoOnly: !!row.photo_only, kind: row.kind });
  }
  for (const item of threads.values()) {
    item.messages.sort((a, b) => when(a.time) - when(b.time));
    item.unread = item.messages.filter((m) => !m.mine && !m.read).length;
    item.last = item.messages.at(-1)?.time ?? '';
  }
  return [...threads.values()].sort((a, b) => when(b.last) - when(a.last));
}

/** 학생이 처음 보낼 때 허락받기 (2026-10-31) — 상대 id → 대화 상태. 막는 것은 서버 send_desk_message_v2 다 */
export async function loadSessions(): Promise<{ role: string; sessions: Record<string, SessionStatus> }> {
  const { data, error } = await rpc('desk_message_sessions');
  if (error) throw new Error(error.message);
  const value = data as { role?: string; sessions?: Array<{ peer: string; status: SessionStatus }> } | null;
  return { role: value?.role ?? '', sessions: Object.fromEntries((value?.sessions ?? []).map((row) => [row.peer, row.status])) };
}

export async function decideRequest(student: string, approve: boolean): Promise<void> {
  const { error } = await rpc('desk_message_decide', { p_student_resource_id: student, p_approve: approve });
  if (error) throw new Error(error.message);
}

export async function endSession(student: string): Promise<void> {
  const { error } = await rpc('desk_message_end_session', { p_student_resource_id: student });
  if (error) throw new Error(error.message);
}

export async function markRead(ids: string[]): Promise<void> {
  const clean = ids.filter((id) => UUID.test(id)).slice(0, 100);
  if (!clean.length) return;
  const { error } = await supabase.from('notification_events').update({ is_read: true } as never)
    .in('id', clean).eq('type', DESK_MESSAGE_TYPE);
  if (error) throw error;
}

export async function directory(): Promise<{ role: string; me: string; people: Person[] }> {
  const { data, error } = await rpc('desk_message_directory');
  if (error) throw new Error(error.message);
  const value = data as { role?: string; me?: string; people?: Person[] } | null;
  if (!value || !Array.isArray(value.people)) throw new Error('주소록을 불러오지 못했습니다.');
  return { role: value.role ?? '', me: value.me ?? '', people: value.people };
}

export interface OutgoingImage { data: string; mime: string; width: number; height: number }

/** 보낸다. replyTo 는 답장할 받은 메시지(알림) id — 서버가 «답장함» 표시와 인용을 붙인다 */
export async function sendMessage(recipient: string, body: string, replyTo: string | null, pictures: OutgoingImage[] = []) {
  const text = body.trim();
  if (!text && !pictures.length) throw new Error('메시지 내용을 써 주세요.');
  if (text.length > MESSAGE_LIMIT) throw new Error(`메시지는 ${MESSAGE_LIMIT}자까지 보낼 수 있습니다 (지금 ${text.length}자).`);
  if (pictures.length > IMAGE_LIMIT) throw new Error(`사진은 한 번에 ${IMAGE_LIMIT}장까지 보낼 수 있습니다.`);
  const { data, error } = await rpc('send_desk_message_v2', {
    p_recipient_resource_id: recipient, p_body: text, p_reply_to_notification_id: replyTo,
    p_images: pictures.length ? pictures : null,
  });
  if (error) throw new Error(error.message);
  return data as { notification_id: string };
}

const imageCache = new Map<string, string | null>();

/** 사진 한 장 — data: 주소. 서버의 7일이 지났으면 null */
export async function loadImage(id: string): Promise<string | null> {
  if (imageCache.has(id)) return imageCache.get(id)!;
  const { data, error } = await rpc('desk_message_image', { p_image_id: id });
  if (error) throw new Error(error.message);
  const row = data as { data?: string; mime?: string } | null;
  const src = row?.data ? `data:${row.mime || 'image/jpeg'};base64,${row.data}` : null;
  imageCache.set(id, src);
  return src;
}

/** 휴대폰 사진을 줄여 보낸다 — 긴 변 1600px JPEG, 서버 한도(1.5MB) 안으로 */
export async function shrinkPhoto(file: File): Promise<OutgoingImage> {
  const bitmap = await createImageBitmap(file);
  let side = 1600;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.82);
    const data = url.slice(url.indexOf(',') + 1);
    if (data.length * 0.75 <= IMAGE_BYTES) return { data, mime: 'image/jpeg', width: canvas.width, height: canvas.height };
    side = Math.round(side * 0.7);
  }
  throw new Error('사진이 너무 큽니다.');
}
