/**
 * 결강 처리 — 출장·개인일정 시간에 걸린 **내** 수업을 교체·대체로 해결하는 모달.
 *
 * 진입 3곳이 전부 같은 모달이다(`AbsenceResolutionHost` 가 `?absence=<일정 id>` 로 연다):
 *   ① 일정을 저장한 직후 ② 일정 상세의 `수업 처리 N/M` ③ 출장 동행 교사에게 간 알림.
 *
 * 설계 (2026-09-27 사용자 결정):
 * - **저장을 막지 않고 저장 뒤에 이어서 처리한다.** 교체·대체는 상대 승인을 기다리는 일이라
 *   일정 등록을 거기에 묶으면 출장이 늦게 올라간다. 그래서 [나중에 처리]가 있다.
 * - 처리 상태는 저장하지 않고 **그날 그 교시에 내가 보낸 요청**에서 계산한다
 *   (`src/lib/absenceLessons.ts`). 시간표에서 먼저 신청해 둔 교체도 처리됨으로 잡힌다.
 * - 교체·대체 신청은 기존 `ClassSwapDialog` 를 **이 모달 위에 겹쳐** 띄운다(바꿔치기 아님 —
 *   신청을 마치고 돌아오면 목록이 갱신된 채 그대로 있어야 다음 수업을 이어서 처리한다).
 * - 개인일정의 제목·내용은 요청 사유에 싣지 않는다(`absenceReason`).
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ArrowLeftRight,
  CalendarX2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RotateCcw,
  UserCheck,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useAbsenceLessons } from '@/hooks/useAbsenceLessons';
import type { TimetableEntry } from '@/hooks/useTimetableData';
import { useCancelClassSwap } from '@/hooks/useClassSwapMutations';
import { NotificationService } from '@/services/notificationService';
import type { AbsenceMeetingRow } from '@/services/absenceLessonService';
import type { ClassSwap } from '@/types/classSwap';
import {
  ABSENCE_KIND_LABEL,
  absenceParticipantKeys,
  isAbsenceKind,
  isAbsenceParticipant,
  type AbsenceContext,
  type AbsenceLesson,
} from '@/lib/absenceLessons';
import { ClassSwapDialog } from '@/components/timetable/ClassSwapDialog';
import { SwapDocumentDialog } from '@/components/timetable/SwapDocumentDialog';
import { DayPeriodStrip, DayPeriodStripLegend } from '@/components/timetable/DayPeriodStrip';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/timetable/timetableDialogDesign';

const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];

interface AbsenceResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: AbsenceMeetingRow;
}

export function AbsenceResolutionDialog({ open, onOpenChange, meeting }: AbsenceResolutionDialogProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const cancelSwap = useCancelClassSwap();

  const kind = isAbsenceKind(meeting.kind) ? meeting.kind : null;

  const result = useAbsenceLessons(
    { startsAt: meeting.starts_at, endsAt: meeting.ends_at, dateOnly: meeting.date_only },
    open && !!kind
  );
  const { window, lessons, summary, weekEntries, swaps, myResourceId, isLoading } = result;

  const participant =
    !!kind &&
    isAbsenceParticipant(
      { kind: meeting.kind, created_by: meeting.created_by, assignee: meeting.assignee },
      { resourceId: myResourceId, name: profile?.name }
    );

  const absence: AbsenceContext | undefined = useMemo(() => {
    if (!kind || !window) return undefined;
    const me = [myResourceId, profile?.name?.trim()].filter(Boolean) as string[];
    return {
      meetingId: meeting.id,
      kind,
      // ⚠ 개인일정 제목은 넘기지 않는다 — 요청 사유로 상대에게 보이게 된다
      title: kind === 'event' ? meeting.title : undefined,
      window,
      coParticipantKeys:
        kind === 'event'
          ? absenceParticipantKeys(meeting.assignee).filter((k) => !me.includes(k))
          : [],
    };
  }, [kind, window, meeting.id, meeting.title, meeting.assignee, myResourceId, profile?.name]);

  // ── 겹쳐 띄우는 신청 모달 ───────────────────────────────
  const [swapTarget, setSwapTarget] = useState<{ entry: TimetableEntry; mode: 'swap' | 'substitute' } | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

  const openSwap = (entry: TimetableEntry, mode: 'swap' | 'substitute') => {
    setSwapTarget({ entry, mode });
    setSwapOpen(true);
  };

  const handleCancel = (swap: ClassSwap) => {
    cancelSwap.mutate(swap.id, {
      onSuccess: async () => {
        try {
          await NotificationService.notifyClassSwapCancelled(
            swap.id,
            swap.approver_resource_id,
            swap.meta.requester_name || '',
            swap.meta.requester_section_name || '',
            swap.meta.approver_section_name || '',
            swap.approver_swap_date
          );
        } catch (e) {
          console.error('Failed to send notification:', e);
        }
      },
    });
  };

  /** 보강 계획서는 승인된 요청으로 만든다 — 이 결강에 걸린 교시의 것만 */
  const approvedSwaps = useMemo(() => {
    const ids = new Set(lessons.filter((l) => l.state === 'approved' && l.swap).map((l) => l.swap!.id));
    return swaps.filter((s) => ids.has(s.id));
  }, [lessons, swaps]);

  const mySlots = useMemo(
    () =>
      weekEntries
        .filter((e) => e.type === 'pattern')
        .map((e) => ({ weekday: e.weekday, period: e.period })),
    [weekEntries]
  );

  const whenText = (() => {
    const start = new Date(meeting.starts_at);
    const end = new Date(meeting.ends_at);
    const day = format(start, 'M월 d일(E)', { locale: ko });
    return meeting.date_only ? `${day} 하루 종일` : `${day} ${format(start, 'HH:mm')}~${format(end, 'HH:mm')}`;
  })();

  const allResolved = summary.total > 0 && summary.resolved === summary.total;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className={DIALOG_HEADER_CLASS}>
            <div className="flex items-center gap-3.5">
              <TitleIconChip icon={CalendarX2} />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  결강 처리
                </DialogTitle>
                <DialogDescription className="mt-0.5 truncate text-xs text-slate-500" title={meeting.title}>
                  {kind ? ABSENCE_KIND_LABEL[kind] : '일정'} · {whenText}
                  {meeting.title ? ` · ${meeting.title}` : ''}
                </DialogDescription>
              </div>
            </div>

            {participant && summary.total > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <ProgressChip tone={allResolved ? 'emerald' : 'slate'}>
                  처리 {summary.resolved}/{summary.total}
                </ProgressChip>
                {summary.pending > 0 && <ProgressChip tone="amber">응답 대기 {summary.pending}</ProgressChip>}
                {summary.open > 0 && <ProgressChip tone="rose">미처리 {summary.open}</ProgressChip>}
              </div>
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            {!kind ? (
              <Notice>출장·개인일정만 결강 처리를 할 수 있습니다.</Notice>
            ) : !participant ? (
              <Notice>
                이 일정의 대상자가 아니어서 처리할 내 수업이 없습니다. 대상자에게는 수업이 겹치면 알림이 갑니다.
              </Notice>
            ) : isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                시간표를 확인하는 중
              </div>
            ) : lessons.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </span>
                <p className="text-sm font-medium text-slate-700">이 시간에 내 수업이 없습니다</p>
                <p className="max-w-xs text-xs leading-relaxed text-slate-500">
                  처리할 수업이 없습니다. 일정 시간을 바꾸면 다시 확인합니다.
                </p>
              </div>
            ) : (
              <>
                {window && (
                  <section className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <DayPeriodStrip
                      title={`${WEEKDAY_LABELS[window.weekday]}요일`}
                      subtitle="내 하루"
                      slots={mySlots}
                      weekday={window.weekday}
                      removed={lessons.map((l) => l.period)}
                    />
                    <DayPeriodStripLegend />
                  </section>
                )}

                <section className="space-y-2">
                  <SectionLabel icon={CalendarX2}>빠지는 수업</SectionLabel>
                  <ul className="space-y-1.5">
                    {lessons.map((lesson) => (
                      <LessonRow
                        key={lesson.period}
                        lesson={lesson}
                        cancelling={cancelSwap.isPending}
                        onSwap={(entry) => openSwap(entry, 'swap')}
                        onSubstitute={(entry) => openSwap(entry, 'substitute')}
                        // 행의 swap 은 `fetchMySwapsOnDate` 가 준 class_swap 전체 행이다
                        onCancel={(swap) => handleCancel(swap as unknown as ClassSwap)}
                        onOpenTimetable={() => {
                          onOpenChange(false);
                          navigate('/timetable');
                        }}
                      />
                    ))}
                  </ul>
                  <p className="px-0.5 text-[11px] leading-relaxed text-slate-400">
                    {kind === 'personal'
                      ? '상대 선생님께는 사유가 "개인 사정"으로만 보입니다. 일정 제목과 내용은 전달되지 않습니다.'
                      : '요청은 상대 선생님이 승인해야 확정됩니다. 거절되면 이 목록에서 다시 요청할 수 있습니다.'}
                  </p>
                </section>
              </>
            )}
          </div>

          <DialogFooter className={DIALOG_FOOTER_CLASS}>
            {approvedSwaps.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => setDocOpen(true)}
                className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
              >
                <FileText className="h-3.5 w-3.5" />
                보강 계획서
              </Button>
            )}
            <Button
              onClick={() => onOpenChange(false)}
              className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')}
            >
              {participant && summary.open + summary.pending > 0 && summary.total > 0 ? '나중에 처리' : '닫기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 겹쳐 띄우기 — 이 모달을 닫지 않는다(docs/nested-modal-pitfalls.md) */}
      {swapTarget && absence && (
        <ClassSwapDialog
          open={swapOpen}
          onOpenChange={setSwapOpen}
          selectedEntry={swapTarget.entry}
          currentTeacherEntries={weekEntries}
          absence={absence}
          initialMode={swapTarget.mode}
        />
      )}

      {approvedSwaps.length > 0 && (
        <SwapDocumentDialog open={docOpen} onOpenChange={setDocOpen} selectedSwaps={approvedSwaps} />
      )}
    </>
  );
}

