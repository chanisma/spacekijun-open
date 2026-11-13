/**
 * 범용 결재(approval) 타입.
 *
 * 결재 대상은 `subject_type` + `subject_id`로 가리킨다 — 기능마다 표가 달라 FK를 걸 수 없다.
 * 허용 타입은 DB가 아니라 **코드 registry**(`registry.tsx`)에서 관리한다(`actionRegistry.ts`와 같은 원칙:
 * DB 값이 곧 실행 경로가 되지 않게 한다).
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalStep {
  id: string;
  request_id: string;
  order_index: number;
  /** 결재란 칸 이름(계·부장·교감·교장). HWPX 결재란 셀을 찾는 키가 된다. */
  role_label: string;
  approver_user_id: string | null;
  approver_resource_id: string | null;
  approver_name: string;
  status: ApprovalStepStatus;
  /** 획 좌표 서명(검증 전 raw). 렌더 전 `parseSignatureStrokes()` 필수 */
  signature: unknown | null;
  comment: string | null;
  acted_at: string | null;
}

export interface ApprovalRequest {
  id: string;
  subject_type: string;
  subject_id: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  requester_user_id: string;
  requester_resource_id: string | null;
  requester_name: string;
  status: ApprovalStatus;
  /** 지금 결재할 차례인 단계의 order_index */
  current_order: number;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  steps: ApprovalStep[];
}

/** 신청 시 넘기는 결재선 한 칸 */
export interface ApprovalStepDraft {
  role_label: string;
  approver_name: string;
  approver_resource_id?: string | null;
}

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: '결재 진행 중',
  approved: '결재 완료',
  rejected: '반려',
  cancelled: '취소',
};

export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** 지금 결재할 차례인 단계. 종료된 요청이면 null. */
export function currentStep(request: ApprovalRequest): ApprovalStep | null {
  if (request.status !== 'pending') return null;
  return request.steps.find((s) => s.order_index === request.current_order) ?? null;
}

/**
 * 승인된 단계의 서명들 — `role_label`이 곧 문서 결재란에서 찍힐 칸 이름이다.
 * `stampApprovalSignatures(blob, stamps)`가 그대로 받는 모양.
 */
export function approvedSignatures(
  request: ApprovalRequest,
): { roleLabel: string; signature: unknown }[] {
  return request.steps
    .filter((step) => step.status === 'approved' && step.signature)
    .map((step) => ({ roleLabel: step.role_label, signature: step.signature }));
}

/** 내 차례인가 — user id가 비면(계정 미보유 결재자) 이름으로 판정하는 서버 규칙과 같다. */
export function isMyTurn(
  request: ApprovalRequest,
  userId: string | undefined,
  profileName: string | undefined,
): boolean {
  const step = currentStep(request);
  if (!step) return false;
  if (step.approver_user_id) return step.approver_user_id === userId;
  return !!profileName && step.approver_name === profileName;
}
