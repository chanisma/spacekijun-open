/**
 * 수업 대체 신청 모달 — 내 수업을 다른 선생님이 대신 진행한다.
 *
 * 디자인 규약 = `src/components/timetable/timetableDialogDesign.tsx`.
 *
 * 대체는 교체와 달리 **양쪽 날짜가 같다**(내 수업이 있는 그 날 그 교시를 상대가 맡음).
 * 그래서 `requester_swap_date` 와 `approver_swap_date` 에 같은 값을 넣고
 * `meta.type = 'substitute'` 로 구분한다 — `useTimetableData` 가 이 값으로 분기한다.
 *
 * 2026-08-14: 날짜가 "다음 수업일" 로 고정돼 있어 다음 주 출장 같은 흔한 경우를
 * 신청할 수 없었다. 요일이 같은 4주치 날짜 중에서 고르게 바꿨다
 * (DB CHECK 가 날짜의 ISO 요일과 원래 요일 일치를 강제하므로 요일은 유지된다).
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
  ArrowDown,
  CalendarClock,
  Check,
  GraduationCap,
  Loader2,
  MessageSquare,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { format, addDays, addWeeks, startOfWeek, isBefore } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { TimetableEntry } from '@/hooks/useTimetableData';
import type { CreateClassSwapRequest } from '@/types/classSwap';
import { useCreateClassSwap } from '@/hooks/useClassSwapMutations';
import { absenceReason, absenceSwapMeta, type AbsenceContext } from '@/lib/absenceLessons';
import type { AvailableTeacher } from '@/hooks/useAvailableTeachers';
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

interface SubstituteRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myEntry: TimetableEntry;
  substituteTeacher: AvailableTeacher;
  /** 내 주간 슬롯 — 교시 인포그래픽용. 없으면 그 섹션만 조용히 빠진다 */
  mySlots?: DayPeriodStripSlot[];
  /** 대체 교사 주간 슬롯 */
  substituteSlots?: DayPeriodStripSlot[];
  /** 결강 처리에서 열었을 때 — 날짜는 결강일 하나, 사유는 채워진 채로 시작한다 */
  absence?: AbsenceContext;
  onSuccess?: () => void;
}

