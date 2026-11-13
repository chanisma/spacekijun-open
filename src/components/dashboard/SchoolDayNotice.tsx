import { CalendarOff, PencilLine } from 'lucide-react';
import { schoolDayMessage, type SchoolDayInfo } from '@/lib/schoolDay';
import { cn } from '@/lib/utils';

/**
 * 오늘이 수업일이 아닐 때 시간표 카드 위에 붙는 한 줄 (2026-10-11).
 * 휴일·방학·주말 = 슬레이트(수업 없음), 시험 = 앰버(수업은 흐리게 남는다).
 */
export function SchoolDayNotice({ day, className, showPartial = false }: { day: SchoolDayInfo | null; className?: string; /** 일부 학년 휴업도 말한다(교사 화면) */ showPartial?: boolean }) {
  if (!day) return null;
  const message = schoolDayMessage(day, showPartial);
  if (!message) return null;
  const exam = day.kind === 'exam' && !(showPartial && day.partialLabel);
  const Icon = exam ? PencilLine : CalendarOff;
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium',
        exam ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600',
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}
