import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import type {
  SaveTaskWorkflowGraphInput,
  TaskWorkflow,
  TaskWorkflowEdgeRecord,
  TaskWorkflowEntityLink,
  TaskWorkflowEntityLinks,
  TaskWorkflowGraph,
  TaskWorkflowNodeRecord,
  UpdateTaskWorkflowInput,
  WorkflowRelationType,
} from '../types';
import { WORKFLOW_NODE_SIZE } from '../types';

const workflowTable = () => supabase.from('task_workflow');
const nodeTable = () => supabase.from('task_workflow_node');
const edgeTable = () => supabase.from('task_workflow_edge');

const workflowLinkSelect =
  'event_id, task_id, workflow_id, task_workflow!inner(id, name, department_id, updated_at)';

interface WorkflowLinkRow {
  event_id: string | null;
  task_id: string | null;
  workflow_id: string;
  task_workflow:
    | {
        id: string;
        name: string;
        department_id: string | null;
        updated_at: string;
      }
    | {
        id: string;
        name: string;
        department_id: string | null;
        updated_at: string;
      }[]
    | null;
}

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  requireUser(user);
  return user;
}

export async function listTaskWorkflows(departmentId: string | null = null): Promise<TaskWorkflow[]> {
  // 2026-07-26 전체 교사 공유: owner 필터 제거 — 노출 범위는 RLS(교사/admin 전체 읽기)가 결정.
  // 수정·삭제 가능 여부는 UI에서 owner_id === user.id ∨ isAdmin으로 판정한다.
  await getCurrentUser();
  let query = workflowTable()
    .select('id, owner_id, department_id, name, description, viewport, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (departmentId) query = query.eq('department_id', departmentId);

  const { data, error } = await query;

  if (error) throw error;
  const rows = (data ?? []) as TaskWorkflow[];

  // 소유자 이름 표시용 — profiles에서 일괄 조회(실패해도 목록은 유지)
  const ownerIds = getUniqueIds(rows.map((row) => row.owner_id));
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', ownerIds);
    const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.name as string]));
    rows.forEach((row) => {
      row.owner_name = nameById.get(row.owner_id) ?? null;
    });
  }
  return rows;
}

function getUniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function chunkIds(ids: string[], size = 100): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

function getWorkflowFromRow(row: WorkflowLinkRow) {
  return Array.isArray(row.task_workflow)
    ? row.task_workflow[0] ?? null
    : row.task_workflow;
}

function setLatestWorkflowLink(
  links: Record<string, TaskWorkflowEntityLink>,
  entityId: string | null,
  row: WorkflowLinkRow
) {
  if (!entityId) return;
  const workflow = getWorkflowFromRow(row);
  if (!workflow) return;

  const nextLink: TaskWorkflowEntityLink = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    departmentId: workflow.department_id,
    updatedAt: workflow.updated_at,
  };
  const currentLink = links[entityId];

  if (
    !currentLink ||
    new Date(nextLink.updatedAt).getTime() >
      new Date(currentLink.updatedAt).getTime()
  ) {
    links[entityId] = nextLink;
  }
}

export async function listTaskWorkflowEntityLinks(
  workIds: string[],
  taskIds: string[]
): Promise<TaskWorkflowEntityLinks> {
  const uniqueWorkIds = getUniqueIds(workIds);
  const uniqueTaskIds = getUniqueIds(taskIds);
  const requests = [
    ...chunkIds(uniqueWorkIds).map(ids =>
      nodeTable().select(workflowLinkSelect).in('event_id', ids)
    ),
    ...chunkIds(uniqueTaskIds).map(ids =>
      nodeTable().select(workflowLinkSelect).in('task_id', ids)
    ),
  ];

  if (requests.length === 0) return { works: {}, tasks: {} };

  const results = await Promise.all(requests);
  const rows: WorkflowLinkRow[] = [];

  results.forEach(result => {
    if (result.error) throw result.error;
    rows.push(...((result.data ?? []) as unknown as WorkflowLinkRow[]));
  });

  const links: TaskWorkflowEntityLinks = { works: {}, tasks: {} };
  rows.forEach(row => {
    setLatestWorkflowLink(links.works, row.event_id, row);
    setLatestWorkflowLink(links.tasks, row.task_id, row);
  });

  return links;
}

