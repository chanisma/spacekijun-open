/**
 * 꾸미기 의뢰 — 서버 RPC 입구(`20261008110000_tamagotchi_decor_order.sql`) + 나만의 꾸미기 받아 두기.
 *
 * 흐름은 캐릭터 의뢰와 같다: 학생이 자리 하나를 골라 글로 의뢰(자리별 값 DECOR_PRICES) → 관리자가 색·무늬를 고르거나(기기 디자인·벽지·러그)
 * 픽셀 PNG 를 올려(소품) 배송 → 서버가 «나만의 물건»(tama_item.custom_owner)을 만들어 인벤토리에 넣는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { registerCustomItems, type CatalogItem } from '../model/catalog';
import { customItemFromRow, type CustomItemRow, type DecorSlot } from '../model/decorDesign';
import { loadCustomDecoSprites } from '../color/customDecor';

/**
 * 꾸미기 의뢰 값 — 자리별로 다르다(2026-10-13 사용자 지시 «차별화», 서버 tama_decor_write 의 case, 회귀가 대조).
 * 기기 디자인 = 세 기기에 입히는 껍데기 · 소품 = 픽셀 그림을 새로 그린다 · 벽지·러그 = 색·무늬만 고른다.
 */
// 기기 종류 300(2026-10-13 사용자 지시 «기기 의뢰도 가능하도록 · 대신 300코인») — 새 3D 모델을 개발자가 만드는 가장 큰 일
export const DECOR_PRICES: Record<DecorSlot, number> = { device: 300, shell: 130, floor: 100, shelf: 100, wall: 100, wallpaper: 70, rug: 70 };
export const decorPriceOf = (slot: DecorSlot): number => DECOR_PRICES[slot];
export const DECOR_BUCKET = 'tama-decor';

export type DecorStatus = 'submitted' | 'crafting' | 'delivered' | 'declined' | 'cancelled';
export interface DecorOrder {
  id: string;
  owner: string;
  owner_name?: string;
  slot: DecorSlot;
  title: string;
  prompt: string;
  status: DecorStatus;
  admin_note: string | null;
  item_id: string | null;
  charged_coins: number;
  refunded_coins: number;
  created_at: string;
  delivered_at: string | null;
}

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  tama_decor_read: { Args: { p_scope: 'mine' | 'admin' }; Returns: DecorOrder[] };
  tama_decor_write: { Args: { p_action: string; p_payload: Record<string, unknown> }; Returns: DecorOrder & { coins?: number } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

/** 비공개 버킷 — 본인 · 관리자 · 별빛 친구만 서명 URL 을 받는다(tama_private.can_read_decor) */
export async function decorSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(DECOR_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message || '그림을 불러오지 못했어요.');
  return data.signedUrl;
}

/** 서버가 준 나만의 꾸미기 줄들 → 목록에 더하고 소품 그림을 받기 시작한다. 모양이 틀린 줄은 버린다 */
export function hydrateCustomItems(rows: CustomItemRow[] | undefined | null): CatalogItem[] {
  const items = (rows ?? []).map(customItemFromRow).filter((i): i is CatalogItem => !!i);
  registerCustomItems(items);
  loadCustomDecoSprites(items, decorSignedUrl);
  return items;
}

export const decorService = {
  mine: async () => unwrap(await db.rpc('tama_decor_read', { p_scope: 'mine' })),
  all: async () => unwrap(await db.rpc('tama_decor_read', { p_scope: 'admin' })),
  write: async (action: 'submit' | 'cancel' | 'start' | 'decline' | 'deliver', payload: Record<string, unknown>) =>
    unwrap(await db.rpc('tama_decor_write', { p_action: action, p_payload: payload })),
  /** 관리자 — 의뢰 폴더에 새 이름으로(덮어쓰지 않는다) */
  upload: async (orderId: string, file: Blob) => {
    const path = `${orderId}/${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage.from(DECOR_BUCKET).upload(path, file, { contentType: 'image/png', upsert: false });
    if (error) throw new Error(error.message);
    return path;
  },
  removeUnused: async (path: string) => { await supabase.storage.from(DECOR_BUCKET).remove([path]); },
};
