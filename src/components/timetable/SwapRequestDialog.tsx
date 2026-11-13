/**
 * 수업 교체 신청 모달 — 교체할 날짜를 고르고 사유를 남긴다.
 *
 * 디자인 규약 = `src/components/timetable/timetableDialogDesign.tsx`.
 *
 * 교체의 의미(= `useTimetableData` 의 전개 규칙과 동일해야 한다):
 *   - `requester_swap_date`(내 요일) 의 **내 교시**에는 **상대**가 자기 과목을 한다.
 *   - `approver_swap_date`(상대 요일) 의 **상대 교시**에는 **내**가 내 과목을 한다.
 * 2026-08-14 이전 구현의 미리보기는 사람과 교시를 서로 바꿔 표시하고 있었다.
 *
 * DB CHECK 제약(`requester_swap_date_matches_weekday` / `approver_...`)이 날짜의
 * ISO 요일과 원래 요일 일치를 강제하므로, 선택지는 해당 요일의 실제 날짜만 만든다.
 */

import React, { useEffect, useMemo, useState } from 'react';
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
  CalendarClock,
  Check,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { format, addWeeks, startOfWeek, addDays, isBefore } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { TimetableEntry } from '@/hooks/useTimetableData';
import type { CreateClassSwapRequest } from '@/types/classSwap';
import { useCreateClassSwap } from '@/hooks/useClassSwapMutations';
import {
  ABSENCE_KIND_LABEL,
  absenceApproverDateOptions,
  absenceReason,
  absenceSwapMeta,
  type AbsenceContext,
} from '@/lib/absenceLessons';
import {
  DayPeriodStrip,
  DayPeriodStripLegend,
  type DayPeriodStripSlot,
} from './DayPeriodStrip';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from './timetableDialogDesign';

const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];
const OCCURRENCE_COUNT = 4;

interface SwapRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myEntry: TimetableEntry;
  targetEntry: TimetableEntry;
  /** 내 주간 슬롯 — 교시 인포그래픽용. 없으면 그 섹션만 조용히 빠진다 */
  mySlots?: DayPeriodStripSlot[];
  /** 상대 주간 슬롯 */
  targetSlots?: DayPeriodStripSlot[];
  /**
   * 결강 처리에서 열었을 때. 내 날짜는 결강일 하나로 고정되고, 상대 날짜 중 결강 구간 안의
   * 칸은 고를 수 없다(그 시간엔 나도 없다). 사유가 채워지고 meta 에 출처가 남는다.
   */
  absence?: AbsenceContext;
  onSuccess?: () => void;
}

/** 이번 주부터 4주간, 주어진 ISO 요일에 해당하는 날짜들 */
function occurrencesOf(weekday: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = startOfWeek(today, { weekStartsOn: 1 });
  return Array.from({ length: OCCURRENCE_COUNT }, (_, week) =>
    addDays(addWeeks(base, week), weekday - 1)
  );
}

