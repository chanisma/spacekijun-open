// 할 일 제출 — **스펙 기반 값 제출** 데이터 계층 (2026-09-03).
//
// 파일 제출(`taskSubmissionService.ts`)과 **분리**한다: 이쪽은 Google 드라이브 의존이
// 전혀 없고, 저장되는 것이 파일이 아니라 **값**(`task_action_document`의 plan/field_values)이다.
//
// 값으로 저장하는 이득: ①언제든 파일로 재구성 ②열람 ③DB에서 바로 분석
// (`task_spec_submission_view` — `field_values->>'키'` 로 질의된다).
import { supabase } from '@/integrations/supabase/client';
import { fillDocument, normalizeSpecPlanKeys } from '@/features/task-workflow/document/spec';
import type { SpecDocumentRow } from '@/features/task-workflow/services/specDocumentService';
import { getSubmissionConfig, type SubmissionTemplateRef } from '@/lib/taskSubmissionConfig';
import type { Task } from '@/types/tasks';
import type { TaskAction } from '@/features/task-workflow/types';

/** Resolve from the saved task, not a potentially stale task-card snapshot. */
export async function getTaskSubmissionWork(taskId: string, client = supabase) {
  const { data: task, error: taskError } = await client.from('task').select('meta').eq('id', taskId).single();
  if (taskError) throw new Error(`제출 설정 조회 실패: ${taskError.message}`);
  const config = getSubmissionConfig(task as Pick<Task, 'meta'>);
  if (!config.required || config.mode !== 'spec') throw new Error('현재 이 할 일은 문서 작성 제출을 받지 않습니다.');
  if (!config.actionId) throw new Error('제출 양식 연결이 완료되지 않았습니다. 할 일 편집에서 제출 양식을 저장해 주세요.');
  const { data: action, error } = await client.from('task_action').select('*')
    .eq('id', config.actionId).eq('task_id', taskId).eq('action_type', 'document.spec_fill')
    .is('archived_at', null).maybeSingle();
  if (error) throw new Error(`제출용 양식 조회 실패: ${error.message}`);
  if (!action) throw new Error('연결된 제출 양식이 삭제·보관되었거나 열람 권한이 없습니다.');
  return { action, config };
}

const submissionActionModes = {
  execution_mode: 'assisted', verification_mode: 'human_review',
} satisfies Pick<TaskAction, 'execution_mode' | 'verification_mode'>;

/** 제출 RPC — 값 문서를 이 할 일의 제출물로 확정한다(문서 final + 담당자 completed) */
export async function submitTaskSpecSubmission(input: {
  taskId: string;
  documentId: string;
  unitKey?: string | null;
}): Promise<{ submissionId: string; resubmitted: boolean }> {
  const { data, error } = await supabase.rpc('submit_task_spec_submission', {
    p_task_id: input.taskId,
    p_document_id: input.documentId,
    p_unit_key: input.unitKey ?? null,
  });
  if (error) throw new Error(`제출에 실패했습니다: ${error.message}`);
  const r = data as unknown as { submission_id: string; resubmitted: boolean };
  return { submissionId: r.submission_id, resubmitted: r.resubmitted === true };
}

/** 분석용 평탄 행 — 뷰가 `security_invoker` 라 하부 RLS 가 그대로 적용된다 */
export interface SpecSubmissionFlatRow {
  submission_id: string;
  task_id: string;
  assignee_resource_id: string;
  assignee_name: string | null;
  unit_key: string | null;
  submitted_at: string;
  resubmitted_at: string | null;
  document_id: string;
  title: string;
  version: number;
  template_version_id: string;
  plan: Record<string, unknown>;
  field_values: Record<string, unknown>;
  row_values: Record<string, Record<string, unknown>[]>;
}

