// ========================================
// 연간 업무 템플릿 — 가져오기 실행 (2026-09-23)
// 판정(무엇을 어떤 모양으로 만들지)은 `@/lib/workRollover` 가 하고, 여기는 읽기·쓰기만 한다.
//
// 쓰기 순서 = 업무 → 할 일(일괄) → 실행(일괄) → 값 제출 실행 재연결.
// 중간에 실패하면 **업무를 지운다** — `task.event_id`·`task_action.task_id` 가 ON DELETE CASCADE 라
// 한 번에 전부 사라진다. 반쯤 만들어진 업무가 목록에 남으면 사람이 그걸 "가져온 것"으로 믿는다.
// ========================================

import { supabase } from '@/integrations/supabase/client';
import { unifiedAuth } from '@/services/unifiedAuth';
import { requireUser } from '@/lib/authGuard';
import { getTaskActionDefinition } from '@/features/task-workflow/actionRegistry';
import {
  remapSubmissionAction,
  type ActiveResourceMap,
  type RolloverPlan,
  type RolloverSourceWork,
} from '@/lib/workRollover';

export interface RolloverSourceAction {
  id: string;
  task_id: string;
  action_type: string;
  handler_version: number;
  title: string;
  description: string | null;
  execution_mode: string;
  verification_mode: string;
  config: Record<string, unknown> | null;
  is_required: boolean;
}

export interface RolloverSource {
  work: RolloverSourceWork;
  /** 원본 할 일에 연결된 실행 중 **내가 볼 수 있고** 레지스트리에 있는 것(RLS 가 비공개 양식 실행을 가린다) */
  actions: RolloverSourceAction[];
  activeResources: ActiveResourceMap;
}

function collectPeopleIds(work: RolloverSourceWork): string[] {
  const ids = new Set<string>();
  const add = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const p of list) {
      const id = (p as { id?: unknown } | null)?.id;
      if (typeof id === 'string' && id) ids.add(id);
    }
  };
  add(work.meta?.managers);
  for (const t of work.tasks ?? []) add(t.meta?.assignees);
  return [...ids];
}

/** 미리보기에 필요한 것을 한 번에 읽는다 — 원본(할 일 포함), 실행, 재직 판정 */
export async function loadRolloverSource(workId: string): Promise<RolloverSource> {
  const { data: work, error } = await supabase
    .from('work')
    .select('id, name, description, keywords, meta, created_at, tasks:task(id, title, description, type, order_index, due_date, keywords, meta)')
    .eq('id', workId)
    .single();
  if (error) throw new Error(`원본 업무를 읽지 못했습니다: ${error.message}`);
  const source = work as unknown as RolloverSourceWork;

  const taskIds = (source.tasks ?? []).map((t) => t.id);
  let actions: RolloverSourceAction[] = [];
  if (taskIds.length > 0) {
    const { data, error: actionError } = await supabase
      .from('task_action')
      .select('id, task_id, action_type, handler_version, title, description, execution_mode, verification_mode, config, is_required')
      .in('task_id', taskIds)
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    if (actionError) throw new Error(`연결된 작업을 읽지 못했습니다: ${actionError.message}`);
    actions = ((data ?? []) as unknown as RolloverSourceAction[]).filter((a) =>
      getTaskActionDefinition(a.action_type),
    );
  }

  const activeResources: ActiveResourceMap = new Map();
  const peopleIds = collectPeopleIds(source);
  if (peopleIds.length > 0) {
    const { data, error: resError } = await supabase
      .from('resource')
      .select('id, name')
      .in('id', peopleIds)
      .eq('status', 'active');
    if (resError) throw new Error(`담당자 재직 여부를 확인하지 못했습니다: ${resError.message}`);
    for (const r of data ?? []) activeResources.set(r.id, r.name);
  }

  return { work: source, actions, activeResources };
}

export interface RolloverResult {
  workId: string;
  taskCount: number;
  actionCount: number;
  /** 새로 잇지 못해 연결을 끊은 값 제출 수 — 0 이 아니면 매니저가 양식을 다시 골라야 한다 */
  detachedSubmissions: number;
}