/* ────────────────────────────── 부품 ────────────────────────────── */

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
      {children}
    </p>
  );
}

function ProgressChip({
  tone,
  children,
}: {
  tone: 'emerald' | 'slate' | 'amber' | 'rose';
  children: React.ReactNode;
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  } as const;
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1', tones[tone])}>
      {children}
    </span>
  );
}

const STATE_META: Record<AbsenceLesson['state'], { label: string; dot: string; badge: string }> = {
  unhandled: { label: '미처리', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 ring-rose-100' },
  pending: { label: '응답 대기', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 ring-amber-100' },
  approved: { label: '처리됨', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  swapped_in: { label: '교체로 맡은 수업', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

function describeSwap(swap: NonNullable<AbsenceLesson['swap']>, state: AbsenceLesson['state']): string {
  const name = swap.meta?.approver_name || '상대';
  const isSubstitute = swap.meta?.type === 'substitute';
  if (state === 'pending') {
    return `${name} 선생님께 ${isSubstitute ? '대체' : '교체'}를 요청했습니다 · 응답을 기다립니다`;
  }
  if (isSubstitute) return `${name} 선생님이 대신 맡습니다`;
  const day = format(new Date(`${swap.approver_swap_date}T00:00:00`), 'M/d(E)', { locale: ko });
  return `${name} 선생님과 교체 — ${day} ${swap.approver_original_period}교시에 내가 수업합니다`;
}

function LessonRow({
  lesson,
  cancelling,
  onSwap,
  onSubstitute,
  onCancel,
  onOpenTimetable,
}: {
  lesson: AbsenceLesson<TimetableEntry>;
  cancelling: boolean;
  onSwap: (entry: TimetableEntry) => void;
  onSubstitute: (entry: TimetableEntry) => void;
  onCancel: (swap: NonNullable<AbsenceLesson['swap']>) => void;
  onOpenTimetable: () => void;
}) {
  const meta = STATE_META[lesson.state];
  const entry = lesson.entry;
  const canRequest = lesson.state === 'unhandled' && !!entry?.section_id;

  let note: React.ReactNode = null;
  if (lesson.swap && (lesson.state === 'pending' || lesson.state === 'approved')) {
    note = describeSwap(lesson.swap, lesson.state);
  } else if (lesson.state === 'swapped_in') {
    note = '다른 교체로 이 시간에 맡게 된 수업입니다. 시간표의 교체 관리에서 조정하세요.';
  } else if (lesson.state === 'unhandled' && entry && !entry.section_id) {
    note = '분반 정보가 없어 신청할 수 없습니다. 관리자에게 시간표 분반 등록을 요청하세요.';
  } else if (lesson.lastRejected) {
    const who = lesson.lastRejected.meta?.approver_name;
    const why = (lesson.lastRejected.meta as { rejection_reason?: string } | null)?.rejection_reason;
    note = `${who ? `${who} 선생님이 ` : ''}요청을 거절했습니다${why ? ` — ${why}` : ''}. 다시 요청하세요.`;
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
        <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-slate-800">{lesson.period}교시</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-800" title={lesson.subject}>
            {lesson.subject}
          </div>
          {lesson.gradeClass && <div className="text-[11px] text-slate-400">{lesson.gradeClass}</div>}
        </div>
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1', meta.badge)}>
          {meta.label}
        </span>

        {/* 동작 — 좁은 화면에서는 줄을 바꿔 한 줄 전체를 쓴다 */}
        <div className="flex w-full shrink-0 justify-end gap-1.5 sm:w-auto">
          {lesson.state === 'unhandled' && entry && (
            <>
              <RowButton tone="emerald" disabled={!canRequest} onClick={() => onSwap(entry)}>
                <ArrowLeftRight className="h-3.5 w-3.5" />
                교체
              </RowButton>
              <RowButton tone="indigo" disabled={!canRequest} onClick={() => onSubstitute(entry)}>
                <UserCheck className="h-3.5 w-3.5" />
                대체
              </RowButton>
            </>
          )}
          {lesson.state === 'pending' && lesson.swap && (
            <RowButton tone="rose" disabled={cancelling} onClick={() => onCancel(lesson.swap!)}>
              <X className="h-3.5 w-3.5" />
              요청 취소
            </RowButton>
          )}
          {lesson.state === 'swapped_in' && (
            <RowButton tone="slate" onClick={onOpenTimetable}>
              <RotateCcw className="h-3.5 w-3.5" />
              시간표
            </RowButton>
          )}
        </div>
      </div>
      {note && (
        <p className="mt-1.5 flex items-start gap-1.5 pl-4 text-[11px] leading-relaxed text-slate-500">
          <Clock className="mt-0.5 h-3 w-3 shrink-0 text-slate-300" />
          <span>{note}</span>
        </p>
      )}
    </li>
  );
}

function RowButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: 'emerald' | 'indigo' | 'rose' | 'slate';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800',
    indigo: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800',
    rose: 'bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800',
    slate: 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-800',
  } as const;
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className={cn('h-9 gap-1 px-2.5 text-xs font-medium sm:h-7', tones[tone])}
    >
      {children}
    </Button>
  );
}
