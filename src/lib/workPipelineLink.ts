// ========================================
// 업무 진행 모달의 딥링크 (2026-09-27)
//
// 업무 관리(`/tasks`)가 이 두 파라미터를 한 번 소비해 `WorkPipelineDialog` 를 연다.
// `?task=` 가 아닌 이유: 그 이름은 이미 «할 일 상세 모달»의 딥링크다 — 같이 쓰면 두 모달이 함께 열린다.
// ========================================

import { taskPagePath } from '@/lib/taskTabs';

export const PIPELINE_PARAM = 'pipeline';
export const PIPELINE_TASK_PARAM = 'pipelineTask';

/** 업무 진행 모달을 여는 주소 — 알림·공지 링크에서 쓴다 */
export function workPipelineHref(workId: string, taskId?: string | null): string {
  // 업무 목록 페이지에서 연다(2026-10-05 탭 → 페이지). 구 `/tasks?tab=myWorks&pipeline=` 도 넘겨 주기는 한다
  const params = new URLSearchParams({ [PIPELINE_PARAM]: workId });
  if (taskId) params.set(PIPELINE_TASK_PARAM, taskId);
  return `${taskPagePath('myWorks')}?${params.toString()}`;
}
