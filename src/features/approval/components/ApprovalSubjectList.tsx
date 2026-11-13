import React from 'react';
import { format } from 'date-fns';
import { Loader2, Stamp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import { useMyApprovalsBySubjectType } from '../hooks/useApprovals';
import { approvalSubjectLabel } from '../registry';
import { ApprovalActDialog } from './ApprovalActDialog';
import { ApprovalLine } from './ApprovalLine';
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TONE,
  isMyTurn,
  type ApprovalRequest,
} from '../types';

/**
 * 한 종류의 결재를 모아 보는 목록 — 기능 화면에 탭으로 끼워 넣는 용도.
 *
 * 결재를 올린 사람은 "내 문서가 어디까지 갔나"를, 결재자는 "내가 볼 것이 있나"를
 * 원본 기능 화면을 떠나지 않고 확인한다. 보이는 범위는 RLS가 정한다
 * (내가 신청했거나 내 결재선에 있는 것).
 *
 * **여기서 새 결재를 올리지는 않는다.** 결재 payload는 상신 시점 스냅샷이라, 이 목록의
 * 옛 payload로 다시 올리면 그 사이 바뀐 원본과 어긋난다. 재상신은 원본 화면
 * (보강 계획서라면 '보낸 요청' 탭 → 보강 계획서)에서 현재 데이터로 다시 만들어야 한다.
 */

interface ApprovalSubjectListProps {
  subjectType: string;
  /** 목록이 비었을 때 안내할 문구 — 기능마다 만드는 방법이 달라 호출부가 준다. */
  emptyHint?: string;
  className?: string;
}

export const ApprovalSubjectList: React.FC<ApprovalSubjectListProps> = ({
  subjectType,
  emptyHint,
  className,
}) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: requests, isLoading } = useMyApprovalsBySubjectType(subjectType);
  const [selected, setSelected] = React.useState<ApprovalRequest | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        결재 문서를 불러오는 중
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
          <Stamp className="h-4 w-4 text-slate-400" />
        </span>
        <p className="text-sm text-slate-500">
          결재 중인 {approvalSubjectLabel(subjectType)}가 없습니다
        </p>
        {emptyHint && <p className="max-w-xs text-[11px] leading-relaxed text-slate-400">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <ul className="space-y-1.5">
        {requests.map((request) => {
          const myTurn = isMyTurn(request, user?.id, profile?.name);
          const mine = request.requester_user_id === user?.id;

          return (
            <li
              key={request.id}
              className={cn(
                'rounded-lg border bg-white px-3 py-2.5 transition-colors hover:border-slate-300',
                myTurn ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200',
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-slate-800">
                      {request.title}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                        APPROVAL_STATUS_TONE[request.status],
                      )}
                    >
                      {APPROVAL_STATUS_LABEL[request.status]}
                    </span>
                    {myTurn && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        내 차례
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {mine ? '내가 상신' : `${request.requester_name} 상신`} ·{' '}
                    {format(new Date(request.created_at), 'M월 d일 HH:mm')}
                  </p>

                  {/* 결재란을 그대로 축소해 보여준다 — 어느 칸까지 갔는지가 한눈에 보인다 */}
                  <div className="mt-1.5 overflow-x-auto pb-0.5">
                    <ApprovalLine request={request} cellHeight={24} />
                  </div>
                </div>

                <Button
                  onClick={() => setSelected(request)}
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-7 shrink-0 px-2 text-xs',
                    myTurn
                      ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                      : 'text-slate-500 hover:bg-slate-100',
                  )}
                >
                  {myTurn ? '결재' : '보기'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {selected && (
        <ApprovalActDialog
          open={!!selected}
          onOpenChange={(open) => !open && setSelected(null)}
          request={selected}
        />
      )}
    </div>
  );
};
