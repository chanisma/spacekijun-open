import type { NotificationEvent } from '@/hooks/useNotifications';

interface NotificationDestination {
  label: string;
  to: string;
  state?: { scheduleId: string } | { swapDate: string };
}

const getId = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function getNotificationDestination(
  notification: Pick<NotificationEvent, 'type' | 'meta' | 'related_meeting_id'>,
): NotificationDestination | undefined {
  const { type, meta } = notification;
  if (type === 'academy_workshop_submitted') {
    const id = getId(meta?.order_id);
    return { label: '공방 주문 확인', to: `/admin?tab=academy-workshop${id ? `&order=${encodeURIComponent(id)}` : ''}` };
  }
  // 별빛 친구 (2026-10-04) — 친구 요청·수락·방명록은 모두 친구 목록으로(목록에서 받기·방문).
  // 다마고찌에서 맺은 요청·수락(2026-10-15)은 다마고찌 친구 창의 «친구 맺기»로 — 아카데미 친구 창은 제3장을
  // 마쳐야 열리므로, 다마고찌만 쓰는 학생을 아카데미로 보내면 열 수 없는 화면에 떨어진다. 화면은 서버가 meta.surface 로 적는다.
  if ((type === 'academy_friend_request' || type === 'academy_friend_accepted') && meta?.surface === 'tamagotchi') {
    return { label: '친구 창 열기', to: '/tamagotchi?friends=requests' };
  }
  if (type === 'academy_friend_request' || type === 'academy_friend_accepted' || type === 'academy_guestbook') {
    return { label: '친구 목록 열기', to: '/academy?friends=1' };
  }
  if (type === 'academy_workshop_delivered' || type === 'academy_workshop_declined') {
    const id = getId(meta?.order_id);
    return { label: '공방 배송함 열기', to: `/academy/dorm?workshop=orders${id ? `&order=${encodeURIComponent(id)}` : ''}` };
  }

  // 요즘 세상 관심 분야 새 소식(2026-10-11) — 그 기사를 펼친 채로. news_id 는 bigint 라 숫자로 온다.
  if (type === 'world_news_pick') {
    const raw = meta?.news_id;
    const id = typeof raw === 'number' ? raw : Number(getId(raw));
    return Number.isSafeInteger(id) && id > 0
      ? { label: '소식 펼치기', to: `/world-today?story=${id}` }
      : { label: '요즘 세상 열기', to: '/world-today' };
  }

  // 다마고찌 펫 부름(2026-10-07 Phase 4) — 펫에게로
  if (type === 'tama_call') {
    return { label: '펫 돌보기', to: '/tamagotchi' };
  }
  // 집중 권하기(2026-10-15) — 자습·계획 시간에 펫이 «같이 집중할래?». 기기 아래 카드가 지금 시각으로 다시 판정한다
  if (type === 'tama_focus_invite') {
    return { label: '같이 집중하기', to: '/tamagotchi' };
  }
  // 다마고찌 함께(Phase 5) — 친구 창 · 캐릭터 의뢰 창 · 가챠(이벤트) · 관리자 의뢰 목록
  if (type === 'tama_trade_offer' || type === 'tama_trade_done' || type === 'tama_visit') {
    return { label: '친구 창 열기', to: '/tamagotchi?friends=1' };
  }
  if (type === 'tama_character_delivered' || type === 'tama_character_declined') {
    return { label: '캐릭터 의뢰 보기', to: '/tamagotchi?character=1' };
  }
  // 꾸미기 의뢰(2026-10-08) — 의뢰 창의 꾸미기 탭 · 관리자 꾸미기 의뢰 목록
  if (type === 'tama_decor_delivered' || type === 'tama_decor_declined') {
    return { label: '꾸미기 의뢰 보기', to: '/tamagotchi?decor=1' };
  }
  if (type === 'tama_decor_submitted') {
    const id = getId(meta?.order_id);
    return { label: '의뢰 확인', to: `/admin?tab=tamagotchi&decor=${id ? encodeURIComponent(id) : '1'}` };
  }
  if (type === 'tama_event') {
    return { label: '가챠 보러 가기', to: '/tamagotchi?gacha=1' };
  }
  if (type === 'tama_character_submitted') {
    const id = getId(meta?.order_id);
    return { label: '의뢰 확인', to: `/admin?tab=tamagotchi${id ? `&order=${encodeURIComponent(id)}` : ''}` };
  }

  if (type === 'purchase_request_submitted') {
    const id = getId(meta?.purchase_page_id);
    return id ? { label: '신청 확인', to: `/purchase-requests/${encodeURIComponent(id)}` } : undefined;
  }

  if (type === 'schedule_survey_requested' || type === 'schedule_survey_closed') {
    // ⚠ 설문 id는 related_meeting_id(meeting FK)가 아니라 meta.survey_id 에 있다
    const id = getId(meta?.survey_id);
    return id
      ? { label: '설문 열기', to: `/schedule?survey=${encodeURIComponent(id)}` }
      : { label: '일정표 확인', to: '/schedule' };
  }

  if (type === 'supervision_swap_requested' || type === 'supervision_swap_result') {
    // 자습 감독 교체(2026-10-11) — 스케줄의 자습 감독 창 [내 감독·교체] 탭
    return { label: type === 'supervision_swap_requested' ? '요청 보기' : '내 감독 보기', to: '/schedule?supervision=swap' };
  }

  if (type === 'absence_lessons') {
    // 출장 시간에 수업이 겹친 동행 교사 — 결강 처리 모달(전역 호스트, `?absence=`)을 연다
    const id = getId(meta?.meeting_id) ?? getId(notification.related_meeting_id);
    return id
      ? { label: '수업 처리', to: `/schedule?absence=${encodeURIComponent(id)}` }
      : { label: '일정표 확인', to: '/schedule' };
  }

  if (type === 'automation_issue') {
    // 자동화 업무(2026-10-23) — 그 자동화의 기록. 서버 무응답 알림은 관리 화면으로
    const id = getId(meta?.automation_id);
    if (meta?.kind === 'runner_offline') return { label: '실행기 확인', to: '/admin' };
    return { label: '기록 보기', to: id ? `/automations?automation=${encodeURIComponent(id)}` : '/automations' };
  }

  if (type === 'task_message') {
    // 할 일 작업 「메시지 보내기」 — 본문은 알림에 있다. 누르면 그 할 일로
    const id = getId(meta?.task_id);
    return id ? { label: '할 일 보기', to: `/my-tasks?task=${encodeURIComponent(id)}` } : undefined;
  }

  if (type === 'task_deadline' || type === 'task_deadline_summary') {
    // 마감 알림 — 담당자는 «수행», 매니저는 «관리» 화면으로 보낸다(같은 할 일이라도 할 일이 다르다)
    const id = getId(meta?.task_id);
    if (!id) return { label: '내 할 일', to: '/my-tasks' };
    return type === 'task_deadline'
      ? { label: '할 일 보기', to: `/my-tasks?task=${encodeURIComponent(id)}` }
      : { label: '진행 현황 보기', to: `/tasks/mine?task=${encodeURIComponent(id)}` };
  }

  if (type === 'submission_requested') {
    // 할 일 작업 「제출 받기」(2026-10-01) — 입력 받기와 같은 응답 창이 종류로 가른다
    const id = getId(meta?.action_id);
    return id
      ? { label: '제출하기', to: `/my-tasks?collect=${encodeURIComponent(id)}` }
      : { label: '내 할 일', to: '/my-tasks' };
  }
  if (type === 'collect_input_requested') {
    // 할 일 작업 「입력 받기」 — 작업 id 는 meta.action_id. 응답 창은 내 할 일이 연다
    const id = getId(meta?.action_id);
    return id
      ? { label: '입력하기', to: `/my-tasks?collect=${encodeURIComponent(id)}` }
      : { label: '내 할 일', to: '/my-tasks' };
  }

  if (type === 'agent_request') {
    // 에이전트 작업 요청(2026-11-11) — 받은 요청 카드(그 요청을 펼친 채)에서 내 PC 에이전트에게 맡긴다.
    // 결과 알림(agent_request_result)은 보낸 사람이 읽기만 하면 된다 — 목적지 없음. 모바일 앱은 data/agentRequests agentRequestPath
    const id = getId(meta?.request_id);
    return { label: '에이전트에게 맡기기', to: id ? `/agents?request=${encodeURIComponent(id)}` : '/agents' };
  }

  if (type === 'signature_request') {
    const id = getId(meta?.signature_request_id);
    return id ? { label: '서명 확인', to: `/signatures?request=${encodeURIComponent(id)}` } : undefined;
  }

  if (['activity_reflection_requested', 'activity_reflection_posted', 'activity_feedback_received'].includes(type)) {
    const id = getId(meta?.activity_id);
    return id ? { label: '활동 확인', to: `/activities?activity=${encodeURIComponent(id)}` } : undefined;
  }

  if (['class_swap_approved', 'class_swap_rejected', 'class_swap_cancelled'].includes(type)) {
    const swapDate = getId(meta?.swap_date);
    return { label: '시간표 확인', to: '/timetable', state: swapDate ? { swapDate } : undefined };
  }

  // 취소된 일정은 삭제되었을 수 있으므로 상세 대신 일정표를 연다.
  if (type === 'schedule_cancelled') {
    return { label: '일정표 확인', to: '/schedule' };
  }

  const scheduleId = getId(notification.related_meeting_id);
  // 새 연수 알림(2026-10-25) — «내 서명 QR»로. 휴대폰으로 찍어 로그인 없이 서명한다(링크가 없는 옛 연수면 그 화면이 일정표로 안내)
  if (scheduleId && type === 'schedule_created' && meta?.meeting_kind === 'training') {
    return { label: '서명 QR 보기', to: `/training-sign-qr/${encodeURIComponent(scheduleId)}` };
  }
  if (scheduleId) {
    return { label: '일정 확인', to: '/schedule', state: { scheduleId } };
  }

  return undefined;
}
