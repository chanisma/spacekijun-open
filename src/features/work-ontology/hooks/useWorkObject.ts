// 「한 장 보기」(업무) 데이터 — 이미 있는 기록을 읽기만 한다 (2026-11-08, P0)
//
// ⚠️ 사람 칸은 고르지 않는다 — work_event 는 «조회·분석은 역할로만»(사용자 결정)이라 actor 의 id 칸,
//    task_status_history 는 바꾼 사람 칸을 select 에 넣지 않는다(회귀가 이 파일을 읽어 검사한다).
// ⚠️ 업무 흐름 선은 업무 노드 사이의 것만 읽는다(contains·action 은 model 이 버린다).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkDetailJsonb } from '@/hooks/useTasksJsonb';
import type { WorkKnowledgeData } from '@/lib/workKnowledge';
import type { FlowNeighbor, StatusHistoryRow, WorkEventRow } from '../model/workObject';

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };

export const WORK_OBJECT_QUERY_PREFIXES = [['work-detail-jsonb'], ['work-object']] as const;

async function fetchEvents(workId: string): Promise<WorkEventRow[]> {
  const { data, error } = await db.from('work_event')
    .select('id, task_id, action_id, kind, actor_role, via, detail, at')
    .eq('work_id', workId)
    .order('at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as WorkEventRow[];
}

async function fetchHistory(taskIds: string[]): Promise<StatusHistoryRow[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await db.from('task_status_history')
    .select('id, task_id, old_status, new_status, changed_at')
    .in('task_id', taskIds)
    .order('changed_at', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as StatusHistoryRow[];
}

/** 이 업무가 놓인 흐름들에서 업무 노드끼리 이어진 선 → 이웃 업무 */
async function fetchFlowNeighbors(workId: string): Promise<FlowNeighbor[]> {
  const { data: mine, error: e1 } = await db.from('task_workflow_node').select('id, workflow_id').eq('event_id', workId);
  if (e1) throw e1;
  const myNodeIds: string[] = (mine ?? []).map((n: { id: string }) => n.id);
  if (myNodeIds.length === 0) return [];
  const idList = myNodeIds.join(',');
  const { data: edges, error: e2 } = await db.from('task_workflow_edge')
    .select('source_node_id, target_node_id, relation_type')
    .or(`source_node_id.in.(${idList}),target_node_id.in.(${idList})`);
  if (e2) throw e2;
  const mineSet = new Set(myNodeIds);
  const otherIds = [...new Set((edges ?? []).flatMap((e: { source_node_id: string; target_node_id: string }) =>
    [e.source_node_id, e.target_node_id].filter((id) => !mineSet.has(id))))] as string[];
  if (otherIds.length === 0) return [];
  const { data: others, error: e3 } = await db.from('task_workflow_node').select('id, event_id').in('id', otherIds);
  if (e3) throw e3;
  const workOfNode = new Map<string, string>();
  for (const n of others ?? []) if (n.event_id) workOfNode.set(n.id, n.event_id);
  const workIds = [...new Set(workOfNode.values())];
  if (workIds.length === 0) return [];
  const { data: works, error: e4 } = await db.from('work').select('id, name, status').in('id', workIds);
  if (e4) throw e4;
  const workById = new Map<string, { name: string; status: string }>((works ?? []).map((w: { id: string; name: string; status: string }) => [w.id, w]));

  const out: FlowNeighbor[] = [];
  for (const e of edges ?? []) {
    const outgoing = mineSet.has(e.source_node_id);
    const otherNode = outgoing ? e.target_node_id : e.source_node_id;
    if (mineSet.has(otherNode)) continue;
    const otherWork = workOfNode.get(otherNode);
    const w = otherWork ? workById.get(otherWork) : null;
    if (!otherWork || !w) continue; // 할 일·메모 노드와 이어진 선 · 볼 수 없는 업무
    out.push({ relation: e.relation_type, direction: outgoing ? 'out' : 'in', workId: otherWork, workName: w.name, workStatus: w.status });
  }
  return out;
}

async function fetchKnowledge(workId: string): Promise<WorkKnowledgeData | null> {
  const { data, error } = await db.rpc('get_work_knowledge', { p_work_id: workId, p_include_archived: false });
  if (error) return null; // 지식을 못 읽어도 한 장 보기는 그린다
  return data as WorkKnowledgeData;
}

export function useWorkObject(workId: string | null) {
  const detailQ = useWorkDetailJsonb(workId ?? '', { enabled: !!workId });
  const taskIds = (detailQ.data?.tasks ?? []).map((t) => t.id);

  const eventsQ = useQuery({
    queryKey: ['work-object', 'events', workId],
    queryFn: () => fetchEvents(workId!),
    enabled: !!workId,
  });
  const historyQ = useQuery({
    queryKey: ['work-object', 'history', workId, taskIds.join(',')],
    queryFn: () => fetchHistory(taskIds),
    enabled: !!workId && detailQ.isSuccess,
  });
  const flowQ = useQuery({
    queryKey: ['work-object', 'flow', workId],
    queryFn: () => fetchFlowNeighbors(workId!),
    enabled: !!workId,
  });
  const knowledgeQ = useQuery({
    queryKey: ['work-object', 'knowledge', workId],
    queryFn: () => fetchKnowledge(workId!),
    enabled: !!workId,
  });

  return {
    work: detailQ.data ?? null,
    isLoading: detailQ.isLoading,
    error: (detailQ.error as Error | null) ?? null,
    events: eventsQ.data ?? [],
    history: historyQ.data ?? [],
    neighbors: flowQ.data ?? [],
    knowledge: knowledgeQ.data ?? null,
  };
}
