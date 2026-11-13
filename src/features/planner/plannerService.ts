import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { DormState } from '@/features/academy/game/dormitoryService';

// Both interfaces use the same records and server-side ownership/reward rules.
type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  academy_dormitory_read: { Args: { p_date: string; p_student_code: string | null }; Returns: DormState };
  academy_dormitory_write: { Args: { p_action: string; p_payload: Record<string, unknown> }; Returns: { reward?: number; id?: string } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

export async function fetchPlanner(date: string, studentCode: string | null = null) {
  const { data, error } = await db.rpc('academy_dormitory_read', { p_date: date, p_student_code: studentCode });
  if (error || !data) throw new Error('계획을 불러오지 못했습니다. 다시 시도해 주세요.');
  return { ...data, tasks: data.tasks.map(task => ({
    ...task,
    start_time: task.start_time?.slice(0, 5) ?? null,
    end_time: task.end_time?.slice(0, 5) ?? null,
  })) };
}

export async function writePlanner(action: string, payload: Record<string, unknown>) {
  const { data, error } = await db.rpc('academy_dormitory_write', { p_action: action, p_payload: payload });
  if (error) throw new Error(error.message || '저장하지 못했습니다. 다시 시도해 주세요.');
  return data;
}
