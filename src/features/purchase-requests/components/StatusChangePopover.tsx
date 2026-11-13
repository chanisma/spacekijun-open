import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUpdatePurchaseRequestStatus } from '../hooks/usePurchaseRequests';
import { PurchaseRequestStatus } from '../types';
import { STATUS_COLOR, STATUS_OPTIONS } from '../purchaseRequestStatus';

interface StatusChangePopoverProps {
  requestId: string;
  pageId: string;
  status: PurchaseRequestStatus;
  reason?: string | null;
  /**
   * 바꿀 품목. 생략하면 신청건의 **모든 품목**을 함께 바꾼다(종전 동작).
   * 품목 1개를 넘기면 그 품목만 바뀌고 신청건 상태는 서버가 파생한다.
   */
  rowIds?: string[] | null;
  /** 팝오버 상단에 "무엇을 바꾸는지" 적는다 — 신청건과 품목이 같은 모양의 배지라 헷갈린다 */
  scopeLabel?: string;
  /** 표 셀 안에서 쓰는 작은 배지 */
  compact?: boolean;
  /** 상태가 신청건 상태를 그대로 따르고 있을 때(아직 개별 지정 전) 흐리게 */
  inherited?: boolean;
}

// 매니저가 상태 배지를 클릭하면 열리는 작은 팝오버.
// 상태 라디오 + 사유(선택) 입력 후 저장한다.
export function StatusChangePopover({
  requestId,
  pageId,
  status,
  reason,
  rowIds,
  scopeLabel,
  compact = false,
  inherited = false,
}: StatusChangePopoverProps) {
  const { toast } = useToast();
  const updateStatus = useUpdatePurchaseRequestStatus();
  const [open, setOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<PurchaseRequestStatus>(status);
  const [draftReason, setDraftReason] = useState<string>(reason ?? '');
  // 같은 신청 안에 품목 팝오버가 여러 개라 requestId 만으로는 라디오 id 가 겹친다
  const uid = `${requestId}-${rowIds?.join('_') ?? 'all'}`;

  // 팝오버를 열 때마다 현재 서버 값으로 초기화 (다른 곳에서 바뀌었을 수 있음)
  useEffect(() => {
    if (open) {
      setDraftStatus(status);
      setDraftReason(reason ?? '');
    }
  }, [open, status, reason]);

  const unchanged = draftStatus === status && (draftReason.trim() || '') === (reason ?? '').trim();

  const handleSave = () => {
    updateStatus.mutate(
      {
        requestId,
        status: draftStatus,
        reason: draftReason.trim() ? draftReason.trim() : null,
        rowIds: rowIds ?? null,
        pageId,
      },
      {
        onSuccess: () => {
          toast({
            title: '상태 변경 완료',
            description: rowIds
              ? `${scopeLabel ?? '선택한 품목'}의 상태가 업데이트되었습니다.`
              : '신청 내 모든 품목의 상태가 업데이트되었습니다.',
          });
          setOpen(false);
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : '상태 변경 중 오류';
          toast({ title: '상태 변경 실패', description: msg, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          title={rowIds ? `${scopeLabel ?? '품목'} 상태 변경` : '신청 전체 상태 변경'}
        >
          <Badge
            variant="secondary"
            className={`${STATUS_COLOR[status]} ${compact ? 'px-1.5 py-0 text-[11px]' : ''} ${
              inherited ? 'opacity-60' : ''
            }`}
          >
            {STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}
            <ChevronDown className="ml-0.5 h-3 w-3" />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        {scopeLabel && (
          <div className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
            변경 대상 · <span className="font-semibold text-slate-800">{scopeLabel}</span>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-600">상태</Label>
          <RadioGroup
            value={draftStatus}
            onValueChange={(v) => setDraftStatus(v as PurchaseRequestStatus)}
            className="grid grid-cols-2 gap-1.5"
          >
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`status-${uid}-${opt.value}`}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 cursor-pointer text-sm transition-colors ${
                  draftStatus === opt.value
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <RadioGroupItem
                  id={`status-${uid}-${opt.value}`}
                  value={opt.value}
                  className="h-3.5 w-3.5"
                />
                {opt.label}
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`reason-${uid}`}
            className="text-xs font-semibold text-slate-600"
          >
            사유 <span className="font-normal text-slate-400">(선택)</span>
          </Label>
          <Textarea
            id={`reason-${uid}`}
            value={draftReason}
            onChange={(e) => setDraftReason(e.target.value)}
            placeholder="신청자에게 보여줄 사유를 입력하세요 (예: 예산 초과로 구매 불가)"
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(false)}
            className="h-8"
          >
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateStatus.isPending || unchanged}
            className="h-8"
          >
            {updateStatus.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            저장
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
