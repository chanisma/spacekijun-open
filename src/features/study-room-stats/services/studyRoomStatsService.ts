import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type {
  StatsFilters,
  StudentsResult,
  StudyRoomOption,
  SummaryResult,
  TemperatureResult,
  WeekdayResult,
} from '../types';

// seaton 과 공유하는 DB 의 통계 계약(supabase/migrations/20261009100000_seaton_stats_contract.sql).
// 생성 타입에 아직 없는 RPC 라 로컬 타입으로 감싼다(academy studyService 와 같은 방식).
type RangeArgs = {
  p_start: string;
  p_end: string;
  p_grade: number | null;
  p_room: string | null;
  p_include_future: boolean;
};

type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      seaton_stats_summary: { Args: RangeArgs; Returns: SummaryResult };
      seaton_stats_students: { Args: RangeArgs; Returns: StudentsResult };
      seaton_stats_weekday: { Args: RangeArgs; Returns: WeekdayResult };
      seaton_stats_temperature: { Args: { p_month: string | null; p_grade: number | null }; Returns: TemperatureResult };
    };
  };
};

const db = supabase as unknown as SupabaseClient<Database>;

function rangeArgs(f: StatsFilters): RangeArgs {
  return {
    p_start: f.start,
    p_end: f.end,
    p_grade: f.grade,
    p_room: f.room,
    p_include_future: f.includeFuture,
  };
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

export async function fetchSummary(f: StatsFilters): Promise<SummaryResult> {
  const { data, error } = await db.rpc('seaton_stats_summary', rangeArgs(f));
  if (error || !data) fail(error, '요약 통계를 불러오지 못했습니다.');
  return data;
}

export async function fetchStudents(f: StatsFilters): Promise<StudentsResult> {
  const { data, error } = await db.rpc('seaton_stats_students', rangeArgs(f));
  if (error || !data) fail(error, '학생별 통계를 불러오지 못했습니다.');
  return data;
}

export async function fetchWeekday(f: StatsFilters): Promise<WeekdayResult> {
  const { data, error } = await db.rpc('seaton_stats_weekday', rangeArgs(f));
  if (error || !data) fail(error, '요일별 통계를 불러오지 못했습니다.');
  return data;
}

export async function fetchTemperature(month: string | null, grade: number | null): Promise<TemperatureResult> {
  const { data, error } = await db.rpc('seaton_stats_temperature', { p_month: month, p_grade: grade });
  if (error || !data) fail(error, '온도 랭킹을 불러오지 못했습니다.');
  return data;
}

/** 열람실 필터 선택지 — 운영 중인 열람실만 */
export async function fetchStudyRooms(): Promise<StudyRoomOption[]> {
  const { data, error } = await supabase
    .from('study_rooms')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) fail(error, '열람실 목록을 불러오지 못했습니다.');
  return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name) }));
}
