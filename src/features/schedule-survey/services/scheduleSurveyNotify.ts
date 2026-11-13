// ========================================
// 일정 설문 알림
//
// ⚠ notification_events.related_meeting_id 는 meeting FK다 — 설문 id를 넣으면 FK 위반이다.
//    설문 id는 meta.survey_id 에 담고 이동은 notificationNavigation 이 맡는다.
//
// ⚠⚠ 남에게 보내는 알림은 `.select()` 를 붙이면 안 된다 (2026-09-17 실측).
//    notification_events 의 INSERT 정책은 `with check (true)` 라 누구에게든 넣을 수 있지만,
//    SELECT 정책은 `owns_notification_resource(resource_id)` 라 **내 것만** 읽힌다.
//    PostgreSQL 은 `INSERT ... RETURNING` 에 SELECT 정책을 추가로 적용하므로,
//    `.insert(rows).select('id')` 는 행이 정상적으로 들어가고도
//    `42501 new row violates row-level security policy` 로 **전체가 롤백된다**.
//    실측: RETURNING 없음 = 성공 / RETURNING 있음 = 42501.
//    그래서 여기서는 반환을 요구하지 않는다 — 한 문장이라 오류가 없으면 전부 들어간 것이다.
//    (같은 이유로 기존 NotificationService.createNotification 도 .select() 를 쓰지 않는다)
// ========================================

import { supabase } from '@/integrations/supabase/client';

export type ScheduleSurveyNotificationType =
  | 'schedule_survey_requested'
  | 'schedule_survey_closed';

interface NotifyArgs {
  type: ScheduleSurveyNotificationType;
  surveyId: string;
  surveyTitle: string;
  /** 받는 사람 resource.id */
  resourceIds: string[];
  title: string;
  message: string;
}

export interface NotifyResult {
  sent: number;
  ok: boolean;
  error?: string;
}

/**
 * 대상자 전원에게 알림을 넣는다.
 *
 * 실패를 삼키지 않고 돌려준다 — 호출부가 "설문은 만들어졌는데 알림이 안 갔다"를
 * 화면에서 말할 수 있어야 한다(알림은 실패해도 조용하다).
 */
export async function notifySurveyTargets({
  type,
  surveyId,
  surveyTitle,
  resourceIds,
  title,
  message,
}: NotifyArgs): Promise<NotifyResult> {
  const unique = [...new Set(resourceIds.filter(Boolean))];
  if (unique.length === 0) return { sent: 0, ok: true };

  const rows = unique.map((resourceId) => ({
    type,
    title,
    message,
    resource_id: resourceId,
    is_read: false,
    meta: { survey_id: surveyId, survey_title: surveyTitle },
  }));

  // ⚠ .select() 금지 — 위 주석 참고
  const { error } = await supabase.from('notification_events').insert(rows);

  if (error) {
    console.error('일정 설문 알림 발송 실패:', error);
    return { sent: 0, ok: false, error: error.message };
  }
  return { sent: unique.length, ok: true };
}
