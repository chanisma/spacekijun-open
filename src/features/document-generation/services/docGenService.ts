// ========================================
// 문서 생성(document-generation) 서비스
//
// '생성 방식' 한 건 = `action_type='document.spec_fill'` 인 `task_action` 행.
// 스펙 기반 문서 생성의 DB(템플릿·RUN·완성 문서)를 그대로 재사용한다.
// 마이그레이션: 20260816090000_docgen_standalone_task_action.sql
//
// ── 목록 범위 (2026-09-08 변경) ─────────────────────────────────────────────
// 종전에는 `config.origin='docgen'` 인 행만 보여 줬다(내 것 + 남의 공개분, 조회 2번).
// 지금은 **읽을 수 있는 spec_fill WORK 전부**를 한 번에 받는다 — 업무 관리(워크플로 캔버스·
// 업무 제출 양식)에서 만들어진 방식도 같은 목록에 선다(사용자 결정).
// 범위는 `task_action_select_teachers` 정책이 정하므로 클라이언트가 그 규칙을 복제하지 않는다.
//
// ── 업무 연결은 여기서 하지 않는다 (2026-09-08 사용자 결정) ─────────────────
// 종전에는 이 화면에서 `task_id` 를 채워 업무에 연결할 수 있었다(`setDocGenActionTask`).
// 연결 지점이 두 곳이면 "어디서 끊는가"가 흐려지고, 실제로 그 연결은 얕게만 쓰였다.
// 연결·해제는 **업무 관리**가 맡고 여기서는 연결 상태를 배지로 보여 주기만 한다.
// ========================================

import { supabase } from '@/integrations/supabase/client';
import { requireUser } from '@/lib/authGuard';
import { getTaskActionDefinition } from '@/features/task-workflow/actionRegistry';
import type { TaskAction } from '@/features/task-workflow/types';
import type { TaskActionDefaultTemplate } from '@/features/task-workflow/services/taskActionService';
import { DOCGEN_ORIGIN, SPEC_FILL_WORK_TYPE } from '../lib/docGenActionList';

// 판정 단일 출처는 순수 모듈(`lib/docGenActionList`) — 기존 소비처를 위해 여기서 다시 내보낸다
export { DOCGEN_ORIGIN, isDocGenPublic } from '../lib/docGenActionList';

const DOCGEN_WORK_TYPE = SPEC_FILL_WORK_TYPE;

const workSelect =
  'id, task_id, created_by, action_type, handler_version, title, description, execution_mode, verification_mode, config, is_required, archived_at, created_at, updated_at';

const workTable = () => supabase.from('task_action');

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  requireUser(user);
  return user;
}

/**
 * 문서 생성 페이지 목록 — **내가 읽을 수 있는 spec_fill WORK 전부**.
 *
 * 소유·공개 필터를 걸지 않는 것이 요점이다. RLS 가
 *   내가 만든 것 OR (교직원 AND (origin ≠ 'docgen' OR visibility='public'))
 * 이므로 여기서 조건을 더하면 그 정책을 복제하게 되고, 정책이 바뀌면 화면만 조용히
 * 어긋난다. 분류(내 것/업무/공유받음)는 받은 뒤 `buildDocGenRows` 가 한다.
 */
export async function listDocGenActions(): Promise<TaskAction[]> {
  const { data, error } = await workTable()
    .select(workSelect)
    .eq('action_type', DOCGEN_WORK_TYPE)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TaskAction[];
}

/**
 * 내가 문서 생성 메뉴에서 만든 방식만 — **공지 링크 픽커 전용**.
 * `[[docgen:id]]` 토큰은 내 방식을 남에게 권하는 링크라, 업무에 매인 WORK 나 남의 것을
 * 섞으면 안 된다(그쪽은 업무 관리·해당 업무가 발견 경로다).
 */
