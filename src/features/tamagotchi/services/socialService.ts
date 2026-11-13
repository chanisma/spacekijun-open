/**
 * 함께(Phase 5) — 친구 펫 방문 · 쓰다듬기 · 교환 · 캐릭터 의뢰 · 펫 이벤트(관리자). 서버 = `20261007140000_tamagotchi_together.sql`.
 *
 * 친구는 별빛 친구(학생·선생님 — 2026-11-06, 아카데미의 친구 코드)다 — 직원은 eligible = false 라 화면이 그 사실을 말한다.
 * 교환은 받는 쪽이 수락하는 순간 서버가 한 트랜잭션에서 두 물건을 옮긴다(반쪽 거래 없음).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomItemRow } from '../model/decorDesign';
import { supabase } from '@/integrations/supabase/client';
import type { Equipped } from '../model/catalog';
import type { TamaEvent } from './shopService';
import { parseLongestPets } from '../model/longestPets';
import { parseAchievements } from '../model/achievements';
import type { PetMode } from '../model/petModes';

/** dead = 친구 펫이 별이 됐다(죽음 옵션 — 2026-10-19, 친구의 방 tama_friend_pet 만 싣는다) */
export interface FriendPetBrief { name: string; stage: string; branch?: string | null; dead?: boolean; species?: string | null }
export interface TamaFriend { id: string; name: string; pet: FriendPetBrief | null; patted_today: boolean }
export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'failed';
export interface TamaTrade {
  id: string;
  from_user: string;
  to_user: string;
  from_name: string;
  to_name: string;
  give_item: string;
  want_item: string | null;
  status: TradeStatus;
  detail: string | null;
  created_at: string;
  responded_at: string | null;
  expired: boolean;
}
export interface FriendsData { eligible: boolean; friends?: TamaFriend[]; trades?: TamaTrade[] }
export interface FriendPet {
  name: string;
  pet: FriendPetBrief | null;
  equipped: Equipped;
  items: Record<string, number>;
  character: { id: string; title: string; image_path: string } | null;
  /** 친구가 꾸민 나만의 꾸미기 — 그 방을 그릴 재료(디자인·그림). items 에는 없다(교환 대상이 아니다) */
  custom?: CustomItemRow[];
  patted_today: boolean;
}

export type CharacterStatus = 'submitted' | 'crafting' | 'delivered' | 'declined' | 'cancelled';
export interface CharacterOrder {
  id: string;
  owner: string;
  owner_name?: string;
  title: string;
  prompt: string;
  status: CharacterStatus;
  admin_note: string | null;
  image_path: string | null;
  charged_coins: number;
  refunded_coins: number;
  created_at: string;
  delivered_at: string | null;
}

