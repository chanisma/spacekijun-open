// R3 값-기반 완성 문서 저장·조회: 완성본은 파일이 아니라
// (템플릿 버전 참조 + plan/knowledge/확정 값 JSONB)로 저장하고, 재구성은
// runSpecFillPipeline에 presetValues를 재주입해 수행한다(prose LLM 무호출·바이트 동일 —
// 회귀: scripts/task-work-spec-test/run-doc-values.mts). 버전은 템플릿과 동일한 선형 계보.

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface SpecDocumentRow {
  id: string;
  /** 소속 실행 — 값 제출에서 "이 문서가 어느 제출 양식의 것인가"를 판정한다 */
  action_id: string;
  title: string;
  status: 'draft' | 'final';
  version: number;
  family_id: string;
  previous_version_id: string | null;
  template_version_id: string;
  plan: Record<string, unknown>;
  knowledge: Record<string, unknown>;
  field_values: Record<string, unknown>;
  row_values: Record<string, Record<string, unknown>[]>;
  user_context: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const DOC_SELECT =
  'id, action_id, title, status, version, family_id, previous_version_id, template_version_id, plan, knowledge, field_values, row_values, user_context, archived_at, created_at, updated_at';

function asRecord(v: Json): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

type DocDbRow = {
  id: string; action_id: string; title: string; status: string; version: number;
  family_id: string; previous_version_id: string | null; template_version_id: string;
  plan: Json; knowledge: Json; field_values: Json; row_values: Json;
  user_context: string | null; archived_at: string | null; created_at: string; updated_at: string;
};

function toRow(r: DocDbRow): SpecDocumentRow {
  return {
    ...r,
    status: r.status === 'final' ? 'final' : 'draft',
    plan: asRecord(r.plan),
    knowledge: asRecord(r.knowledge),
    field_values: asRecord(r.field_values),
    row_values: asRecord(r.row_values) as Record<string, Record<string, unknown>[]>,
  };
}

export interface SpecDocumentContent {
  /** 이 문서를 만든 실행(노드) — 러너 목록이 이 값으로 걸러진다 */
  actionId?: string;
  templateVersionId: string;
  title: string;
  status?: 'draft' | 'final';
  plan: Record<string, unknown>;
  knowledge: Record<string, unknown>;
  fieldValues: Record<string, unknown>;
  rowValues: Record<string, Record<string, unknown>[]>;
  userContext?: string;
}

/**
 * 이 노드에서 내가 저장한 완성 문서(현재 버전만) — **내 것 + 이 실행 것만**(2026-08-14 사용자 결정).
 *
 * `task_action_document`의 SELECT 정책이 이미 `created_by = 나`라 서버가 정본이고,
 * 여기 조건은 **의도를 코드에 남기는 이중 방어**다. 실행 이력과 달리 이쪽은
 * 원래부터 새는 곳이 없었다(확인: 정책 `task_action_document_select_own`, RLS 강제).
 * 정책이 나중에 완화돼도 이 목록만은 조용히 남의 문서를 담지 않는다.
 *
 * **`actionId`로도 거른다**: 완성 문서는 원래 양식 버전에만 연결돼 목록이 전역이었고,
 * 그래서 A 노드를 열어도 B 노드에서 만든 문서가 함께 보였다. 양식으로 거르는 방법도
 * 있지만 같은 양식을 여러 노드가 쓰면 다시 섞인다 — 기준은 "이 노드에서 만든 문서"다.
 * 노드가 삭제된 문서(`action_id` NULL)는 어느 목록에도 뜨지 않는다(행은 보존).
 */
/**
 * 여러 생성 방식의 **내 완성 문서**를 한 번에 — 문서 생성 페이지 헤더의 '완성 문서' 모달용.
 *
 * 그 모달은 "내가 만든 문서 전부"를 보는 자리라 방식마다 따로 부르면 방식 수만큼 왕복이 된다.
 * 어느 방식으로 만든 문서인지는 `action_id` 로 화면에서 붙인다.
 */
export async function listSpecDocumentsForWorks(workIds: string[]): Promise<SpecDocumentRow[]> {
  if (workIds.length === 0) return [];
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`완성 문서 조회 실패: ${authError.message}`);
  const userId = auth.user?.id;
  if (!userId) throw new Error('완성 문서 조회 실패: 로그인이 필요합니다.');
  const { data, error } = await supabase
    .from('task_action_document')
    .select(DOC_SELECT)
    .eq('created_by', userId)
    .in('action_id', workIds)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`완성 문서 조회 실패: ${error.message}`);
  return ((data ?? []) as DocDbRow[]).map(toRow);
}