export function SubstituteRequestDialog({
  open,
  onOpenChange,
  myEntry,
  substituteTeacher,
  mySlots,
  substituteSlots,
  absence,
  onSuccess,
}: SubstituteRequestDialogProps) {
  const createSwapMutation = useCreateClassSwap();

  const dates = useMemo(() => {
    if (absence) return [new Date(`${absence.window.date}T00:00:00`)];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: OCCURRENCE_COUNT }, (_, week) =>
      addDays(addWeeks(base, week), myEntry.weekday - 1)
    );
  }, [absence, myEntry.weekday]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = dates.find((d) => !isBefore(d, today));
    return format(upcoming ?? dates[0], 'yyyy-MM-dd');
  });
  // ⚠ 개인일정은 제목·내용을 싣지 않는다 — 사유는 대체 교사의 교체 관리 목록에 그대로 보인다
  const defaultReason = absence
    ? absenceReason(absence.kind, absence.kind === 'event' ? absence.title : undefined)
    : '';
  const [reason, setReason] = useState(defaultReason);

  // 다른 선생님으로 다시 열릴 때 날짜·사유를 되돌린다
  useEffect(() => {
    if (!open) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = dates.find((d) => !isBefore(d, today));
    setSelectedDate(format(upcoming ?? dates[0], 'yyyy-MM-dd'));
    setReason(defaultReason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, substituteTeacher.id]);

  const canSubmit = Boolean(selectedDate && reason.trim()) && !createSwapMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const substituteRequest: CreateClassSwapRequest = {
      // 대체는 같은 날짜 — 내 수업 시간에 상대가 들어온다.
      requester_swap_date: selectedDate,
      approver_swap_date: selectedDate,

      requester_resource_id: myEntry.resource_id!,
      requester_section_id: myEntry.section_id!,
      requester_original_weekday: myEntry.weekday,
      requester_original_period: myEntry.period,

      approver_resource_id: substituteTeacher.id,
      // 대체 교사는 내 분반을 그대로 맡으므로 같은 section 을 쓴다.
      approver_section_id: myEntry.section_id!,
      approver_original_weekday: myEntry.weekday,
      approver_original_period: myEntry.period,

      meta: {
        type: 'substitute',
        requester_name: myEntry.teacher_name,
        requester_section_name: myEntry.subject,
        approver_name: substituteTeacher.name,
        approver_section_name: '',
        grade: String(myEntry.grade),
        class: String(myEntry.class_number),
        reason: reason.trim(),
        ...absenceSwapMeta(absence),
      },
    };

    createSwapMutation.mutate(substituteRequest, {
      onSuccess: () => {
        setReason(defaultReason);
        onOpenChange(false);
        onSuccess?.();
      },
    });
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3.5">
            <TitleIconChip icon={UserCheck} tone="indigo" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                수업 대체 신청
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-500">
                {substituteTeacher.name} 선생님께 내 수업을 대신 맡아달라고 요청합니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {/* 대체 흐름 */}
          <section className="space-y-2">
            <SectionLabel icon={UserCheck}>대체 내용</SectionLabel>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div className="truncate text-sm font-semibold text-slate-800" title={myEntry.subject}>
                {myEntry.subject}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
                  <CalendarClock className="h-3 w-3 text-slate-400" />
                  <span className="tabular-nums">
                    {WEEKDAY_LABELS[myEntry.weekday]} {myEntry.period}교시
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5">
                  <GraduationCap className="h-3 w-3 text-slate-400" />
                  {myEntry.grade}학년 {myEntry.class_number}반
                </span>
              </div>
            </div>

            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                <ArrowDown className="h-3 w-3" />
                대신 맡을 선생님
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <UserCheck className="h-3.5 w-3.5" />
              </span>
              <span className="truncate text-sm font-semibold text-slate-800">
                {substituteTeacher.name} 선생님
              </span>
            </div>

            {/* 대체는 하루가 하나만 바뀐다 — 내 요일에서 내가 빠지고 상대가 들어온다 */}
            {mySlots && substituteSlots && (
              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500">내 하루</p>
                    <DayPeriodStrip
                      title={`${WEEKDAY_LABELS[myEntry.weekday]}요일`}
                      slots={mySlots}
                      weekday={myEntry.weekday}
                      removed={myEntry.period}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="truncate text-[11px] font-semibold text-slate-500">
                      {substituteTeacher.name} 선생님의 하루
                    </p>
                    <DayPeriodStrip
                      title={`${WEEKDAY_LABELS[myEntry.weekday]}요일`}
                      slots={substituteSlots}
                      weekday={myEntry.weekday}
                      added={myEntry.period}
                    />
                  </div>
                </div>
                <DayPeriodStripLegend />
              </div>
            )}
          </section>

          {/* 날짜 */}
          <section className="space-y-2">
            <SectionLabel icon={CalendarClock}>대체할 날짜</SectionLabel>
            <div
              className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
              role="radiogroup"
              aria-label="대체할 날짜"
            >
              {dates.map((date) => {
                const key = format(date, 'yyyy-MM-dd');
                const selected = selectedDate === key;
                const past = isBefore(date, today);
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedDate(key)}
                    className={cn(
                      'flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs tabular-nums transition-colors',
                      selected
                        ? 'border-indigo-300 bg-indigo-50 font-semibold text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                      past && !selected && 'text-slate-400'
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {format(date, 'M/d (E)', { locale: ko })}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 사유 */}
          <section className="space-y-2">
            <SectionLabel icon={MessageSquare}>대체 사유 (필수)</SectionLabel>
            <Label htmlFor="substitute-reason" className="sr-only">
              대체 사유
            </Label>
            <Textarea
              id="substitute-reason"
              placeholder="예: 출장, 연수, 개인 사정 등"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
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
            대체 신청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
