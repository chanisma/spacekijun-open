// 자습 감독 배정 — 스케줄 [부가 기능] (2026-10-11)
//
// [배정하기] = 학년부장·담임이 자기 학년의 한 달 감독 초안을 만들고 고쳐 일정으로 만든다.
// [내 감독·교체] = 감독을 맡은 선생님끼리 교체를 신청·수락한다(알림 → `/schedule?supervision=swap`).
// 규칙 = `@/lib/selfStudySupervision`, 쉬는 날 = `@/lib/schoolDay`, 교체 = 서버 RPC.
import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import type { SupervisionSlot } from '@/lib/selfStudySupervision';
import { SupervisionPlanTab } from './SupervisionPlanTab';
import { SupervisionSwapTab } from './SupervisionSwapTab';
import { useMySupervisionSwaps } from './useSupervisionSources';

export type SupervisionCreateEvent = (eventData: {
  title: string; kind: 'duty'; starts_at: string; ends_at: string;
  assignee: string; scope: string; exchangeable: boolean; description: string;
  supervision: { grade: number; slot: SupervisionSlot; with_morning?: boolean };
}) => Promise<string | boolean>;

export type SupervisionTab = 'plan' | 'swap';

export function SelfStudySupervisionDialog({
  open,
  onOpenChange,
  initialDate,
  initialTab,
  manageableGrades,
  myName,
  myResourceId = null,
  onCreateEvent,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date;
  initialTab?: SupervisionTab;
  /** 배정할 수 있는 학년 — 비면 [배정하기] 탭이 없다 */
  manageableGrades: number[];
  myName: string | null;
  /** 나의 resource id — [내 감독·교체]의 «내가 못 하는 날» */
  myResourceId?: string | null;
  onCreateEvent: SupervisionCreateEvent;
  /** 일정이 생기거나 바뀌었을 때 — 스케줄 다시 읽기 */
  onChanged: () => void;
}) {
  const canPlan = manageableGrades.length > 0;
  const [tab, setTab] = useState<SupervisionTab>(canPlan ? 'plan' : 'swap');
  useEffect(() => {
    if (open) setTab(initialTab ?? (canPlan ? 'plan' : 'swap'));
    // 열 때만 정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const swaps = useMySupervisionSwaps(open);
  const incoming = (swaps.data ?? []).filter((r) => !r.i_am_requester && r.status === 'pending').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={ClipboardCheck} tone="indigo" />
            자습 감독 배정
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            누적 횟수가 적은 선생님부터, 같은 요일에 몰리지 않게 배정합니다. 교체는 상대 선생님이 수락하면 바로 반영됩니다.
          </DialogDescription>
          <div className="mt-3 flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
            {canPlan && (
              <button type="button" onClick={() => setTab('plan')}
                className={cn('h-8 flex-1 rounded-md text-xs font-semibold', tab === 'plan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                배정하기
              </button>
            )}
            <button type="button" onClick={() => setTab('swap')}
              className={cn('relative h-8 flex-1 rounded-md text-xs font-semibold', tab === 'swap' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
              내 감독·교체
              {incoming > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white" aria-label={`받은 요청 ${incoming}건`}>
                  {incoming}
                </span>
              )}
            </button>
          </div>
        </DialogHeader>
        {tab === 'plan' && canPlan ? (
          <SupervisionPlanTab grades={manageableGrades} initialDate={initialDate} onCreateEvent={onCreateEvent} onCreated={onChanged} />
        ) : (
          <SupervisionSwapTab myName={myName} myResourceId={myResourceId} onChanged={onChanged} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