export async function listSpecDocuments(actionId: string): Promise<SpecDocumentRow[]> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`완성 문서 조회 실패: ${authError.message}`);
  const userId = auth.user?.id;
  if (!userId) throw new Error('완성 문서 조회 실패: 로그인이 필요합니다.');
  const { data, error } = await supabase
    .from('task_action_document')
    .select(DOC_SELECT)
    .eq('created_by', userId)
    .eq('action_id', actionId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`완성 문서 조회 실패: ${error.message}`);
  return ((data ?? []) as DocDbRow[]).map(toRow);
}

/** v1 저장(새 문서) — family_id = 자기 id, 계보 트리거가 형태를 검증 */
export async function createSpecDocument(input: SpecDocumentContent): Promise<SpecDocumentRow> {
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from('task_action_document')
    .insert({
      id,
      family_id: id,
      action_id: input.actionId ?? null,
      template_version_id: input.templateVersionId,
      title: input.title.trim(),
      status: input.status ?? 'draft',
      plan: input.plan as Json,
      knowledge: input.knowledge as Json,
      field_values: input.fieldValues as Json,
      row_values: input.rowValues as unknown as Json,
      user_context: input.userContext?.trim() || null,
    })
    .select(DOC_SELECT)
    .single();
  if (error) throw new Error(`완성 문서 저장 실패: ${error.message}`);
  return toRow(data as DocDbRow);
}

/** 새 버전 저장 — 현재 버전 보관 + 다음 버전 생성을 RPC가 원자적으로 처리 */
export async function createSpecDocumentVersion(
  previousId: string,
  input: SpecDocumentContent,
): Promise<SpecDocumentRow> {
  const { data, error } = await supabase.rpc('create_task_action_document_version', {
    p_previous_document_id: previousId,
    p_id: crypto.randomUUID(),
    p_title: input.title.trim(),
    p_status: input.status ?? 'draft',
    p_plan: input.plan as Json,
    p_knowledge: input.knowledge as Json,
    p_field_values: input.fieldValues as Json,
    p_row_values: input.rowValues as unknown as Json,
    p_user_context: input.userContext ?? null,
    p_template_version_id: input.templateVersionId,
  });
  if (error) throw new Error(`완성 문서 새 버전 저장 실패: ${error.message}`);
  return toRow(data as unknown as DocDbRow);
}

/** draft → final 확정(이후 내용 불변 — 트리거 강제) */
export async function finalizeSpecDocument(id: string): Promise<void> {
  const { error } = await supabase
    .from('task_action_document')
    .update({ status: 'final' })
    .eq('id', id);
  if (error) throw new Error(`완성 문서 확정 실패: ${error.message}`);
}

/** draft 삭제(RLS가 draft 한정, 계보 FK가 중간 버전 삭제 차단) */
export async function deleteSpecDocument(id: string): Promise<void> {
  const { error } = await supabase.from('task_action_document').delete().eq('id', id);
  if (error) throw new Error(`완성 문서 삭제 실패: ${error.message}`);
}

/**
 * 완성 문서 계보 전체 삭제: 최신 버전부터 역순으로 지운다(선행 버전은 후행이 FK로
 * 참조하므로 역순만 가능). final 버전을 만나면 RLS(draft 한정)가 거부 — 확정 문서 보호.
 */
export async function deleteSpecDocumentLineage(familyId: string): Promise<number> {
  const { data, error } = await supabase
    .from('task_action_document')
    .select('id, version, status')
    .eq('family_id', familyId)
    .order('version', { ascending: false });
  if (error) throw new Error(`완성 문서 조회 실패: ${error.message}`);
  const rows = data ?? [];
  let deleted = 0;
  for (const row of rows) {
    if (row.status === 'final') {
      throw new Error(`v${row.version}은(는) 확정(final) 문서라 삭제할 수 없습니다. (이전 ${deleted}개 버전은 삭제됨)`);
    }
    const { error: delError, count } = await supabase
      .from('task_action_document')
      .delete({ count: 'exact' })
      .eq('id', row.id);
    if (delError) throw new Error(`v${row.version} 삭제 실패: ${delError.message}`);
    if (!count) throw new Error(`v${row.version} 삭제가 적용되지 않았습니다(권한 또는 상태 제한).`);
    deleted += count;
  }
  return deleted;
}
