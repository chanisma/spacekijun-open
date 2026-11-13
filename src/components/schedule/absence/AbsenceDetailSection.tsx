/**
 * 일정 상세의 「수업 처리 N/M」 줄 — 저장 때 [나중에 처리]를 골랐거나 요청이 거절됐을 때
 * 결강 처리로 되돌아오는 입구다. 누르면 전역 호스트(`?absence=`)가 상세 **위에** 모달을 겹쳐 띄운다.
 *
 * 출장·개인일정이 아니거나, 내가 빠지는 일정이 아니거나, 걸린 수업이 없으면 아무것도 그리지 않는다
 * (훅이 이 컴포넌트 안에 있어서 그런 일정에서는 시간표를 조회하지도 않는다).
 */

import { CalendarX2, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useAbsenceLessons } from '@/hooks/useAbsenceLessons';
import { isAbsenceKind, isAbsenceParticipant } from '@/lib/absenceLessons';
import { useOpenAbsenceResolution } from './useOpenAbsenceResolution';

interface AbsenceDetailSectionProps {
  enabled: boolean;
  meeting: {
    id: string;
    kind: string;
    starts_at: string;
    ends_at: string;
    created_by?: string | null;
    date_only?: boolean;
    assignee?: unknown;
  };
}

export function AbsenceDetailSection({ enabled, meeting }: AbsenceDetailSectionProps) {
  const { profile } = useAuth();
  const openResolution = useOpenAbsenceResolution();
  const kindOk = isAbsenceKind(meeting.kind);

  const { lessons, summary, myResourceId, isLoading } = useAbsenceLessons(
    { startsAt: meeting.starts_at, endsAt: meeting.ends_at, dateOnly: meeting.date_only },
    enabled && kindOk
  );

  const participant =
    kindOk &&
    isAbsenceParticipant(
      { kind: meeting.kind, created_by: meeting.created_by, assignee: meeting.assignee },
      { resourceId: myResourceId, name: profile?.name }
    );

  if (!enabled || !participant) return null;
  if (isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        이 시간의 내 수업을 확인하는 중
      </p>
    );
  }
  if (lessons.length === 0) return null;

  const done = summary.resolved === summary.total;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5',
        done ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/60'
      )}
    >
      <CalendarX2 className={cn('h-4 w-4 shrink-0', done ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', done ? 'text-emerald-800' : 'text-amber-800')}>
          수업 처리 {summary.resolved}/{summary.total}
        </p>
        <p className="text-[11px] text-slate-500">
          {done
            ? '걸린 수업이 모두 교체·대체됐습니다'
            : [
                summary.pending > 0 ? `응답 대기 ${summary.pending}` : null,
                summary.open > 0 ? `미처리 ${summary.open}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => openResolution(meeting.id)}
        className="h-9 gap-1 px-2.5 text-xs font-medium text-slate-700 hover:bg-white sm:h-8"
      >
        {done ? '보기' : '수업 처리'}
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
