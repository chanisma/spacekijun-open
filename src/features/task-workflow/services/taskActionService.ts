import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import type {
  TaskAction,
  TaskActionArtifact,
  TaskActionArtifactInput,
  TaskActionCheck,
  TaskActionCheckInput,
  TaskActionRun,
  TaskActionRunLog,
  TaskActionRunStatus,
  TaskActionRunWithDetails,
  TaskActionType,
  TaskActionReview,
  TaskActionReviewDecision,
} from '../types';
import { getTaskActionDefinition } from '../actionRegistry';
import type { DraftPlan } from '../utils/taskActionDraft';
import { hasCollectRequest } from './collectInputService';
import {
  mergeNeisActionConfig,
  neisActionTitle,
  parseNeisActionConfig,
  type NeisActionConfig,
} from '@/lib/neisScreens';

const workTable = () => supabase.from('task_action');
const runTable = () => supabase.from('task_action_run');
const artifactTable = () => supabase.from('task_action_artifact');
const checkTable = () => supabase.from('task_action_check');
const reviewTable = () => supabase.from('task_action_review');
const runLogTable = () => supabase.from('task_action_run_log');

const workSelect =
  'id, task_id, created_by, action_type, handler_version, title, description, execution_mode, verification_mode, config, is_required, archived_at, created_at, updated_at';
const runSelect =
  'id, action_id, workflow_id, created_by, idempotency_key, status, input_snapshot, output_summary, error_summary, started_at, completed_at, created_at, updated_at';
const checkSelect =
  'id, run_id, created_by, check_key, label, status, message, evidence, created_at';
const reviewSelect =
  'id, run_id, reviewer_id, decision, comment, created_at';
const artifactSelect =
  'id, run_id, created_by, artifact_key, artifact_type, label, locator, mime_type, size_bytes, content_sha256, metadata, created_at';
const runLogSelect =
  'id, run_id, created_by, sequence_no, log_type, from_status, to_status, payload, created_at';

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  requireUser(user);
  return user;
}