/** 캐릭터 의뢰 값(서버 tama_character_write 의 price 와 같다 — 회귀가 대조) */
// 2026-10-08 아카데미 맞춤 디자인과 같은 100 → 2026-10-13 150(시트 전체를 그리는 가장 큰 일, 서버 20261013100000)
// 2026-10-21 관리자 코인 설정(`tama.character_order`)이 바꾼다 — 기본값 150, setCharacterPrice(model/economySync)
export let CHARACTER_PRICE = 150;
export function setCharacterPrice(price: number): void {
  CHARACTER_PRICE = price;
}
export const CHARACTER_BUCKET = 'tama-character';

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  tama_friends_read: { Args: Record<string, never>; Returns: FriendsData };
  tama_friend_pet: { Args: { p_friend: string }; Returns: FriendPet };
  tama_longest_pets: { Args: { p_mode: string }; Returns: unknown };
  tama_achievements: { Args: Record<string, never>; Returns: unknown };
  tama_achievement_claim: { Args: { p_id: string }; Returns: { id: string; granted: boolean; amount: number; coins: number | null } };
  tama_repeat_claim: { Args: { p_id: string }; Returns: { id: string; times: number; amount: number; coins: number | null } };
  tama_friend_pat: { Args: { p_friend: string }; Returns: { fresh: boolean } };
  tama_visits_take: { Args: Record<string, never>; Returns: { name: string; day: string }[] };
  tama_trade_write: { Args: { p_action: string; p_payload: Record<string, unknown> }; Returns: TamaTrade };
  tama_character_read: { Args: { p_scope: 'mine' | 'admin' }; Returns: unknown };
  tama_character_write: { Args: { p_action: string; p_payload: Record<string, unknown> }; Returns: CharacterOrder & { coins?: number; equipped?: string | null } };
  tama_event_write: { Args: { p_action: string; p_payload: Record<string, unknown> }; Returns: TamaEvent & { notified?: number } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const socialService = {
  friends: async () => unwrap(await db.rpc('tama_friends_read')),
  friendPet: async (id: string) => unwrap(await db.rpc('tama_friend_pet', { p_friend: id })),
  pat: async (id: string) => unwrap(await db.rpc('tama_friend_pat', { p_friend: id })),
  takeVisits: async () => unwrap(await db.rpc('tama_visits_take')),
  /** 오래 함께한 펫 순위(2026-10-19) — 학교 전체 · 모드별, 모르는 사람은 학년만 */
  longestPets: async (mode: PetMode) => parseLongestPets(unwrap(await db.rpc('tama_longest_pets', { p_mode: mode }))),
  /** 업적(2026-10-19) — 진행도는 서버가 센다 */
  achievements: async () => parseAchievements(unwrap(await db.rpc('tama_achievements'))),
  /** 업적 보상 — 서버가 다시 세서 달성이면 한 번만 */
  claimAchievement: async (id: string) => unwrap(await db.rpc('tama_achievement_claim', { p_id: id })),
  /** 반복 업적(2026-10-21) — 닿은 단계를 한꺼번에(단계마다 원장 한 줄) */
  claimRepeat: async (id: string) => unwrap(await db.rpc('tama_repeat_claim', { p_id: id })),
  trade: async (action: 'propose' | 'accept' | 'decline' | 'cancel', payload: Record<string, unknown>) =>
    unwrap(await db.rpc('tama_trade_write', { p_action: action, p_payload: payload })),
};

export const characterService = {
  mine: async () => unwrap(await db.rpc('tama_character_read', { p_scope: 'mine' })) as { orders: CharacterOrder[]; equipped: string | null },
  all: async () => unwrap(await db.rpc('tama_character_read', { p_scope: 'admin' })) as CharacterOrder[],
  write: async (action: 'submit' | 'cancel' | 'equip' | 'start' | 'decline' | 'deliver', payload: Record<string, unknown>) =>
    unwrap(await db.rpc('tama_character_write', { p_action: action, p_payload: payload })),
  /** 비공개 버킷 — 본인·관리자·(장착 중이면) 친구만 서명 URL 을 받는다 */
  signedUrl: async (path: string) => {
    const { data, error } = await supabase.storage.from(CHARACTER_BUCKET).createSignedUrl(path, 3600);
    if (error || !data) throw new Error(error?.message || '그림을 불러오지 못했어요.');
    return data.signedUrl;
  },
  /** 관리자 — 의뢰 폴더에 새 이름으로(덮어쓰지 않는다) */
  upload: async (orderId: string, file: Blob) => {
    const path = `${orderId}/${crypto.randomUUID()}.png`;
    const { error } = await supabase.storage.from(CHARACTER_BUCKET).upload(path, file, { contentType: 'image/png', upsert: false });
    if (error) throw new Error(error.message);
    return path;
  },
  removeUnused: async (path: string) => { await supabase.storage.from(CHARACTER_BUCKET).remove([path]); },
};

export const eventService = {
  list: async () => {
    const { data, error } = await supabase.from('tama_event' as never).select('*').order('starts_at', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as TamaEvent[];
  },
  save: async (payload: Record<string, unknown>) => unwrap(await db.rpc('tama_event_write', { p_action: 'save', p_payload: payload })),
  remove: async (id: string) => unwrap(await db.rpc('tama_event_write', { p_action: 'delete', p_payload: { id } })),
};
