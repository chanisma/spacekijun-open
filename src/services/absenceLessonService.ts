// ========================================
// 결강 처리 — 조회 · 알림
//
// 판정은 `src/lib/absenceLessons.ts` 가 하고 여기는 DB 왕복만 한다.
//
// ⚠ 남에게 보내는 알림은 `.select()` 를 붙이지 않는다 — notification_events 의 SELECT 정책이
//    "내 것만" 이라 `INSERT ... RETURNING` 이 42501 로 전체 롤백된다(2026-09-17 실측).
// ========================================

import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import type { ClassSwap } from '@/types/classSwap';
import { periodsInWindow, type AbsenceWindow } from '@/lib/absenceLessons';
import { fetchEffectiveTeacherTimetable } from '@/services/timetableOverrideService';

export const ABSENCE_NOTIFICATION_TYPE = 'absence_lessons';

/** 결강 처리 모달의 쿼리 키 — `['class-swaps']` 접두라 교체 mutation 이 함께 무효화한다 */
export const absenceSwapsQueryKey = (resourceId: string | null | undefined, date: string | undefined) =>
  ['class-swaps', 'absence', resourceId ?? null, date ?? null] as const;

/** 내가 요청자이고 그날 내 수업을 비우는 교체/대체 전부(상태 무관) */
export async function fetchMySwapsOnDate(resourceId: string, date: string): Promise<ClassSwap[]> {
  const { data, error } = await supabase
    .from('class_swap')
    .select('*')
    .eq('requester_resource_id', resourceId)
    .eq('requester_swap_date', date)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  // meta 는 DB 타입상 Json 이다 — ClassSwapMeta 로 좁히는 것은 기존 교체 목록과 같은 규약
  return (data ?? []) as unknown as ClassSwap[];
}

/**
 * 이 결강 일정에서 보낸 요청 중 아직 살아 있는 것(대기·승인).
 * 일정을 지울 때 "무엇이 남는지" 를 말하려고 쓴다.
 */
export async function fetchActiveSwapsForAbsence(
  meetingId: string,
  resourceId: string
): Promise<ClassSwap[]> {
  const { data, error } = await supabase
    .from('class_swap')
    .select('*')
    .eq('requester_resource_id', resourceId)
    .eq('meta->>absence_meeting_id', meetingId)
    .in('status', ['pending', 'approved']);
  if (error) throw error;
  return (data ?? []) as unknown as ClassSwap[];
}

export interface AbsenceMeetingRow {
  id: string;
  kind: string;
  title: string;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
  date_only?: boolean;
  assignee?: unknown;
}

export async function fetchAbsenceMeeting(meetingId: string): Promise<AbsenceMeetingRow | null> {
  const { data, error } = await supabase
    .from('meeting')
    .select('id, kind, starts_at, ends_at, created_by, meta')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  return {
    id: data.id,
    kind: data.kind,
    title: typeof meta.title === 'string' ? meta.title : '',
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    created_by: (data as { created_by?: string | null }).created_by ?? null,
    date_only: meta.date_only === true,
    assignee: meta.assignee,
  };
}

export interface NotifyAbsenceArgs {
  meetingId: string;
  title: string;
  window: AbsenceWindow;
  /** 출장 대상자 resource.id (나 포함 가능 — 내부에서 뺀다) */
  participantIds: string[];
  excludeResourceId?: string | null;
  term: { year: number; semester: number };
}

/**
 * 출장 대상자 중 **그 시간에 수업이 있는 선생님**에게 결강 처리 알림을 보낸다.
 *
 * 등록한 사람이 남의 수업을 대신 처리할 수는 없다 — `class_swap` 의 요청자는 본인이어야 한다.
 * 그래서 각자에게 알리고, 알림을 누르면 자기 수업만 보이는 같은 모달이 열린다.
 * 수업이 없는 대상자에게는 보내지 않는다(할 일이 없는 알림은 소음이다).
 *
 * 실패를 삼키지 않고 돌려준다 — 호출부가 "일정은 만들었는데 알림이 안 갔다" 를 말할 수 있게.
 */
export async function notifyAbsenceParticipants({
  meetingId,
  title,
  window,
  participantIds,
  excludeResourceId,
  term,
}: NotifyAbsenceArgs): Promise<{ sent: number; ok: boolean; error?: string }> {
  const ids = [...new Set(participantIds.filter((id) => id && id !== excludeResourceId))];
  const periods = periodsInWindow(window);
  if (ids.length === 0 || periods.length === 0) return { sent: 0, ok: true };

  // 그날 실제로 들어가는 수업 — 운영 시간표(시험·수능 대비 등)가 있으면 그것으로
  let slots: { teacher_resource_id: string | null; period: number }[];
  try {
    const periodSet = new Set(periods);
    const idSet = new Set(ids);
    slots = (
      await fetchEffectiveTeacherTimetable({ year: term.year, semester: term.semester, from: window.date, to: window.date })
    ).filter((s) => s.day_of_week === window.weekday && periodSet.has(s.period) && !!s.teacher_resource_id && idSet.has(s.teacher_resource_id));
  } catch (e) {
    return { sent: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const countByTeacher = new Map<string, Set<number>>();
  for (const slot of slots ?? []) {
    if (!slot.teacher_resource_id) continue;
    const set = countByTeacher.get(slot.teacher_resource_id) ?? new Set<number>();
    set.add(slot.period);
    countByTeacher.set(slot.teacher_resource_id, set);
  }
  if (countByTeacher.size === 0) return { sent: 0, ok: true };

  const day = format(new Date(`${window.date}T00:00:00`), 'M월 d일(E)', { locale: ko });
  const rows = [...countByTeacher.entries()].map(([resourceId, set]) => ({
    type: ABSENCE_NOTIFICATION_TYPE,
    title: '출장 시간에 수업이 있습니다',
    message: `${title ? `"${title}" ` : ''}출장(${day}) 시간에 수업 ${set.size}개가 겹칩니다.\n교체나 대체를 요청해 주세요.`,
    resource_id: resourceId,
    // meeting FK 라 일정 id 를 그대로 넣을 수 있다
    related_meeting_id: meetingId,
    meta: { meeting_id: meetingId, absence_date: window.date, periods: [...set].sort((a, b) => a - b) },
    is_read: false,
  }));

  const { error } = await supabase.from('notification_events').insert(rows);
  if (error) return { sent: 0, ok: false, error: error.message };
  return { sent: rows.length, ok: true };
}
