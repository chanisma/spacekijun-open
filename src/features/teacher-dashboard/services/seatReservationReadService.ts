import { supabase } from '@/integrations/supabase/client';
import type {
  SeatAttendanceStatus,
  SeatReservationReadRow,
  StudyRoomReadRow,
} from '../types';

function normalizeAttendanceStatus(value: unknown): SeatAttendanceStatus {
  return value === 'attended' || value === 'excused' || value === 'supplement'
    ? value
    : null;
}

/**
 * seaton과 공유하는 테이블의 홈 대시보드 전용 읽기 함수입니다.
 * 학생 식별자, 좌석 번호, 확인 교사, 피드백은 의도적으로 조회하지 않습니다.
 *
 * 2026-10-09: 표를 직접 읽지 않고 RPC `seaton_day_attendance_rows`(교직원)로 읽는다.
 * seat_reservations 의 «로그인한 누구나 전체 읽기» 정책을 걷어 내면 직원은 표에서 0행을 받기 때문이다
 * (supabase/migrations/20261009110000 · docs/database/seaton-contract.md).
 */
export async function readSeatReservationOverviewRows(date: string): Promise<{
  reservations: SeatReservationReadRow[];
  rooms: StudyRoomReadRow[];
}> {
  const [reservationResult, roomResult] = await Promise.all([
    // 생성 타입에 아직 없는 RPC — 반환 행 모양은 예전 select 세 칸 그대로
    (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{
      data: Array<{ room_id: string; is_attended: boolean | null; attendance_status: string | null }> | null;
      error: { message: string } | null;
    }>)('seaton_day_attendance_rows', { p_date: date }),
    supabase
      .from('study_rooms')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  if (reservationResult.error) throw reservationResult.error;
  if (roomResult.error) throw roomResult.error;

  const reservations = (reservationResult.data ?? []).map((row) => ({
    room_id: String(row.room_id),
    is_attended: Boolean(row.is_attended),
    attendance_status: normalizeAttendanceStatus(row.attendance_status),
  }));
  const rooms = (roomResult.data ?? []).map((room) => ({
    id: String(room.id),
    name: String(room.name),
  }));

  return { reservations, rooms };
}
