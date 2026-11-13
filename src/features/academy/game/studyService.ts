import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface StudyEntry {
  id: string; day: string; room: string; period: string; start_time: string | null; end_time: string | null;
  minutes: number | null; attendance: 'attended' | 'excused' | 'supplement' | 'pending'; eligible: boolean; claimed: boolean;
}
export interface StudyState {
  week: string; today: string; first_week: string; latest_week: string; coins: number; entries: StudyEntry[]; claimed_coins: number;
  /** 받을 수 있는 가장 이른 주(2026-10-13 — 지난주까지만). 없으면(옛 서버) 기한 없음 */
  claim_from?: string;
}

/** 하루 최대 영수증(= +10코인, 2026-10-13 사용자 지시) — 서버 on_attendance · study_claim 의 «2» 와 같다 */
export let STUDY_DAILY_CAP = 2;
/** 출석 1회 코인(기본 5) — 관리자 코인 설정 `study.attendance_reward` */
export let STUDY_REWARD = 5;
/** 관리자 코인 설정 반영(game/economySync) */
export function setStudyEconomy(reward: number, dailyCap: number): void {
  STUDY_REWARD = reward;
  STUDY_DAILY_CAP = dailyCap;
}

/**
 * 이 주에서 지금 받을 수 있는 회차 — 서버 규칙을 그대로 따라 센다(화면이 «받기» 숫자를 부풀리지 않게):
 *   기한(claim_from 보다 이른 주는 못 받음) · 하루 최대 STUDY_DAILY_CAP(이미 받은 것 포함) · 같은 날은 예약 id 순서(서버 row_number order by id).
 */
export function studyClaimable(state: Pick<StudyState, 'week' | 'claim_from' | 'entries'>) {
  const expired = !!state.claim_from && state.week < state.claim_from;
  const claimable = new Set<string>();
  const capped = new Set<string>();
  const days = new Map<string, StudyEntry[]>();
  for (const e of state.entries) if (e.eligible) days.set(e.day, [...(days.get(e.day) ?? []), e]);
  for (const list of days.values()) {
    let room = Math.max(0, STUDY_DAILY_CAP - list.filter((e) => e.claimed).length);
    for (const e of list.filter((x) => !x.claimed).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      if (room > 0) { room -= 1; if (!expired) claimable.add(e.id); } else capped.add(e.id);
    }
  }
  return { expired, claimable, capped };
}
type Database = { public: { Tables: Record<string, never>; Views: Record<string, never>; Functions: {
  academy_study_read: { Args: { p_week: string | null; p_student_code: string | null }; Returns: StudyState };
  academy_study_claim: { Args: { p_week: string }; Returns: { count: number; reward: number; coins: number } };
} } };
const db = supabase as unknown as SupabaseClient<Database>;
export async function fetchStudy(week: string | null, studentCode: string | null) {
  const { data, error } = await db.rpc('academy_study_read', { p_week: week, p_student_code: studentCode });
  if (error || !data) throw new Error(error?.message || '자습 기록을 펼치지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function claimStudy(week: string) {
  const { data, error } = await db.rpc('academy_study_claim', { p_week: week });
  if (error || !data) throw new Error(error?.message || '보상을 받지 못했어요. 다시 시도해 주세요.');
  return data;
}
