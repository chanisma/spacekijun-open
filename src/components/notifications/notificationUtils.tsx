import React from 'react';
import { AlarmClock, Bot, Calendar, CalendarClock, ClipboardList, Clock, Egg, Inbox, MessageSquareText, FileSignature, MapPin, MessageCircle, Newspaper, PenLine, Reply, ShoppingCart, Sparkles, Users, AlertTriangle } from 'lucide-react';

export const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'academy_workshop_submitted':
    case 'academy_workshop_delivered':
    case 'academy_workshop_declined':
    case 'academy_friend_request':
    case 'academy_friend_accepted':
    case 'academy_guestbook':
      return <Sparkles className="h-5 w-5 text-violet-500" />;
    case 'task_deadline':
      return <AlarmClock className="h-5 w-5 text-rose-500" />;
    case 'task_deadline_summary':
      return <AlarmClock className="h-5 w-5 text-amber-500" />;
    case 'schedule_created':
      return <Calendar className="h-5 w-5 text-green-500" />;
    case 'schedule_updated':
      return <Calendar className="h-5 w-5 text-blue-500" />;
    case 'schedule_cancelled':
      return <Calendar className="h-5 w-5 text-red-500" />;
    case 'training':
    case 'training_scheduled':
      return <MapPin className="h-5 w-5 text-pink-500" />;
    case 'duty':
    case 'duty_assigned':
      return <Clock className="h-5 w-5 text-orange-500" />;
    case 'manual':
      return <Users className="h-5 w-5 text-blue-500" />;
    // 쿨메신저에서 받은 쪽지 — 로컬 감시기가 넣는다
    case 'coolmessenger':
      return <MessageCircle className="h-5 w-5 text-sky-500" />;
    // SPACEKIJUN 안에서 보낸 답장 — send_notification_reply RPC 가 넣는다
    case 'direct_reply':
      return <Reply className="h-5 w-5 text-sky-500" />;
    // 창의적 체험활동 — 소통 루프 A(성찰 요청 → 성찰 도착 → 피드백 도착)
    case 'activity_reflection_requested':
      return <PenLine className="h-5 w-5 text-fuchsia-500" />;
    case 'activity_reflection_posted':
      return <Sparkles className="h-5 w-5 text-fuchsia-500" />;
    case 'activity_feedback_received':
      return <MessageCircle className="h-5 w-5 text-emerald-500" />;
    // 요즘 세상 — 관심 분야 새 소식(하루 1건, world_news_private.dispatch_picks)
    case 'world_news_pick':
      return <Newspaper className="h-5 w-5 text-violet-500" />;
    // 구매 신청 — 담당자(페이지 작성자·공동 작업자)가 받는다
    case 'purchase_request_submitted':
      return <ShoppingCart className="h-5 w-5 text-amber-500" />;
    // 전자서명 — 내 차례가 됐을 때(서명자) · 끝났을 때(요청자)
    case 'signature_request':
      return <FileSignature className="h-5 w-5 text-violet-500" />;
    // 할 일 작업 「입력 받기」 — 대상 규칙으로 고른 교직원에게
    case 'collect_input_requested':
      return <ClipboardList className="h-5 w-5 text-indigo-500" />;
    // 할 일 작업 「제출 받기」(2026-10-01)
    case 'submission_requested':
      return <Inbox className="h-5 w-5 text-indigo-500" />;
    // 자동화 업무 — 건너뜀·실패·확인 필요·서버 무응답(2026-10-23)
    case 'automation_issue':
      return <CalendarClock className="h-5 w-5 text-amber-500" />;
    // 에이전트 작업 요청(2026-11-11) — 받은 요청 · 완료·거절·취소 결과
    case 'agent_request':
      return <Bot className="h-5 w-5 text-indigo-500" />;
    case 'agent_request_result':
      return <Bot className="h-5 w-5 text-emerald-500" />;
    // 할 일 작업 「메시지 보내기」
    case 'task_message':
      return <MessageSquareText className="h-5 w-5 text-blue-500" />;
    // 다마고찌 펫 부름(2026-10-07)
    case 'tama_call':
    case 'tama_focus_invite':
    case 'tama_visit':
    case 'tama_trade_offer':
    case 'tama_trade_done':
    case 'tama_character_submitted':
    case 'tama_character_delivered':
    case 'tama_character_declined':
    case 'tama_decor_submitted':
    case 'tama_decor_delivered':
    case 'tama_decor_declined':
    case 'tama_event':
      return <Egg className="h-5 w-5 text-pink-500" />;
    default:
      return <AlertTriangle className="h-5 w-5 text-gray-500" />;
  }
};

export const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 1) return '방금 전';
  if (diffInHours < 24) return `${diffInHours}시간 전`;
  return `${Math.floor(diffInHours / 24)}일 전`;
};

type NotificationCardType = "success" | "error" | "warning" | "info";

/**
 * 알림 유형을 NotificationCard 스타일로 매핑
 *
 * 분류 기준:
 * - Success (green): 긍정적 완료 상태 - 일정 등록, 승인 완료, 계정 연결
 * - Error (red): 부정적 결과 - 취소, 거절
 * - Warning (amber): 사용자 행동 필요 - 승인 요청, 긴급 알림
 * - Info (blue): 단순 정보 전달 - 변경 안내, 일반 공지
 */
export const getNotificationCardType = (
  notificationType: string,
  priority?: 'low' | 'medium' | 'high'
): NotificationCardType => {
  // Error (red) - 부정적 결과: 취소, 거절
  if (
    notificationType === 'schedule_cancelled' ||
    notificationType === 'class_swap_rejected'
  ) {
    return 'error';
  }

  // Success (green) - 긍정적 완료: 일정 등록, 배정 확정, 승인 완료, 계정 연결
  if (
    notificationType === 'schedule_created' ||
    notificationType === 'training_scheduled' ||
    notificationType === 'duty_assigned' ||
    notificationType === 'user_connection_completed' ||
    notificationType === 'class_swap_approved'
  ) {
    return 'success';
  }

  // Warning (amber) - 행동 필요: 승인 요청, 긴급 알림
  // 구매 신청은 담당자가 검토·승인해야 도착지에 닿으므로 여기에 속한다.
  if (
    notificationType === 'class_swap_requested' ||
    notificationType === 'purchase_request_submitted' ||
    // 출장 시간에 수업이 겹침 — 교체·대체를 요청해야 한다
    notificationType === 'absence_lessons' ||
    // 자습 감독 교체 요청 — 수락·거절해야 한다(2026-10-11)
    notificationType === 'supervision_swap_requested'
  ) {
    return 'warning';
  }

  // Info (blue) - 일반 정보: 변경 안내, 취소 안내, 관리자 공지
  // 포함: schedule_updated, class_swap_cancelled, manual
  return 'info';
};
