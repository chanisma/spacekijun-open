import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { DOCUMENT_ANALYSIS_PROMPT_VERSION } from '../analysis/prompts';
import { normalizeCandidateEdits } from '../analysis/candidateEdits';
import { DEFAULT_DOCUMENT_ANALYSIS_MODEL } from './documentAnalysisService';
import type {
  DocumentAnalysisHistoryRecord,
  DocumentAnalysisResult,
  DocumentCandidateDecision,
  DocumentFingerprint,
  DocumentFormat,
  DocumentHistoryMatch,
  ParsedSchoolDocument,
} from '../types';

interface AnalysisHistoryRow {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  format: DocumentFormat;
  file_sha256: string;
  document_key: string;
  parser_version: string;
  prompt_version: string;
  model: string;
  analysis_result: DocumentAnalysisResult;
  status: DocumentAnalysisHistoryRecord['status'];
  revision_of: string | null;
  applied_event_id: string | null;
  applied_at: string | null;
  created_at: string;
}

interface AnalysisDecisionRow {
  candidate_local_id: string;
  decision: DocumentCandidateDecision['decision'];
  linked_event_id: string | null;
  linked_task_id: string | null;
  created_task_id: string | null;
}

function normalizeDocumentKey(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '').normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
  const withoutBracketedRevision = withoutExtension.replace(
    /\s*(?:\(|\[).*?(?:수정|개정|최종|최종본|버전|version|ver\.?|v\s*\d+).*?(?:\)|\])\s*$/giu,
    ''
  );
  return withoutBracketedRevision
    .replace(/(?:[\s_-]+(?:수정|개정|최종(?:본)?|버전\s*\d+|ver\.?\s*\d+(?:\.\d+)*|v\s*\d+(?:\.\d+)*|\d+차))+\s*$/giu, '')
    .replace(/\s+/g, ' ')
    .trim() || withoutExtension;
}

export async function createDocumentFingerprint(file: File): Promise<DocumentFingerprint> {
  if (!globalThis.crypto?.subtle) throw new Error('이 브라우저에서는 안전한 파일 지문 생성을 지원하지 않습니다.');
  const bytes = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { sha256, documentKey: normalizeDocumentKey(file.name) };
}

async function getAuthenticatedUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('문서 분석 이력을 저장하려면 로그인이 필요합니다.');
  return user.id;
}

async function loadDecisions(analysisId: string): Promise<DocumentCandidateDecision[]> {
  const { data, error } = await supabase
    .from('task_document_analysis_decision')
    .select('candidate_local_id, decision, linked_event_id, linked_task_id, created_task_id')
    .eq('analysis_id', analysisId);
  if (error) throw error;
  return ((data ?? []) as AnalysisDecisionRow[]).map((row) => ({
    candidateId: row.candidate_local_id,
    decision: row.decision,
    linkedWorkId: row.linked_event_id,
    linkedTaskId: row.linked_task_id,
    createdTaskId: row.created_task_id,
  }));
}

const CANDIDATE_TYPE_VALUES = new Set([
  'event', 'task', 'submission', 'approval', 'constraint', 'information',
]);

/**
 * 이력에서 읽은 사용자 수정분을 **믿지 않고 검사한다**.
 *
 * `analysis_result` 는 자유 JSONB 라 손으로도 고칠 수 있고, 후보 localId 는 재분석 때
 * 바뀐다. 검사하지 않으면 존재하지 않는 후보에 달린 수정이 조용히 남아 «수정됨» 배지만
 * 늘어나거나, 잘못된 유형 문자열이 화면 분기를 통과한다.
 */
function withValidatedEdits(analysis: DocumentAnalysisResult): DocumentAnalysisResult {
  const localIds = new Set((analysis?.candidates ?? []).map((candidate) => candidate.localId));
  const edits = normalizeCandidateEdits(analysis?.candidateEdits, localIds, CANDIDATE_TYPE_VALUES);
  if (!edits) {
    if (!analysis?.candidateEdits) return analysis;
    const { candidateEdits: _dropped, ...rest } = analysis;
    return rest as DocumentAnalysisResult;
  }
  return { ...analysis, candidateEdits: edits };
}

async function toHistoryRecord(row: AnalysisHistoryRow | null): Promise<DocumentAnalysisHistoryRecord | null> {
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    format: row.format,
    fileSha256: row.file_sha256,
    documentKey: row.document_key,
    parserVersion: row.parser_version,
    promptVersion: row.prompt_version,
    model: row.model,
    analysis: withValidatedEdits(row.analysis_result),
    status: row.status,
    revisionOf: row.revision_of,
    appliedWorkId: row.applied_event_id,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    decisions: await loadDecisions(row.id),
  };
}

async function findLatestAnalysis(
  column: 'file_sha256' | 'document_key',
  value: string,
  excludedHash?: string
): Promise<DocumentAnalysisHistoryRecord | null> {
  let query = supabase
    .from('task_document_analysis')
    .select('*')
    .eq(column, value)
    .order('created_at', { ascending: false })
    .limit(1);
  if (excludedHash) query = query.neq('file_sha256', excludedHash);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return toHistoryRecord((data ?? null) as AnalysisHistoryRow | null);
}

