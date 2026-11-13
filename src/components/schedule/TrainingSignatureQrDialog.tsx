import React from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Copy, QrCode, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { useTrainingSignatures } from '@/hooks/useTrainingSignatures';
import { useToast } from '@/hooks/use-toast';

/**
 * 휴대폰으로 서명받기 — QR 표시 모달.
 *
 * QR은 그냥 **서명 페이지로 가는 링크**다. 서명 자체는 로그인 사용자만 가능하고
 * (2026-08-14 사용자 결정: 익명 서명 불가) 서버는 로그인한 본인 이름으로만 저장을 허용한다.
 * 따라서 QR이 유출돼도 남의 이름으로 서명되지 않는다 — QR에 유효기간·토큰을 두지 않는 이유.
 */

interface TrainingSignatureQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingTitle: string;
  /** meta.assignee 참석자 수 — 진행률 표시용 */
  totalAssignees: number;
}

export const TrainingSignatureQrDialog: React.FC<TrainingSignatureQrDialogProps> = ({
  open,
  onOpenChange,
  meetingId,
  meetingTitle,
  totalAssignees,
}) => {
  const { toast } = useToast();
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const signUrl = React.useMemo(
    () => `${window.location.origin}/training-sign/${meetingId}`,
    [meetingId],
  );

  // 모달이 열려 있는 동안만 진행률을 갱신한다(강의실 화면에 띄워두고 지켜보는 용도).
  const { data: signatures = [] } = useTrainingSignatures(meetingId, open);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    QRCode.toDataURL(signUrl, { width: 720, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((error) => {
        console.error('QR 생성 실패:', error);
        if (!cancelled) setQrDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, signUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(signUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: '복사 실패', description: '주소를 길게 눌러 직접 복사해 주세요.', variant: 'destructive' });
    }
  };

  const signedCount = signatures.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-md flex-col gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-2.5">
            <TitleIconChip icon={QrCode} tone="indigo" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-left text-base">휴대폰으로 서명받기</DialogTitle>
              <p className="mt-0.5 truncate text-left text-xs text-slate-500">{meetingTitle}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="flex justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="연수 서명 페이지 QR 코드"
                className="h-56 w-56 rounded-lg border bg-white p-2"
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-slate-50 text-xs text-slate-400">
                QR 생성 중...
              </div>
            )}
          </div>

          <p className="text-center text-sm text-slate-600">
            참석자가 휴대폰 카메라로 찍으면 서명 화면이 열립니다.
          </p>

          <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-600">{signUrl}</code>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 shrink-0 px-2 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="ml-1">{copied ? '복사됨' : '복사'}</span>
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
            <span className="text-xs font-medium text-indigo-900">서명 현황</span>
            <Badge variant="secondary" className="bg-white text-indigo-700">
              {signedCount} / {totalAssignees}명
            </Badge>
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            서명하려면 학교 계정 로그인이 필요합니다. 로그인 후 서명 화면으로 자동 이동하며,
            본인 이름으로만 서명할 수 있습니다.
          </p>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
          >
            <X className="h-3.5 w-3.5" />
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
