import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, Clock4, XCircle } from 'lucide-react';
import { getPagePeriodStatus } from '../types';

interface PeriodBadgeProps {
  periodStart: string;
  periodEnd: string;
  archived?: boolean;
  /** true면 "예정/신청 가능/마감" 대신 "8/20 시작 · D-3 · 마감됨" 같은 실행 정보를 표시 */
  showDday?: boolean;
}

const DAY_MS = 86400000;

/** 신청자 관점의 실행 정보 텍스트 — "언제부터/언제까지"를 즉답한다 */
export function formatDdayText(periodStart: string, periodEnd: string): string | null {
  const status = getPagePeriodStatus({ period_start: periodStart, period_end: periodEnd });
  if (status === 'upcoming') {
    const d = new Date(periodStart);
    return `${d.getMonth() + 1}/${d.getDate()} 시작`;
  }
  if (status === 'open') {
    const days = Math.floor((new Date(periodEnd).getTime() - Date.now()) / DAY_MS);
    return days <= 0 ? '오늘 마감' : `마감 D-${days}`;
  }
  return null; // closed는 라벨 '마감'으로 충분
}

export function PeriodBadge({ periodStart, periodEnd, archived, showDday }: PeriodBadgeProps) {
  if (archived) {
    return (
      <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-600">
        <XCircle className="h-3 w-3" /> 보관됨
      </Badge>
    );
  }

  const status = getPagePeriodStatus({ period_start: periodStart, period_end: periodEnd });
  const ddayText = showDday ? formatDdayText(periodStart, periodEnd) : null;

  if (status === 'upcoming') {
    return (
      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700">
        <Calendar className="h-3 w-3" /> {ddayText ?? '예정'}
      </Badge>
    );
  }
  if (status === 'open') {
    return (
      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> {ddayText ? `신청 가능 · ${ddayText}` : '신청 가능'}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-600">
      <Clock4 className="h-3 w-3" /> 마감
    </Badge>
  );
}

export function formatPeriodRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  return `${fmt(start)} ~ ${fmt(end)}`;
}