export async function createTaskWorkflow(input: {
  name: string;
  departmentId: string | null;
}): Promise<TaskWorkflow> {
  const user = await getCurrentUser();
  const { data, error } = await workflowTable()
    .insert({
      owner_id: user.id,
      department_id: input.departmentId,
      name: input.name.trim(),
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    .select('id, owner_id, department_id, name, description, viewport, created_at, updated_at')
    .single();

  if (error) throw error;
  return data as TaskWorkflow;
}

export async function updateTaskWorkflow(
  input: UpdateTaskWorkflowInput
): Promise<TaskWorkflow> {
  await getCurrentUser();
  // owner 필터 제거(2026-07-26): admin도 수정 가능 — 권한은 RLS(owner ∨ admin)가 판정
  const { data, error } = await workflowTable()
    .update({
      department_id: input.departmentId,
      name: input.name.trim(),
    })
    .eq('id', input.workflowId)
    .select('id, owner_id, department_id, name, description, viewport, created_at, updated_at')
    .single();

  if (error) throw error;
  return data as TaskWorkflow;
}

/**
 * 업무 흐름 삭제 — 노드·엣지는 FK 연쇄로 함께 지워지고, RUN 이력은 보존된 채
 * `workflow_id` 링크만 끊긴다(ON DELETE SET NULL).
 * 삭제 권한은 생성자 ∨ admin(RLS). RLS가 막으면 오류가 아니라 **0행**이므로
 * 반환 행으로 실제 삭제를 확인한다 — 아니면 UI가 "삭제됨"으로 보인다.
 */
export async function deleteTaskWorkflow(workflowId: string): Promise<void> {
  const { data, error } = await workflowTable().delete().eq('id', workflowId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('이 업무 흐름을 만든 사람과 관리자만 삭제할 수 있습니다.');
}

export interface CopyTaskWorkflowResult {
  workflowId: string;
  events: number;
  tasks: number;
  nodes: number;
  edges: number;
  /** 복사한 작업(Action) 수 — 2026-09-23 부터 */
  actions: number;
}

/**
 * 워크플로 복사(copy_task_workflow RPC) — 워크플로+내부 event/task+노드/엣지를 한 트랜잭션에
 * 복제한다. 제외는 **보낸 목록 그대로**(연쇄는 화면이 선으로 계산 — utils/workflowCopy.ts),
 * event/task는 새 행(매니저=복사자, 담당자 상태 리셋)으로 만들어져 원본과 완전히 분리된다.
 * 작업(Action) 연결도 새 할 일로 옮긴다(작성자=복사자, 2026-09-23). 실행 이력(RUN)은 복제하지 않는다.
 */
export async function copyTaskWorkflow(input: {
  sourceWorkflowId: string;
  name?: string;
  excludedNodeIds?: string[];
}): Promise<CopyTaskWorkflowResult> {
  await getCurrentUser();
  const { data, error } = await (supabase as any).rpc('copy_task_workflow', {
    p_source_workflow_id: input.sourceWorkflowId,
    p_name: input.name ?? null,
    p_excluded_node_ids: input.excludedNodeIds ?? [],
  });
  if (error) throw error;
  const row = data as { workflow_id: string; events: number; tasks: number; nodes: number; edges: number; actions?: number };
  return {
    workflowId: row.workflow_id,
    events: row.events,
    tasks: row.tasks,
    nodes: row.nodes,
    edges: row.edges,
    actions: row.actions ?? 0,
  };
}

export async function loadTaskWorkflowGraph(workflowId: string): Promise<TaskWorkflowGraph> {
  const [nodesResult, edgesResult] = await Promise.all([
    nodeTable()
      .select(
        'id, workflow_id, node_kind, event_id, task_id, action_id, label, position_x, position_y, metadata, created_at, updated_at'
      )
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: true }),
    edgeTable()
      .select(
        'id, workflow_id, source_node_id, target_node_id, relation_type, label, metadata, created_at, updated_at'
      )
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: true }),
  ]);

  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;

  return {
    nodes: (nodesResult.data ?? []) as TaskWorkflowNodeRecord[],
    edges: (edgesResult.data ?? []) as TaskWorkflowEdgeRecord[],
  };
}

export async function saveTaskWorkflowGraph(input: SaveTaskWorkflowGraphInput): Promise<void> {
  const nodes = input.nodes.map((node) => {
    const size = WORKFLOW_NODE_SIZE[node.data.kind];
    const measuredWidth = Number(
      node.width ??
        node.measured?.width ??
        node.style?.width ??
        node.data.metadata.width ??
        size.width
    );
    const measuredHeight = Number(
      node.height ??
        node.measured?.height ??
        node.style?.height ??
        node.data.metadata.height ??
        size.height
    );

    return {
      id: node.id,
      node_kind: node.data.kind,
      event_id: node.data.kind === 'event' ? node.data.entityId : null,
      task_id: node.data.kind === 'task' ? node.data.entityId : null,
      // 작업 노드 — 연결을 해제하면 FK CASCADE 가 이 행을 함께 지운다(유령 노드 방지)
      action_id: node.data.kind === 'action' ? node.data.entityId : null,
      label: node.data.label,
      position_x: node.position.x,
      position_y: node.position.y,
      metadata: {
        ...node.data.metadata,
        width: Number.isFinite(measuredWidth)
          ? Math.max(size.minWidth, measuredWidth)
          : size.width,
        height: Number.isFinite(measuredHeight)
          ? Math.max(size.minHeight, measuredHeight)
          : size.height,
      },
    };
  });

  const edges = input.edges.map((edge) => {
    const { relationType: _relationType, ...metadata } = edge.data ?? {
      relationType: 'flow' as WorkflowRelationType,
    };

    return {
      id: edge.id,
      source_node_id: edge.source,
      target_node_id: edge.target,
      relation_type: (edge.data?.relationType ?? 'flow') as WorkflowRelationType,
      label: typeof edge.label === 'string' ? edge.label : null,
      metadata,
    };
  });

  const { error } = await supabase.rpc('save_task_workflow_graph', {
    p_workflow_id: input.workflowId,
    p_name: input.name.trim(),
    p_description: input.description,
    p_viewport: input.viewport,
    p_nodes: nodes,
    p_edges: edges,
  });

  if (error) throw error;
}