export function SwapRequestDialog({
  open,
  onOpenChange,
  myEntry,
  targetEntry,
  mySlots,
  targetSlots,
  absence,
  onSuccess,
}: SwapRequestDialogProps) {
  const createSwapMutation = useCreateClassSwap();

  const myDates = useMemo(
    () =>
      absence ? [new Date(`${absence.window.date}T00:00:00`)] : occurrencesOf(myEntry.weekday),
    [absence, myEntry.weekday]
  );

  /** 결강 처리: 결강 주 앞뒤에서 고르고, 결강 구간 안의 칸은 막는다 */
  const absenceOptions = useMemo(
    () =>
      absence
        ? absenceApproverDateOptions(absence.window, targetEntry.weekday, targetEntry.period, new Date())
        : null,
    [absence, targetEntry.weekday, targetEntry.period]
  );
  const targetDates = useMemo(
    () =>
      absenceOptions
        ? absenceOptions.map((o) => new Date(`${o.date}T00:00:00`))
        : occurrencesOf(targetEntry.weekday),
    [absenceOptions, targetEntry.weekday]
  );
  const blockedTargetDates = useMemo(
    () => new Set(absenceOptions?.filter((o) => o.blocked).map((o) => o.date) ?? []),
    [absenceOptions]
  );

  // 기본값 = 아직 지나지 않은 가장 이른 날 (전부 지났으면 첫 항목). 막힌 날은 건너뛴다
  const defaultOf = (dates: Date[], blocked: Set<string> = new Set()) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const usable = dates.filter((d) => !blocked.has(format(d, 'yyyy-MM-dd')));
    if (usable.length === 0) return '';
    const upcoming = usable.find((d) => !isBefore(d, today));
    return format(upcoming ?? usable[0], 'yyyy-MM-dd');
  };

  /**
   * 교체가 바꾸는 하루들.
   * 내 요일과 상대 요일이 **같으면**(월2 ↔ 월5) 한 사람의 하루에 추가·제거가 함께 일어나므로
   * 스트립도 한 줄로 합쳐야 한다.
   */
  const { myDayViews, targetDayViews } = useMemo(() => {
    const sameWeekday = myEntry.weekday === targetEntry.weekday;
    if (sameWeekday) {
      return {
        // 내 교시는 내주고, 상대 교시를 받는다
        myDayViews: [
          { weekday: myEntry.weekday, removed: myEntry.period, added: targetEntry.period },
        ],
        targetDayViews: [
          { weekday: myEntry.weekday, added: myEntry.period, removed: targetEntry.period },
        ],
      };
    }
    return {
      myDayViews: [
        { weekday: myEntry.weekday, removed: myEntry.period },
        { weekday: targetEntry.weekday, added: targetEntry.period },
      ],
      targetDayViews: [
        { weekday: myEntry.weekday, added: myEntry.period },
        { weekday: targetEntry.weekday, removed: targetEntry.period },
      ],
    };
  }, [myEntry.weekday, myEntry.period, targetEntry.weekday, targetEntry.period]);

  const defaultReason = absence
    ? absenceReason(absence.kind, absence.kind === 'event' ? absence.title : undefined)
    : '';
  const [requesterDate, setRequesterDate] = useState<string>(() => defaultOf(myDates));
  const [approverDate, setApproverDate] = useState<string>(() =>
    defaultOf(targetDates, blockedTargetDates)
  );
  const [reason, setReason] = useState(defaultReason);

  // 이 모달은 한 번 마운트된 뒤 다른 후보로 다시 열린다 — 열릴 때마다 그 후보 기준으로 되돌린다.
  // (안 하면 앞 후보의 날짜가 남아 요일이 다른 날짜로 신청되고 DB CHECK 에서 거절된다)
  useEffect(() => {
    if (!open) return;
    setRequesterDate(defaultOf(myDates));
    setApproverDate(defaultOf(targetDates, blockedTargetDates));
    setReason(defaultReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetEntry.id]);

  const canSubmit =
    Boolean(requesterDate && approverDate) &&
    !blockedTargetDates.has(approverDate) &&
    !createSwapMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const swapRequest: CreateClassSwapRequest = {
      requester_swap_date: requesterDate,
      approver_swap_date: approverDate,

      requester_resource_id: myEntry.resource_id,
      requester_section_id: myEntry.section_id!,
      requester_original_weekday: myEntry.weekday,
      requester_original_period: myEntry.period,

      approver_resource_id: targetEntry.resource_id,
      approver_section_id: targetEntry.section_id!,
      approver_original_weekday: targetEntry.weekday,
      approver_original_period: targetEntry.period,

      meta: {
        requester_name: myEntry.teacher_name,
        requester_section_name: myEntry.subject,
        approver_name: targetEntry.teacher_name,
        approver_section_name: targetEntry.subject,
        grade: String(myEntry.grade),
        class: String(myEntry.class_number),
        reason: reason.trim() || undefined,
        ...absenceSwapMeta(absence),
      },
    };

    createSwapMutation.mutate(swapRequest, {
      onSuccess: () => {
        setReason(defaultReason);
        onOpenChange(false);
        onSuccess?.();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3.5">
            <TitleIconChip icon={ArrowLeftRight} tone="emerald" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                수업 교체 신청
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-500">
                {targetEntry.teacher_name} 선생님과 수업 시간을 서로 맞바꿉니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {/* 교체 대상 */}
          <section className="space-y-2">
            <SectionLabel icon={ArrowLeftRight}>교체 대상</SectionLabel>
            {/* 좁은 화면에서는 좌우 2단이 뭉개진다 → 세로로 쌓고 화살표를 돌린다 */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <ClassCard
                caption="내 수업"
                subject={myEntry.subject}
                teacher={myEntry.teacher_name}
                slot={`${WEEKDAY_LABELS[myEntry.weekday]} ${myEntry.period}교시`}
                tone="emerald"
              />
              <div className="flex shrink-0 items-center justify-center text-slate-300">
                <ArrowLeftRight className="h-4 w-4 rotate-90 sm:rotate-0" />
              </div>
              <ClassCard
                caption="상대 수업"
                subject={targetEntry.subject}
                teacher={targetEntry.teacher_name}
                slot={`${WEEKDAY_LABELS[targetEntry.weekday]} ${targetEntry.period}교시`}
                tone="slate"
              />
            </div>
          </section>

          {/* 날짜 선택 */}
          <section className="space-y-2">
            <SectionLabel icon={CalendarClock}>교체할 날짜</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <DatePicker
                title={`내 ${WEEKDAY_LABELS[myEntry.weekday]}요일 수업`}
                hint={
                  absence
                    ? `${ABSENCE_KIND_LABEL[absence.kind]}으로 비우는 날입니다. 이 날 ${myEntry.period}교시를 ${targetEntry.teacher_name} 선생님이 맡습니다`
                    : `이 날 ${myEntry.period}교시를 ${targetEntry.teacher_name} 선생님이 맡습니다`
                }
                dates={myDates}
                value={requesterDate}
                onChange={setRequesterDate}
              />
              <DatePicker
                title={`상대 ${WEEKDAY_LABELS[targetEntry.weekday]}요일 수업`}
                hint={
                  blockedTargetDates.size > 0 && absence
                    ? `이 날 ${targetEntry.period}교시를 내가 맡습니다. 줄 그은 날은 ${ABSENCE_KIND_LABEL[absence.kind]} 시간이라 고를 수 없습니다`
                    : `이 날 ${targetEntry.period}교시를 내가 맡습니다`
                }
                dates={targetDates}
                blocked={blockedTargetDates}
                value={approverDate}
                onChange={setApproverDate}
              />
            </div>
          </section>

          {/* 미리보기 */}
          {requesterDate && approverDate && (
            <section className="space-y-2">
              <SectionLabel icon={Sparkles}>승인되면 이렇게 바뀝니다</SectionLabel>
              <div className="space-y-1.5 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2.5">
                <PreviewLine
                  date={requesterDate}
                  period={myEntry.period}
                  text={
                    <>
                      <strong className="font-semibold text-slate-800">
                        {targetEntry.teacher_name}
                      </strong>{' '}
                      선생님이 {targetEntry.subject} 수업
                    </>
                  }
                />
                <PreviewLine
                  date={approverDate}
                  period={targetEntry.period}
                  text={
                    <>
                      <strong className="font-semibold text-slate-800">내</strong>가{' '}
                      {myEntry.subject} 수업
                    </>
                  }
                />
              </div>

              {/* 그날 하루가 어떻게 되는지 — 문장보다 그림이 빠르다 */}
              {mySlots && targetSlots && (
                <div className="mt-3 space-y-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-500">내 하루</p>
                      {myDayViews.map((view) => (
                        <DayPeriodStrip
                          key={`mine-${view.weekday}`}
                          title={`${WEEKDAY_LABELS[view.weekday]}요일`}
                          slots={mySlots}
                          weekday={view.weekday}
                          added={view.added}
                          removed={view.removed}
                        />
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <p className="truncate text-[11px] font-semibold text-slate-500">
                        {targetEntry.teacher_name} 선생님의 하루
                      </p>
                      {targetDayViews.map((view) => (
                        <DayPeriodStrip
                          key={`target-${view.weekday}`}
                          title={`${WEEKDAY_LABELS[view.weekday]}요일`}
                          slots={targetSlots}
                          weekday={view.weekday}
                          added={view.added}
                          removed={view.removed}
                        />
                      ))}
                    </div>
                  </div>
                  <DayPeriodStripLegend />
                </div>
              )}
            </section>
          )}

          {/* 사유 */}
          <section className="space-y-2">
            <SectionLabel icon={MessageSquare}>사유 (선택)</SectionLabel>
            <Label htmlFor="swap-reason" className="sr-only">
              교체 사유
            </Label>
            <Textarea
              id="swap-reason"
              placeholder="교체가 필요한 이유를 적으면 상대 선생님이 판단하기 쉬워집니다."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </section>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createSwapMutation.isPending}
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
          >
            <X className="h-3.5 w-3.5" />
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} size="sm" className="h-8 gap-1.5 px-3 text-xs">
            {createSwapMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            교체 신청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────── 부품 ────────────────────────────── */

function ClassCard({
  caption,
  subject,
  teacher,
  slot,
  tone,
}: {
  caption: string;
  subject?: string;
  teacher?: string;
  slot: string;
  tone: 'emerald' | 'slate';
}) {
  const tones = {
    emerald: 'border-emerald-100 bg-emerald-50/40',
    slate: 'border-slate-200 bg-slate-50/60',
  } as const;
  return (
    <div className={cn('min-w-0 flex-1 rounded-lg border px-3 py-2.5', tones[tone])}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {caption}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800" title={subject}>
        {subject}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500">
        {teacher} · <span className="tabular-nums">{slot}</span>
      </div>
    </div>
  );
}

function DatePicker({
  title,
  hint,
  dates,
  blocked,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  dates: Date[];
  /** 고를 수 없는 날(yyyy-MM-dd) — 목록에서 지우지 않고 줄을 긋는다(왜 없는지 보이게) */
  blocked?: Set<string>;
  value: string;
  onChange: (value: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="text-xs font-semibold text-slate-700">{title}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={title}>
        {dates.map((date) => {
          const key = format(date, 'yyyy-MM-dd');
          const selected = value === key;
          const past = isBefore(date, today);
          const isBlocked = blocked?.has(key) ?? false;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isBlocked}
              onClick={() => onChange(key)}
              className={cn(
                'flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs tabular-nums transition-colors',
                selected
                  ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                past && !selected && 'text-slate-400',
                isBlocked && 'cursor-not-allowed border-dashed text-slate-300 line-through hover:border-slate-200 hover:bg-transparent'
              )}
            >
              {selected && <Check className="h-3 w-3" />}
              {format(date, 'M/d (E)', { locale: ko })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewLine({
  date,
  period,
  text,
}: {
  date: string;
  period: number;
  text: React.ReactNode;
}) {
  return (
    // 날짜 라벨은 폭이 들쭉날쭉하다 — 넓은 화면에서만 열을 맞추고 좁으면 줄을 바꾼다.
    <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-baseline sm:gap-2">
      <span className="shrink-0 font-semibold tabular-nums text-emerald-700 sm:w-28">
        {format(new Date(date), 'M/d (E)', { locale: ko })} {period}교시
      </span>
      <span className="text-slate-600">{text}</span>
    </div>
  );
}
