import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { PurchaseRequestStatus } from '../types';
import { STATUS_OPTIONS } from '../purchaseRequestStatus';

interface BulkStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** '품목' | '건' — 선택 단위가 뷰마다 다르다 */
  unitLabel: string;
  /** 신청건 단위 변경이면 형제 품목까지 함께 바뀐다는 사실을 알린다 */
  affectsWholeRequest: boolean;
  pending: boolean;
  onApply: (status: PurchaseRequestStatus, reason: string | null) => void;
}

/**
 * 선택한 품목·신청의 상태를 한 번에 바꾼다 (2026-09-02).
 *
 * 종전엔 상태 select 와 사유 입력이 **선택 액션 바 안에** 있었다. 바가 화면 아래에 뜨는
 * 구조로 바뀌면서 입력 요소까지 얹으니 좁은 화면에서 줄바꿈으로 화면을 크게 가렸고,
 * 사유는 한 줄 input 이라 긴 문장을 쓰기도 나빴다. 바에는 버튼만 남기고 입력은 모달로 옮긴다.
 */
export function BulkStatusDialog({
  open,
  onOpenChange,
  count,
  unitLabel,
  affectsWholeRequest,
  pending,
  onApply,
}: BulkStatusDialogProps) {
  const [status, setStatus] = useState<PurchaseRequestStatus>('approved');
  const [reason, setReason] = useState('');

  // 열 때마다 초기화 — 직전 일괄 처리의 사유가 남아 엉뚱한 품목에 붙는 것을 막는다
  useEffect(() => {
    if (open) {
      setStatus('approved');
      setReason('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            <TitleIconChip icon={CheckCircle2} tone="emerald" />
            <span className="truncate">상태 일괄 변경</span>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              {count}
              {unitLabel}
            </Badge>
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs text-slate-500">
            {affectsWholeRequest
              ? '선택한 신청의 모든 품목 상태가 함께 바뀝니다.'
              : '선택한 품목만 바뀝니다. 같은 신청의 다른 품목은 그대로입니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="space-y-1.5">
            <SectionLabel icon={CheckCircle2}>상태</SectionLabel>
            <RadioGroup
              value={status}
              onValueChange={(v) => setStatus(v as PurchaseRequestStatus)}
              className="grid grid-cols-2 gap-1.5"
            >
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`bulk-status-${opt.value}`}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                    status === opt.value
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <RadioGroupItem
                    id={`bulk-status-${opt.value}`}
                    value={opt.value}
                    className="h-3.5 w-3.5"
                  />
                  {opt.label}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-status-reason" className="text-[11px] font-medium text-slate-600">
              사유 <span className="font-normal text-slate-400">(선택)</span>
            </Label>
            <Textarea
              id="bulk-status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="신청자에게 보여줄 사유 (예: 예산 초과로 구매 불가)"
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-[10px] text-slate-400">
              선택한 {count}
              {unitLabel}에 같은 사유가 붙습니다.
            </p>
          </div>
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
          >
            취소
          </Button>
          <Button
            onClick={() => onApply(status, reason.trim() ? reason.trim() : null)}
            disabled={pending || count === 0}
            className={`${FOOTER_BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700`}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {count}
            {unitLabel} 적용
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
