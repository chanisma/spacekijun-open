export type NotificationEventStatus = 'active' | 'dormant' | 'legacy';
export type NotificationDeliveryMode = 'automatic' | 'manual';
export type NotificationDeliveryLayer = 'database-trigger' | 'client-service' | 'rpc';

export interface NotificationEventCatalogItem {
  id: string;
  category: string;
  name: string;
  status: NotificationEventStatus;
  deliveryMode: NotificationDeliveryMode;
  deliveryLayer: NotificationDeliveryLayer;
  trigger: string;
  recipients: string;
  notificationType: string;
  titleTemplate: string;
  messageTemplate: string;
  source: string[];
  note?: string;
  /**
   * 전송 문구를 관리자가 편집할 수 있는 이벤트의 `system_settings.setting_key`.
   *
   * 지정되면 알림 관리 카드가 DB 의 실제 값을 표시하고 같은 자리에서 편집한다.
   * 없으면 titleTemplate/messageTemplate 이 코드에 고정된(편집 불가) 문구다.
   * (2026-07-28: 환영 알림 편집이 시스템 설정 → 알림 관리로 이관됐다.)
   */
  settingKey?: 'welcome_notification';
}

/**
 * 사용자 알림 생성 경로 감사 목록.
 *
 * 범위:
 * - 현재 알림함(notification_events)에 연결된 프런트엔드/RPC/DB 트리거
 * - 구현은 남아 있지만 호출되지 않는 알림 서비스
 * - 배포 DB에 남아 있는 레거시 문제풀이 알림(notifications)
 *
 * 화면 내 성공/실패 toast와 브라우저 자체 알림은 포함하지 않는다.
 */
