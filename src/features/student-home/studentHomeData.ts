import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';

type Client = SupabaseClient<Database>;
type Round = Database['public']['Tables']['course_selection_round']['Row'];
export type HomeRound = Pick<Round, 'id' | 'title' | 'round_number' | 'status' | 'target_grade' | 'admission_year' | 'opens_at' | 'closes_at'>;
export interface StudentScope {
  studentCode: string;
  grade: number | null;
  admissionYear: number | null;
}

export function upcomingStudentRounds(rounds: HomeRound[], scope: StudentScope, now: Date) {
  if (!scope.studentCode) return [];
  return rounds.filter((round) => {
    if (round.status !== 'open') return false;
    if (round.admission_year != null) {
      if (scope.admissionYear !== round.admission_year) return false;
    } else if (round.target_grade != null && scope.grade !== round.target_grade) {
      return false;
    }
    const open = round.opens_at ? Date.parse(round.opens_at) : null;
    const close = round.closes_at ? Date.parse(round.closes_at) : null;
    if (open !== null && !Number.isFinite(open)) return false;
    if (close !== null && (!Number.isFinite(close) || close < now.getTime())) return false;
    return open === null || close === null || open <= close;
  }).sort((a, b) => (
    (a.closes_at ? Date.parse(a.closes_at) : Infinity) - (b.closes_at ? Date.parse(b.closes_at) : Infinity)
    || a.round_number - b.round_number
  ));
}

export async function readStudentCourseHome(client: Client, scope: StudentScope) {
  if (!scope.studentCode) throw new Error('학생 정보가 필요합니다.');
  const { data, error } = await client.from('course_selection_round')
    .select('id, title, round_number, status, target_grade, admission_year, opens_at, closes_at')
    .eq('status', 'open');
  if (error) throw error;
  const rounds = upcomingStudentRounds(data ?? [], scope, new Date());
  if (rounds.length === 0) return { rounds, savedRoundIds: [] as string[] };
  const result = await client.from('course_selection_submission')
    .select('round_id').eq('student_code', scope.studentCode)
    .in('round_id', rounds.map((round) => round.id));
  if (result.error) throw result.error;
  // Saving one group creates a submission row; it does not prove completion.
  return { rounds, savedRoundIds: (result.data ?? []).map((row) => row.round_id) };
}

export async function readStudentSeatHome(client: Client, profileId: string, start: string, end: string) {
  if (!profileId) throw new Error('학생 계정 연결이 필요합니다.');
  const { data, error } = await client.from('seat_reservations')
    .select('id, reservation_date, seat_number, period_id, study_rooms(name, operating_periods)')
    .eq('student_id', profileId).gte('reservation_date', start).lte('reservation_date', end)
    .order('reservation_date').order('period_id', { nullsFirst: true }).order('id').limit(7);
  if (error) throw error;
  return data ?? [];
}

export function reservationPeriodLabel(periodId: number | null, periods: Json | undefined) {
  if (periodId === null) return '교시 구분 없음';
  if (Array.isArray(periods)) {
    const period = periods.find((value) => value && typeof value === 'object' && !Array.isArray(value) && value.id === periodId);
    if (period && typeof period === 'object' && !Array.isArray(period)) {
      const name = typeof period.name === 'string' ? period.name : `${periodId}교시`;
      const start = typeof period.start_time === 'string' ? period.start_time : null;
      const end = typeof period.end_time === 'string' ? period.end_time : null;
      return start && end ? `${name} · ${start}–${end}` : name;
    }
  }
  return `${periodId}교시`;
}

type PurchasePage = Database['public']['Tables']['purchase_request_pages']['Row'];
export type HomePurchasePage = Pick<PurchasePage, 'id' | 'title' | 'description' | 'target_roles' | 'is_archived' | 'period_start' | 'period_end'>;

export function activeStudentPurchasePages(pages: HomePurchasePage[], now: Date) {
  return pages.filter((page) => !page.is_archived && page.target_roles.includes('student')
    && Date.parse(page.period_start) <= now.getTime() && Date.parse(page.period_end) >= now.getTime());
}

export async function readStudentPurchaseHome(client: Client) {
  const now = new Date();
  const { data, error } = await client.from('purchase_request_pages')
    .select('id, title, description, target_roles, is_archived, period_start, period_end')
    .contains('target_roles', ['student']).eq('is_archived', false)
    .lte('period_start', now.toISOString()).gte('period_end', now.toISOString())
    .order('period_end');
  if (error) throw error;
  return activeStudentPurchasePages(data ?? [], now);
}

export interface HomeIpsiPost { id: string; title: string; url: string | null; date: string | null; kind: 'news' | 'video' }

export function parseHomeIpsiPosts(data: Json): HomeIpsiPost[] {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)) return [];
  return data.items.flatMap((row): HomeIpsiPost[] => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || typeof row.title !== 'string') return [];
    let url: string | null = null;
    try {
      const parsed = new URL(typeof row.url === 'string' ? row.url : '');
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed.href;
    } catch { /* Missing links fall back to the internal information page. */ }
    return [{ id: row.id, title: row.title, url, date: typeof row.sort_date === 'string' ? row.sort_date : null, kind: row.kind === 'video' ? 'video' : 'news' }];
  }).slice(0, 5);
}

export async function readStudentIpsiHome(client: Client) {
  const { data, error } = await client.rpc('get_ipsi_hub_feed', { p_type: 'all', p_limit: 5, p_offset: 0 });
  if (error) throw error;
  return parseHomeIpsiPosts(data);
}
