import React from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, FileText, PenTool, Stamp, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import { SignaturePad } from '@/components/signature/SignaturePad';
import type { SignatureStrokes } from '@/lib/signatureStrokes';
import { ApprovalLine } from '@/features/approval/components/ApprovalLine';
import { approvalSubject } from '@/features/approval/registry';
import { useActOnApproval, useApprovalRequest } from '@/features/approval/hooks/useApprovals';
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TONE,
  currentStep,
  isMyTurn,
} from '@/features/approval/types';

/**
 * 휴대폰 결재 서명 페이지 (`/approval-sign/:requestId`).
 *
 * QR로 여는 화면이라 앱 셸(사이드바·헤더) 없이 단독으로 렌더한다.
 * 로그인 필수 — 라우트가 public 화이트리스트에 없으므로 `RequireAuth`가 막고,
 * 로그인 후 이 주소로 되돌아온다(`sessionStorage` 경유). 연수 서명 페이지와 같은 구조.
 *
 * 권한 판정은 화면이 아니라 서버가 한다: `act_on_approval_step`이 요청 행을 잠그고
 * "지금 차례인 결재자 본인"인지, 승인이면 서명이 있는지 다시 검증한다.
 */
export default function ApprovalSign() {
  const { requestId } = useParams<{ requestId: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useProfile();
  const act = useActOnApproval();

  const [strokes, setStrokes] = React.useState<SignatureStrokes | null>(null);
  const [comment, setComment] = React.useState('');

  const { data: request, isLoading, error } = useApprovalRequest(requestId);

  const submit = async (action: 'approve' | 'reject') => {
    if (!requestId) return;
    if (action === 'approve' && !strokes) return;
    try {
      await act.mutateAsync({
        requestId,
        action,
        signature: action === 'approve' ? strokes : null,
        comment: comment.trim() || null,
      });
      setStrokes(null);
      setComment('');
      toast({
        title: action === 'approve' ? '결재 완료' : '반려 처리됨',
        description:
          action === 'approve'
            ? '서명이 저장되었습니다.'
            : '신청자가 내용을 고쳐 다시 상신할 수 있습니다.',
      });
    } catch (err) {
      toast({
        title: '처리 실패',
        description: err instanceof Error ? err.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const loading = isLoading || !profile;
  const definition = request ? approvalSubject(request.subject_type) : null;
  const myTurn = request ? isMyTurn(request, user?.id, profile?.name) : false;
  const step = request ? currentStep(request) : null;
  const busy = act.isPending;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <header className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
            <Stamp className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">결재 서명</h1>
        </header>

        {loading ? (
          <Card>
            <div className="flex items-center justify-center py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            </div>
          </Card>
        ) : error || !request ? (
          <Card>
            <Message
              title="결재 정보를 불러올 수 없습니다"
              body="주소가 정확한지 확인해 주세요. 결재선에 없는 문서는 열람할 수 없습니다."
            />
          </Card>
        ) : (
          <>
            <Card>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 flex-1 text-base font-semibold text-slate-900">
                    {request.title}
                  </h2>
                  <Badge
                    variant="outline"
                    className={cn('shrink-0 text-xs', APPROVAL_STATUS_TONE[request.status])}
                  >
                    {APPROVAL_STATUS_LABEL[request.status]}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {definition?.label ?? request.subject_type} · {request.requester_name} 상신 ·{' '}
                  {format(new Date(request.created_at), 'M월 d일 HH:mm')}
                </p>
                <div className="overflow-x-auto pb-1">
                  <ApprovalLine request={request} />
                </div>
              </div>
            </Card>

            {request.summary && (
              <Card>
                <div className="space-y-1.5">
                  <SectionTitle icon={FileText}>결재 내용</SectionTitle>
                  <p className="text-sm text-slate-700">{request.summary}</p>
                </div>
              </Card>
            )}

            {/* 반려 사유 등 이미 남은 의견은 상태와 무관하게 보여준다. */}
            {request.steps.some((s) => s.comment) && (
              <Card>
                <div className="space-y-1.5">
                  <SectionTitle icon={FileText}>결재 의견</SectionTitle>
                  {request.steps
                    .filter((s) => s.comment)
                    .map((s) => (
                      <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span className="font-medium text-slate-700">
                          {s.role_label} {s.approver_name}
                        </span>
                        <span
                          className={cn(
                            'ml-2 text-xs',
                            s.status === 'rejected' ? 'text-rose-600' : 'text-slate-500',
                          )}
                        >
                          {s.status === 'rejected' ? '반려' : '승인'}
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{s.comment}</p>
                      </div>
                    ))}
                </div>
              </Card>
            )}

            {request.status !== 'pending' ? (
              <Card>
                <Message
                  title={`${APPROVAL_STATUS_LABEL[request.status]} 상태입니다`}
                  body="더 이상 결재할 수 없습니다. 위 결재란에서 처리 결과를 확인하세요."
                />
              </Card>
            ) : !myTurn ? (
              <Card>
                <Message
                  title="지금은 결재 차례가 아닙니다"
                  body={
                    step
                      ? `${step.role_label} ${step.approver_name} 선생님의 결재를 기다리는 중입니다.`
                      : '결재 단계를 확인할 수 없습니다.'
                  }
                />
              </Card>
            ) : (
              <Card>
                <div className="space-y-3">
                  <SectionTitle icon={PenTool}>
                    {step?.role_label} 결재 — {step?.approver_name}
                  </SectionTitle>
                  <p className="text-xs text-slate-600">
                    아래 서명이 문서 결재란의 <b>{step?.role_label}</b> 칸에 그대로 표시됩니다.
                  </p>
                  {/* 세로 화면에서 손가락으로 쓰기 좋게 캔버스를 조금 더 높인다. */}
                  <SignaturePad onChange={setStrokes} aspectRatio={1.8} disabled={busy} />
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="의견 (선택). 반려 시에는 사유를 남겨 주세요."
                    className="min-h-[60px] text-sm"
                    disabled={busy}
                  />
                  <Button
                    onClick={() => submit('approve')}
                    disabled={!strokes || busy}
                    className="h-11 w-full gap-1.5 text-sm"
                  >
                    <Check className="h-4 w-4" />
                    {act.isPending ? '처리 중...' : '서명하고 결재'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => submit('reject')}
                    disabled={busy}
                    className="h-9 w-full gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <X className="h-3.5 w-3.5" />
                    반려
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border bg-white p-4 shadow-sm">{children}</div>
);

const SectionTitle: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({
  icon: Icon,
  children,
}) => (
  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
    <Icon className="h-3.5 w-3.5" />
    {children}
  </div>
);

const Message: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="py-4 text-center">
    <p className="text-sm font-medium text-slate-800">{title}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
  </div>
);
