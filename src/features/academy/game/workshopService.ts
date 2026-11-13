import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { WorkshopSlot, WorkshopStatus } from './workshopModel';

export interface WorkshopOrder {
  id: string; student_id: string; student_name?: string; student_code?: string; slot: WorkshopSlot;
  title: string; prompt: string; status: WorkshopStatus; admin_note: string; image_path: string | null;
  sale_price: number; charged_coins: number; refunded_coins: number; commission_count?: number; commission_coins?: number;
  item_id: number | null; created_at: string; updated_at: string; image_url?: string;
}
export interface WorkshopPage { orders: WorkshopOrder[]; total: number }
type Database = { public: { Tables: { academy_workshop_orders: { Row: WorkshopOrder; Insert: never; Update: never; Relationships: [] } ; academy_workshop_commissions: { Row: {order_id:string; amount:number}; Insert: never; Update: never; Relationships: [] } }; Views: Record<string, never>; Functions: {
  academy_workshop_read: { Args: { p_status: string | null; p_offset: number; p_student_code: string | null }; Returns: WorkshopPage };
  academy_workshop_write: { Args: { p_action: string; p_payload: Record<string, unknown> }; Returns: WorkshopOrder };
} } };
const db = supabase as unknown as SupabaseClient<Database>;
const bucket = supabase.storage.from('academy-workshop');
export async function signWorkshopImages(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await bucket.createSignedUrls([...new Set(paths)], 3600);
  if (error) throw new Error('공방 이미지의 봉인을 열지 못했어요. 잠시 후 다시 열어 주세요.');
  return new Map((data ?? []).filter(x => !!x.signedUrl && !!x.path).map(x => [x.path!, x.signedUrl]));
}
export async function fetchWorkshopOrders({ offset = 0, status = null, studentCode = null, orderId = null, own = false }: { own?: boolean; offset?: number; status?: string | null; studentCode?: string | null; orderId?: string | null } = {}): Promise<WorkshopPage> {
  let result: WorkshopPage;
  if (orderId && !studentCode && !own) {
    const { data, error } = await db.from('academy_workshop_orders').select('*').eq('id', orderId).maybeSingle();
    if (error) throw new Error('주문을 불러오지 못했어요.');
    if (data) {
      const { data: profile } = await supabase.from('profiles').select('name,nickname,email').eq('id', data.student_id).maybeSingle();
      const { count: sales, error: commissionError } = await db.from('academy_workshop_commissions').select('amount', { count: 'exact', head: true }).eq('order_id', data.id);
      if (commissionError) throw new Error('작품 정산 내역을 불러오지 못했어요.');
      result = { orders: [{ ...data, commission_count: sales ?? 0, commission_coins: (sales ?? 0) * 10, student_name: profile?.name || profile?.nickname || '학생', student_code: profile?.email?.split('@')[0] }], total: 1 };
    } else result = { orders: [], total: 0 };
  } else {
    const { data, error } = own && !studentCode ? await (supabase as unknown as SupabaseClient).rpc('academy_workshop_own_read', { p_offset: orderId ? 0 : offset, p_order: orderId }) : await db.rpc('academy_workshop_read', { p_status: status, p_offset: offset, p_student_code: studentCode });
    if (error || !data) throw new Error('공방 주문을 불러오지 못했어요. 다시 시도해 주세요.');
    result = data;
  }
  if (own && orderId) result = { orders: result.orders.filter(o => o.id === orderId), total: result.total };
  const signed = await signWorkshopImages(result.orders.flatMap(o => o.image_path ? [o.image_path] : []));
  return { ...result, orders: result.orders.map(o => ({ ...o, image_url: o.image_path ? signed.get(o.image_path) : undefined })) };
}
export async function writeWorkshopOrder(action: string, payload: Record<string, unknown>) {
  const { data, error } = await db.rpc('academy_workshop_write', { p_action: action, p_payload: payload });
  if (error || !data) throw new Error(error?.message || '공방에 전달하지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function uploadWorkshopImage(orderId: string, file: File) {
  const path = `${orderId}/${crypto.randomUUID()}.png`;
  const { error } = await bucket.upload(path, file, { contentType: 'image/png', upsert: false });
  if (error) throw new Error('이미지를 등록하지 못했어요. 주문 상태를 확인한 뒤 다시 시도해 주세요.');
  return path;
}
export async function removeUnusedWorkshopImage(path: string) {
  const { error } = await bucket.remove([path]);
  if (error) throw new Error('이전 미리보기를 정리하지 못했어요.');
}

export { validateWorkshopImage } from './workshopImage';
