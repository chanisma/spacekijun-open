/**
 * 수업 교체 / 대체 신청 진입 모달.
 *
 * 디자인 규약 = `src/components/timetable/timetableDialogDesign.tsx`
 * (헤더·본문·푸터 3단, 마이크로 라벨 섹션 헤더, 푸터 ghost 버튼).
 *
 * 표시 원칙(2026-08-14 오버홀):
 * - 신청 가능한 대상을 먼저, 시간이 겹쳐 불가능한 대상은 **접어서** 보여준다.
 *   이전 구현은 가능/불가를 한 표에 섞어 놓아 실제로 누를 수 있는 줄을 찾기 어려웠다.
 * - 충돌 사유는 **인라인 텍스트**다. 구 구현은 hover 툴팁이라 터치 기기에서 아예 열리지 않아
 *   "왜 안 되는지"가 모바일에서 통째로 사라졌다.
 * - 두 탭의 행 모양을 `ActionRow` 하나로 통일한다 — 탭을 오갈 때 행 높이·여백이 흔들리지 않게.
 * - 후보는 **상대 선생님 부담이 적은 순**(`src/lib/swapBurden.ts`)이고,
 *   **교장·교감(학교관리자 태그)은 상대방 후보에서 제외**한다(`useSwapExcludedTeacherIds`).
 * - **수강생이 맞아야 교체할 수 있다**(2026-10-12). 시간표의 학년-반 표기는 학급일 때도 선택과목
 *   분반 번호일 때도 있어, 표기가 같아도 학생이 다르면 맞바꾼 시간에 학생이 두 수업에 겹친다.
 *   명단 판정 = 서버 `get_swap_roster_fit`(`useSwapRosterFit`), 판정 규칙 = `timetableSwapUtils`.
 *   명단을 못 읽으면 표기로만 고르되 **그 사실을 화면이 말한다**(조용히 예전 판정으로 돌아가지 않는다).
 * - **교체를 막는 것은 동아리활동뿐이다**(`isSwappableLesson`, 2026-09-15). 자율·자치·진로는
 *   학급 단위로 담임이 맡는 시간이라 다른 교과와 맞바꿀 수 있다. 내 수업이 동아리면
 *   교체 탭은 안내와 함께 대체 탭으로 길을 열어준다 — 대체는 막지 않는다.
 * - 후속 모달(신청·대체)은 이 모달의 **형제**로 렌더한다. DialogContent 안에 중첩하면
 *   포커스 트랩이 겹쳐 스크린리더·키보드 이동이 꼬인다.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeftRight,
  CalendarClock,
  ChevronDown,
  GraduationCap,
  Loader2,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays, format, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  ABSENCE_KIND_LABEL,
  isCoParticipant,
  periodsInWindow,
  type AbsenceContext,
} from '@/lib/absenceLessons';
import { TimetableEntry } from '@/hooks/useTimetable';
import {
  findSwappableClasses,
  getRosterConflictReasons,
  getSwapConflictReason,
  formatWeekday,
  isSwappableLesson,
  SwapCandidate,
} from '@/utils/timetableSwapUtils';
import { SwapRequestDialog } from './SwapRequestDialog';
import { SubstituteRequestDialog } from './SubstituteRequestDialog';
import { useSwapCandidates } from '@/hooks/useSwapCandidates';
import { useSwapRosterFit } from '@/hooks/useSwapRosterFit';
import { useAvailableTeachers, type AvailableTeacher } from '@/hooks/useAvailableTeachers';
import { useSwapExcludedTeacherIds } from '@/hooks/useSwapExcludedTeachers';
import {
  BURDEN_LEVEL_LABEL,
  compareBurden,
  evaluateSwapBurden,
  type BurdenResult,
  type BurdenSlot,
} from '@/lib/swapBurden';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from './timetableDialogDesign';

interface ClassSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEntry: TimetableEntry | null;
  currentTeacherEntries: TimetableEntry[];
  /** 교체·대체 신청이 실제로 저장됐을 때 (업무 흐름 WORK 실행 기록 등) */
  onRequested?: (entry: TimetableEntry) => void;
  /**
   * 결강(출장·개인일정) 처리에서 열 때. 내 날짜가 결강일로 고정되고, 같은 결강에 빠지는
   * 선생님과 결강 구간 안의 칸은 후보에서 막힌다. 판정 = `src/lib/absenceLessons.ts`
   */
  absence?: AbsenceContext;
  /** 처음 열릴 탭 (기본 교체) */
  initialMode?: 'swap' | 'substitute';
  /** 보고 있는 주의 아무 날 — 대체 교사 판정이 그 주의 실제 날짜(운영 시간표)를 본다 */
  weekDate?: Date;
}

