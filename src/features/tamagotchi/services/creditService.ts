/**
 * 코인 · 펫 일기 · 함께 집중 — 서버 RPC 입구(`20261007110000_tamagotchi_credit.sql`).
 * 쓰기는 전부 RPC(원장·일기·집중 표에 쓰기 정책이 없다). 일기 목록만 RLS(본인 행)로 직접 읽는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { CreditKind, DiaryKind, FocusSession, LedgerRow } from '../model/credit';

export interface CreditStatus {
  coins: number;
  /** 치료제 외상(Phase 3) */
  debt?: number;
  /** 펫이 태어난 뒤 받은 코인 종류별 횟수 — 진화 가지 근거(Phase 3) */
  lifetime?: Partial<Record<CreditKind, number>>;
  rules: Record<CreditKind, { amount: number; cap: number; taken: number }>;
  planning_reward_today: boolean;
  recent: LedgerRow[];
  focus: FocusSession | null;
  server_now: number;
}

export interface DiaryEntry {
  id: string;
  kind: DiaryKind;
  body: string;
  prompt?: string | null;
  written_on: string;
  created_at: string;
}

export interface FocusFinish {
  outcome: 'running' | 'completed' | 'gave_up' | 'expired' | 'replaced';
  remaining?: number;
  credit: number;
  coins?: number;
  server_now: number;
}

type Database = { public: { Tables: {
  tama_diary: { Row: DiaryEntry & { owner: string }; Insert: never; Update: never; Relationships: [] };
}; Views: Record<string, never>; Functions: {
  tama_credit_read: { Args: Record<string, never>; Returns: CreditStatus };
  tama_diary_write: { Args: { p_kind: DiaryKind; p_body: string; p_prompt?: string | null }; Returns: { entry: DiaryEntry; credit: number; coins: number | null } };
  tama_diary_delete: { Args: { p_id: string }; Returns: { ok: boolean } };
  tama_focus_start: { Args: { p_minutes: number; p_task_id: string | null }; Returns: { focus: FocusSession; server_now: number } };
  tama_focus_finish: { Args: { p_id: string; p_give_up: boolean }; Returns: FocusFinish };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export const creditService = {
  read: async () => unwrap(await db.rpc('tama_credit_read')),
  diaryList: async (): Promise<DiaryEntry[]> => unwrap(await db.from('tama_diary')
    .select('id, kind, body, prompt, written_on, created_at').order('created_at', { ascending: false }).limit(60)) ?? [],
  diaryWrite: async (kind: DiaryKind, body: string, prompt: string | null = null) => unwrap(await db.rpc('tama_diary_write', { p_kind: kind, p_body: body, p_prompt: prompt })),
  diaryDelete: async (id: string) => unwrap(await db.rpc('tama_diary_delete', { p_id: id })),
  focusStart: async (minutes: number, taskId: string | null) => unwrap(await db.rpc('tama_focus_start', { p_minutes: minutes, p_task_id: taskId })),
  focusFinish: async (id: string, giveUp: boolean) => unwrap(await db.rpc('tama_focus_finish', { p_id: id, p_give_up: giveUp })),
};
