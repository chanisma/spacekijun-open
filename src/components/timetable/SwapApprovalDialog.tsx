/**
 * 수업 교체 / 대체 요청 검토 모달 (승인·거절).
 *
 * 디자인 규약 = `src/components/timetable/timetableDialogDesign.tsx`.
 *
 * 2026-08-14 수정 2건:
 * - `swap.approver_original_grade` / `approver_original_class_number` 를 표시하고 있었는데
 *   `class_swap` 에 **없는 컬럼**이라 "undefined-undefined" 가 찍혔다. 학년·반은
 *   `meta.grade` / `meta.class` 가 정본이다.
 * - 이미 승인·거절된 요청에도 승인/거절 버튼이 그대로 떠서 상태를 덮어쓸 수 있었다.
 *   이제 `pending` 일 때만 조작 버튼을 낸다.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  Loader2,
  MessageSquare,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ClassSwap } from '@/types/classSwap';
import { useUpdateClassSwapStatus } from '@/hooks/useClassSwapMutations';
import { NotificationService } from '@/services/notificationService';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_DESTRUCTIVE_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from './timetableDialogDesign';

interface SwapApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swap: ClassSwap;
  onSuccess?: () => void;
}

const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];

const STATUS_META = {
  pending: { label: '승인 대기', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  approved: { label: '승인됨', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  rejected: { label: '거절됨', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  cancelled: { label: '취소됨', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
} as const;

export function SwapApprovalDialog({
  open,
  onOpenChange,
  swap,
  onSuccess,
}: SwapApprovalDialogProps) {
  const [rejectionReason, setRejectionReason] = useState('');
  const updateSwapMutation = useUpdateClassSwapStatus();

  const isSubstitute = swap.meta.type === 'substitute';
  const isPending = swap.status === 'pending';
  const status = STATUS_META[swap.status] ?? STATUS_META.pending;
  const classLabel =
    swap.meta.grade && swap.meta.class ? `${swap.meta.grade}학년 ${swap.meta.class}반` : null;

  const notifyOutcome = async (approved: boolean) => {
    const swapId = swap.id;
    const requesterId = swap.requester_resource_id;
    const approverName = swap.meta.approver_name || '';
    const requesterSection = swap.meta.requester_section_name || '';
    const approverSection = swap.meta.approver_section_name || '';
    const date = swap.requester_swap_date;

    try {
      if (approved) {
        await NotificationService.notifyClassSwapApproved(
          swapId,
          requesterId,
          approverName,
          requesterSection,
          approverSection,
          date
        );
      } else {
        await NotificationService.notifyClassSwapRejected(
          swapId,
          requesterId,
          approverName,
          requesterSection,
          approverSection,
          date,
          rejectionReason || undefined
        );
      }
    } catch (notificationError) {
      // 알림 실패가 상태 전이를 되돌리지는 않는다.
      console.error('Failed to send notification:', notificationError);
    }
  };

  const respond = (approved: boolean) => {
    updateSwapMutation.mutate(
      approved
        ? { swapId: swap.id, status: 'approved' }
        : { swapId: swap.id, status: 'rejected', rejection_reason: rejectionReason },
      {
        onSuccess: async () => {
          await notifyOutcome(approved);
          onOpenChange(false);
          onSuccess?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3.5">
            <TitleIconChip icon={isSubstitute ? UserCheck : ArrowLeftRight} tone={isSubstitute ? 'indigo' : 'blue'} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  {isSubstitute ? '수업 대체 요청' : '수업 교체 요청'}
                </DialogTitle>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
                    status.className
                  )}
                >
                  {status.label}
                </span>
              </div>
              <DialogDescription className="mt-0.5 text-xs text-slate-500">
                {swap.meta.requester_name} 선생님 ·{' '}
                {format(new Date(swap.created_at), 'M월 d일 HH:mm', { locale: ko })} 요청
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          <section className="space-y-2">
            <SectionLabel
              icon={isSubstitute ? ArrowRight : ArrowLeftRight}
              trailing={
                classLabel ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <GraduationCap className="h-3 w-3 text-slate-400" />
                    {classLabel}
                  </span>
                ) : undefined
              }
            >
              {isSubstitute ? '대체 내용' : '교체 내용'}
            </SectionLabel>

            {isSubstitute ? (
              /* 대체 = 요청자의 수업 한 칸을 내가 그대로 맡는다 */
              <div className="space-y-1.5">
                <SlotCard
                  caption="내가 맡을 수업"
                  subject={swap.meta.requester_section_name}
                  date={swap.requester_swap_date}
                  weekday={swap.requester_original_weekday}
                  period={swap.requester_original_period}
                  tone="indigo"
                />
                <p className="px-1 text-[11px] text-slate-500">
                  {swap.meta.requester_name} 선생님 대신 이 시간에 들어갑니다.
                </p>
              </div>
            ) : (
              /* 교체 = 서로의 시간을 맞바꾼다 */
              <div className="space-y-1.5">
                <SlotCard
                  caption="내가 맡을 시간"
                  subject={swap.meta.approver_section_name}
                  date={swap.requester_swap_date}
                  weekday={swap.requester_original_weekday}
                  period={swap.requester_original_period}
                  tone="blue"
                />
                <SlotCard
                  caption={`${swap.meta.requester_name} 선생님이 맡을 시간`}
                  subject={swap.meta.requester_section_name}
                  date={swap.approver_swap_date}
                  weekday={swap.approver_original_weekday}
                  period={swap.approver_original_period}
                  tone="slate"
                />
              </div>
            )}
          </section>

          {swap.meta.reason && (
            <section className="space-y-2">
              <SectionLabel icon={MessageSquare}>요청 사유</SectionLabel>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
                {swap.meta.reason}
              </p>
            </section>
          )}

          {swap.status === 'rejected' && swap.meta.rejection_reason && (
            <section className="space-y-2">
              <SectionLabel icon={XCircle}>거절 사유</SectionLabel>
              <p className="whitespace-pre-wrap rounded-lg bg-rose-50 px-3 py-2.5 text-sm leading-relaxed text-rose-700">
                {swap.meta.rejection_reason}
              </p>
            </section>
          )}

          {isPending && (
            <section className="space-y-2">
              <SectionLabel icon={XCircle}>거절 사유 (선택)</SectionLabel>
              <Label htmlFor="rejection-reason" className="sr-only">
                거절 사유
              </Label>
              <Textarea
                id="rejection-reason"
                placeholder="거절하는 경우에만 입력하면 됩니다."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </section>
          )}
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          {isPending ? (
            // 판단 두 개(거절·승인)를 오른쪽에 붙여 나란히 비교하게 두고,
            // 결정을 미루는 '닫기' 는 왼쪽으로 뺀다.
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={updateSwapMutation.isPending}
                className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, 'mr-auto')}
              >
                <X className="h-3.5 w-3.5" />
                닫기
              </Button>
              <Button
                variant="ghost"
                onClick={() => respond(false)}
                disabled={updateSwapMutation.isPending}
                className={cn(FOOTER_BUTTON_CLASS, FOOTER_DESTRUCTIVE_CLASS)}
              >
                {updateSwapMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                거절
              </Button>
              <Button
                onClick={() => respond(true)}
                disabled={updateSwapMutation.isPending}
                size="sm"
                className="h-8 gap-1.5 px-3 text-xs"
              >
                {updateSwapMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                승인
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <X className="h-3.5 w-3.5" />
              닫기
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SlotCard({
  caption,
  subject,
  date,
  weekday,
  period,
  tone,
}: {
  caption: string;
  subject?: string;
  date: string;
  weekday: number;
  period: number;
  tone: 'blue' | 'indigo' | 'slate';
}) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/40',
    indigo: 'border-indigo-100 bg-indigo-50/40',
    slate: 'border-slate-200 bg-slate-50/60',
  } as const;

  return (
    <div className={cn('rounded-lg border px-3 py-2.5', tones[tone])}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {caption}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800" title={subject}>
        {subject}
      </div>
      <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
        <CalendarClock className="h-3 w-3 text-slate-400" />
        <span className="tabular-nums">
          {format(new Date(date), 'M월 d일 (E)', { locale: ko })} · {WEEKDAY_LABELS[weekday]}{' '}
          {period}교시
        </span>
      </div>
    </div>
  );
}
