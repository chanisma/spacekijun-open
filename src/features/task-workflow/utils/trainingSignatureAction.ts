/**
 * 작업 「연수 참석 서명 받기」의 설정 해석 — 단일 출처 (2026-09-24).
 *
 * 저장은 `task_action.config.training.meetingId` 한 칸이다. 별도 표를 두지 않은 이유:
 * 서명은 이미 `training_signature` 에 쌓이고 참석자 명단은 `meeting.meta.assignee` 에 있어서,
 * 이 작업이 새로 가지는 정보는 **어느 연수를 가리키는가** 하나뿐이다.
 */
export interface TrainingSignatureConfig {
  meetingId: string | null;
}

export function readTrainingSignatureConfig(
  config: Record<string, unknown> | null | undefined,
): TrainingSignatureConfig {
  const training = (config ?? {}).training as { meetingId?: unknown } | undefined;
  const meetingId = typeof training?.meetingId === 'string' ? training.meetingId.trim() : '';
  return { meetingId: meetingId || null };
}

/** 저장할 패치 — `mergeTaskActionConfig` 에 그대로 넘긴다(다른 config 키는 보존된다) */
export function buildTrainingSignaturePatch(meetingId: string): Record<string, unknown> {
  return { training: { meetingId } };
}

/** 서명이 다 모였는가 — 참석자가 0명이면 «완료»라고 말하지 않는다(받을 사람이 없는 것뿐이다) */
export function isTrainingSignatureComplete(signed: number, total: number): boolean {
  return total > 0 && signed >= total;
}