export const notificationEventCatalog: NotificationEventCatalogItem[] = [
  {
    id: 'academy-workshop-submitted', category: '아카데미 공방', name: '맞춤 주문 접수', status: 'active',
    deliveryMode: 'automatic', deliveryLayer: 'rpc', trigger: '학생이 맞춤 제작 주문서의 제출을 확정했을 때',
    recipients: '실제 관리자 프로필에 연결된 리소스', notificationType: 'academy_workshop_submitted',
    titleTemplate: '새 공방 주문서', messageTemplate: '{주문 이름}\n학생의 맞춤 제작 의뢰가 도착했습니다.',
    source: ['academy_workshop_write → academy_private.workshop_write', 'supabase/migrations/20260913143155_academy_workshop_orders.sql'],
    note: '알림에서 /admin?tab=academy-workshop&order=<id>로 해당 주문을 연다. 주문과 알림은 같은 트랜잭션이며 재전송은 중복 알림을 만들지 않는다.',
  },
  {
    id: 'academy-workshop-delivered', category: '아카데미 공방', name: '맞춤 선물 배송', status: 'active',
    deliveryMode: 'automatic', deliveryLayer: 'rpc', trigger: '관리자가 완성 이미지의 배송을 확정했을 때',
    recipients: '주문한 학생의 연결 리소스 또는 학번과 일치하는 활성 학생 리소스', notificationType: 'academy_workshop_delivered',
    titleTemplate: '공방에서 선물이 도착했어요', messageTemplate: '{주문 이름}\n{배송 편지}',
    source: ['academy_workshop_write → academy_private.workshop_write'],
    note: '학생은 기숙사 배송함에서 상자를 연 뒤 개인 소장품을 적용한다. 제작 불가 답장은 academy_workshop_declined로 같은 배송함에 연결된다.',
  },
  {
    id: 'absence-lessons',
    category: '일정',
    name: '출장 결강 처리 요청',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: '출장 일정을 저장했을 때 (생성 직후 1회)',
    recipients: '출장 대상자 중 그 시간에 수업이 있는 선생님 — 등록한 본인은 제외(저장 직후 결강 처리 모달이 바로 열린다)',
    notificationType: 'absence_lessons',
    titleTemplate: '출장 시간에 수업이 있습니다',
    messageTemplate: '"{출장 제목}" 출장({M월 d일(E)}) 시간에 수업 {N}개가 겹칩니다.\n교체나 대체를 요청해 주세요.',
    source: [
      'src/services/absenceLessonService.ts (notifyAbsenceParticipants)',
      'src/components/schedule/ScheduleCreateDialog.tsx',
    ],
    note:
      'class_swap 의 요청자는 본인이어야 해 등록한 사람이 남의 수업을 대신 처리할 수 없다 — 그래서 각자에게 알린다. ' +
      '/schedule?absence=<일정 id> 로 이동해 결강 처리 모달이 열린다. 개인일정은 본인만 빠지므로 알림이 없다. ' +
      '남에게 보내는 알림이라 insert 에 .select() 를 붙이지 않는다.',
  },
  {
    id: 'schedule-survey-requested',
    category: '일정',
    name: '일정 설문 요청',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: '주최자가 일정 설문을 만들었을 때 (설문 생성 직후 1회)',
    recipients: '설문 대상자 전원 — 교사·직원·학생 모두 가능',
    notificationType: 'schedule_survey_requested',
    titleTemplate: '일정 설문 요청',
    messageTemplate: '{주최자}님이 "{설문 제목}" 설문에 응답을 요청했습니다.',
    source: [
      'src/features/schedule-survey/services/scheduleSurveyNotify.ts',
      'src/features/schedule-survey/components/ScheduleSurveyCreateDialog.tsx',
    ],
    note:
      '설문 id는 related_meeting_id(meeting FK)가 아니라 meta.survey_id 에 담고 /schedule?survey=<id> 로 이동한다. ' +
      '공지사항은 학생에게 보이지 않으므로 학생 대상 설문에는 이 알림이 유일한 도달 경로다. ' +
      '남에게 보내는 알림이라 insert 에 .select() 를 붙이면 42501 로 전체가 롤백된다(2026-09-17 실측).',
  },
  {
    id: 'collect-input-requested',
    category: '업무',
    name: '입력 요청 (할 일 작업 「입력 받기」)',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger: '책임자가 [요청 보내기]를 눌렀을 때 · 명단 다시 계산으로 새 대상이 생겼을 때 · [다시 알림](미완료자만)',
    recipients: '대상 규칙(학년·과목·담임·부서·업무분장·태그·직접 지정)으로 확정한 명단 중 교직원 명단에 연결된 사람',
    notificationType: 'collect_input_requested',
    titleTemplate: '입력 요청 / 입력 요청 (다시 알림)',
    messageTemplate: '{요청자}님이 "{할 일}" 입력을 요청했습니다.',
    source: [
      'start_collect_request · sync_collect_targets · remind_collect_pending → collect_notify (supabase/migrations/20260923160000_collect_input.sql)',
    ],
    note:
      '작업 id 는 meta.action_id 에 담고 /my-tasks?collect=<id> 로 이동한다. 응답자는 할 일 담당자가 아니라서 내 할 일의 「입력 요청」 구획과 홈 「나의 업무」 카드의 「입력 요청」 줄이 발견 경로다. ' +
      '분장표에만 있는 이름(resource 미연결)은 알림을 받지 못하며, 책임자 화면이 그 사실을 따로 알린다.',
  },
  {
    id: 'submission-requested',
    category: '업무',
    name: '제출 요청 (할 일 작업 「제출 받기」 — 파일·양식 문서·실물)',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger:
      '대상이 «이 할 일의 담당자»뿐인 제출 작업을 만들 때(자동) · 책임자가 [요청 보내기]를 눌렀을 때 · 명단이 바뀌어 새 대상이 생겼을 때(담당자 변경 포함) · [다시 알림](안 낸 사람만)',
    recipients: '대상 규칙으로 확정한 명단 중 교직원 명단에 연결된 사람(기본 = 그 할 일의 담당자)',
    notificationType: 'submission_requested',
    titleTemplate: '제출 요청 / 제출 요청 (다시 알림)',
    messageTemplate: '{요청자}님이 "{할 일}" 제출을 요청했습니다.',
    source: [
      '_start_action_request · _sync_action_targets · remind_collect_pending → collect_notify (supabase/migrations/20261001180000_submission_actions.sql)',
    ],
    note:
      '입력 요청과 같은 자리(내 할 일 「요청」·홈 「나의 업무」·메뉴 배지)에 종류 표시와 함께 나온다. /my-tasks?collect=<id> 의 같은 창이 종류로 본문을 가른다. ' +
      '대상 중 할 일 담당자는 내면 완료되고, 내기 전에는 완료로 바꿀 수 없다(서버 트리거).',
  },
  {
    id: 'task-deadline',
    category: '업무',
    name: '할 일 마감 예고 (담당자)',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger:
      '마감이 오늘~3일 뒤인 미완료 할 일이 있을 때. pg_cron 이 없어 «화면이 방아쇠» — 교직원이 앱을 열면 세션당 한 번 notify_task_deadlines() 가 돈다',
    recipients: '그 할 일의 담당자 중 아직 끝내지 않은 사람(다중 마감은 끝내지 않은 회차만)',
    notificationType: 'task_deadline',
    titleTemplate: '{오늘|내일|D-n} 마감 · {할 일}',
    messageTemplate: '{MM월 DD일}까지 「{할 일}」를 마쳐 주세요.',
    source: ['notify_task_deadlines (supabase/migrations/20260924180000_task_deadline_notice.sql)'],
    note:
      '중복 발송은 부분 유니크 인덱스 notification_events_task_deadline_key(사람·종류·task_id·deadline)가 막는다 — 보낸 기록을 담는 표를 따로 두지 않았다. ' +
      'meta.task_id → /my-tasks?task=<id>.',
  },
  {
    id: 'task-deadline-summary',
    category: '업무',
    name: '할 일 마감 미완료 요약 (책임자)',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger: '위와 같은 시점 — 같은 함수가 이어서 보낸다',
    recipients:
      '그 업무의 책임자(work.meta.managers + 레거시 manager_id). 책임자이면서 담당자인 사람은 개인 알림만 받는다(두 번 보내지 않는다)',
    notificationType: 'task_deadline_summary',
    titleTemplate: '{오늘|내일|D-n} 마감 · 미완료 {N}명',
    messageTemplate: '「{할 일}」 {MM월 DD일} 마감 — 아직 {N}명이 남았습니다.',
    source: ['notify_task_deadlines (supabase/migrations/20260924180000_task_deadline_notice.sql)'],
    note: 'meta.task_id → /tasks/mine?task=<id>(업무 목록 — 관리 화면). 담당자용 알림과 목적지가 다르다.',
  },
  {
    id: 'task-message',
    category: '업무',
    name: '업무 메시지 (할 일 작업 「메시지 보내기」)',
    status: 'active',
    deliveryMode: 'manual',
    deliveryLayer: 'rpc',
    trigger: '할 일 책임자가 메시지 작업에서 [알림 보내기]를 눌렀을 때',
    recipients: '대상 규칙(학년·과목·담임·부서·업무분장·동아리·태그·직접 지정)으로 푼 교직원 중 계정이 연결된 사람',
    notificationType: 'task_message',
    titleTemplate: '{메시지 제목}',
    messageTemplate: '{메시지 본문}',
    source: ['send_task_message (supabase/migrations/20260924120000_task_message.sql)'],
    note:
      '보낸 기록은 task_message_send. 쿨메신저는 자동 발송하지 않는다 — 러너가 본문·받는 사람 복사와 절차를 안내한다. ' +
      'meta.task_id → /my-tasks?task=<id>.',
  },
  {
    id: 'automation-issue',
    category: '업무',
    name: '자동화 업무 확인 필요',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'database-trigger',
    trigger: '자동화 회차가 건너뜀(상한·0명·권한)·시간 지남·실패·확인 필요가 됐을 때, 또는 실행 서버가 10분 넘게 응답하지 않을 때(관리자, 하루 한 번)',
    recipients: '자동화를 만든 사람 + 관리자',
    notificationType: 'automation_issue',
    titleTemplate: '자동화 업무 확인 필요 / 자동화 서버 응답 없음',
    messageTemplate: '«{자동화 이름}» {MM/DD HH:MI} 회차: {상태 · 사유}',
    source: ['automation_private.notify_issue · sweep (supabase/migrations/20261023165000_automation_scheduler.sql)'],
    note:
      '쉬는 날 건너뜀·마감 임박 업무 없음은 정상이라 알리지 않는다. meta.automation_id → /automations?automation=<id>(기록), ' +
      'meta.kind=runner_offline → /admin.',
  },
  {
    id: 'training-created',
    category: '일정',
    name: '연수 일정 등록',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'database-trigger',
    trigger: 'kind가 training인 일정이 등록되고 meta.assignee가 객체일 때',
    recipients: '담당자로 지정된 교사 리소스',
    notificationType: 'schedule_created',
    titleTemplate: '새로운 연수 일정',
    messageTemplate: '{일정명} 연수가 {시작일시}에 예정되어 있습니다.',
    source: [
      'meeting → create_meeting_notification_trigger',
      'supabase/migrations/20251013000000_migrate_notifications_to_resource_id.sql',
    ],
  },
  {
    id: 'duty-created',
    category: '일정',
    name: '근무 일정 등록',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'database-trigger',
    trigger: 'kind가 duty인 일정이 등록되고 meta.assignee가 객체일 때',
    recipients: '담당자로 지정된 교사 리소스',
    notificationType: 'schedule_created',
    titleTemplate: '새로운 근무 일정',
    messageTemplate: '{일정명} 근무가 {시작일시}에 예정되어 있습니다.',
    source: [
      'meeting → create_meeting_notification_trigger',
      'supabase/migrations/20251013000000_migrate_notifications_to_resource_id.sql',
    ],
  },
  {
    id: 'document-submission-created',
    category: '일정',
    name: '서류 제출 일정 등록',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'database-trigger',
    trigger: 'kind가 document_submission인 일정이 등록되고 meta.assignee가 객체일 때',
    recipients: '담당자로 지정된 교사 리소스',
    notificationType: 'schedule_created',
    titleTemplate: '새로운 서류 제출 일정',
    messageTemplate: '{일정명} 서류 제출이 {마감일시}까지입니다.',
    source: [
      'meeting → create_meeting_notification_trigger',
      'supabase/migrations/20251013000000_migrate_notifications_to_resource_id.sql',
    ],
  },
  {
    id: 'user-connection-completed',
    category: '사용자',
    name: '최초 사용자 연결 완료',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: '프로필 저장 후 교사 리소스와 처음 연결되었을 때',
    recipients: '새로 연결된 교사 리소스',
    notificationType: 'user_connection_completed',
    titleTemplate: 'SPACEKIJUN 사용 환영합니다! 🎉',
    messageTemplate: '{사용자명}님, 사용자 연결이 완료되었습니다. SPACEKIJUN의 모든 기능을 이용하실 수 있습니다.',
    source: [
      'src/components/profile/ProfileEditDialog.tsx',
      'src/services/notificationService.ts',
    ],
    note: '이 카드에서 제목과 내용을 직접 편집할 수 있습니다. 저장하지 않으면 코드의 기본 문구가 발송됩니다.',
    settingKey: 'welcome_notification',
  },
  {
    id: 'class-swap-requested',
    category: '수업 교체',
    name: '수업 교체 요청',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: '수업 교체 요청이 DB에 정상 등록되었을 때',
    recipients: '교체 요청을 받은 승인자',
    notificationType: 'class_swap_requested',
    titleTemplate: '수업 교체 요청',
    messageTemplate: '{요청자} 선생님이 수업 교체를 요청했습니다. 교체 날짜와 두 수업의 요일·교시가 함께 표시됩니다.',
    source: [
      'src/hooks/useClassSwapMutations.ts',
      'src/services/notificationService.ts',
    ],
  },
  {
    id: 'class-swap-approved',
    category: '수업 교체',
    name: '수업 교체 승인',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: '승인자가 수업 교체 요청을 승인하고 상태 변경이 성공했을 때',
    recipients: '교체 요청자',
    notificationType: 'class_swap_approved',
    titleTemplate: '수업 교체 승인됨 ✅',
    messageTemplate: '{승인자} 선생님이 수업 교체를 승인했습니다. 교체 날짜와 변경된 수업이 함께 표시됩니다.',
    source: [
      'src/components/timetable/SwapApprovalDialog.tsx',
      'src/services/notificationService.ts',
    ],
  },
  {
    id: 'class-swap-rejected',
    category: '수업 교체',
    name: '수업 교체 거절',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: '승인자가 수업 교체 요청을 거절하고 상태 변경이 성공했을 때',
    recipients: '교체 요청자',
    notificationType: 'class_swap_rejected',
    titleTemplate: '수업 교체 거절됨',
    messageTemplate: '{승인자} 선생님이 수업 교체를 거절했습니다. 입력한 경우 거절 사유도 함께 표시됩니다.',
    source: [
      'src/components/timetable/SwapApprovalDialog.tsx',
      'src/services/notificationService.ts',
    ],
  },
  {
    id: 'class-swap-cancelled',
    category: '수업 교체',
    name: '수업 교체 요청 취소',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: '요청자가 대기 중인 수업 교체 요청을 취소했을 때',
    recipients: '교체 요청을 받았던 승인자',
    notificationType: 'class_swap_cancelled',
    titleTemplate: '수업 교체 취소됨',
    messageTemplate: '{요청자} 선생님이 수업 교체 요청을 취소했습니다. 교체 날짜와 대상 수업이 함께 표시됩니다.',
    source: [
      'src/components/timetable/SwapRequestList.tsx',
      'src/services/notificationService.ts',
    ],
  },
  {
    id: 'purchase-request-submitted',
    category: '구매 신청',
    name: '새 구매 신청 등록',
    status: 'active',
    deliveryMode: 'automatic',
    deliveryLayer: 'database-trigger',
    trigger: '구매 신청 게시판에 새 신청이 등록(INSERT)됐을 때. 신청 수정은 발송하지 않는다',
    recipients: '해당 페이지의 담당자(작성자 + 공동 작업자). 신청자 본인은 제외',
    notificationType: 'purchase_request_submitted',
    titleTemplate: '새 구매 신청',
    messageTemplate: '{신청자}님 · {첫 물품명 외 N건}\n📋 {게시판 제목}',
    source: [
      'purchase_requests → notify_purchase_request_submitted_trigger',
      'supabase/migrations/20260903081803_purchase_request_submitted_notification.sql',
    ],
    note: '담당자 명단을 신청자에게 노출하지 않으려고 DB 트리거로 보낸다. 알림 카드의 [신청 확인] 이 meta.purchase_page_id 로 게시판 상세를 연다.',
  },
  {
    id: 'manual-notification',
    category: '직접 발송',
    name: '알림 화면에서 직접 발송',
    status: 'active',
    deliveryMode: 'manual',
    deliveryLayer: 'rpc',
    trigger: '알림 화면에서 제목·내용·대상자를 입력하고 생성을 확정했을 때',
    recipients: '선택한 교사 리소스 또는 전체 교사',
    notificationType: 'manual',
    titleTemplate: '{입력한 제목}',
    messageTemplate: '{입력한 내용}',
    source: [
      'src/components/notifications/NotificationCreateDialog.tsx',
      'create_manual_notification RPC',
    ],
  },
  {
    id: 'notification-reply',
    category: '직접 발송',
    name: '알림에 답장',
    status: 'active',
    deliveryMode: 'manual',
    deliveryLayer: 'rpc',
    trigger: '쿨메신저 쪽지 알림 또는 받은 답장 알림에서 [답장]을 보냈을 때',
    recipients: '보낸 사람 이름과 일치하는 교직원 1명, 모호하면 답장하는 사람이 고른 교직원 1명',
    notificationType: 'direct_reply',
    titleTemplate: '[답장] {보낸 교직원 이름}',
    messageTemplate: '{답장 내용}',
    source: [
      'src/components/notifications/NotificationReplyDialog.tsx',
      'src/lib/notificationReply.ts',
      'send_notification_reply RPC',
      'supabase/migrations/20260922100000_notification_reply.sql',
    ],
    note: '보낸 사람·원문 인용은 서버가 유도한다(위조 방지). 받은 사람이 다시 [답장]하면 meta.sender_resource_id 로 바로 돌아간다. 2026-09-22 이전에는 쿨메신저 발송 큐(coolmsg_outbox)로 보냈다.',
  },
  {
    id: 'generic-schedule-created-dormant',
    category: '미연결 일정 코드',
    name: '일반 일정 등록 알림 서비스',
    status: 'dormant',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: 'notifyScheduleCreated가 호출될 때',
    recipients: '일정 생성자와 전달받은 참여자 목록',
    notificationType: 'schedule_created',
    titleTemplate: '새로운 {일정유형} 등록',
    messageTemplate: '{일정명}, 날짜, 시간을 생성자와 참여자용 문구로 구분해 표시합니다.',
    source: ['src/services/notificationService.ts'],
    note: '현재 저장소에 호출부가 없어 실제 일정 등록 시 이 경로로는 발송되지 않습니다.',
  },
  {
    id: 'schedule-updated-dormant',
    category: '미연결 일정 코드',
    name: '일정 변경 알림 서비스',
    status: 'dormant',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: 'notifyScheduleUpdated가 호출될 때',
    recipients: '함수에 전달된 리소스 목록',
    notificationType: 'schedule_updated',
    titleTemplate: '{일정유형} 변경 알림',
    messageTemplate: '{일정명} 일정이 수정되었습니다. 새로운 시간을 확인해주세요.',
    source: ['src/services/notificationService.ts'],
    note: '현재 저장소에 호출부와 DB UPDATE 트리거가 없어 일정 수정 시 발송되지 않습니다.',
  },
  {
    id: 'schedule-cancelled-dormant',
    category: '미연결 일정 코드',
    name: '일정 취소 알림 서비스',
    status: 'dormant',
    deliveryMode: 'automatic',
    deliveryLayer: 'client-service',
    trigger: 'notifyScheduleCancelled가 호출될 때',
    recipients: '함수에 전달된 참여자 목록',
    notificationType: 'schedule_cancelled',
    titleTemplate: '{일정유형} 취소 알림',
    messageTemplate: '{일정명} 일정이 취소되었습니다.',
    source: ['src/services/notificationService.ts'],
    note: '현재 저장소에 호출부와 DB DELETE 트리거가 없어 일정 삭제 시 발송되지 않습니다.',
  },
  {
    id: 'problem-like-legacy',
    category: '레거시 문제풀이',
    name: '문제 좋아요',
    status: 'legacy',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger: '문제에 다른 사용자가 좋아요를 누르고 create_notification RPC를 호출할 때',
    recipients: '문제 작성자',
    notificationType: 'problem_like',
    titleTemplate: '문제에 좋아요가 눌렸습니다',
    messageTemplate: '문제 좋아요 안내 문구',
    source: ['Supabase public.create_notification RPC', 'public.notifications'],
    note: '배포 DB에는 이력이 있지만 현재 앱의 /notifications 화면은 이 테이블을 조회하지 않습니다.',
  },
  {
    id: 'problem-solution-legacy',
    category: '레거시 문제풀이',
    name: '문제에 새 풀이 등록',
    status: 'legacy',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger: '다른 사용자가 문제 풀이를 등록하고 create_notification RPC를 호출할 때',
    recipients: '문제 작성자',
    notificationType: 'problem_solution',
    titleTemplate: '문제에 새 풀이가 등록되었습니다',
    messageTemplate: '새 풀이 등록 안내 문구',
    source: ['Supabase public.create_notification RPC', 'public.notifications'],
    note: '배포 DB에는 이력이 있지만 현재 앱의 /notifications 화면은 이 테이블을 조회하지 않습니다.',
  },
  {
    id: 'solution-comment-legacy',
    category: '레거시 문제풀이',
    name: '풀이에 새 댓글 등록',
    status: 'legacy',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger: '다른 사용자가 풀이에 댓글을 등록하고 create_notification RPC를 호출할 때',
    recipients: '풀이 작성자',
    notificationType: 'solution_comment',
    titleTemplate: '풀이에 새 댓글이 등록되었습니다',
    messageTemplate: '새 댓글 등록 안내 문구',
    source: ['Supabase public.create_notification RPC', 'public.notifications'],
    note: '배포 DB에는 이력이 있지만 현재 앱의 /notifications 화면은 이 테이블을 조회하지 않습니다.',
  },
  {
    id: 'solution-like-legacy',
    category: '레거시 문제풀이',
    name: '풀이 좋아요',
    status: 'legacy',
    deliveryMode: 'automatic',
    deliveryLayer: 'rpc',
    trigger: '다른 사용자가 풀이에 좋아요를 누르고 create_notification RPC를 호출할 때',
    recipients: '풀이 작성자',
    notificationType: 'solution_like',
    titleTemplate: '풀이에 좋아요가 눌렸습니다',
    messageTemplate: '풀이 좋아요 안내 문구',
    source: ['Supabase public.create_notification RPC', 'public.notifications'],
    note: '배포 DB에는 이력이 있지만 현재 앱의 /notifications 화면은 이 테이블을 조회하지 않습니다.',
  },
];
