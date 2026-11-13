import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { FocusRecord } from './pomodoroModel';

type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  planner_focus_read: { Args: { p_date: string }; Returns: FocusRecord[] };
  planner_focus_record: { Args: { p_record: FocusRecord }; Returns: FocusRecord };
} } };
const db = supabase as unknown as SupabaseClient<Database>;

export async function fetchFocusRecords(date: string) {
  const { data, error } = await db.rpc('planner_focus_read', { p_date: date });
  if (error) throw new Error('집중 기록을 불러오지 못했습니다. 다시 시도해 주세요.');
  return data ?? [];
}

export async function saveFocusRecord(record: FocusRecord) {
  const { data, error } = await db.rpc('planner_focus_record', { p_record: record });
  if (error || !data) throw new Error('집중 기록을 저장하지 못했습니다. 기록을 유지하고 있으니 다시 시도해 주세요.');
  return data;
}