export async function listMyDocGenActions(): Promise<TaskAction[]> {
  const user = await getCurrentUser();
  const { data, error } = await workTable()
    .select(workSelect)
    .eq('created_by', user.id)
    .eq('action_type', DOCGEN_WORK_TYPE)
    .contains('config', { origin: DOCGEN_ORIGIN })
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TaskAction[];
}

/** 공유 카드의 '만든 사람' 표시용 — auth uid → profiles.name */
export async function fetchCreatorNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles').select('id, name').in('id', userIds);
  if (error) throw error;
  return new Map(
    ((data ?? []) as { id: string; name: string | null }[]).map((r) => [r.id, r.name ?? '이름 미등록']),
  );
}

/**
 * 단건 조회 — 공지 딥링크(?entry=)로 남의 생성 방식을 열 때 사용.
 * SELECT RLS 가 범위를 정하고, spec_fill 은 공유 실행 유형이라 실행도 가능하다
 * (산출물은 실행자 소유).
 */
export async function getDocGenAction(id: string): Promise<TaskAction | null> {
  const { data, error } = await workTable()
    .select(workSelect)
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as TaskAction) ?? null;
}

export async function createDocGenAction(input: {
  title: string;
  description?: string;
  template?: TaskActionDefaultTemplate | null;
  /** 다른 교사·직원에게 공개(기본 비공개) — 공지 링크·공유 실행에 필요 */
  isPublic?: boolean;
}): Promise<TaskAction> {
  const user = await getCurrentUser();
  const definition = getTaskActionDefinition(DOCGEN_WORK_TYPE);
  if (!definition) throw new Error('문서 생성 WORK 정의를 찾을 수 없습니다.');

  const config: Record<string, unknown> = { origin: DOCGEN_ORIGIN };
  if (input.template) config.defaultTemplate = input.template;
  if (input.isPublic) config.visibility = 'public';

  const { data, error } = await workTable()
    .insert({
      task_id: null,
      created_by: user.id,
      action_type: definition.type,
      handler_version: definition.handlerVersion,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      execution_mode: definition.executionMode,
      verification_mode: definition.verificationMode,
      // 생성 타입의 Json은 재귀 유니온이라 Record<string, unknown>을 직접 받지 못한다
      config: config as never,
    })
    .select(workSelect)
    .single();
  if (error) throw error;
  return data as unknown as TaskAction;
}

/** 이름·설명 수정 — RLS가 막으면 0행이므로 반환 행으로 실제 반영을 확인한다 */
export async function updateDocGenAction(
  actionId: string,
  patch: { title?: string; description?: string | null },
): Promise<TaskAction> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;

  const { data, error } = await workTable()
    .update(update as never)
    .eq('id', actionId)
    .select(workSelect);
  if (error) throw error;
  if (!data?.length) throw new Error('내가 만든 생성 방식만 수정할 수 있습니다.');
  return data[0] as unknown as TaskAction;
}

/**
 * 공개/비공개 전환 — config 병합 쓰기(setTaskActionDefaultTemplate과 같은 read-modify-write.
 * config는 소유자만 쓰므로 경합 위험이 사실상 없다). RLS 차단 시 0행 → 오류.
 *
 * **값을 지우지 않고 `'private'` 을 명시해 적는다 (2026-09-08).** 종전에는 비공개 = 키 삭제
 * 였는데, 업무 쪽 행은 **키가 없는 것이 곧 공개**(현행 동작 보존)라 삭제로는 감출 수가 없다.
 * RLS 는 `= 'public'` 만 보므로 docgen 행에서는 삭제와 `'private'` 이 같은 뜻이고,
 * 두 출신이 같은 코드 경로를 쓰게 된다. 판정 = `lib/docGenActionList.isListedForOthers`.
 */
