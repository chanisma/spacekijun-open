import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Download, FileText, Loader2, PenTool, RotateCcw, Stamp, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_DESTRUCTIVE_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import type { SignatureStrokes } from '@/lib/signatureStrokes';
import { approvalSubject } from '../registry';
import { useActOnApproval, useApprovalRequest, useCancelApproval } from '../hooks/useApprovals';
import { ApprovalLine } from './ApprovalLine';
import { ApprovalSignQr } from './ApprovalSignQr';
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TONE,
  approvedSignatures,
  currentStep,
  isMyTurn,
  type ApprovalRequest,
} from '../types';

/**
 * 결재 상세 — 내용을 확인하고 서명해서 승인하거나 반려한다.
 *
 * 승인에는 **그 자리 서명이 필수**다(서버도 거부한다). 그 서명이 곧 문서 결재란에 찍히는
 * 그림이므로, 서명 없이 승인되면 결재란이 빈 채로 남는다.
 */

interface ApprovalActDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ApprovalRequest;
  /**
   * 취소·반려된 결재를 신청자가 다시 올리는 경로. 넘기지 않으면 버튼이 나오지 않는다.
   * 여기서 열어야 반려 사유를 보면서 결재선을 다시 짤 수 있다.
   */
  onResubmit?: () => void;
}