export async function listTaskActions(taskId: string): Promise<TaskAction[]> {
  const { data, error } = await workTable()
    .select(workSelect)
    .eq('task_id', taskId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TaskAction[];
}

/**
 * 할 일에 실행을 연결한다(upsert).
 *
 * **주의: `config` 를 `{}` 로 덮어쓴다.** 이미 `origin`·`defaultTemplate` 을 담고 있는 실행 에
 * 이 함수를 부르면 그 값이 조용히 사라진다 — 값 제출용 실행이 정확히 그런 경우라
 * `ensureSubmissionAction`(taskSpecSubmissionService)는 이 함수를 쓰지 않고 직접 병합한다.
 */
/** instance_key 칸이 아직 없다(마이그레이션 전) — PostgREST 스키마 캐시 오류 */
function isMissingInstanceKey(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === 'PGRST204' && (e.message ?? '').includes('instance_key');
}

export async function bindTaskAction(input: {
  taskId: string;
  workType: TaskActionType;
}): Promise<TaskAction> {
  const user = await getCurrentUser();
  const definition = getTaskActionDefinition(input.workType);
  if (!definition) throw new Error('지원하지 않는 실행 유형입니다.');
  const row = {
    task_id: input.taskId,
    created_by: user.id,
    action_type: definition.type,
    handler_version: definition.handlerVersion,
    title: definition.title,
    description: definition.description,
    execution_mode: definition.executionMode,
    verification_mode: definition.verificationMode,
    config: {},
    archived_at: null,
  };

  // 여러 개를 두는 유형(NEIS 화면) — 연결마다 새 행, 고유 instance_key
  if (definition.multiple) {
    const first = await workTable()
      .insert({ ...row, instance_key: crypto.randomUUID() } as never)
      .select(workSelect)
      .single();
    if (!first.error) return first.data as unknown as TaskAction;
    if (!isMissingInstanceKey(first.error)) throw first.error;

    // 마이그레이션(20260923120000) 적용 전 — 칸이 없으면 칸 없이 만든다. 옛 유일 제약이라
    // 이 할 일에서 같은 유형은 하나까지만 된다(2026-09-23 실제로 PGRST204 400 이 났다).
    const legacy = await workTable().insert(row).select(workSelect).single();
    if (!legacy.error) return legacy.data as unknown as TaskAction;
    if ((legacy.error as { code?: string }).code === '23505') {
      throw new Error(
        `${definition.title}을(를) 한 할 일에 여러 개 두려면 DB 업데이트가 필요합니다(task_action.instance_key). 관리자에게 알려 주세요.`,
      );
    }
    throw legacy.error;
  }

  // 한 개뿐인 유형 — upsert(onConflict) 를 쓰지 않는다. 유일 제약의 컬럼 구성이 바뀌어도
  // (20260923120000: instance_key 추가) 배포 순서와 무관하게 동작하도록 조회 후 수정/추가.
  const { data: found, error: findError } = await workTable()
    .select('id')
    .eq('task_id', input.taskId)
    .eq('created_by', user.id)
    .eq('action_type', definition.type)
    .limit(1);
  if (findError) throw findError;
  const existingId = (found as { id: string }[] | null)?.[0]?.id;
  const { data, error } = existingId
    ? await workTable().update(row).eq('id', existingId).select(workSelect).single()
    : await workTable().insert(row).select(workSelect).single();

  if (error) throw error;
  return data as unknown as TaskAction;
}

/** 실행 config에 저장되는 기본 스펙(양식) — 노드를 여는 사람이 양식 선택을 건너뛰게 한다 */
export interface TaskActionDefaultTemplate {
  id: string;
  name?: string;
  /**
   * 양식 계보 id (2026-09-03). `id` 는 **버전 행**을 가리키므로 그 양식에 새 버전이
   * 등록되면 핀한 행이 보관본이 되어 목록에서 사라지고, 잠금이 조용히 풀린다.
   * 값 제출은 이 값으로 현재 버전을 되찾아 다시 잠근다(`findPinned`).
   */
  familyId?: string | null;
}

export function getDefaultTemplate(action: TaskAction): TaskActionDefaultTemplate | null {
  const v = (action.config as { defaultTemplate?: unknown }).defaultTemplate;
  if (!v || typeof v !== 'object') return null;
  const t = v as TaskActionDefaultTemplate;
  return typeof t.id === 'string' && t.id ? t : null;
}

/**
 * 노드의 기본 스펙 지정/해제 — **실행 생성자(=워크플로 생성자)만** 가능(RLS `task_action_update_own`).
 * 다른 교사가 그 노드를 열면 이 양식이 자동으로 로드되어 양식 선택을 건너뛴다.
 * RLS가 막으면 오류가 아니라 0행이므로 반환 행으로 실제 반영을 확인한다.
 */
export async function setTaskActionDefaultTemplate(
  actionId: string,
  template: TaskActionDefaultTemplate | null,
): Promise<TaskAction> {
  const { data: current, error: readError } = await workTable()
    .select('config').eq('id', actionId).single();
  if (readError) throw readError;

  const nextConfig = { ...((current?.config as Record<string, unknown>) ?? {}) };
  if (template) nextConfig.defaultTemplate = template;
  else delete nextConfig.defaultTemplate;

  const { data, error } = await workTable()
    // 생성 타입의 Json은 재귀 유니온이라 Record<string, unknown>을 직접 받지 못한다
    .update({ config: nextConfig as never })
    .eq('id', actionId)
    .select(workSelect);
  if (error) throw error;
  if (!data?.length) throw new Error('이 업무 흐름을 만든 사람만 기본 양식을 지정할 수 있습니다.');
  return data[0] as unknown as TaskAction;
}

/**
 * NEIS 업무 화면 실행(`neis.screen`)의 화면 목록·안내를 저장한다(2026-09-23).
 * config 의 다른 키는 보존하고 `neis` 만 바꾼다. 카드에서 무엇을 가리키는지 보이도록
 * 제목도 첫 화면 이름으로 함께 맞춘다. RLS 가 막으면 0행이라 반환 행으로 확인한다.
 */
export async function updateNeisActionConfig(
  actionId: string,
  next: NeisActionConfig,
): Promise<TaskAction> {
  const { data: current, error: readError } = await workTable()
    .select('config').eq('id', actionId).single();
  if (readError) throw readError;

  const merged = mergeNeisActionConfig(current?.config as Record<string, unknown> | null, next);
  const { data, error } = await workTable()
    .update({ config: merged as never, title: neisActionTitle(parseNeisActionConfig(merged)) })
    .eq('id', actionId)
    .select(workSelect);
  if (error) throw error;
  if (!data?.length) throw new Error('이 연결을 만든 사람만 NEIS 화면을 바꿀 수 있습니다.');
  return data[0] as unknown as TaskAction;
}

/**
 * 할 일 편집 창의 작업 초안을 반영한다(2026-09-23). 순서 = 삭제 → 추가 → 수정
 * (`planActionDraft` 주석). 하나가 실패해도 나머지는 계속하고 실패 목록을 돌려준다 —
 * 할 일 자체는 이미 저장됐으므로, 절반만 반영된 채 조용히 끝나지 않게 호출부가 알린다.
 */
export async function applyTaskActionPlan(
  taskId: string,
  plan: DraftPlan,
): Promise<{ failures: string[]; createdIds: Record<string, string> }> {
  const failures: string[] = [];
  // 임시 키 → 새 연결 id — 작업 순서(actionFlow)를 저장할 때 임시 키를 바꿔 적는다
  const createdIds: Record<string, string> = {};
  const reason = (e: unknown) =>
    e instanceof Error ? e.message : ((e as { message?: string } | null)?.message ?? String(e));
  for (const id of plan.removeIds) {
    try {
      await deleteTaskAction(id);
    } catch (e) {
      failures.push(`작업 빼기 실패: ${reason(e)}`);
    }
  }
  for (const item of plan.adds) {
    const title = getTaskActionDefinition(item.type)?.title ?? item.type;
    try {
      const bound = await bindTaskAction({ taskId, workType: item.type });
      createdIds[item.tempId] = bound.id;
      if (item.neis) await updateNeisActionConfig(bound.id, item.neis);
    } catch (e) {
      failures.push(`"${title}" 연결 실패: ${reason(e)}`);
    }
  }
  for (const update of plan.neisUpdates) {
    try {
      await updateNeisActionConfig(update.actionId, update.config);
    } catch (e) {
      failures.push(`NEIS 화면 저장 실패: ${reason(e)}`);
    }
  }
  return { failures, createdIds };
}

/**
 * 작업 순서 저장(2026-09-23) — `task.meta.actionFlow` 만 바꾸고 다른 meta 키는 보존한다.
 * task UPDATE RLS 는 로그인 사용자 전원에게 열려 있다 — 누가 바꿀 수 있는지는 호출하는
 * 화면(관리 보기·할 일 편집 = 업무 흐름 소유자·매니저)이 정한다. 0행이면 오류로 만든다.
 */
export async function setTaskActionFlow(taskId: string, flow: string[]): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from('task').select('meta').eq('id', taskId).single();
  if (readError) throw readError;
  const meta = { ...((current?.meta as Record<string, unknown> | null) ?? {}), actionFlow: flow };
  const { data, error } = await supabase
    .from('task').update({ meta: meta as never }).eq('id', taskId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('작업 순서를 저장하지 못했습니다(권한 없음 또는 삭제됨).');
}

export async function startTaskActionRun(input: {
  actionId: string;
  workflowId: string | null;
  inputSnapshot: Record<string, unknown>;
}): Promise<TaskActionRun> {
  const { data: runId, error: startError } = await supabase.rpc('start_task_action_run', {
    p_action_id: input.actionId,
    p_workflow_id: input.workflowId ?? undefined,
    p_idempotency_key: crypto.randomUUID(),
    p_input_snapshot: input.inputSnapshot,
  });

  if (startError) throw startError;

  const { data, error } = await runTable()
    .select(runSelect)
    .eq('id', runId)
    .single();

  if (error) throw error;
  return data as unknown as TaskActionRun;
}

export async function finalizeTaskActionRun(input: {
  runId: string;
  status: Extract<TaskActionRunStatus, 'needs_review' | 'failed' | 'cancelled'>;
  outputSummary?: Record<string, unknown>;
  errorSummary?: string | null;
  checks?: TaskActionCheckInput[];
  artifacts?: TaskActionArtifactInput[];
}): Promise<void> {
  const { error } = await supabase.rpc('finalize_task_action_run', {
    p_run_id: input.runId,
    p_status: input.status,
    p_output_summary: input.outputSummary ?? {},
    p_error_summary: input.errorSummary ?? undefined,
    p_checks: input.checks ?? [],
    p_artifacts: input.artifacts ?? [],
  });

  if (error) throw error;
}

export async function reviewTaskActionRun(input: {
  runId: string;
  decision: TaskActionReviewDecision;
  comment?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('review_task_action_run', {
    p_run_id: input.runId,
    p_decision: input.decision,
    p_comment: input.comment?.trim() || undefined,
  });

  if (error) throw error;
}

/**
 * 실행의 실행·검수 이력 — **내가 실행한 것만**(2026-08-14 사용자 결정).
 *
 * `document.spec_fill`은 공유 실행 유형이라 같은 실행를 여러 사람이 돌린다. 그런데
 * 이력 목록에는 남이 실행한 건까지 섞여 나왔다 — 내 작업 이력을 보는 자리에
 * 남의 실행이 끼면 "불러와서 진행"의 대상도 헷갈리고, 다른 교사가 무엇을
 * 만들었는지가 드러난다.
 *
 * **주의: 이 필터는 화면 규칙이고 서버 관문이 아니다.** `task_action_run`의 SELECT
 * 정책은 아직 `created_by = 나 OR is_teacher_or_admin(나)`이라 API로는 전 교사가
 * 읽을 수 있다(하위 check·artifact·run_event·review도 같다). 실제 차단까지 하려면
 * RLS를 함께 좁혀야 하는데, 그러면 비소유자용 '실행·검수 이력 보기'(TaskActionPanel의
 * readOnly 경로)와 실행 삭제 시 남의 RUN 정리가 함께 영향을 받는다 — 별도 결정 사안.
 */
export async function listTaskActionRuns(actionId: string): Promise<TaskActionRunWithDetails[]> {
  return listRunsForWorks([actionId], 20);
}

/**
 * 여러 실행 의 내 실행 이력을 한 번에 — 문서 생성 페이지의 '실행 이력' 서랍용.
 *
 * 서랍은 **기본으로 열려 있고 아무 카드도 고르지 않은 상태**가 기본이라, 그때 보여 줄
 * 것이 있어야 한다. 실행 마다 따로 부르면 생성 방식 수만큼 왕복이 생기므로
 * `in (...)` 한 번으로 받는다. 필터(카드 선택)는 받아 온 뒤 화면에서 건다 —
 * 서랍을 열어 둔 채 카드를 옮겨 다니는 것이 기본 사용법이라 그때마다 다시 받으면 깜빡인다.
 */
export async function listTaskActionRunsForActions(
  workIds: string[],
  limit = 60,
): Promise<TaskActionRunWithDetails[]> {
  if (workIds.length === 0) return [];
  return listRunsForWorks(workIds, limit);
}

async function listRunsForWorks(
  workIds: string[],
  limit: number,
): Promise<TaskActionRunWithDetails[]> {
  const user = await getCurrentUser();
  const { data: runData, error: runError } = await runTable()
    .select(runSelect)
    .in('action_id', workIds)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (runError) throw runError;

  const runs = (runData ?? []) as unknown as TaskActionRun[];
  const runIds = runs.map((run) => run.id);
  if (runIds.length === 0) return [];

  const [checksResult, reviewsResult, artifactsResult, runLogsResult] = await Promise.all([
    checkTable().select(checkSelect).in('run_id', runIds).order('created_at'),
    reviewTable().select(reviewSelect).in('run_id', runIds).order('created_at'),
    artifactTable().select(artifactSelect).in('run_id', runIds).order('created_at'),
    runLogTable()
      .select(runLogSelect)
      .in('run_id', runIds)
      .order('sequence_no'),
  ]);

  if (checksResult.error) throw checksResult.error;
  if (reviewsResult.error) throw reviewsResult.error;
  if (artifactsResult.error) throw artifactsResult.error;
  if (runLogsResult.error) throw runLogsResult.error;

  const checks = (checksResult.data ?? []) as unknown as TaskActionCheck[];
  const reviews = (reviewsResult.data ?? []) as unknown as TaskActionReview[];
  const artifacts = (artifactsResult.data ?? []) as unknown as TaskActionArtifact[];
  const events = (runLogsResult.data ?? []) as unknown as TaskActionRunLog[];

  const groupByRunId = <T extends { run_id: string }>(items: T[]) => {
    const grouped = new Map<string, T[]>();
    items.forEach((item) => {
      const current = grouped.get(item.run_id) ?? [];
      current.push(item);
      grouped.set(item.run_id, current);
    });
    return grouped;
  };

  const checksByRun = groupByRunId(checks);
  const reviewsByRun = groupByRunId(reviews);
  const artifactsByRun = groupByRunId(artifacts);
  const logsByRun = groupByRunId(events);

  return runs.map((run) => ({
    ...run,
    checks: checksByRun.get(run.id) ?? [],
    reviews: reviewsByRun.get(run.id) ?? [],
    artifacts: artifactsByRun.get(run.id) ?? [],
    events: logsByRun.get(run.id) ?? [],
  }));
}

/**
 * 실행 연결 해제(삭제): 이력 RUN들을 먼저 `delete_task_action_run` RPC로 지워
 * 파일 ARTIFACT의 Storage 정리까지 수행한 뒤(단순 FK cascade는 파일을 남김),
 * task_action 행을 삭제한다. 실행 중(running) RUN이 있으면 RPC가 거부해 중단된다.
 */
/**
 * 실행 삭제 — 행을 **하드 삭제**한다(보관이 아니다). `task_action_run` 은 CASCADE 로,
 * `task_action_document` 는 `action_id` 가 **SET NULL** 로 처리된다(문서는 남지만 목록에서
 * 찾을 수 없게 된다).
 *
 * **RPC 로 지우는 것은 내 RUN 뿐이다 (2026-09-08).** 종전에는 이 실행 의 RUN 을 전부 돌며
 * `delete_task_action_run` 을 불렀는데, 그 RPC 는 `created_by = 나` 가 아니면 P0002 로 거부한다
 * (`document.spec_fill` 은 공유 실행 유형이라 남의 RUN 이 흔하다). 그래서 **내 RUN 만 지워진
 * 채 예외가 나고 실행은 그대로 남는** 반쯤 삭제된 상태가 됐다. 남의 RUN 행은 CASCADE 가
 * 지우므로 루프의 역할은 애초에 **행 삭제가 아니라 Storage 파일 정리**뿐이고, 남의 파일은
 * 어차피 버킷 정책상 내가 지울 수 없다(고아로 남지만 접근 불가는 아니다).
 */
export async function deleteTaskAction(actionId: string): Promise<void> {
  const user = await getCurrentUser();
  // 입력 받기: 요청을 보낸 뒤에는 지우지 않고 보관한다 — 지우면 받은 응답이 cascade 로 사라진다
  // (서버 트리거 guard_collect_action_delete 도 삭제를 거부한다). 보관하면 요청도 마감된다.
  if (await hasCollectRequest(actionId)) {
    const { data, error } = await workTable()
      .update({ archived_at: new Date().toISOString() })
      .eq('id', actionId)
      .select('id');
    if (error) throw new Error(`작업 보관 실패: ${error.message}`);
    if (!data?.length) throw new Error('이 작업을 만든 사람만 뺄 수 있습니다.');
    return;
  }
  const { data: runs, error: runsError } = await runTable()
    .select('id')
    .eq('action_id', actionId)
    .eq('created_by', user.id);
  if (runsError) throw runsError;
  for (const run of (runs ?? []) as { id: string }[]) {
    await deleteTaskActionRun(run.id);
  }
  // RLS 가 남의 행을 걸러 내면 오류가 아니라 **0행 삭제**로 끝난다 — 확인하지 않으면 화면은
  // "해제했습니다"를 띄우고 작업은 그대로 남는다(공동 매니저가 남이 연결한 작업을 해제할 때).
  const { data: deleted, error } = await workTable().delete().eq('id', actionId).select('id');
  if (error) throw new Error(`실행 삭제 실패: ${error.message}`);
  if (!deleted?.length) throw new Error('이 작업을 연결한 사람만 해제할 수 있습니다.');
}

/**
 * 태스크별 실행 연결 여부(노드 아이콘용): 실행 bind 행을 가진 task_id 집합.
 * 2026-07-26 완화(사용자 결정): 연결 = bind 행 존재 — [연결] 클릭 즉시 연결되고
 * 해제도 즉시 가능. 실행 이력은 '진행' 표시일 뿐 연결 판정 조건이 아니다.
 */
export async function listConnectedTaskIds(taskIds: string[]): Promise<string[]> {
  if (taskIds.length === 0) return [];
  const { data: actions, error } = await workTable()
    .select('task_id')
    .in('task_id', taskIds)
    .is('archived_at', null);
  if (error) throw error;
  return [...new Set(((actions ?? []) as { task_id: string }[]).map((row) => row.task_id))];
}

/**
 * 작업 설정(`config`)의 일부만 병합 저장 — 연수 참석 서명이 «어느 연수인가»를 적을 때 쓴다.
 *
 * ⚠️ `bindTaskAction` 처럼 `config` 를 통째로 덮어쓰지 않는다 — 그 함수는 `{}` 로 밀어 버려서
 * 이미 들어 있는 `origin`·`defaultTemplate` 이 조용히 사라진다(같은 파일 위의 경고).
 * ⚠️ 쓰기 RLS 가 `created_by` 전용이라 **연결을 만든 사람만** 바꿀 수 있다(NEIS 화면과 동일).
 *    0행이 돌아오면 그 뜻이므로 오류로 말해 준다.
 */
export async function mergeTaskActionConfig(
  actionId: string,
  patch: Record<string, unknown>,
  /** 함께 맞출 표시 제목(선택) — 목록에서 «무엇을 가리키는지»가 제목만으로 읽혀야 하는 유형 */
  title?: string,
): Promise<TaskAction> {
  const { data: current, error: readError } = await workTable()
    .select('config').eq('id', actionId).single();
  if (readError) throw readError;

  const merged = { ...((current?.config as Record<string, unknown> | null) ?? {}), ...patch };
  const { data, error } = await workTable()
    .update({ config: merged as never, ...(title ? { title } : {}) })
    .eq('id', actionId)
    .select(workSelect);
  if (error) throw error;
  if (!data?.length) throw new Error('이 연결을 만든 사람만 설정을 바꿀 수 있습니다.');
  return data[0] as unknown as TaskAction;
}

/**
 * 여러 할 일의 작업을 한 번에 — 업무 흐름 캔버스의 작업 노드가 쓴다(2026-09-24).
 * 행마다 `listTaskActions` 를 걸면 N+1 이라 캔버스 노드 수만큼 왕복이 생긴다.
 * (라이브 작업 30건 규모라 PostgREST 1000행 상한에 닿지 않는다 — 닿기 시작하면 페이징할 것)
 */
export async function listTaskActionsForTasks(taskIds: string[]): Promise<TaskAction[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await workTable()
    .select(workSelect)
    .in('task_id', taskIds)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as TaskAction[];
}

/**
 * 실행별 실행 이력 존재 여부 — "실행·검수 이력이 없는 실행는 연결로 간주하지 않는다"
 * 판정의 단일 출처. run이 있는 action_id 집합을 반환한다.
 */
export async function listTaskActionRunActionIds(workIds: string[]): Promise<string[]> {
  if (workIds.length === 0) return [];
  const { data, error } = await runTable().select('action_id').in('action_id', workIds);
  if (error) throw error;
  return [...new Set(((data ?? []) as { action_id: string }[]).map((row) => row.action_id))];
}

/**
 * RUN(+하위 감사 행 cascade) 삭제 — `delete_task_action_run` RPC가 소유·종료 상태를
 * 검증하고 파일 ARTIFACT의 Storage 경로를 반환하면, 실제 파일을 best-effort 정리한다.
 */
export async function deleteTaskActionRun(runId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_task_action_run', { p_run_id: runId });
  if (error) throw new Error(`실행 이력 삭제 실패: ${error.message}`);
  const paths = (data ?? []) as string[];
  if (paths.length > 0) {
    // 파일 정리 실패는 무시(고아 파일은 소유자 폴더에 남을 뿐 접근 불가 아님)
    await supabase.storage.from('task-work-documents').remove(paths).catch(() => undefined);
  }
}
