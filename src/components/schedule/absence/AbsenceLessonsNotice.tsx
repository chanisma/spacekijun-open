/**
 * 일정 생성 모달의 「결강 미리보기」 — 출장·개인일정 시간에 걸린 내 수업을 **저장 전에** 알린다.
 *
 * 알리기만 하고 저장은 막지 않는다(2026-09-27 사용자 결정: 저장하고 이어서 처리).
 * 계산은 호출부가 `useAbsenceLessons` 로 하고 이 컴포넌트는 그리기만 한다 —
 * 같은 결과로 저장 버튼 문구(「저장하고 수업 처리」)도 정해야 하기 때문이다.
 */

import { AlertTriangle, Bell, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AbsenceKind, AbsenceLesson } from '@/lib/absenceLessons';
import { DayPeriodStrip, type DayPeriodStripSlot } from '@/components/timetable/DayPeriodStrip';

const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];

interface AbsenceLessonsNoticeProps {
  kind: AbsenceKind;
  /** 내가 이 일정에 빠지는가(개인일정=항상, 출장=대상자에 나를 넣었을 때) */
  iAmAbsent: boolean;
  lessons: Pick<AbsenceLesson, 'period' | 'subject' | 'gradeClass' | 'state'>[];
  loading: boolean;
  weekday?: number;
  mySlots: DayPeriodStripSlot[];
  /** 출장에 나 말고 다른 대상자가 있다 — 그들에게는 알림이 간다 */
  hasOtherParticipants: boolean;
}

export function AbsenceLessonsNotice({
  kind,
  iAmAbsent,
  lessons,
  loading,
  weekday,
  mySlots,
  hasOtherParticipants,
}: AbsenceLessonsNoticeProps) {
  const othersLine =
    kind === 'event' && hasOtherParticipants ? (
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
        <Bell className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
        저장하면 다른 대상자 중 이 시간에 수업이 있는 선생님께 수업 처리 알림이 갑니다.
      </p>
    ) : null;

  if (!iAmAbsent) return othersLine;

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          이 시간의 내 수업을 확인하는 중
        </p>
        {othersLine}
      </div>
    );
  }

  const open = lessons.filter((l) => l.state !== 'approved');
  if (lessons.length === 0) return othersLine;

  return (
    <div className="space-y-2">
      <section
        className={cn(
          'space-y-2 rounded-xl border px-3 py-2.5',
          open.length > 0 ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/50'
        )}
        aria-live="polite"
      >
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold',
            open.length > 0 ? 'text-amber-800' : 'text-emerald-800'
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {open.length > 0
            ? `이 시간에 내 수업 ${lessons.length}개가 있습니다`
            : `이 시간의 내 수업 ${lessons.length}개는 이미 교체·대체가 승인됐습니다`}
        </p>

        {weekday && (
          <div className="rounded-lg bg-white/80 px-2.5 py-2">
            <DayPeriodStrip
              title={`${WEEKDAY_LABELS[weekday]}요일`}
              subtitle="내 하루"
              slots={mySlots}
              weekday={weekday}
              removed={lessons.map((l) => l.period)}
            />
          </div>
        )}

        <ul className="space-y-0.5">
          {lessons.map((l) => (
            <li key={l.period} className="flex min-w-0 items-baseline gap-1.5 text-xs text-slate-700">
              <span className="w-9 shrink-0 font-semibold tabular-nums">{l.period}교시</span>
              <span className="min-w-0 truncate" title={l.subject}>
                {l.subject}
              </span>
              {l.state === 'approved' && (
                <span className="shrink-0 text-[10px] font-semibold text-emerald-700">처리됨</span>
              )}
              {l.state === 'pending' && (
                <span className="shrink-0 text-[10px] font-semibold text-amber-700">요청 중</span>
              )}
            </li>
          ))}
        </ul>

        {open.length > 0 && (
          <p className="text-[11px] leading-relaxed text-slate-600">
            저장한 뒤 바로 교체·대체를 요청할 수 있습니다. 지금 하지 않아도 일정 상세에서 이어서 처리할 수 있습니다.
            {kind === 'personal' && ' 상대 선생님께는 사유가 "개인 사정"으로만 보입니다.'}
          </p>
        )}
      </section>
      {othersLine}
    </div>
  );
}
