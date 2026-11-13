// ========================================
// 할 일 편집 창의 작업(Action) 초안 — 저장할 때 한꺼번에 반영 (2026-09-23)
//
// 할 일 편집 창 안에서 작업을 추가·빼기·설정한다(사용자 결정: 할 일과 작업의 UX 를 분리하지
// 않는다). 새 할 일은 아직 id 가 없어 task_action 을 만들 수 없으므로(FK) **모든 변경을 초안에
// 모았다가 [저장] 때 반영**한다 — 수정 창도 같은 규칙이라야 "어떤 변경은 즉시, 어떤 변경은
// 저장 때"로 갈리지 않는다.
//
// "제출 받기"도 화면에서는 작업 목록의 한 항목이지만 **저장은 종전대로 task.meta.submission**
// 이다(서버 가드·제출 RPC 가 그 값을 읽는다). 그래서 이 초안에는 들어오지 않는다.
// ========================================

import type { NeisActionConfig } from '@/lib/neisScreens';
import type { TaskActionDefinition } from '../actionRegistry';
import type { TaskAction, TaskActionType } from '../types';

export interface PendingAction {
  /** 화면용 임시 키 */
  tempId: string;
  type: TaskActionType;
  /** NEIS 화면 — 저장 때 연결 직후 함께 적는다 */
  neis?: NeisActionConfig;
}

export interface ActionDraft {
  adds: PendingAction[];
  /** 해제할 기존 연결 id — 저장 때 삭제(실행 이력·결과 파일 포함) */
  removeIds: string[];
  /** 기존 NEIS 연결의 바뀐 설정 */
  neisEdits: Record<string, NeisActionConfig>;
}

export const EMPTY_ACTION_DRAFT: ActionDraft = { adds: [], removeIds: [], neisEdits: {} };

/**
 * 값 제출(양식 작성)을 위해 할 일 저장이 스스로 만드는 연결 — 제출 받기의 **구현**이지
 * 따로 고른 작업이 아니다. 목록에 따로 보이면 같은 일이 두 번 나온다.
 */
export function isSubmissionBackedAction(action: Pick<TaskAction, 'config'>): boolean {
  return (action.config as { origin?: string } | null)?.origin === 'submission';
}

/** 작업 목록에 보일 기존 연결 */
export function listableActions<T extends Pick<TaskAction, 'config'>>(actions: T[]): T[] {
  return actions.filter((action) => !isSubmissionBackedAction(action));
}

/** 이 사람이 뺄 수 있는가 — task_action DELETE RLS 가 created_by 전용이다 */
export function canRemoveAction(action: Pick<TaskAction, 'created_by'>, userId: string | null): boolean {
  return Boolean(userId) && action.created_by === userId;
}

/**
 * 추가할 수 있는 작업 유형. 같은 할 일·같은 사람·같은 유형은 한 행뿐이라
 * (UNIQUE task_id, created_by, action_type) 이미 내가 가진 유형은 뺀다 — 단 초안에서 해제한
 * 것은 다시 고를 수 있다(저장 때 삭제가 먼저 돈다).
 */
export function addableDefinitions(
  definitions: TaskActionDefinition[],
  input: {
    existing: Pick<TaskAction, 'id' | 'created_by' | 'action_type' | 'config'>[];
    draft: ActionDraft;
    userId: string | null;
    canUse: (definition: TaskActionDefinition) => boolean;
  },
): TaskActionDefinition[] {
  const removed = new Set(input.draft.removeIds);
  const taken = new Set<string>([
    ...input.existing
      .filter((action) => action.created_by === input.userId && !removed.has(action.id))
      .map((action) => action.action_type),
    ...input.draft.adds.map((item) => item.type),
  ]);
  return definitions.filter(
    (definition) =>
      !definition.hidden && input.canUse(definition) && (definition.multiple || !taken.has(definition.type)),
  );
}

export interface DraftPlan {
  removeIds: string[];
  adds: PendingAction[];
  neisUpdates: Array<{ actionId: string; config: NeisActionConfig }>;
}

/**
 * 저장 때 실행할 것. **순서가 규칙이다 — 삭제 → 추가 → 수정.** 해제한 유형을 다시 추가하면
 * 삭제가 먼저 돌아야 UNIQUE 에 걸리지 않는다. 해제하는 연결의 설정 변경은 버린다.
 */
export function planActionDraft(
  draft: ActionDraft,
  existing: Pick<TaskAction, 'id' | 'created_by'>[],
  userId: string | null,
): DraftPlan {
  const byId = new Map(existing.map((action) => [action.id, action]));
  const removeIds = draft.removeIds.filter((id) => {
    const action = byId.get(id);
    return action ? canRemoveAction(action, userId) : false;
  });
  const removing = new Set(removeIds);
  const neisUpdates = Object.entries(draft.neisEdits)
    .filter(([id]) => byId.has(id) && !removing.has(id) && byId.get(id)!.created_by === userId)
    .map(([actionId, config]) => ({ actionId, config }));
  return { removeIds, adds: draft.adds, neisUpdates };
}

export function isDraftEmpty(draft: ActionDraft): boolean {
  return draft.adds.length === 0 && draft.removeIds.length === 0 && Object.keys(draft.neisEdits).length === 0;
}