export async function findDocumentAnalysisHistory(file: File): Promise<DocumentHistoryMatch> {
  await getAuthenticatedUserId();
  const fingerprint = await createDocumentFingerprint(file);
  const [exact, previousRevision] = await Promise.all([
    findLatestAnalysis('file_sha256', fingerprint.sha256),
    findLatestAnalysis('document_key', fingerprint.documentKey, fingerprint.sha256),
  ]);
  return { fingerprint, exact, previousRevision };
}

export async function saveDocumentAnalysis(params: {
  file: File;
  parsed: ParsedSchoolDocument;
  analysis: DocumentAnalysisResult;
  fingerprint?: DocumentFingerprint;
  revisionOf?: string | null;
  model?: string;
}): Promise<DocumentAnalysisHistoryRecord> {
  const createdBy = await getAuthenticatedUserId();
  const fingerprint = params.fingerprint ?? await createDocumentFingerprint(params.file);
  const { data, error } = await supabase
    .from('task_document_analysis')
    .insert({
      created_by: createdBy,
      file_name: params.file.name,
      file_size: params.file.size,
      mime_type: params.file.type,
      format: params.parsed.format,
      file_sha256: fingerprint.sha256,
      document_key: fingerprint.documentKey,
      parser_version: params.parsed.parserVersion,
      prompt_version: DOCUMENT_ANALYSIS_PROMPT_VERSION,
      model: params.model ?? DEFAULT_DOCUMENT_ANALYSIS_MODEL,
      analysis_result: params.analysis,
      revision_of: params.revisionOf ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  const record = await toHistoryRecord(data as AnalysisHistoryRow);
  if (!record) throw new Error('저장된 문서 분석 이력을 불러오지 못했습니다.');
  return record;
}

/**
 * 카드 수정분을 이력 행에 저장한다 (2026-09-23).
 *
 * `analysis_result` 를 통째로 덮어쓰되 **AI 원본(`candidates`)은 그대로 실어 보낸다** —
 * 수정은 `candidateEdits` 에만 담기므로 원본이 지워지지 않는다(그것이 이 설계의 요점이다).
 * 새 컬럼이 없어 마이그레이션도 필요 없다.
 *
 * ⚠️ 읽고-고쳐-쓰기라 **마지막 쓰기가 이긴다**. 이 표는 RLS 가 `created_by` 본인으로
 * 묶여 있고 편집 지점이 이 모달 하나뿐이라 지금은 충돌할 자리가 없다. 다른 화면에서도
 * 같은 행을 고치게 되면 그때는 jsonb_set RPC 로 옮길 것.
 *
 * **status 는 건드리지 않는다** — 'reviewed' 는 «검토 결정을 저장했다»는 뜻이고
 * (`saveDocumentAnalysisDecisions`), 값을 고친 것과는 다른 사건이다.
 */
export async function saveDocumentAnalysisResult(
  analysisId: string,
  analysis: DocumentAnalysisResult
): Promise<void> {
  await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from('task_document_analysis')
    .update({ analysis_result: analysis as unknown as Json })
    .eq('id', analysisId)
    .select('id');
  if (error) throw error;
  // RLS 차단은 오류가 아니라 **0행**으로 온다 — 반환 행으로 실제 반영을 확인한다.
  if (!data || data.length === 0) {
    throw new Error('이 분석 이력을 수정할 권한이 없습니다.');
  }
}

export async function saveDocumentAnalysisDecisions(
  analysisId: string,
  decisions: DocumentCandidateDecision[]
): Promise<void> {
  const decidedBy = await getAuthenticatedUserId();
  if (decisions.length > 0) {
    const { error } = await supabase
      .from('task_document_analysis_decision')
      .upsert(decisions.map((decision) => ({
        analysis_id: analysisId,
        candidate_local_id: decision.candidateId,
        decision: decision.decision,
        linked_event_id: decision.linkedWorkId,
        linked_task_id: decision.linkedTaskId,
        created_task_id: decision.createdTaskId,
        decided_by: decidedBy,
      })), { onConflict: 'analysis_id,candidate_local_id' });
    if (error) throw error;
  }
  const { error } = await supabase
    .from('task_document_analysis')
    .update({ status: 'reviewed' })
    .eq('id', analysisId);
  if (error) throw error;
}

export async function markDocumentAnalysisApplied(
  analysisId: string,
  workId: string,
  createdTaskIds: Record<string, string> = {}
): Promise<void> {
  const { error } = await supabase
    .from('task_document_analysis')
    .update({ status: 'applied', applied_event_id: workId, applied_at: new Date().toISOString() })
    .eq('id', analysisId);
  if (error) throw error;

  await Promise.all(Object.entries(createdTaskIds).map(async ([candidateId, taskId]) => {
    const { error: decisionError } = await supabase
      .from('task_document_analysis_decision')
      .update({ created_task_id: taskId })
      .eq('analysis_id', analysisId)
      .eq('candidate_local_id', candidateId)
      .eq('decision', 'create');
    if (decisionError) throw decisionError;
  }));
}