export const ApprovalActDialog: React.FC<ApprovalActDialogProps> = ({
  open,
  onOpenChange,
  request: requestProp,
  onResubmit,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useProfile();
  const act = useActOnApproval();
  const cancel = useCancelApproval();

  // 결재자가 QR로 휴대폰에서 서명하면 이 탭에는 focus 이벤트가 없어 자동 갱신이 걸리지 않는다.
  // 그래서 모달이 열려 있는 동안만 짧게 폴링해 결재란·버튼이 실시간으로 따라오게 한다.
  const { data: live } = useApprovalRequest(requestProp.id, open, 5000);
  const request = live ?? requestProp;

  const [strokes, setStrokes] = React.useState<SignatureStrokes | null>(null);
  const [comment, setComment] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setStrokes(null);
      setComment('');
    }
  }, [open, request.id]);

  const definition = approvalSubject(request.subject_type);
  const Preview = definition?.Preview;
  const myTurn = isMyTurn(request, user?.id, profile?.name);
  const step = currentStep(request);
  const isRequester = request.requester_user_id === user?.id;

  const submit = async (action: 'approve' | 'reject') => {
    if (action === 'approve' && !strokes) return;
    try {
      await act.mutateAsync({
        requestId: request.id,
        action,
        signature: action === 'approve' ? strokes : null,
        comment: comment.trim() || null,
      });
      toast({
        title: action === 'approve' ? '결재 완료' : '반려 처리됨',
        description:
          action === 'approve'
            ? '서명이 저장되었습니다. 다음 결재자에게 넘어갑니다.'
            : '신청자가 내용을 고쳐 다시 상신할 수 있습니다.',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '처리 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync(request.id);
      toast({ title: '결재 요청을 취소했습니다' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: '취소 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const [downloading, setDownloading] = React.useState(false);

  // 문서를 만들 줄 아는 대상 타입만 버튼이 나온다(레지스트리가 결정 — 결재 기능은 양식을 모른다).
  const handleDownload = async () => {
    if (!definition?.download) return;
    setDownloading(true);
    try {
      await definition.download(request);
    } catch (error) {
      toast({
        title: '문서 생성 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const signedCount = approvedSignatures(request).length;
  const busy = act.isPending || cancel.isPending || downloading;

  // 취소·반려는 "이 건은 끝"일 뿐 재신청을 막지 않는다(서버도 pending 1건만 막는다).
  // 승인 완료는 제외 — 이미 결재를 받은 문서라 다시 올릴 대상이 아니다.
  const canResubmit =
    !!onResubmit && isRequester && (request.status === 'cancelled' || request.status === 'rejected');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-2.5">
            <TitleIconChip icon={Stamp} tone="indigo" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-left text-base">{request.title}</DialogTitle>
              <p className="mt-0.5 truncate text-left text-xs text-slate-500">
                {definition?.label ?? request.subject_type} · {request.requester_name} 상신 ·{' '}
                {format(new Date(request.created_at), 'M월 d일 HH:mm')}
              </p>
            </div>
            <Badge variant="outline" className={cn('shrink-0 text-xs', APPROVAL_STATUS_TONE[request.status])}>
              {APPROVAL_STATUS_LABEL[request.status]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-2">
            <SectionLabel icon={Stamp}>결재선</SectionLabel>
            <div className="overflow-x-auto pb-1">
              <ApprovalLine request={request} />
            </div>
          </div>

          {(request.summary || Preview) && (
            <div className="space-y-2">
              <SectionLabel icon={FileText}>결재 내용</SectionLabel>
              {request.summary && <p className="text-sm text-slate-700">{request.summary}</p>}
              {Preview && <Preview payload={request.payload} />}
            </div>
          )}

          {/* 이미 처리된 의견은 상태와 무관하게 보여준다 — 반려 사유가 재신청의 근거다 */}
          {request.steps.some((s) => s.comment) && (
            <div className="space-y-2">
              <SectionLabel icon={FileText}>결재 의견</SectionLabel>
              <div className="space-y-1.5">
                {request.steps
                  .filter((s) => s.comment)
                  .map((s) => (
                    <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-700">
                        {s.role_label} {s.approver_name}
                      </span>
                      <span className={cn('ml-2 text-xs', s.status === 'rejected' ? 'text-rose-600' : 'text-slate-500')}>
                        {s.status === 'rejected' ? '반려' : '승인'}
                      </span>
                      <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{s.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {myTurn && step && (
            <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <SectionLabel icon={PenTool}>
                {step.role_label} 결재 — {step.approver_name}
              </SectionLabel>
              <p className="text-xs text-slate-600">
                아래 서명이 문서 결재란의 <b>{step.role_label}</b> 칸에 그대로 표시됩니다.
                마우스로 쓰기 어려우면 오른쪽 QR을 찍어 휴대폰으로 서명하세요.
              </p>
              {/* 좁은 화면에서는 QR을 아래로 내린다 */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <SignaturePad onChange={setStrokes} aspectRatio={2.2} disabled={busy} />
                </div>
                <ApprovalSignQr requestId={request.id} size={92} />
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="의견 (선택). 반려 시에는 사유를 남겨 주세요."
                className="min-h-[60px] text-sm"
                disabled={busy}
              />
            </div>
          )}

          {!myTurn && request.status === 'pending' && step && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              현재 <b>{step.role_label} {step.approver_name}</b> 선생님의 결재를 기다리는 중입니다.
            </p>
          )}
        </div>

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, 'justify-between')}>
          <div className="flex gap-1.5">
            {definition?.download && (
              <Button
                variant="ghost"
                onClick={handleDownload}
                disabled={busy}
                className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloading ? '생성 중…' : signedCount > 0 ? '결재본 내려받기' : '문서 내려받기'}
              </Button>
            )}
            {isRequester && request.status === 'pending' && (
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={busy}
                className={cn(FOOTER_BUTTON_CLASS, FOOTER_DESTRUCTIVE_CLASS)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                상신 취소
              </Button>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <X className="h-3.5 w-3.5" />
              닫기
            </Button>
            {canResubmit && (
              <Button onClick={onResubmit} disabled={busy} className="h-8 gap-1.5 px-3 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                다시 상신
              </Button>
            )}
            {myTurn && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => submit('reject')}
                  disabled={busy}
                  className={cn(FOOTER_BUTTON_CLASS, FOOTER_DESTRUCTIVE_CLASS)}
                >
                  <X className="h-3.5 w-3.5" />
                  반려
                </Button>
                <Button
                  onClick={() => submit('approve')}
                  disabled={busy || !strokes}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  {act.isPending ? '처리 중...' : '서명하고 결재'}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
