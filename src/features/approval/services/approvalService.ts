import { supabase } from '@/integrations/supabase/client';
import type { ApprovalRequest, ApprovalStep, ApprovalStepDraft } from '../types';
import type { SignatureStrokes } from '@/lib/signatureStrokes';

/**
 * 결재 데이터 계층.
 *
 * **쓰기는 전부 RPC 경유**다. 표에 INSERT/UPDATE 정책을 두지 않은 이유는 상태 전이 때문 —
 * 클라이언트가 직접 쓰면 차례를 건너뛰거나 남의 칸에 서명할 수 있다. 서버가 차례·신원·
 * 서명 유무를 검증하고 요청 행을 잠근 채 전이시킨다.
 */

const REQUEST_COLUMNS =
  'id, subject_type, subject_id, title, summary, payload, requester_user_id, requester_resource_id, requester_name, status, current_order, decided_at, created_at, updated_at';

type RawRequest = Omit<ApprovalRequest, 'steps' | 'payload'> & {
  payload: unknown;
  approval_step: ApprovalStep[] | null;
};

function normalize(row: RawRequest): ApprovalRequest {
  const steps = [...(row.approval_step ?? [])].sort((a, b) => a.order_index - b.order_index);
  return {
    ...row,
    payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>,
    steps,
  };
}

/** 특정 대상에 붙은 결재 요청들(최신순). RLS가 참여자에게만 보여준다. */
export async function fetchApprovalsForSubject(
  subjectType: string,
  subjectId: string,
): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('approval_request')
    .select(`${REQUEST_COLUMNS}, approval_step(*)`)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawRequest[]).map(normalize);
}

/**
 * 결재 요청 한 건. QR로 연 휴대폰 서명 화면처럼 대상(subject)을 모른 채 id만 아는 진입점용.
 * RLS(`can_view_approval_request`)가 참여자·admin이 아니면 0행을 준다 — 없음과 구분하지 않는다.
 */
export async function fetchApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
  const { data, error } = await supabase
    .from('approval_request')
    .select(`${REQUEST_COLUMNS}, approval_step(*)`)
    .eq('id', requestId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalize(data as unknown as RawRequest) : null;
}

/** 내가 볼 수 있는 결재 전부(내가 신청했거나 내가 결재선에 있는 것). RLS가 곧 필터다. */
export async function fetchMyApprovals(): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('approval_request')
    .select(`${REQUEST_COLUMNS}, approval_step(*)`)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return ((data ?? []) as unknown as RawRequest[]).map(normalize);
}

export interface CreateApprovalArgs {
  subjectType: string;
  subjectId: string;
  title: string;
  summary?: string | null;
  /** 결재 시점 스냅샷. 원본이 바뀌어도 결재된 내용은 이 값으로 남는다. */
  payload?: Record<string, unknown>;
  steps: ApprovalStepDraft[];
}

export async function createApprovalRequest(args: CreateApprovalArgs): Promise<string> {
  const { data, error } = await supabase.rpc('create_approval_request', {
    p_subject_type: args.subjectType,
    p_subject_id: args.subjectId,
    p_title: args.title,
    p_summary: args.summary ?? null,
    p_payload: (args.payload ?? {}) as never,
    p_steps: args.steps.map((s) => ({
      role_label: s.role_label,
      approver_name: s.approver_name,
      approver_resource_id: s.approver_resource_id ?? null,
    })) as never,
  });

  if (error) {
    // `approval_request_one_pending_per_subject`(부분 UNIQUE)가 대상별 진행 중 결재를 1건으로 묶는다.
    // 재상신 시 다른 탭에서 이미 올렸거나 취소가 반영되기 전이면 여기로 온다 — 원문은 읽을 수 없다.
    if (error.code === '23505') {
      throw new Error('이미 진행 중인 결재가 있습니다. 화면을 새로고침한 뒤 확인해 주세요.');
    }
    throw error;
  }
  return data as string;
}

export interface ActOnApprovalArgs {
  requestId: string;
  action: 'approve' | 'reject';
  /** 승인 시 필수 — 서버가 거부한다(결재란에 찍을 것이 없어지므로) */
  signature?: SignatureStrokes | null;
  comment?: string | null;
}

export async function actOnApproval(args: ActOnApprovalArgs): Promise<void> {
  const { error } = await supabase.rpc('act_on_approval_step', {
    p_request_id: args.requestId,
    p_action: args.action,
    p_signature: (args.signature ?? null) as never,
    p_comment: args.comment ?? null,
  });
  if (error) throw error;
}

export async function cancelApprovalRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_approval_request', { p_request_id: requestId });
  if (error) throw error;
}
