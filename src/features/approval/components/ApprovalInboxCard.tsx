import React from 'react';
import { Stamp } from 'lucide-react';
import { format } from 'date-fns';
import { DashboardCardShell } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { useMyPendingApprovals } from '../hooks/useApprovals';
import { approvalSubjectLabel } from '../registry';
import { ApprovalActDialog } from './ApprovalActDialog';
import { currentStep, type ApprovalRequest } from '../types';

/**
 * 결재 대기함 — "지금 내 차례인" 결재만 모은다.
 *
 * 결재자는 원본 화면(예: 보강 계획서 모달)을 열 이유가 없으므로 결재를 붙이기만 해서는
 * 아무도 결재하지 않는다. 이 카드가 유일한 발견 경로다.
 *
 * 대기 중인 것이 없으면 `null`을 반환해 카드 자체가 사라진다(부모 그리드에서 한 줄을
 * 통째로 차지하는 배치라 구멍이 남지 않는다).
 */
export function ApprovalInboxCard({ className }: { className?: string }) {
  const { data: pending = [] } = useMyPendingApprovals();
  const [selected, setSelected] = React.useState<ApprovalRequest | null>(null);

  if (pending.length === 0) return null;

  return (
    <>
      <DashboardCardShell
        title="결재 대기"
        icon={Stamp}
        accent="orange"
        description="내가 결재할 차례인 문서입니다."
        badge={
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            {pending.length}건
          </span>
        }
        className={className}
      >
        <div className="divide-y divide-slate-100">
          {pending.slice(0, 5).map((request) => {
            const step = currentStep(request);
            return (
              <button
                key={request.id}
                type="button"
                onClick={() => setSelected(request)}
                className="teacher-dashboard-row flex w-full items-start gap-3 rounded-lg px-1 py-3 text-left"
              >
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {step?.role_label ?? '결재'}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800">{request.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {approvalSubjectLabel(request.subject_type)} · {request.requester_name} 상신 ·{' '}
                    {format(new Date(request.created_at), 'M월 d일')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </DashboardCardShell>

      {selected && (
        <ApprovalActDialog
          open={!!selected}
          onOpenChange={(open) => !open && setSelected(null)}
          request={selected}
        />
      )}
    </>
  );
}
