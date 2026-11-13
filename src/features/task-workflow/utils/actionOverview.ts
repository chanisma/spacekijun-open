// ========================================
// 업무 목록의 «작업 줄» — 할 일 아래에 연결된 작업을 글로 늘어놓는다 (2026-10-06 사용자 결정)
//
// 종전엔 할 일 행의 렌치를 눌러 창을 열어야 무엇이 붙어 있는지 보였다. 아이콘·칩으로 줄이는 안은
// «작업 종류가 너무 많아 무엇인지 알아보기 어렵다»는 이유로 기각됐다(사용자) — 그래서 줄마다
// **등록부의 종류 이름 + 작업 이름 + 관리 창과 같은 설정 요약 문장 + 요청 상태**를 글자로 보인다.
// 같은 글을 쓰는 이유: 관리 창(TaskActionPanel)에서 본 문장과 목록의 문장이 다르면 같은 작업이
// 두 개처럼 읽힌다 → 요약은 `manageSummaryFor` 그대로, 순서는 `task.meta.actionFlow` 그대로.
//
// 이 파일은 React·Supabase 를 모른다 — 조회는 훅(useWorkActionOverview), 그리기는 WorkTaskTable.
// ========================================

import { getTaskActionDefinition } from '../actionRegistry';
import type { TaskAction } from '../types';
import { orderByFlow, readActionFlow } from './actionFlow';
import { manageSummaryFor } from './actionPanelMode';
import { listableActions } from './taskActionDraft';

/** 보낸 요청의 상태 — collect_request 한 행 + 명단 사람 수 */
export interface ActionRequestState {
  status: 'open' | 'closed';
  /** 명단에서 빠지지 않은 **사람** 수(과목·학급마다 한 줄인 축에서도 사람으로 센다) */
  people: number;
}

export type ActionLineTone = 'idle' | 'open' | 'closed';

export interface ActionLine {
  action: TaskAction;
  /** 등록부의 종류 이름 — «입력 받기» · «NEIS 업무 화면» */
  typeLabel: string;
  /** 사람이 붙인 이름 — 종류 이름과 같으면 비운다(같은 말을 두 번 쓰지 않는다) */
  name: string;
  /** 관리 창과 같은 설정 요약 */
  summary: string;
  /** 요청을 보내는 작업(입력·제출)만. 나머지·볼 수 없는 사람은 null */
  state: { label: string; tone: ActionLineTone } | null;
}

/** 요청을 보내는 작업 — 상태 칸을 갖는다 */
export const REQUEST_ACTION_TYPES: ReadonlySet<string> = new Set([
  'collect.input', 'submit.file', 'submit.document', 'submit.physical',
]);

/**
 * 요청 상태 글. `canSeeRequests` 가 거짓이면(요청 표는 책임자·대상만 읽는다) **«요청 전»이라 하지 않고 null** —
 * 못 읽은 것을 «아직 안 보냄»으로 그리면 거짓말이 된다.
 */
export function actionLineState(
  actionType: string,
  request: ActionRequestState | undefined,
  canSeeRequests: boolean,
): ActionLine['state'] {
  if (!REQUEST_ACTION_TYPES.has(actionType) || !canSeeRequests) return null;
  if (!request) return { label: '요청 전', tone: 'idle' };
  if (request.status === 'closed') return { label: '마감', tone: 'closed' };
  return { label: `보냄 · ${request.people}명`, tone: 'open' };
}

/**
 * 할 일마다 작업 줄 — 순서는 관리 창과 같다(`actionFlow`). 값 제출용 자동 연결 등 목록에 서지 않는
 * 작업은 뺀다(`listableActions` — 관리 창과 같은 규칙).
 */
export function buildActionLines(
  actions: readonly TaskAction[],
  taskMeta: ReadonlyMap<string, unknown>,
  requests: ReadonlyMap<string, ActionRequestState>,
  canSeeRequests: (taskId: string) => boolean,
): Map<string, ActionLine[]> {
  const byTask = new Map<string, TaskAction[]>();
  for (const action of listableActions([...actions])) {
    if (!action.task_id) continue;
    byTask.set(action.task_id, [...(byTask.get(action.task_id) ?? []), action]);
  }
  const out = new Map<string, ActionLine[]>();
  for (const [taskId, list] of byTask) {
    const ordered = orderByFlow(list, readActionFlow(taskMeta.get(taskId)), (action) => action.id);
    out.set(taskId, ordered.map((action) => {
      const definition = getTaskActionDefinition(action.action_type);
      const typeLabel = definition?.title ?? '지원하지 않는 작업';
      const title = (action.title ?? '').trim();
      return {
        action,
        typeLabel,
        name: title && title !== typeLabel ? title : '',
        summary: manageSummaryFor(action, definition ?? null),
        state: actionLineState(action.action_type, requests.get(action.id), canSeeRequests(taskId)),
      };
    }));
  }
  return out;
}

/** collect_target 행들 → 작업마다 사람 수(빠진 사람 제외, 같은 사람의 여러 줄은 한 명) */
export function countRequestPeople(
  targets: ReadonlyArray<{ action_id: string; resource_id: string | null; holder_name: string; removed_at: string | null }>,
): Map<string, number> {
  const people = new Map<string, Set<string>>();
  for (const target of targets) {
    if (target.removed_at) continue;
    const key = target.resource_id ?? `name:${target.holder_name}`;
    const set = people.get(target.action_id) ?? new Set<string>();
    set.add(key);
    people.set(target.action_id, set);
  }
  return new Map([...people].map(([actionId, set]) => [actionId, set.size]));
}
