// ========================================
// 창체 알림 (Phase 3)
//
// 소통 루프 A를 닫는 세 통이다. 하나라도 없으면 루프가 끊긴다:
//   ① 성찰 요청  교사 → 참여 학생   (없으면 학생은 이 기능의 존재를 모른다)
//   ② 성찰 도착  학생 → 담당 교사   (없으면 교사가 답할 계기가 없다)
//   ③ 피드백 도착 교사 → 작성 학생  (없으면 학생이 답을 못 본다)
//
// **수신자는 `resource.id`다.** `notification_events.resource_id`가 그 컬럼이고,
// 학생 수신은 `20260828100000`에서 정책을 넓혀 실제로 도달하게 만들었다
// (그 전에는 학생 630명 중 618명이 자기 알림을 못 봤다).
//
// `related_meeting_id`는 meeting FK라 쓸 수 없다 — 활동 id는 `meta.activity_id`에
// 담고, 알림 클릭은 `/activities?activity=<id>` 딥링크로 연결한다.
// ========================================

import { supabase } from '@/integrations/supabase/client';

export const ACTIVITY_NOTIFICATION_TYPES = {
  reflectionRequested: 'activity_reflection_requested',
  reflectionPosted: 'activity_reflection_posted',
  feedbackReceived: 'activity_feedback_received',
} as const;

/**
 * 알림 meta — 활동 딥링크에 쓰인다.
 *
 * **`interface`가 아니라 `type`이어야 한다.** generated types의 `meta`는 `Json`인데,
 * interface는 암묵적 인덱스 시그니처가 없어 `Json`에 대입되지 않는다(TS2769).
 */
type ActivityNotificationMeta = {
  activity_id: string;
  activity_name: string;
};

interface NotifyRow {
  type: string;
  title: string;
  message: string;
  resource_id: string;
  priority?: 'low' | 'medium' | 'high';
  meta: ActivityNotificationMeta;
}

/**
 * 알림 발송은 **실패해도 본 작업을 되돌리지 않는다.**
 * 성찰이 저장됐는데 알림이 안 갔다고 성찰을 지우는 것은 말이 안 된다.
 */
async function send(rows: NotifyRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('notification_events').insert(
    rows.map((r) => ({
      type: r.type,
      title: r.title,
      message: r.message,
      resource_id: r.resource_id,
      priority: r.priority ?? 'low',
      meta: r.meta,
      is_read: false,
    }))
  );
  if (error) console.error('창체 알림 발송 실패:', error);
}

/** ① 성찰 요청 — 참여 학생 전원에게 */
export async function notifyReflectionRequested(payload: {
  activityId: string;
  activityName: string;
  studentResourceIds: string[];
}): Promise<number> {
  const targets = [...new Set(payload.studentResourceIds.filter(Boolean))];
  await send(
    targets.map((resourceId) => ({
      type: ACTIVITY_NOTIFICATION_TYPES.reflectionRequested,
      title: '성찰을 남겨 주세요',
      message: `'${payload.activityName}' 활동에서 무엇을 해봤고 무엇을 알게 됐는지 적어 주세요.`,
      resource_id: resourceId,
      priority: 'medium' as const,
      meta: { activity_id: payload.activityId, activity_name: payload.activityName },
    }))
  );
  return targets.length;
}

/** ② 성찰 도착 — 담당 교사에게 (교사가 답할 계기) */
export async function notifyReflectionPosted(payload: {
  activityId: string;
  activityName: string;
  teacherResourceIds: string[];
  studentName: string | null;
}): Promise<void> {
  const targets = [...new Set(payload.teacherResourceIds.filter(Boolean))];
  await send(
    targets.map((resourceId) => ({
      type: ACTIVITY_NOTIFICATION_TYPES.reflectionPosted,
      title: '성찰이 도착했습니다',
      message: `${payload.studentName ?? '학생'} · '${payload.activityName}'`,
      resource_id: resourceId,
      priority: 'low' as const,
      meta: { activity_id: payload.activityId, activity_name: payload.activityName },
    }))
  );
}

/** ③ 피드백 도착 — 성찰을 쓴 학생에게 */
export async function notifyFeedbackReceived(payload: {
  activityId: string;
  activityName: string;
  studentResourceId: string;
}): Promise<void> {
  if (!payload.studentResourceId) return;
  await send([
    {
      type: ACTIVITY_NOTIFICATION_TYPES.feedbackReceived,
      title: '선생님이 답을 남겼습니다',
      message: `'${payload.activityName}' 활동에 남긴 성찰에 피드백이 달렸습니다.`,
      resource_id: payload.studentResourceId,
      priority: 'medium',
      meta: { activity_id: payload.activityId, activity_name: payload.activityName },
    },
  ]);
}

/** 학생코드 → resource.id. 알림 수신자는 resource.id다. */
export async function resolveStudentResourceIds(
  studentCodes: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(studentCodes.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from('resource')
    .select('id, meta')
    .eq('type', 'student')
    .in('meta->>id', unique);
  if (error) {
    console.error('학생 리소스 조회 실패:', error);
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const code = (row.meta as Record<string, unknown> | null)?.id;
    if (typeof code === 'string') map.set(code, row.id);
  }
  return map;
}
