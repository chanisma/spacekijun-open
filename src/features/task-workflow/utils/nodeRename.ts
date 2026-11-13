// ========================================
// 노드 표시 이름 → 원본(업무·할 일) 이름 동기화 제안 (2026-09-23)
//
// 노드 라벨은 원본과 따로 저장되는 **별도의 표시 이름**이다(상태·진행률만 실시간 동기화).
// 그래서 노드에서 이름을 고치면 캔버스에만 남고 업무 관리·내 할 일의 이름은 그대로다.
// 사용자가 원하면 원본도 바꾸도록 **묻는다** — 자동으로 바꾸지 않는 이유는 둘:
//   ① 캔버스용 약칭("1학기 출결")을 붙이고 싶을 뿐인 경우가 있다
//   ② 원본 이름은 담당자 전원의 내 할 일·알림에 보이는 공용 값이다
//
// 서버 RLS(work·task UPDATE)는 로그인 사용자 전원에게 열려 있어 막아 주지 않는다.
// 그래서 **그 업무의 매니저 ∨ admin** 일 때만 제안한다 — 캔버스에 남의 업무를 올려 둔
// 사람이 남의 업무 이름을 바꾸면 안 된다.
// ========================================

import { isWorkManager } from '@/lib/taskUtils';
import type { Work } from '@/types/tasks';
import type { WorkflowFlowNode } from '../types';

export interface SourceRenameProposal {
  kind: 'work' | 'task';
  entityId: string;
  /** 원본의 지금 이름 */
  currentName: string;
  /** 바꿀 이름(앞뒤 공백 제거) */
  nextName: string;
  /** 할 일이면 소속 업무 이름 — 확인창에서 어느 업무의 할 일인지 말한다 */
  workName?: string;
}

export interface RenameViewer {
  resourceId: string | null;
  isAdmin: boolean;
}

export const SOURCE_NAME_MAX = 200;

function findSource(node: WorkflowFlowNode, works: Work[]) {
  const entityId = node.data.entityId;
  if (!entityId) return null;
  if (node.data.kind === 'event') {
    const work = works.find((item) => item.id === entityId);
    return work ? { kind: 'work' as const, work, name: work.name } : null;
  }
  if (node.data.kind === 'task') {
    for (const work of works) {
      const task = (work.tasks ?? []).find((item) => item.id === entityId);
      if (task) return { kind: 'task' as const, work, name: task.title };
    }
  }
  return null;
}

/** 연결된 원본의 지금 이름 — 원본이 없으면(메모·영역·삭제됨) null */
export function getLinkedSourceName(node: WorkflowFlowNode, works: Work[]): string | null {
  return findSource(node, works)?.name ?? null;
}

/** 이 사람이 원본 이름을 바꿔도 되는가 — 할 일은 소속 업무의 매니저가 관리한다 */
export function canRenameSource(work: Work, viewer: RenameViewer): boolean {
  if (viewer.isAdmin) return true;
  const legacyManagerId = (work as { manager_id?: string | null }).manager_id;
  return isWorkManager(legacyManagerId, work.meta, viewer.resourceId);
}

/**
 * 원본 이름과 다른 표시 이름을 원본에도 적용할지 물을 것인가.
 * null = 묻지 않는다(원본 없음·같은 이름·빈 이름·권한 없음·메모/영역 노드).
 */
export function getSourceRenameProposal(
  node: WorkflowFlowNode,
  works: Work[],
  viewer: RenameViewer,
): SourceRenameProposal | null {
  const source = findSource(node, works);
  if (!source) return null;
  const nextName = node.data.label.trim();
  if (!nextName || nextName.length > SOURCE_NAME_MAX) return null;
  if (nextName === source.name.trim()) return null;
  if (!canRenameSource(source.work, viewer)) return null;
  return {
    kind: source.kind,
    entityId: node.data.entityId!,
    currentName: source.name,
    nextName,
    ...(source.kind === 'task' ? { workName: source.work.name } : {}),
  };
}

/**
 * 편집을 마친 순간(입력칸을 벗어남·Enter) 물을 것인가 — **이번 편집에서 이름이 바뀌었을
 * 때만**. 이미 원본과 다른 약칭을 쓰던 노드를 클릭만 하고 나가도 매번 묻으면 사용자는
 * 곧 읽지 않고 누르게 된다.
 */
export function shouldAskOnCommit(labelAtEditStart: string | null, labelNow: string): boolean {
  return labelAtEditStart !== null && labelAtEditStart.trim() !== labelNow.trim();
}
