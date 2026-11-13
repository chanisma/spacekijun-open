// ========================================
// 작업 «연결 해제»가 실제로 하는 일 — 확인창·버튼 설명의 단일 출처 (2026-10-05)
//
// 종전엔 «실행 이력이 있을 때만» 확인을 물었다. 그런데 입력·제출·메시지 작업은 실행 이력을 남기지
// 않아, **요청을 보낸 작업도 확인 없이** 풀렸다. 버튼 설명은 모두에게 «실행·검수 이력과 결과 파일 포함»
// 이라 실제와도 달랐다. 실제 동작(taskActionService.deleteTaskAction · DB 외래키):
//   · 입력 받기·제출 받기 — 요청을 보낸 뒤면 지우지 않고 **보관**하고 요청을 **마감**한다(받은 것은 남는다).
//     보내기 전이면 그냥 지운다.
//   · 메시지 보내기 — 지운다. 발송 기록(task_message_send)이 CASCADE 로 함께 지워진다(받은 알림은 남는다).
//   · 그 밖 — 지운다. 내 실행·검수 이력과 결과 파일이 함께 지워진다.
// ========================================

export interface DisconnectEffect {
  /** 누르기 전에 물어야 하는가 */
  confirm: boolean;
  /** 확인창 본문 · 버튼 설명 — 무엇이 남고 무엇이 사라지는지 */
  message: string;
}

const REQUEST_TYPES = new Set(['collect.input', 'submit.file', 'submit.document', 'submit.physical']);

/**
 * @param actionType 작업 유형
 * @param hasRuns 내 실행 이력이 있는가(입력·제출·메시지 작업은 이력을 남기지 않는다)
 */
export function disconnectEffect(actionType: string, hasRuns: boolean): DisconnectEffect {
  if (REQUEST_TYPES.has(actionType)) {
    return {
      confirm: true,
      message: '요청을 보냈다면 요청이 마감되고, 받은 응답·제출물은 보관됩니다(보내기 전이면 연결만 풀립니다).',
    };
  }
  if (actionType === 'message.send') {
    return {
      confirm: true,
      message: '이 작업으로 보낸 메시지 기록이 함께 지워집니다(받은 사람의 알림은 남습니다).',
    };
  }
  return hasRuns
    ? { confirm: true, message: '내 실행·검수 이력과 결과 파일이 함께 삭제됩니다.' }
    : { confirm: false, message: '연결만 풀립니다.' };
}