export async function setDocGenActionVisibility(actionId: string, isPublic: boolean): Promise<TaskAction> {
  const { data: current, error: readError } = await workTable()
    .select('config')
    .eq('id', actionId)
    .single();
  if (readError) throw readError;

  const nextConfig = { ...((current?.config as Record<string, unknown>) ?? {}) };
  nextConfig.visibility = isPublic ? 'public' : 'private';

  const { data, error } = await workTable()
    .update({ config: nextConfig as never })
    .eq('id', actionId)
    .select(workSelect);
  if (error) throw error;
  if (!data?.length) throw new Error('내가 만든 생성 방식만 공개 설정을 바꿀 수 있습니다.');
  return data[0] as unknown as TaskAction;
}

/**
 * 삭제하면 무엇이 사라지는지 — 확인 모달이 **숫자로** 말하기 위한 조회 (2026-09-08).
 *
 * "정말 삭제할까요?"만 묻는 확인은 아무것도 알려 주지 않는다. 특히 이 삭제는 카드 하나를
 * 넘어선다: 행이 하드 삭제되므로 **연결된 업무의 WORK 목록에서도 사라지고**, 그 업무의
 * 값 제출 양식이면 담당자가 제출할 수 없게 된다.
 *
 * 세 수치의 정확도가 다르다 — 화면 문구가 그대로 반영해야 한다:
 *   · `runs`/`otherRuns` : 정확(`task_action_run` SELECT 가 교직원 전체)
 *   · `myDocuments`      : **내 것만**(RLS `task_action_document_select_own`). 남이 만든
 *                          완성 문서는 셀 수 없으므로 "내가 저장한" 이라고 적는다.
 *   · `isSubmissionForm` : `task.meta.submission.actionId` 가 이 행을 가리키는가
 */
export interface DocGenActionImpact {
  /** 이 WORK 의 전체 실행 이력 */
  runs: number;
  /** 그중 남이 실행한 것 — 행은 CASCADE 로 지워지지만 그 결과 파일은 남는다 */
  otherRuns: number;
  /** 내가 저장한 완성 문서 — 삭제되지 않고 `action_id` 가 비워져 목록에서 사라진다 */
  myDocuments: number;
  /** 연결된 업무 제목(없으면 null) */
  taskTitle: string | null;
  /** 이 WORK 가 그 업무의 값 제출 양식인가 — 삭제하면 담당자가 제출할 수 없다 */
  isSubmissionForm: boolean;
}

export async function fetchDocGenActionImpact(action: TaskAction): Promise<DocGenActionImpact> {
  const user = await getCurrentUser();
  const [runsRes, docsRes, taskRes] = await Promise.all([
    supabase.from('task_action_run').select('created_by').eq('action_id', action.id),
    supabase
      .from('task_action_document')
      .select('id', { count: 'exact', head: true })
      .eq('action_id', action.id)
      .eq('created_by', user.id)
      .is('archived_at', null),
    action.task_id
      ? supabase.from('task').select('title, meta').eq('id', action.task_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (runsRes.error) throw runsRes.error;
  if (docsRes.error) throw docsRes.error;
  if (taskRes.error) throw taskRes.error;

  const runRows = (runsRes.data ?? []) as { created_by: string }[];
  const task = taskRes.data as { title: string | null; meta: unknown } | null;
  const submissionWorkId = (
    (task?.meta as { submission?: { actionId?: unknown } } | null)?.submission?.actionId
  );

  return {
    runs: runRows.length,
    otherRuns: runRows.filter((r) => r.created_by !== user.id).length,
    myDocuments: docsRes.count ?? 0,
    taskTitle: task?.title ?? null,
    isSubmissionForm: submissionWorkId === action.id,
  };
}

/** 연결된 업무 제목 표시용 배치 조회 — 못 읽는 업무는 빠진다(배지가 폴백 문구를 쓴다) */
export async function fetchTaskTitles(taskIds: string[]): Promise<Map<string, string>> {
  if (taskIds.length === 0) return new Map();
  const { data, error } = await supabase.from('task').select('id, title').in('id', taskIds);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; title: string | null }[]).map((r) => [r.id, r.title ?? '(제목 없음)']));
}
