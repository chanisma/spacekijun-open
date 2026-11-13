import React from 'react';
import { Check, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import type { ApprovalRequest, ApprovalStep } from '../types';

/**
 * 결재란 미니어처.
 *
 * 문서(HWPX)의 결재란과 **같은 모양**으로 그린다 — 칸 이름이 위, 서명이 아래.
 * 화면에서 본 그대로가 문서에 찍히므로 결재자가 결과를 예상할 수 있다.
 */
export const ApprovalLine: React.FC<{
  request: ApprovalRequest;
  className?: string;
  /** 각 칸 높이(px). 상세 모달은 크게, 목록 행은 작게. */
  cellHeight?: number;
}> = ({ request, className, cellHeight = 56 }) => (
  <div className={cn('inline-flex overflow-hidden rounded-lg border border-slate-300', className)}>
    <div className="flex w-9 items-center justify-center border-r border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-500">
      결재
    </div>
    {request.steps.map((step) => (
      <ApprovalCell
        key={step.id}
        step={step}
        isCurrent={request.status === 'pending' && step.order_index === request.current_order}
        cellHeight={cellHeight}
      />
    ))}
  </div>
);

const ApprovalCell: React.FC<{
  step: ApprovalStep;
  isCurrent: boolean;
  cellHeight: number;
}> = ({ step, isCurrent, cellHeight }) => (
  <div className={cn('min-w-[68px] border-r border-slate-300 last:border-r-0', isCurrent && 'bg-amber-50')}>
    <div className="border-b border-slate-300 bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-600">
      {step.role_label}
    </div>
    <div className="flex items-center justify-center px-1 text-slate-800" style={{ height: cellHeight }}>
      {step.status === 'approved' && step.signature ? (
        <SignatureStrokesView value={step.signature} title={`${step.approver_name} 결재 서명`} />
      ) : step.status === 'rejected' ? (
        <X className="h-4 w-4 text-rose-500" />
      ) : isCurrent ? (
        <Clock className="h-4 w-4 text-amber-500" />
      ) : step.status === 'approved' ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <span className="text-[11px] text-slate-300">대기</span>
      )}
    </div>
    <div className="truncate border-t border-slate-200 px-1 pb-0.5 text-center text-[10px] text-slate-500">
      {step.approver_name}
    </div>
  </div>
);
