import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, PenTool, X } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { SignaturePad } from '@/components/signature/SignaturePad';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import { useSubmitTrainingSignature, type TrainingSignature } from '@/hooks/useTrainingSignatures';
import { useToast } from '@/hooks/use-toast';
import type { SignatureStrokes } from '@/lib/signatureStrokes';

/**
 * 연수 참석 서명 입력 모달.
 *
 * 프로필에 등록해둔 서명을 재사용하지 않고 **그 자리에서 직접** 받는다
 * (2026-08-14 사용자 결정). 이미 서명한 경우엔 기존 서명을 보여주고 다시 서명할 수 있게 한다.
 */

interface TrainingSignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingTitle: string;
  meetingDate?: Date | null;
  signerName: string;
  resourceId?: string | null;
  /** 이미 저장된 내 서명(있으면 '다시 서명' 흐름) */
  existing?: TrainingSignature | null;
  source?: 'app' | 'qr';
  onSigned?: () => void;
}

export const TrainingSignDialog: React.FC<TrainingSignDialogProps> = ({
  open,
  onOpenChange,
  meetingId,
  meetingTitle,
  meetingDate,
  signerName,
  resourceId,
  existing,
  source = 'app',
  onSigned,
}) => {
  const { toast } = useToast();
  const submit = useSubmitTrainingSignature();
  const [strokes, setStrokes] = React.useState<SignatureStrokes | null>(null);

  // 모달을 다시 열면 이전에 그리던 획이 남지 않도록 초기화한다.
  React.useEffect(() => {
    if (open) setStrokes(null);
  }, [open]);

  const handleSubmit = async () => {
    if (!strokes) return;
    try {
      await submit.mutateAsync({ meetingId, signerName, resourceId, strokes, source });
      toast({ title: '서명 완료', description: '연수 참석 서명이 저장되었습니다.' });
      onOpenChange(false);
      onSigned?.();
    } catch (error) {
      toast({
        title: '서명 저장 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-2.5">
            <TitleIconChip icon={PenTool} tone="indigo" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-left text-base">연수 참석 서명</DialogTitle>
              <p className="mt-0.5 truncate text-left text-xs text-slate-500">
                {meetingTitle}
                {meetingDate ? ` · ${format(meetingDate, 'M월 d일 (E)', { locale: ko })}` : ''}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs text-slate-500">서명자</span>
            <span className="text-sm font-semibold text-slate-800">{signerName}</span>
          </div>

          {existing && (
            <div className="space-y-2">
              <SectionLabel icon={Check}>이미 저장된 서명</SectionLabel>
              <div className="flex h-20 items-center justify-center rounded-lg border bg-white p-2 text-slate-800">
                <SignatureStrokesView value={existing.strokes} title={`${signerName} 서명`} />
              </div>
              <p className="text-xs text-slate-500">
                아래에 다시 서명하면 이 서명을 대체합니다.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <SectionLabel icon={PenTool}>{existing ? '새로 서명' : '서명'}</SectionLabel>
            <SignaturePad onChange={setStrokes} disabled={submit.isPending} />
          </div>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submit.isPending}
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
          >
            <X className="h-3.5 w-3.5" />
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!strokes || submit.isPending} className="h-8 gap-1.5 px-3 text-xs">
            <Check className="h-3.5 w-3.5" />
            {submit.isPending ? '저장 중...' : '서명 제출'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
