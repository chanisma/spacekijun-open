/**
 * 가챠 · 꾸미기 · 치료제 외상 — 서버 RPC 입구(`20261007120000_tamagotchi_gacha.sql`). 뽑기는 서버가 한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Equipped, ItemSlot, Rarity } from '../model/catalog';
import { hydrateCustomItems } from './decorService';

export interface ShopStatus {
  /** 관리자(서버 역할) — 확인용으로 모든 물건을 가진 것으로 보이고 뽑기가 무료다(20261007170000) */
  admin?: boolean;
  coins: number;
  debt: number;
  since_new: number;
  pulls: number;
  /** prob = 지금 풀에서의 확률(%) — 이벤트 밖의 이벤트 물건은 0. pickup = 열린 이벤트의 픽업(같은 등급 안에서 두 배) */
  items: { id: string; slot: ItemSlot; rarity: Rarity; name: string; prob: number; event_only?: boolean; pickup?: boolean;
    /** 나만의 꾸미기(꾸미기 의뢰) — 내 것만 온다 */
    custom?: boolean; design?: unknown; image_path?: string | null }[];
  /** 기계마다 값·환급·확률(%) — 2026-10-13 가챠 기계 다섯(20261013130000) */
  machines?: Record<string, { price: number; refund: number; probs: Record<string, number> }>;
  /** 지금 열린 펫 이벤트(Phase 5) */
  events?: TamaEvent[];
  owned: Record<string, number>;
  equipped: Equipped;
}

export interface TamaEvent {
  id: string;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string;
  item_ids: string[];
  pickup_ids: string[];
}

export interface DrawResult {
  item: string;
  is_new: boolean;
  pity: boolean;
  refund: number;
  coins: number;
  since_new: number;
  pulls: number;
  machine?: string;
}

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  tama_shop_read: { Args: Record<string, never>; Returns: ShopStatus };
  tama_gacha_draw: { Args: { p_machine: string }; Returns: DrawResult };
  tama_equip_set: { Args: { p_slot: ItemSlot; p_item: string | null }; Returns: Equipped };
  tama_medicine_buy: { Args: Record<string, never>; Returns: { paid: boolean; debt: number; coins: number } };
  tama_debt_pay: { Args: Record<string, never>; Returns: { paid: number; debt: number; coins: number } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const shopService = {
  // 읽을 때마다 나만의 꾸미기를 목록에 더한다(그래야 꾸미기 창·방 그림·미리보기가 그 물건을 안다)
  read: async () => {
    const status = unwrap(await db.rpc('tama_shop_read'));
    hydrateCustomItems((status.items ?? []).filter((i) => i.custom));
    return status;
  },
  draw: async (machine = 'all') => unwrap(await db.rpc('tama_gacha_draw', { p_machine: machine })),
  equip: async (slot: ItemSlot, item: string | null) => unwrap(await db.rpc('tama_equip_set', { p_slot: slot, p_item: item })),
  payDebt: async () => unwrap(await db.rpc('tama_debt_pay')),
};
