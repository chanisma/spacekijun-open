/**
 * 펫 저장소 — 학생·교사·관리자는 서버(`tama_pet_*` RPC, 2026-10-07 교사 추가), 그 밖은 이 기기에만(«체험 모드»).
 *
 * 서버 RPC 는 학생·교사·관리자만 받는다(직원이 부르면 42501). 체험 모드는 화면이 그 사실을 글로 말한다
 * (저장이 조용히 실패하는 화면을 만들지 않는다).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { readStoredJson, writeStoredJson, removeStored } from '@/lib/safeLocalStorage';
import { parsePetState, type PetState } from '../model/petModel';
import type { PetCall } from '../model/petCall';

interface PetRow {
  id: string;
  name: string;
  state: unknown;
  version: number;
  created_at?: string;
  rested_at?: string | null;
  /** 이 펫이 입은 스킨(2026-10-14 — 스킨은 계정이 아니라 펫마다) */
  skin_order_id?: string | null;
  skin_item_id?: string | null;
  /** 창고에 둔 때(2026-10-26) — 칸을 차지하지 않고 시계가 멈춘다 */
  stored_at?: string | null;
}

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  tama_pet_read: { Args: Record<string, never>; Returns: { pet: PetRow | null; others?: PetRow[]; slots?: number; bought_slots?: number; next_slot_price?: number | null; server_now: number } };
  tama_pet_slot_buy: { Args: Record<string, never>; Returns: { bought_slots: number; slots: number; price: number; coins: number; next_price: number | null } };
  tama_pet_switch: { Args: { p_pet_id: string; p_state: PetState }; Returns: { pet: PetRow; server_now: number } };
  tama_pet_adopt: { Args: { p_name: string; p_state: PetState }; Returns: { pet: PetRow; server_now: number } };
  tama_pet_save: { Args: { p_pet_id: string; p_version: number; p_state: PetState }; Returns: { conflict: boolean; pet: PetRow; server_now: number } };
  tama_pet_rebirth: { Args: { p_pet_id: string; p_name: string; p_state: PetState }; Returns: { pet: PetRow; server_now: number } };
  tama_ticket_hatch: { Args: { p_ticket: string; p_name: string; p_state: PetState }; Returns: { pet: PetRow; server_now: number } };
  tama_storage_write: { Args: { p_action: 'store' | 'unstore' | 'abroad'; p_payload: Record<string, unknown> }; Returns: { ok: boolean; price?: number; coins?: number } };
  tama_pet_schedule_call: { Args: { p_pet_id: string; p_at: string | null; p_reason: string | null }; Returns: { ok: boolean } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

export interface StoredPet {
  id: string;
  version: number;
  state: PetState;
}

export interface PetLoad {
  pet: StoredPet | null;
  /** 서버 시각 − 기기 시각 (ms). 체험 모드는 0. */
  clockOffset: number;
  /** 쉬고 있는 펫(Phase 6 — 시간이 멈춰 있다) */
  others?: RestingPet[];
  /** 펫 자리 수(서버 tama_private.pet_slots — 얻은 자리 + 산 자리) */
  slots?: number;
  /** 산 자리 · 다음 자리 값(null = 더 못 산다) — 2026-10-13 */
  boughtSlots?: number;
  nextSlotPrice?: number | null;
  /** 지금 펫을 맞은 때 — 자리 계산용 */
  primaryCreatedAt?: string;
}

/**
 * 펫 한 마리가 입은 캐릭터 스킨(2026-10-14) — 의뢰 캐릭터(orderId)가 가챠 캐릭터(itemId)보다 앞선다.
 * 서버 정본 = tama_pet.skin_order_id · skin_item_id. 입히기·벗기기는 «함께하는 펫»의 칸을 바꾼다.
 */
export interface PetSkin { orderId: string | null; itemId: string | null }
export const NO_SKIN: PetSkin = { orderId: null, itemId: null };
const skinOf = (row: PetRow): PetSkin => ({ orderId: row.skin_order_id ?? null, itemId: row.skin_item_id ?? null });

export interface RestingPet extends StoredPet {
  name: string;
  createdAt: string;
  restedAt: string | null;
  skin: PetSkin;
  /** 창고에 있으면 그때(2026-10-26) */
  storedAt: string | null;
}

export interface PetStore {
  mode: 'server' | 'demo';
  load(): Promise<PetLoad>;
  adopt(state: PetState): Promise<PetLoad>;
  save(pet: StoredPet): Promise<{ pet: StoredPet; conflict: boolean; clockOffset: number }>;
  /** 쉬던 펫과 함께하기(Phase 6) — state 는 시계를 지금으로 옮긴 것(restPetState). 체험 모드에는 없다(펫이 하나뿐). */
  switchTo?(petId: string, state: PetState): Promise<{ pet: StoredPet; clockOffset: number }>;
  /**
   * 별이 된 펫 자리에 새 알(죽음 옵션 — 2026-10-19). 같은 자리(행)를 새 알로 바꾼다 — 서버가 «정말 별이 됐는가»를 확인한다.
   * 체험 모드는 알 받기와 같다(펫이 하나뿐이다).
   */
  rebirth(petId: string, state: PetState): Promise<PetLoad>;
  /** 펫 자리 사기(2026-10-13). 체험 모드에는 없다 */
  buySlot?(): Promise<{ slots: number; price: number; coins: number }>;
  /** 통신으로 받은 알 표를 칸의 새 알로 깨운다(2026-10-26). 체험 모드에는 없다 */
  hatchTicket?(ticketId: string, state: PetState): Promise<PetLoad>;
  /** 창고(2026-10-26) — store(칸 → 창고, 코인) · unstore(창고 → 칸, state = 시계를 옮긴 상태) · abroad(유학 — 되돌릴 수 없다) */
  storage?(action: 'store' | 'unstore' | 'abroad', petId: string, state?: PetState): Promise<{ price?: number; coins?: number }>;
  /** 탭을 닫아도 부르기(Phase 4) — 다음 부름을 서버에 맡긴다. null = 취소. 체험 모드에는 없다(부를 서버가 없다). */
  scheduleCall?(petId: string, call: PetCall | null): Promise<void>;
}

const toStored = (row: PetRow): StoredPet | null => {
  const state = parsePetState(row.state);
  return state ? { id: row.id, version: row.version, state } : null;
};

export const serverPetStore: PetStore = {
  mode: 'server',
  async load() {
    const sentAt = Date.now();
    const { data, error } = await db.rpc('tama_pet_read');
    if (error || !data) throw new Error(error?.message || '펫을 불러오지 못했어요.');
    const latency = (Date.now() - sentAt) / 2;
    const others = (data.others ?? []).flatMap((r): RestingPet[] => {
      const s = toStored(r);
      return s ? [{ ...s, name: r.name, createdAt: r.created_at ?? '', restedAt: r.rested_at ?? null, skin: skinOf(r), storedAt: r.stored_at ?? null }] : [];
    });
    return {
      pet: data.pet ? toStored(data.pet) : null, clockOffset: data.server_now - (Date.now() - latency),
      others, slots: data.slots ?? 1, primaryCreatedAt: data.pet?.created_at,
      boughtSlots: data.bought_slots ?? 0, nextSlotPrice: data.next_slot_price ?? null,
    };
  },
  async buySlot() {
    const { data, error } = await db.rpc('tama_pet_slot_buy');
    if (error || !data) throw new Error(error?.message || '펫 자리를 사지 못했어요.');
    return { slots: data.slots, price: data.price, coins: data.coins };
  },
  async switchTo(petId, state) {
    const { data, error } = await db.rpc('tama_pet_switch', { p_pet_id: petId, p_state: state });
    if (error || !data) throw new Error(error?.message || '펫을 데려오지 못했어요.');
    const stored = toStored(data.pet);
    if (!stored) throw new Error('펫 정보가 올바르지 않아요.');
    return { pet: stored, clockOffset: data.server_now - Date.now() };
  },
  async adopt(state) {
    const { data, error } = await db.rpc('tama_pet_adopt', { p_name: state.name, p_state: state });
    if (error || !data) throw new Error(error?.message || '알을 받지 못했어요.');
    return { pet: toStored(data.pet), clockOffset: data.server_now - Date.now() };
  },
  async rebirth(petId, state) {
    const { data, error } = await db.rpc('tama_pet_rebirth', { p_pet_id: petId, p_name: state.name, p_state: state });
    if (error || !data) throw new Error(error?.message || '새 알을 받지 못했어요.');
    return { pet: toStored(data.pet), clockOffset: data.server_now - Date.now() };
  },
  async hatchTicket(ticketId, state) {
    const { data, error } = await db.rpc('tama_ticket_hatch', { p_ticket: ticketId, p_name: state.name, p_state: state });
    if (error || !data) throw new Error(error?.message || '알을 깨우지 못했어요.');
    return { pet: toStored(data.pet), clockOffset: data.server_now - Date.now() };
  },
  async storage(action, petId, state) {
    const { data, error } = await db.rpc('tama_storage_write', { p_action: action, p_payload: state ? { pet_id: petId, state } : { pet_id: petId } });
    if (error || !data) throw new Error(error?.message || '처리하지 못했어요.');
    return { price: data.price, coins: data.coins };
  },
  async save(pet) {
    const { data, error } = await db.rpc('tama_pet_save', { p_pet_id: pet.id, p_version: pet.version, p_state: pet.state });
    if (error || !data) throw new Error(error?.message || '저장하지 못했어요.');
    const stored = toStored(data.pet);
    if (!stored) throw new Error('저장된 펫 정보가 올바르지 않아요.');
    return { pet: stored, conflict: data.conflict, clockOffset: data.server_now - Date.now() };
  },
  async scheduleCall(petId, call) {
    const { error } = await db.rpc('tama_pet_schedule_call', {
      p_pet_id: petId,
      p_at: call ? new Date(call.atMs).toISOString() : null,
      p_reason: call?.reason ?? null,
    });
    if (error) throw new Error(error.message);
  },
};

const DEMO_KEY = 'tamagotchi:demo:v1';
const isDemo = (v: unknown): v is StoredPet => !!v && typeof v === 'object' && parsePetState((v as StoredPet).state) !== null;

export const demoPetStore: PetStore = {
  mode: 'demo',
  async load() {
    const stored = readStoredJson<StoredPet | null>(DEMO_KEY, null, (v): v is StoredPet | null => v === null || isDemo(v));
    return { pet: stored ? { ...stored, state: parsePetState(stored.state)! } : null, clockOffset: 0 };
  },
  async adopt(state) {
    const pet = { id: 'demo', version: 1, state };
    writeStoredJson(DEMO_KEY, pet);
    return { pet, clockOffset: 0 };
  },
  async rebirth(_petId, state) {
    return demoPetStore.adopt(state);
  },
  async save(pet) {
    const next = { ...pet, version: pet.version + 1 };
    writeStoredJson(DEMO_KEY, next);
    return { pet: next, conflict: false, clockOffset: 0 };
  },
};

export const clearDemoPet = () => removeStored(DEMO_KEY);