export async function fetchTaskSpecSubmissionsFlat(taskId: string): Promise<SpecSubmissionFlatRow[]> {
  const { data, error } = await supabase
    .from('task_spec_submission_view')
    .select('*')
    .eq('task_id', taskId)
    .order('submitted_at', { ascending: true });
  if (error) throw new Error(`제출 현황 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as SpecSubmissionFlatRow[];
}

/** 매니저·담당자가 제출된 문서 1건을 읽는다(새 SELECT 정책이 범위를 정한다) */
export async function getSpecDocumentById(id: string): Promise<SpecDocumentRow | null> {
  const { data, error } = await supabase
    .from('task_action_document')
    .select('id, action_id, title, status, version, family_id, previous_version_id, template_version_id, plan, knowledge, field_values, row_values, user_context, archived_at, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`문서 조회 실패: ${error.message}`);
  return (data ?? null) as unknown as SpecDocumentRow | null;
}

/**
 * 저장된 **값**으로 HWPX 를 다시 만든다 — 이 기능의 핵심.
 *
 * **LLM·DB 조회가 없다.** `runSpecFillPipeline` 을 타면 `resolveKnowledge` 가 **열람자
 * 권한으로 DB 를 다시 읽어** 제출 시점과 다른 문서가 나올 수 있다(매니저가 열면 매니저가
 * 보는 데이터로 채워진다). 그래서 저장된 `knowledge` 를 그대로 쓰고 `fillDocument` 만 부른다.
 *
 * `template_version_id` 가 **버전 행**을 가리키므로 양식이 나중에 바뀌어도(새 버전 = 새 행)
 * 제출 시점의 서식이 그대로 나온다.
 */
export async function rebuildSpecDocumentBlob(doc: SpecDocumentRow): Promise<Blob> {
  const { exportHwpxSections, getSpecTemplateById, downloadSpecTemplateSource, loadHwpxSections } =
    await import('@/features/task-workflow/services/specTemplateService');
  const tpl = await getSpecTemplateById(doc.template_version_id);
  const blob = await downloadSpecTemplateSource(tpl);
  const source = await loadHwpxSections(blob);
  const spec = normalizeSpecPlanKeys(tpl.spec);
  const filled = await fillDocument(source.sections, {
    spec,
    plan: doc.plan,
    knowledge: doc.knowledge,
    // 확정된 값(서술 본문 포함)을 그대로 얹는다 — 생성기를 주지 않으므로 LLM 을 부르지 않는다
    presetValues: doc.field_values,
  });
  return exportHwpxSections(source, filled.sections);
}

/**
 * 이 할 일의 **제출용 실행** 를 보장한다(매니저가 할 일을 저장할 때 1회).
 *
 * 담당자들은 이 실행 하나를 **공유 실행**해 각자 자기 문서(`created_by`=본인)를 만든다 —
 * 문서화된 "노드 기본 스펙 + 공유 실행" 모델 그대로다.
 *
 * **`bindTaskAction` 를 쓰지 않는다**: 그 upsert 는 `config: {}` 로 덮어써 우리가 넣은
 * `origin`·`defaultTemplate` 을 날린다. 여기서는 조회 후 없으면 insert, 있으면 config 를
 * **병합**한다.
 *
 * `origin: 'submission'` 인 이유: `task_action_select_teachers` 정책이 `origin='docgen'` 인
 * 행에만 `visibility='public'` 을 요구한다. docgen 으로 두면 비공개 항목이 담당자에게
 * 아예 안 보이는 함정에 걸린다.
 */
export async function ensureSubmissionAction(input: {
  taskId: string;
  template: SubmissionTemplateRef;
  taskTitle?: string;
}, client = supabase): Promise<string> {
  const { data: auth } = await client.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data: existing, error: readErr } = await client
    .from('task_action')
    .select('id, config')
    .eq('task_id', input.taskId)
    .eq('created_by', userId)
    .eq('action_type', 'document.spec_fill')
    .maybeSingle();
  if (readErr) throw new Error(`제출용 실행 조회 실패: ${readErr.message}`);

  const defaultTemplate = {
    id: input.template.id,
    name: input.template.name ?? null,
    familyId: input.template.familyId ?? null,
  };

  if (existing) {
    const prev = (existing.config ?? {}) as Record<string, unknown>;
    const { error } = await client
      .from('task_action')
      .update({ config: { ...prev, origin: 'submission', defaultTemplate } as never, archived_at: null })
      .eq('id', existing.id);
    if (error) throw new Error(`제출용 실행 갱신 실패: ${error.message}`);
    return existing.id;
  }

  const { data: created, error } = await client
    .from('task_action')
    .insert({
      task_id: input.taskId,
      created_by: userId,
      action_type: 'document.spec_fill',
      handler_version: 1,
      title: input.taskTitle ? `${input.taskTitle} 제출 양식` : '제출 양식',
      description: '담당자가 이 양식에 값을 채워 제출합니다.',
      ...submissionActionModes,
      config: { origin: 'submission', defaultTemplate } as never,
    } as never)
    .select('id')
    .single();
  if (error) throw new Error(`제출용 실행 생성 실패: ${error.message}`);
  return (created as unknown as { id: string }).id;
}