export function ClassSwapDialog({
  open,
  onOpenChange,
  selectedEntry,
  currentTeacherEntries,
  onRequested,
  absence,
  initialMode = 'swap',
  weekDate,
}: ClassSwapDialogProps) {
  const [mode, setMode] = useState<'swap' | 'substitute'>(initialMode);
  // 결강 처리 모달은 행마다 [교체]/[대체] 를 따로 누른다 — 열릴 때마다 누른 쪽 탭으로 맞춘다
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  /** 결강 구간에 걸린 교시 — 같은 요일의 이 교시와 맞바꾸면 결강일에는 쓸 수 없다 */
  const absencePeriods = useMemo(
    () => (absence ? new Set(periodsInWindow(absence.window)) : null),
    [absence]
  );

  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<TimetableEntry | null>(null);

  const [substituteDialogOpen, setSubstituteDialogOpen] = useState(false);
  const [selectedSubstitute, setSelectedSubstitute] = useState<AvailableTeacher | null>(null);

  const { data: fetchedEntries = [], isLoading: candidatesLoading } = useSwapCandidates(
    selectedEntry,
    open
  );

  // 대체는 그날 실제로 비어 있는 교사여야 한다 — 운영 시간표(시험·수능 대비 등)는 날짜로 판정된다
  const lessonDate = useMemo(() => {
    if (absence) return absence.window.date;
    if (weekDate && selectedEntry?.weekday) {
      return format(addDays(startOfWeek(weekDate, { weekStartsOn: 1 }), selectedEntry.weekday - 1), 'yyyy-MM-dd');
    }
    return undefined;
  }, [absence, weekDate, selectedEntry?.weekday]);

  const { data: availableTeachers = [], isLoading: teachersLoading } = useAvailableTeachers(
    selectedEntry?.weekday,
    selectedEntry?.period,
    open && mode === 'substitute',
    lessonDate
  );

  // 교장·교감(학교관리자 태그)은 상대방 후보에서 뺀다.
  // 태그가 도착하기 전에 목록을 그리면 제외 대상이 한 프레임 스쳐 보이므로 로딩에 합친다.
  const { data: excludedTeacherIds, isLoading: exclusionsLoading } = useSwapExcludedTeacherIds();
  const isExcluded = (resourceId?: string) =>
    !!resourceId && !!excludedTeacherIds?.has(resourceId);

  // 수강생 판정 — 표기가 같아도 학생이 다르면 교체할 수 없다
  const {
    data: rosterFit,
    isLoading: rosterLoading,
    isError: rosterError,
  } = useSwapRosterFit(selectedEntry, open);

  const loading = candidatesLoading || exclusionsLoading || rosterLoading;

  // 내 시간표(이미 로드된 것)와 전체 교사 시간표를 합쳐 충돌 판정 모집단을 만든다.
  const allTeacherEntries = useMemo(() => {
    const combined = [...currentTeacherEntries, ...fetchedEntries];
    return combined.filter(
      (entry, index, self) => index === self.findIndex((e) => e.id === entry.id)
    );
  }, [currentTeacherEntries, fetchedEntries]);

  const swapCandidates = useMemo(() => {
    if (!selectedEntry || allTeacherEntries.length === 0) return [];
    // 충돌 판정 모집단(allTeacherEntries)에서는 빼지 않는다 — 제외 대상 교사의 수업도
    // 시간 점유는 실재하므로, 후보 **목록**에서만 걸러야 판정이 정확하다.
    return findSwappableClasses(selectedEntry, allTeacherEntries, rosterFit ?? null).filter(
      (candidate) => !isExcluded(candidate.entry.resource_id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry, allTeacherEntries, excludedTeacherIds, rosterFit]);

  /** 내 수업의 학생 수 — 판정 묶음 어느 행에나 같은 값이 있다(없으면 명단을 모른다) */
  const myStudentCount = useMemo(() => {
    const first = rosterFit?.values().next().value;
    return first && first.myCount > 0 ? first.myCount : null;
  }, [rosterFit]);

  /** 교사별 주간 슬롯 — 부담 계산의 입력 */
  const slotsByTeacher = useMemo(() => {
    const map = new Map<string, BurdenSlot[]>();
    for (const entry of allTeacherEntries) {
      if (!entry.resource_id) continue;
      const slots = map.get(entry.resource_id) ?? [];
      slots.push({ weekday: entry.weekday, period: entry.period });
      map.set(entry.resource_id, slots);
    }
    return map;
  }, [allTeacherEntries]);

  const targetSlot = useMemo(
    () => ({ weekday: selectedEntry?.weekday ?? 0, period: selectedEntry?.period ?? 0 }),
    [selectedEntry?.weekday, selectedEntry?.period]
  );

  /**
   * 교체 가능한 후보는 **상대 선생님 부담이 적은 순**으로 세운다.
   * 시간 순으로 늘어놓으면 신청자가 맨 위 사람에게 몰아서 부탁하게 된다.
   */
  const available = useMemo(
    () =>
      swapCandidates
        .filter(
          (c) =>
            c.canSwap &&
            !isCoParticipant(absence, { id: c.entry.resource_id, name: c.entry.teacher_name })
        )
        .map((candidate) => ({
          candidate,
          weekday: candidate.entry.weekday,
          period: candidate.entry.period,
          burden: evaluateSwapBurden({
            teacherSlots: slotsByTeacher.get(candidate.entry.resource_id) ?? [],
            add: targetSlot,
            // 교체는 상대가 자기 시간을 내려놓으므로 그만큼 부담이 상쇄된다.
            remove: { weekday: candidate.entry.weekday, period: candidate.entry.period },
          }),
        }))
        .sort(compareBurden),
    [swapCandidates, slotsByTeacher, targetSlot, absence]
  );

  /**
   * 불가능한 후보는 이유별로 따로 접는다 — 수강생이 다른 수업(표기만 같은 수업)과
   * 선생님 시간이 겹치는 수업은 신청자가 할 수 있는 일이 다르다. 둘 다 해당하면 수강생 쪽에 둔다
   * (다른 주로 미뤄도 풀리지 않는 이유다).
   */
  const studentBlocked = useMemo(
    () => swapCandidates.filter((c) => !c.canSwap && c.studentConflicts > 0),
    [swapCandidates]
  );
  const blocked = useMemo(
    () => swapCandidates.filter((c) => !c.canSwap && c.studentConflicts === 0),
    [swapCandidates]
  );

  /**
   * 같은 결강(같은 출장)에 빠지는 선생님의 수업 — 시간표상으로는 맞바꿀 수 있어도
   * 그 선생님도 그날 없다. 목록에서 지우지 않고 사유를 달아 접어 둔다(왜 없는지 보이게).
   */
  const coParticipantBlocked = useMemo(
    () =>
      swapCandidates.filter(
        (c) =>
          c.canSwap &&
          isCoParticipant(absence, { id: c.entry.resource_id, name: c.entry.teacher_name })
      ),
    [swapCandidates, absence]
  );

  /** 결강과 같은 요일·교시의 후보 — 그 주 결강일에는 내가 맡을 수 없어 다른 주로만 가능하다 */
  const absenceNoteFor = (entry: TimetableEntry): string[] =>
    absence && absencePeriods && entry.weekday === absence.window.weekday && absencePeriods.has(entry.period)
      ? [`${ABSENCE_KIND_LABEL[absence.kind]} 시간과 같은 요일·교시라 결강일이 아닌 다른 주 날짜로만 교체할 수 있습니다`]
      : [];

  /** 교장·교감을 뺀 대체 후보 모집단 */
  const eligibleTeachers = useMemo(
    () => availableTeachers.filter((t) => !isExcluded(t.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availableTeachers, excludedTeacherIds]
  );

  const isAbsentToo = (t: AvailableTeacher) => isCoParticipant(absence, { id: t.id, name: t.name });

  /** 대체는 수업이 순수하게 하나 늘어난다(remove 없음) */
  const freeTeachers = useMemo(
    () =>
      eligibleTeachers
        .filter((t) => !t.hasConflict && !isAbsentToo(t))
        .map((teacher) => ({
          teacher,
          burden: evaluateSwapBurden({
            teacherSlots: slotsByTeacher.get(teacher.id) ?? [],
            add: targetSlot,
          }),
        }))
        .sort(compareBurden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligibleTeachers, slotsByTeacher, targetSlot, absence]
  );

  const busyTeachers = useMemo(
    () => eligibleTeachers.filter((t) => t.hasConflict && !isAbsentToo(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligibleTeachers, absence]
  );

  /** 같은 결강에 함께 빠지는 선생님 — 수업이 비어 있어도 그날 없다 */
  const absentTeachers = useMemo(
    () => eligibleTeachers.filter(isAbsentToo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligibleTeachers, absence]
  );

  if (!selectedEntry) return null;

  const handleRequestSwap = (candidateEntry: TimetableEntry) => {
    setSelectedCandidate(candidateEntry);
    setRequestDialogOpen(true);
  };

  const handleRequestSubstitute = (teacher: AvailableTeacher) => {
    setSelectedSubstitute(teacher);
    setSubstituteDialogOpen(true);
  };

  /** 분반(section) 행이 없으면 class_swap 의 NOT NULL FK 를 채울 수 없다 */
  const cannotRequest = !selectedEntry.section_id;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className={DIALOG_HEADER_CLASS}>
            <div className="flex items-center gap-3.5">
              <TitleIconChip icon={ArrowLeftRight} tone="blue" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  수업 교체 · 대체 신청
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-slate-500">
                  같은 학생들이 듣는 다른 수업과 시간을 맞바꾸거나, 다른 선생님께 대신 맡길 수 있습니다.
                </DialogDescription>
              </div>
            </div>

            {/* 대상 수업 — 어떤 칸을 고른 상태인지 항상 보이게 둔다 */}
            <div className="mt-3 rounded-lg border border-slate-200/80 bg-white/70 px-2.5 py-2">
              <div className="truncate text-sm font-semibold text-slate-800">
                {selectedEntry.subject}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <InfoChip icon={CalendarClock}>
                  {formatWeekday(selectedEntry.weekday)} {selectedEntry.period}교시
                </InfoChip>
                {/* "N학년 M반" 으로 풀어 쓰지 않는다 — 선택과목에서는 학급이 아니라 분반 번호다 */}
                <InfoChip icon={GraduationCap}>
                  {selectedEntry.grade}-{selectedEntry.class_number}
                  {myStudentCount !== null && ` · 학생 ${myStudentCount}명`}
                </InfoChip>
                <InfoChip icon={Users}>{selectedEntry.teacher_name}</InfoChip>
              </div>
            </div>

            {/* 결강 처리에서 열었으면 어느 날을 비우는지 항상 보이게 둔다 */}
            {absence && (
              <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
                <span className="font-semibold">
                  {ABSENCE_KIND_LABEL[absence.kind]} ·{' '}
                  {format(new Date(`${absence.window.date}T00:00:00`), 'M월 d일(E)', { locale: ko })}
                </span>{' '}
                결강을 처리합니다. 이 날의 {selectedEntry.period}교시를 비우는 요청이 만들어집니다.
              </p>
            )}
          </DialogHeader>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as 'swap' | 'substitute')}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* 컨트롤 밴드 — 아래 목록과 시각적으로 분리한다 */}
            <div className="shrink-0 border-b bg-white px-4 py-2.5 sm:px-6">
              <TabsList className="grid h-9 w-full grid-cols-2 bg-slate-100 p-1">
                <TabsTrigger
                  value="swap"
                  className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  수업 교체
                </TabsTrigger>
                <TabsTrigger
                  value="substitute"
                  className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  수업 대체
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── 교체: 같은 학급의 다른 수업과 시간 맞바꾸기 ───────────────── */}
            <TabsContent
              value="swap"
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
            >
              {cannotRequest ? (
                <UnregisteredSectionState />
              ) : !isSwappableLesson(selectedEntry) ? (
                // 동아리는 교체 대상이 아니다. 막고 끝내지 말고 대체 탭으로 길을 열어준다.
                <EmptyState
                  title="동아리활동은 교체할 수 없습니다"
                  hint="동아리는 학급이 아니라 동아리 단위로 학생이 모이고 담당 교사도 그 동아리에 묶여 있어, 같은 학급의 다른 수업과 시간을 맞바꿀 수 없습니다. 대신 맡아줄 선생님이 필요하면 수업 대체를 이용하세요."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 px-2.5 text-xs"
                      onClick={() => setMode('substitute')}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      수업 대체로 이동
                    </Button>
                  }
                />
              ) : loading ? (
                <LoadingState label="교체 가능한 수업을 찾는 중" />
              ) : swapCandidates.length === 0 ? (
                <EmptyState
                  title="교체할 수 있는 수업이 없습니다"
                  hint="이 수업 학생들이 듣는 다른 선생님의 수업이 있어야 교체할 수 있습니다."
                />
              ) : (
                <div className="space-y-4">
                  {rosterError && (
                    <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
                      수강생 명단을 확인하지 못해 학년-반 표기로만 골랐습니다. 표기가 같아도 수강생이
                      다를 수 있으니 신청 전에 학생 구성을 확인하세요.
                    </p>
                  )}

                  <section className="space-y-2">
                    <SectionLabel
                      icon={ArrowLeftRight}
                      trailing={<CountChip tone="emerald">{available.length}</CountChip>}
                    >
                      교체 가능한 수업
                    </SectionLabel>

                    {available.length === 0 ? (
                      <InlineNotice>
                        지금 바로 교체할 수 있는 수업이 없습니다. 아래에서 겹치는 이유를 확인하세요.
                      </InlineNotice>
                    ) : (
                      <>
                        <SortNote />
                        <ul className="space-y-1.5">
                          {available.map(({ candidate, burden }) => (
                            <CandidateRow
                              key={candidate.entry.id}
                              candidate={candidate}
                              targetEntry={selectedEntry}
                              allEntries={allTeacherEntries}
                              burden={burden}
                              extraReasons={absenceNoteFor(candidate.entry)}
                              onRequestSwap={handleRequestSwap}
                            />
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  {coParticipantBlocked.length > 0 && absence && (
                    <Disclosure
                      label={`같은 ${ABSENCE_KIND_LABEL[absence.kind]}에 빠지는 선생님의 수업 ${coParticipantBlocked.length}개`}
                    >
                      <ul className="space-y-1.5">
                        {coParticipantBlocked.map((candidate) => (
                          <CandidateRow
                            key={candidate.entry.id}
                            candidate={{ ...candidate, canSwap: false }}
                            targetEntry={selectedEntry}
                            allEntries={allTeacherEntries}
                            extraReasons={[
                              `${candidate.entry.teacher_name} 선생님도 이 ${ABSENCE_KIND_LABEL[absence.kind]}에 함께 빠집니다`,
                            ]}
                            onRequestSwap={handleRequestSwap}
                          />
                        ))}
                      </ul>
                    </Disclosure>
                  )}

                  {studentBlocked.length > 0 && (
                    <Disclosure
                      label={`수강생이 달라 교체할 수 없는 수업 ${studentBlocked.length}개`}
                    >
                      <p className="mb-1.5 px-0.5 text-[11px] leading-relaxed text-slate-400">
                        학년-반 표기는 같지만 학생 구성이 다른 수업입니다(선택과목·수준별 분반 등).
                        맞바꾸면 그 시간에 두 수업에 들어가야 하는 학생이 생깁니다.
                      </p>
                      <ul className="space-y-1.5">
                        {studentBlocked.map((candidate) => (
                          <CandidateRow
                            key={candidate.entry.id}
                            candidate={candidate}
                            targetEntry={selectedEntry}
                            allEntries={allTeacherEntries}
                            onRequestSwap={handleRequestSwap}
                          />
                        ))}
                      </ul>
                    </Disclosure>
                  )}

                  {blocked.length > 0 && (
                    <Disclosure label={`선생님 시간이 겹쳐 불가능한 수업 ${blocked.length}개`}>
                      <ul className="space-y-1.5">
                        {blocked.map((candidate) => (
                          <CandidateRow
                            key={candidate.entry.id}
                            candidate={candidate}
                            targetEntry={selectedEntry}
                            allEntries={allTeacherEntries}
                            onRequestSwap={handleRequestSwap}
                          />
                        ))}
                      </ul>
                    </Disclosure>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── 대체: 이 시간에 수업이 없는 교사에게 맡기기 ──────────────── */}
            <TabsContent
              value="substitute"
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
            >
              {cannotRequest ? (
                <UnregisteredSectionState />
              ) : teachersLoading || exclusionsLoading ? (
                <LoadingState label="대체 가능한 선생님을 찾는 중" />
              ) : eligibleTeachers.length === 0 ? (
                <EmptyState
                  title="대체 가능한 선생님을 찾을 수 없습니다"
                  hint="교사 명단을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
                />
              ) : (
                <div className="space-y-4">
                  <section className="space-y-2">
                    <SectionLabel
                      icon={UserCheck}
                      trailing={<CountChip tone="indigo">{freeTeachers.length}</CountChip>}
                    >
                      {formatWeekday(selectedEntry.weekday)} {selectedEntry.period}교시가 비어 있는
                      선생님
                    </SectionLabel>

                    {freeTeachers.length === 0 ? (
                      <InlineNotice>이 시간에 비어 있는 선생님이 없습니다.</InlineNotice>
                    ) : (
                      <>
                        <SortNote />
                        {/* 교사 항목은 짧아 2열이 효율적이지만, 행 모양은 교체 탭과 동일하게 유지한다. */}
                        <ul className="grid gap-1.5 sm:grid-cols-2">
                          {freeTeachers.map(({ teacher, burden }) => (
                            <ActionRow
                              key={teacher.id}
                              tone="active"
                              title={teacher.name}
                              meta={<BurdenChip burden={burden} />}
                              note={<BurdenReasons burden={burden} />}
                              action={
                                <RowActionButton
                                  tone="indigo"
                                  onClick={() => handleRequestSubstitute(teacher)}
                                >
                                  대체 요청
                                </RowActionButton>
                              }
                            />
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  {absentTeachers.length > 0 && absence && (
                    <Disclosure
                      label={`같은 ${ABSENCE_KIND_LABEL[absence.kind]}에 함께 빠지는 선생님 ${absentTeachers.length}명`}
                    >
                      <ul className="flex flex-wrap gap-1">
                        {absentTeachers.map((teacher) => (
                          <li
                            key={teacher.id}
                            className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-400 ring-1 ring-slate-200"
                          >
                            {teacher.name}
                          </li>
                        ))}
                      </ul>
                    </Disclosure>
                  )}

                  {busyTeachers.length > 0 && (
                    <Disclosure label={`이 시간에 수업이 있는 선생님 ${busyTeachers.length}명`}>
                      <ul className="flex flex-wrap gap-1">
                        {busyTeachers.map((teacher) => (
                          <li
                            key={teacher.id}
                            className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-400 ring-1 ring-slate-200"
                          >
                            {teacher.name}
                          </li>
                        ))}
                      </ul>
                    </Disclosure>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className={DIALOG_FOOTER_CLASS}>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <X className="h-3.5 w-3.5" />
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedCandidate && (
        <SwapRequestDialog
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
          myEntry={selectedEntry}
          targetEntry={selectedCandidate}
          mySlots={slotsByTeacher.get(selectedEntry.resource_id) ?? []}
          targetSlots={slotsByTeacher.get(selectedCandidate.resource_id) ?? []}
          absence={absence}
          onSuccess={() => {
            onRequested?.(selectedEntry);
            onOpenChange(false);
          }}
        />
      )}

      {selectedSubstitute && (
        <SubstituteRequestDialog
          open={substituteDialogOpen}
          onOpenChange={setSubstituteDialogOpen}
          myEntry={selectedEntry}
          substituteTeacher={selectedSubstitute}
          mySlots={slotsByTeacher.get(selectedEntry.resource_id) ?? []}
          substituteSlots={slotsByTeacher.get(selectedSubstitute.id) ?? []}
          absence={absence}
          onSuccess={() => {
            onRequested?.(selectedEntry);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}

/* ────────────────────────────── 부품 ────────────────────────────── */

function InfoChip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      <Icon className="h-3 w-3 text-slate-400" />
      {children}
    </span>
  );
}

function CountChip({ tone, children }: { tone: 'emerald' | 'indigo'; children: React.ReactNode }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  } as const;
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

function InlineNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs leading-relaxed text-slate-500">
      {children}
    </p>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      {label}
    </div>
  );
}

function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
        <Search className="h-4 w-4 text-slate-400" />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-slate-500">{hint}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

function UnregisteredSectionState() {
  return (
    <EmptyState
      title="이 수업은 아직 신청할 수 없습니다"
      hint="분반 정보가 등록되지 않은 수업입니다. 관리자에게 시간표 분반 등록을 요청해주세요."
    />
  );
}

/** 소음(충돌 후보·바쁜 교사)을 기본 접힘으로 감추는 토글 */
function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100/70 hover:text-slate-700"
      >
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-slate-200/80 p-2">{children}</div>}
    </section>
  );
}

/**
 * 두 탭이 공유하는 행 모양 — `[상태 점] [본문] [동작]`.
 * 탭을 오갈 때 행 높이·여백이 흔들리지 않게 하나로 묶어둔다.
 */
function ActionRow({
  tone,
  title,
  meta,
  note,
  action,
}: {
  tone: 'active' | 'muted';
  title?: string;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const isActive = tone === 'active';
  return (
    <li
      className={cn(
        'rounded-lg border px-3 py-2 transition-colors',
        isActive ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-slate-200/70 bg-white/70'
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            isActive ? 'bg-emerald-500' : 'bg-slate-300'
          )}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm font-medium',
              isActive ? 'text-slate-800' : 'text-slate-500'
            )}
            title={title}
          >
            {title}
          </div>
          {meta && <div className="mt-0.5 text-[11px] text-slate-400">{meta}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {note && <div className="mt-1.5 pl-4">{note}</div>}
    </li>
  );
}

/**
 * 행 안의 동작 버튼.
 * ghost 는 배경이 없어 목록에서 눌러야 할 곳이 잘 보이지 않았다 → 옅은 톤 배경을 준다.
 * 폭을 고정해 여러 행의 버튼이 **세로로 정렬**되게 한다(스캔 속도가 달라진다).
 */
function RowActionButton({
  tone,
  onClick,
  children,
}: {
  tone: 'emerald' | 'indigo';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800',
    indigo: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800',
  } as const;
  return (
    <Button
      onClick={onClick}
      size="sm"
      variant="ghost"
      className={cn('h-7 w-[72px] px-0 text-xs font-medium', tones[tone])}
    >
      {children}
    </Button>
  );
}

/**
 * 정렬 기준과 제외 규칙을 밝혀 둔다.
 * 순서 근거를 숨기면 사용자는 그냥 맨 위를 고르고, 제외를 숨기면 "왜 교감선생님이 없지?" 를 묻는다.
 */
function SortNote() {
  return (
    <p className="px-0.5 text-[11px] leading-relaxed text-slate-400">
      수강생 명단을 대조해 맞바꿔도 겹치는 학생이 없는 수업만 보여 줍니다.
      <br />
      상대 선생님이 받는 부담이 적은 순입니다 (연강 · 하루 수업 수 · 마지막 교시 기준).
      <br />
      교장·교감(학교관리자)은 목록에서 제외됩니다.
    </p>
  );
}

function BurdenChip({ burden }: { burden: BurdenResult }) {
  const tones = {
    low: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    high: 'bg-rose-50 text-rose-700',
  } as const;
  const dots = {
    low: 'bg-emerald-500',
    medium: 'bg-amber-500',
    high: 'bg-rose-500',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tones[burden.level]
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[burden.level])} />
      {BURDEN_LEVEL_LABEL[burden.level]}
    </span>
  );
}

/** 수강생 판정 칩 — 교체 가능한 후보에만 붙인다(불가 후보는 사유 글이 이미 말한다) */
function RosterChip({ status }: { status: SwapCandidate['rosterStatus'] }) {
  if (status === 'conflict') return null;
  const spec = {
    same: { label: '수강생 같음', tone: 'bg-slate-100 text-slate-600' },
    compatible: { label: '겹치는 학생 없음', tone: 'bg-slate-100 text-slate-600' },
    unknown: { label: '명단 미확인', tone: 'bg-amber-50 text-amber-700' },
  }[status];
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', spec.tone)}>
      {spec.label}
    </span>
  );
}

/** 부담 사유 — 있을 때만 렌더한다(부담이 적은 후보의 행 높이를 늘리지 않게) */
function BurdenReasons({ burden }: { burden: BurdenResult }) {
  if (burden.reasons.length === 0) return null;
  return <ReasonList reasons={burden.reasons} />;
}

function ReasonList({ reasons }: { reasons: string[] }) {
  return (
    <ul className="space-y-0.5">
      {reasons.map((reason, i) => (
        <li
          key={i}
          className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400"
        >
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}

interface CandidateRowProps {
  candidate: SwapCandidate;
  targetEntry: TimetableEntry;
  allEntries: TimetableEntry[];
  /** 교체 가능한 후보에만 있다 — 불가능한 후보는 부담을 따질 필요가 없다 */
  burden?: BurdenResult;
  /** 결강 처리에서 덧붙는 사유(같은 출장 동행·결강 시간과 같은 칸) */
  extraReasons?: string[];
  onRequestSwap: (candidateEntry: TimetableEntry) => void;
}

function CandidateRow({
  candidate,
  targetEntry,
  allEntries,
  burden,
  extraReasons = [],
  onRequestSwap,
}: CandidateRowProps) {
  const { entry, canSwap, rosterFit, teacherConflict, rosterStatus, matchedBy } = candidate;
  const conflictReasons = useMemo(
    () =>
      canSwap
        ? []
        : [
            ...getRosterConflictReasons(targetEntry, entry, rosterFit),
            ...(teacherConflict ? getSwapConflictReason(targetEntry, entry, allEntries) : []),
          ],
    [canSwap, targetEntry, entry, allEntries, rosterFit, teacherConflict]
  );

  // 판정 근거가 평소와 다를 때만 말한다 — 수강생이 같은 경우(대부분)는 칩 하나로 충분하다.
  const rosterNotes: string[] = [];
  if (canSwap && rosterStatus === 'unknown') {
    rosterNotes.push('수강생 명단이 없어 학년-반 표기로만 골랐습니다 — 신청 전에 학생 구성을 확인하세요');
  }
  if (canSwap && matchedBy === 'roster') {
    rosterNotes.push('학년-반 표기는 다르지만 수강생이 맞아 교체할 수 있습니다');
  }
  if (canSwap && rosterStatus === 'compatible') {
    rosterNotes.push('수강생 일부가 다르지만, 그 학생들은 맞바꾼 시간이 비어 있습니다');
  }

  // 툴팁 대신 인라인 — 터치 기기에서도 사유가 읽힌다.
  const notes = [
    ...extraReasons,
    ...rosterNotes,
    ...(canSwap ? (burden?.reasons ?? []) : conflictReasons),
  ];

  return (
    <ActionRow
      tone={canSwap ? 'active' : 'muted'}
      title={entry.subject}
      meta={
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="truncate">{entry.teacher_name}</span>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap tabular-nums">
            {formatWeekday(entry.weekday)} {entry.period}교시
          </span>
          {canSwap && <RosterChip status={rosterStatus} />}
          {burden && <BurdenChip burden={burden} />}
        </span>
      }
      note={notes.length > 0 ? <ReasonList reasons={notes} /> : undefined}
      action={
        canSwap ? (
          <RowActionButton tone="emerald" onClick={() => onRequestSwap(entry)}>
            교체 요청
          </RowActionButton>
        ) : undefined
      }
    />
  );
}