/** 원본 없이 함께 넣을 할 일(예: 공문에서 온 할 일) — 모양은 할 일 표 그대로 */
export interface ExtraTaskInsert {
  title: string;
  description: string;
  type: 'one_time' | 'procedural';
  order_index: number;
  due_date: string | null;
  keywords: string[];
  meta: Record<string, unknown>;
}

/**
 * 계획대로 업무를 만든다 — 종전 «지난 업무 가져오기»와 «참고해서 시작»(2026-11-12) 공용.
 * - continue: 할 일 = `meta.rolledOverFrom.taskId`, 작업 = `rolled_over_from` 으로 원본을 잇는다(계보 = 지식이 따라간다)
 * - reference: 할 일 = `meta.copiedFrom.taskId` 로만 짝을 찾고, 작업에는 **계보를 남기지 않는다**(`rolled_over_from` null —
 *   남기면 `action_lineage` 가 남의 업무 지식을 «작년»으로 읽는다). 그래서 작업을 한 줄씩 넣어 id 를 짝짓는다.
 */
export async function executeWorkRollover(
  plan: RolloverPlan,
  actions: RolloverSourceAction[],
  extra: { tasks?: ExtraTaskInsert[]; workMeta?: Record<string, unknown> } = {},
): Promise<RolloverResult> {
  const lineage = plan.mode !== 'reference';
  if (plan.managers.length === 0) throw new Error('책임자를 한 명 이상 지정해 주세요.');
  if (!plan.name.trim()) throw new Error('업무 이름을 입력해 주세요.');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  requireUser(user);
  const myResourceId = await unifiedAuth.getCurrentResourceId();

  // 매니저는 선택기가 id 만 준다 — 이름과 재직 여부를 저장 직전에 다시 확인한다
  const { data: managerRows, error: managerError } = await supabase
    .from('resource')
    .select('id, name')
    .in('id', plan.managers.map((m) => m.id))
    .eq('status', 'active');
  if (managerError) throw new Error(`책임자를 확인하지 못했습니다: ${managerError.message}`);
  const managerName = new Map((managerRows ?? []).map((r) => [r.id, r.name]));
  const managers = plan.managers
    .filter((m) => managerName.has(m.id))
    .map((m) => ({ id: m.id, name: managerName.get(m.id) ?? '' }));
  if (managers.length === 0) throw new Error('재직 중인 책임자를 한 명 이상 지정해 주세요.');

  const { data: work, error: workError } = await supabase
    .from('work')
    .insert({
      name: plan.name.trim(),
      description: plan.description,
      manager_id: managers[0].id,
      status: 'active',
      keywords: plan.keywords,
      meta: { ...plan.workMeta, ...(extra.workMeta ?? {}), managers } as never,
    })
    .select('id')
    .single();
  if (workError || !work) throw new Error(`업무를 만들지 못했습니다: ${workError?.message ?? '알 수 없는 오류'}`);
  const workId = work.id as string;

  const rollback = async (reason: string): Promise<never> => {
    const { error } = await supabase.from('work').delete().eq('id', workId);
    throw new Error(
      error
        ? `${reason} — 만들던 업무를 지우지도 못했습니다(${error.message}). 목록에서 직접 지워 주세요.`
        : `${reason} — 만들던 업무는 되돌렸습니다.`,
    );
  };

  // 할 일 — 원본 id 는 meta.rolledOverFrom.taskId 로 되찾는다(반환 순서에 기대지 않는다)
  const newTaskIdBySource = new Map<string, string>();
  const newMetaByTaskId = new Map<string, Record<string, unknown>>();
  const extraTasks = extra.tasks ?? [];
  if (plan.tasks.length + extraTasks.length > 0) {
    const { data: tasks, error: taskError } = await supabase
      .from('task')
      .insert(
        [...extraTasks, ...plan.tasks].map((t) => ({
          event_id: workId,
          title: t.title,
          description: t.description,
          type: t.type,
          order_index: t.order_index,
          due_date: t.due_date,
          keywords: t.keywords,
          meta: t.meta as never,
          status: 'pending',
          created_by: myResourceId,
        })),
      )
      .select('id, meta');
    if (taskError || !tasks) return rollback(`할 일을 만들지 못했습니다: ${taskError?.message ?? ''}`);
    for (const row of tasks) {
      const meta = (row.meta ?? {}) as Record<string, unknown>;
      const from = ((lineage ? meta.rolledOverFrom : meta.copiedFrom) as { taskId?: string } | undefined)?.taskId;
      if (from) newTaskIdBySource.set(from, row.id);
      newMetaByTaskId.set(row.id, meta);
    }
  }

  // 작업 — 한 작업 = 한 줄(2026-10-24). 종전엔 (할 일, 유형)당 하나로 접어, 한 할 일에 나이스 작업이 둘이면
  // 다음 해에는 하나만 남았다. 여러 개 둘 수 있는 유형은 새 instance_key(uuid)로 하나씩 옮기고, 하나뿐인 유형만
  // (할 일, 유형)당 하나로 접는다(유니크 키 = 할 일·만든 사람·유형·instance_key — 원본은 사람마다 따로였어도 옮기면 만든 사람이 나 하나라 겹친다).
  // 원본 작업 id 는 rolled_over_from 에 남긴다 — 업무 지식이 «그 작업» 단위로 다음 해에 이어지는 열쇠(work_knowledge.action_id).
  const actionIdMap = new Map<string, string>();
  const rows: Array<Record<string, unknown>> = [];
  const sourcesByFirst = new Map<string, string[]>();
  const singleFirst = new Map<string, string>();
  for (const a of actions) {
    const taskId = newTaskIdBySource.get(a.task_id);
    if (!taskId) continue;
    const multiple = !!getTaskActionDefinition(a.action_type)?.multiple;
    if (!multiple) {
      const key = `${taskId}|${a.action_type}`;
      const first = singleFirst.get(key);
      if (first) {
        sourcesByFirst.get(first)!.push(a.id);
        continue;
      }
      singleFirst.set(key, a.id);
    }
    sourcesByFirst.set(a.id, [a.id]);
    rows.push({
      task_id: taskId,
      created_by: user.id,
      action_type: a.action_type,
      handler_version: a.handler_version,
      title: a.title,
      description: a.description,
      execution_mode: a.execution_mode,
      verification_mode: a.verification_mode,
      config: a.config ?? {},
      is_required: a.is_required,
      instance_key: multiple ? crypto.randomUUID() : '',
      rolled_over_from: lineage ? a.id : null,
      _source: a.id,
    });
  }
  if (rows.length > 0 && !lineage) {
    for (const { _source, ...row } of rows) {
      const { data: one, error: oneError } = await supabase.from('task_action').insert(row as never).select('id').single();
      if (oneError || !one) return rollback(`작업을 옮기지 못했습니다: ${oneError?.message ?? ''}`);
      for (const sourceId of sourcesByFirst.get(_source as string) ?? []) actionIdMap.set(sourceId, (one as { id: string }).id);
    }
  } else if (rows.length > 0) {
    const { data: created, error: actionError } = await supabase
      .from('task_action')
      .insert(rows.map(({ _source, ...row }) => row) as never)
      .select('id, rolled_over_from');
    if (actionError || !created) return rollback(`실행을 옮기지 못했습니다: ${actionError?.message ?? ''}`);
    for (const c of created as unknown as Array<{ id: string; rolled_over_from: string | null }>) {
      for (const sourceId of (c.rolled_over_from && sourcesByFirst.get(c.rolled_over_from)) || []) {
        actionIdMap.set(sourceId, c.id);
      }
    }
  }

  // 값 제출의 실행 재연결
  let detachedSubmissions = 0;
  for (const [taskId, meta] of newMetaByTaskId) {
    const { meta: next, changed } = remapSubmissionAction(meta, actionIdMap);
    if (!changed) continue;
    if (!(next.submission as { actionId?: string }).actionId) detachedSubmissions++;
    const { error } = await supabase.from('task').update({ meta: next as never }).eq('id', taskId);
    if (error) return rollback(`제출 설정을 잇지 못했습니다: ${error.message}`);
  }

  return {
    workId,
    taskCount: newTaskIdBySource.size + extraTasks.length,
    actionCount: rows.length,
    detachedSubmissions,
  };
}
