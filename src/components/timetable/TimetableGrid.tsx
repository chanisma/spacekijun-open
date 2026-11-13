import '@/components/ui/improved-card.css';
import { Card } from '@/components/ui/card';
import React, { useMemo, useCallback, useState } from 'react';
import { format, addDays, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight, Calendar, StickyNote, Pencil, Users, GraduationCap, MapPin } from 'lucide-react';
import { formatPeriodTime } from '@/lib/timeUtils';
import { TimetableEntry } from '@/hooks/useTimetable';
import { ViewMode } from './TimetableHeader';
import { ClassSwapDialog } from './ClassSwapDialog';
import { TimetableMemoDialog } from './TimetableMemoDialog';
import { SectionStudentsDialog } from './SectionStudentsDialog';
import { useTimetableEvents } from '@/hooks/useTimetableEvents';
import { useTeacherMemos, findMemoForSlot } from '@/hooks/useTeacherMemo';
import { useSchoolCalendar } from '@/hooks/useSchoolCalendar';
import { gradeOfSectionName, isClosedForGrade, type SchoolDayInfo } from '@/lib/schoolDay';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { PretextInline } from '@/components/ui/PretextContent';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from '@/components/ui/context-menu';

interface TimetableGridProps {
  currentDate: Date;
  meetings: TimetableEntry[];
  viewMode: ViewMode;
  selectedResource?: string;
  /** 학생 시간표 — 그 학생의 학년(일부 학년 «수업 없는 날» 판정). 교사 시간표는 칸의 반 이름에서 읽는다 */
  viewerGrade?: number | null;
}


export const TimetableGrid = ({ currentDate, meetings, viewMode, selectedResource, viewerGrade = null }: TimetableGridProps) => {
  // State for swap dialog
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [selectedEntryForSwap, setSelectedEntryForSwap] = useState<TimetableEntry | null>(null);

  // State for memo dialog
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [memoSlot, setMemoSlot] = useState<{ date: Date; period: number; subjectName?: string } | null>(null);

  // State for students dialog
  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
  const [selectedEntryForStudents, setSelectedEntryForStudents] = useState<TimetableEntry | null>(null);
  const [selectedDateForStudents, setSelectedDateForStudents] = useState<Date | null>(null);

  // Teacher memos for the current week
  const { data: memos = [] } = useTeacherMemos(
    selectedResource && selectedResource !== 'student' ? selectedResource : undefined,
    currentDate
  );

  const { weekDays, periods } = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return {
      weekDays: Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
      periods: Array.from({ length: 7 }, (_, i) => i + 1)
    };
  }, [currentDate]);

  // 그 주의 쉬는 날·시험일 — 수업은 그대로 보여 주고 요일 머리에 이름을 붙인다(2026-10-11).
  // 학기 기간은 적용하지 않는다: 다음 학기 주를 넘겨 볼 때 «방학»으로 잘못 덮인다.
  // 방학은 NEIS 학사일정(`여름방학` 휴업일)이 이미 말해 준다.
  const schoolCalendar = useSchoolCalendar(weekDays[0], weekDays[weekDays.length - 1], { applyTerm: false });
  const dayInfoOf = (day: Date): SchoolDayInfo | undefined => schoolCalendar.days.get(format(day, 'yyyy-MM-dd'));

  // 시간표(수업) 조회 전용 — 일정(meeting) 데이터는 불러오지 않는다
  const { getTimetableEntryForSlot } = useTimetableEvents(meetings);

  // Handler to open swap dialog (delay to let ContextMenu fully close, avoiding aria-hidden focus conflict)
  const handleClassClick = useCallback((entry: TimetableEntry) => {
    // Disable swap for student timetable view
    if (selectedResource === 'student') return;
    // Only allow swapping for pattern entries (regular classes)
    if (entry.type === 'pattern') {
      setSelectedEntryForSwap(entry);
      setTimeout(() => {
        setSwapDialogOpen(true);
      }, 150);
    }
  }, [selectedResource]);

  // Handler to open memo dialog (delay to let ContextMenu fully close, avoiding aria-hidden focus conflict)
  const handleOpenMemo = useCallback((date: Date, period: number, subjectName?: string) => {
    setMemoSlot({ date, period, subjectName });
    setTimeout(() => {
      setMemoDialogOpen(true);
    }, 150);
  }, []);

  // Handler to open students dialog
  const handleViewStudents = useCallback((entry: TimetableEntry, date?: Date) => {
    setSelectedEntryForStudents(entry);
    setSelectedDateForStudents(date ?? null);
    setTimeout(() => {
      setStudentsDialogOpen(true);
    }, 150);
  }, []);

  const isTeacherView = selectedResource && selectedResource !== 'student';

  return (
    <>
        {/* 표 형태 그리드 - 모바일에서도 기본 뷰 */}
        {/* 사용자 요구사항: 모바일에서 기본은 표 형태, 헤더/푸터보다 커지지 않도록 크기 제한 */}
        <div className={
          viewMode === 'desktop'
            ? 'block w-full'  // 표 형태: 전체 너비 사용, 스크롤 없이 화면에 맞춤
            : 'hidden'  // 카드 형태 선택시: 완전히 숨김
        }>
          <div className="card-surface-effect grid w-full grid-cols-6 gap-0.5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm sm:gap-1 sm:rounded-3xl sm:p-1.5">
            <div className="font-semibold text-center bg-white/80 rounded-md shadow-sm flex items-center justify-center p-1 sm:p-1 md:p-2 min-h-[35px] sm:min-h-[40px] md:min-h-[50px]">
              <div className="text-slate-500 text-xs sm:text-sm md:text-base font-bold">교시</div>
            </div>
            {weekDays.map((day, index) => {
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              return (
                <div key={index} className={`font-medium text-center rounded-md shadow-sm transition-all p-1 sm:p-1 md:p-2 min-h-[35px] sm:min-h-[40px] md:min-h-[50px] flex flex-col items-center justify-center ${isToday
                  ? 'bg-brand-500 text-white ring-1 ring-brand-600 shadow-md'
                  : 'bg-white/80 text-slate-700 hover:bg-white'
                  }`}>
                  <div className="font-bold text-xs sm:text-sm md:text-base leading-tight">
                    {format(day, 'E', { locale: ko })}
                  </div>
                  <div className={`text-[10px] sm:text-xs leading-tight font-medium tabular-nums ${isToday ? 'text-brand-50' : 'text-slate-400'
                    }`}>
                    {format(day, 'M/d')}
                  </div>
                  <SchoolDayChip info={dayInfoOf(day)} onBrand={isToday} />
                </div>
              );
            })}

            {periods.map((period) => [
              <div key={`period-header-${period}`} className="font-semibold text-center bg-white/80 rounded-md shadow-sm border-l-[3px] border-l-indigo-400/70 flex flex-col items-center justify-center p-1 sm:p-1 md:p-2 min-h-[50px] sm:min-h-[60px] md:min-h-[80px]">
                <div className="text-slate-700 text-xs sm:text-sm md:text-base font-bold leading-tight tabular-nums">
                  {period}
                </div>
                <div className="text-[10px] text-slate-400 font-medium leading-tight hidden sm:block mt-0.5 tabular-nums">
                  {formatPeriodTime(period)}
                </div>
              </div>,
              ...weekDays.map((day, dayIndex) => {
                const timetableEntry = getTimetableEntryForSlot(day, period);
                const slotMemo = findMemoForSlot(memos, day, period);
                const isStudentView = selectedResource === 'student';
                const subjectText = timetableEntry?.subject || (timetableEntry?.type === 'meeting' ? '미팅' : '');
                const subjectMatch = subjectText ? subjectText.match(/^(.+?)\s+(\d+-\d+)$/) : null;
                const cellSubjectName = subjectMatch ? subjectMatch[1] : subjectText;

                // 칸의 학년 — 교사 시간표는 반 이름(`과목 2-3`), 학생 시간표는 그 학생의 학년
                const cellGrade = gradeOfSectionName(subjectText) ?? viewerGrade;
                const dayClosed = isClosedForGrade(dayInfoOf(day), cellGrade);
                const cellContent = (
                  <div
                    key={`${period}-${dayIndex}`}
                    className={`border border-slate-100 bg-white/40 hover:bg-white/80 transition-all duration-200 rounded-md shadow-sm relative group flex flex-col justify-start p-1 min-h-[50px] sm:min-h-[60px] md:min-h-[80px] h-auto space-y-1 ${dayClosed ? 'opacity-50' : ''}`}
                  >
                    {/* 메모 인디케이터 with 미리보기 */}
                    {slotMemo && (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="absolute top-1 right-1 z-10 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleOpenMemo(day, period, cellSubjectName || undefined); }}>
                              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-1 ring-amber-200 shadow-sm hover:scale-125 transition-transform" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            <p className="font-medium text-amber-700 mb-0.5">{period}교시 메모</p>
                            <p className="text-slate-600 whitespace-pre-wrap line-clamp-3">{slotMemo.content}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {timetableEntry && (
                      <div
                        className={`rounded-md border h-full transition-all duration-200 flex flex-col items-center justify-center py-1 px-1 sm:py-2 sm:px-1.5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${timetableEntry.type === 'pattern'
                          ? isStudentView
                            ? 'bg-[#e3f2fd]/80 border-[#bbdefb] hover:bg-[#e3f2fd]'
                            : 'bg-[#e3f2fd]/80 border-[#bbdefb] hover:bg-[#e3f2fd] hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
                          : 'bg-[#fff8e1]/80 border-[#ffecb3] hover:bg-[#fff8e1] hover:shadow-md'
                          }`}
                        onClick={(e) => {
                          if (!isStudentView) {
                            e.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
                              bubbles: true, cancelable: true,
                              clientX: e.clientX, clientY: e.clientY,
                            }));
                          }
                        }}
                      >
                        {(() => {
                          const gradeClass = subjectMatch ? subjectMatch[2] : null;

                          return (
                            <div className="text-center w-full">
                              <div className={`font-bold text-xs sm:text-sm leading-tight mb-0.5 line-clamp-2 ${timetableEntry.type === 'pattern'
                                ? 'text-brand-900'
                                : 'text-amber-900'
                                }`}>
                                <PretextInline content={cellSubjectName || ''} />
                              </div>
                              {gradeClass && (
                                <div className={`text-[10px] sm:text-xs font-medium leading-tight ${timetableEntry.type === 'pattern'
                                  ? 'text-brand-700/80'
                                  : 'text-amber-700/80'
                                  }`}>
                                  {gradeClass}
                                </div>
                              )}
                              {timetableEntry.teacher_name && !gradeClass && (
                                <div className={`text-[10px] sm:text-xs font-medium leading-tight ${timetableEntry.type === 'pattern'
                                  ? 'text-brand-700/70'
                                  : 'text-amber-700/70'
                                  }`}>
                                  {timetableEntry.teacher_name}
                                </div>
                              )}
                              {timetableEntry.room_name && (
                                <div className={`text-[9px] mt-0.5 px-1 rounded-full inline-block ${timetableEntry.type === 'pattern'
                                  ? 'bg-brand-100/50 text-brand-800'
                                  : 'bg-amber-100/50 text-amber-800'
                                  }`}>
                                  {timetableEntry.room_name}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                  </div>
                );

                // 학생 뷰에서는 컨텍스트 메뉴 없이 셀만 표시
                if (isStudentView) return cellContent;

                return (
                  <ContextMenu key={`ctx-${period}-${dayIndex}`}>
                    <ContextMenuTrigger asChild>
                      {cellContent}
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextMenuLabel className="text-xs text-muted-foreground">
                        {format(day, 'M/d (E)', { locale: ko })} {period}교시
                      </ContextMenuLabel>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => handleOpenMemo(day, period, cellSubjectName || undefined)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        {slotMemo ? (
                          <>
                            <Pencil className="h-4 w-4 text-amber-500" />
                            <span>메모 수정</span>
                          </>
                        ) : (
                          <>
                            <StickyNote className="h-4 w-4 text-amber-500" />
                            <span>메모 작성</span>
                          </>
                        )}
                      </ContextMenuItem>
                      {timetableEntry?.type === 'pattern' && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onClick={() => handleClassClick(timetableEntry)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <ArrowLeftRight className="h-4 w-4 text-brand-500" />
                            <span>수업 교체</span>
                          </ContextMenuItem>
                          {timetableEntry.teacher_name && (
                            <ContextMenuItem
                              onClick={() => handleViewStudents(timetableEntry, day)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Users className="h-4 w-4 text-emerald-500" />
                              <span>학생 보기</span>
                            </ContextMenuItem>
                          )}
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            ])}
          </div>
        </div>

        {/* 카드 형태 일별 레이아웃 - 사용자가 선택시에만 표시 */}
        {/* 기본은 표 형태이지만, 사용자가 카드 형태를 원할 때 선택 가능 */}
        <div className={
          viewMode === 'mobile'
            ? 'block space-y-4'  // 카드 형태 선택시: 항상 표시
            : 'hidden'  // 표 형태 선택시: 완전히 숨김
        }>
          {weekDays.map((day, dayIndex) => {
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            const dayEntries = periods.map(period => ({
              period,
              entry: getTimetableEntryForSlot(day, period)
            })).filter(item => item.entry);

            if (dayEntries.length === 0) return null;

            return (
              <Card key={dayIndex} className={`card-surface-effect ${isToday ? 'ring-2 ring-brand-400 shadow-md transform scale-[1.01] transition-all' : 'bg-white/80'}`}>
                <div className="p-4">
                  {/* 날짜 헤더 */}
                  <div className={`flex items-center gap-4 pb-4 mb-4 border-b border-dashed ${isToday ? 'border-brand-200' : 'border-slate-200'
                    }`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${isToday
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                      }`}>
                      <span className="font-bold text-xl tabular-nums">{format(day, 'd')}</span>
                    </div>
                    <div>
                      <div className={`font-bold text-lg flex items-center gap-2 ${isToday ? 'text-brand-900' : 'text-slate-800'
                        }`}>
                        {format(day, 'EEEE', { locale: ko })}
                        <SchoolDayChip info={dayInfoOf(day)} />
                        {isToday && (
                          <Badge variant="default" className="bg-brand-500 hover:bg-brand-600 border-0 h-5 px-1.5 text-[10px]">
                            오늘
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 font-medium">
                        {format(day, 'M월 d일 yyyy')}
                      </div>
                    </div>
                  </div>

                  {/* 시간표 엔트리들 */}
                  <div className="space-y-4 relative pl-4 border-l-2 border-slate-100 ml-2">
                    {dayEntries.map(({ period, entry }) => {
                      const cardMemo = findMemoForSlot(memos, day, period);
                      const cardSubject = entry?.subject || '';
                      const cardSubjectMatch = cardSubject.match(/^(.+?)\s+(\d+-\d+)$/);
                      const cardSubjectName = cardSubjectMatch ? cardSubjectMatch[1] : cardSubject;
                      const isStudentView = selectedResource === 'student';

                      const cardContent = (
                      <div key={period} className="relative">
                        <div className="absolute -left-[23px] top-0 bg-white border-2 border-slate-100 rounded-full w-3 h-3 box-content p-0.5">
                          <div className="w-full h-full bg-slate-400 rounded-full"></div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          {/* 시간 표시 */}
                          <div className="flex-shrink-0 w-20 pt-0.5">
                            <div className="text-sm font-bold text-slate-700 flex items-center gap-1">
                              {period}교시
                              {cardMemo && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-1 ring-amber-200 cursor-pointer hover:scale-125 transition-transform" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-[200px] text-xs">
                                      <p className="font-medium text-amber-700 mb-0.5">{period}교시 메모</p>
                                      <p className="text-slate-600 whitespace-pre-wrap line-clamp-3">{cardMemo.content}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-medium mt-0.5">
                              {formatPeriodTime(period)}
                            </div>
                          </div>

                          {/* 수업/활동 내용 */}
                          <div className="flex-1 space-y-2.5">
                            {entry && (
                              <div
                                className={`p-4 rounded-xl border transition-all duration-200 group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${entry.type === 'pattern'
                                  ? isStudentView
                                    ? 'bg-[#e3f2fd]/60 border-[#bbdefb] hover:bg-[#e3f2fd]'
                                    : 'bg-[#e3f2fd]/60 border-[#bbdefb] hover:bg-[#e3f2fd] hover:shadow-md cursor-pointer'
                                  : 'bg-[#fff8e1]/60 border-[#ffecb3] hover:bg-[#fff8e1]'
                                  }`}
                                onClick={() => {
                                  if (entry.type !== 'pattern' || isStudentView) return;
                                  if (entry.teacher_name) {
                                    handleViewStudents(entry, day);
                                  } else {
                                    handleOpenMemo(day, period, cardSubjectName || undefined);
                                  }
                                }}
                              >
                                {entry.type === 'pattern' && !isStudentView && (
                                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {entry.teacher_name
                                      ? <Users className="h-4 w-4 text-emerald-400" />
                                      : <StickyNote className="h-4 w-4 text-amber-400" />
                                    }
                                  </div>
                                )}
                                <div className={`font-bold text-base mb-1.5 line-clamp-2 ${entry.type === 'pattern'
                                  ? 'text-brand-900'
                                  : 'text-amber-900'
                                  }`}>
                                  <PretextInline content={entry.subject || (entry.type === 'meeting' ? '미팅' : '수업')} />
                                </div>
                                <div className="flex flex-wrap gap-2 text-sm">
                                  {entry.teacher_name && (
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${entry.type === 'pattern'
                                      ? 'bg-brand-100/50 text-brand-800'
                                      : 'bg-amber-100/50 text-amber-800'
                                      }`}>
                                      <GraduationCap className="h-3 w-3" />
                                      <span className="font-medium text-xs">{entry.teacher_name}</span>
                                    </div>
                                  )}
                                  {entry.room_name && (
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${entry.type === 'pattern'
                                      ? 'bg-brand-100/50 text-brand-800'
                                      : 'bg-amber-100/50 text-amber-800'
                                      }`}>
                                      <MapPin className="h-3 w-3" />
                                      <span className="font-medium text-xs">{entry.room_name}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        </div>
                      </div>
                      );

                      if (isStudentView) return cardContent;

                      return (
                        <ContextMenu key={`card-ctx-${period}`}>
                          <ContextMenuTrigger asChild>
                            {cardContent}
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            <ContextMenuLabel className="text-xs text-muted-foreground">
                              {format(day, 'M/d (E)', { locale: ko })} {period}교시
                            </ContextMenuLabel>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => handleOpenMemo(day, period, cardSubjectName || undefined)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              {cardMemo ? (
                                <>
                                  <Pencil className="h-4 w-4 text-amber-500" />
                                  <span>메모 수정</span>
                                </>
                              ) : (
                                <>
                                  <StickyNote className="h-4 w-4 text-amber-500" />
                                  <span>메모 작성</span>
                                </>
                              )}
                            </ContextMenuItem>
                            {entry?.type === 'pattern' && (
                              <>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  onClick={() => handleClassClick(entry)}
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <ArrowLeftRight className="h-4 w-4 text-brand-500" />
                                  <span>수업 교체</span>
                                </ContextMenuItem>
                                {entry.teacher_name && (
                                  <ContextMenuItem
                                    onClick={() => handleViewStudents(entry, day)}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <Users className="h-4 w-4 text-emerald-500" />
                                    <span>학생 보기</span>
                                  </ContextMenuItem>
                                )}
                              </>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}

          {weekDays.every(day =>
            periods.every(period => !getTimetableEntryForSlot(day, period))
          ) && (
              <Card className="card-surface-effect">
                <div className="p-12 text-center text-slate-400">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-50 mb-4">
                    <Calendar className="h-8 w-8 text-slate-300" />
                  </div>
                  <div className="text-lg font-bold text-slate-600 mb-1">이번 주 시간표가 비어 있습니다</div>
                  <p className="text-sm text-slate-500">수업이 등록되지 않았습니다.</p>
                </div>
              </Card>
            )}
        </div>

        {/* Class Swap Dialog */}
        <ClassSwapDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          selectedEntry={selectedEntryForSwap}
          currentTeacherEntries={meetings}
          weekDate={currentDate}
        />

        {/* Memo Dialog */}
        {memoSlot && selectedResource && selectedResource !== 'student' && (
          <TimetableMemoDialog
            open={memoDialogOpen}
            onOpenChange={setMemoDialogOpen}
            resourceId={selectedResource}
            date={memoSlot.date}
            period={memoSlot.period}
            existingMemo={findMemoForSlot(memos, memoSlot.date, memoSlot.period)}
            subjectName={memoSlot.subjectName}
          />
        )}

        {/* Students Dialog */}
        {selectedEntryForStudents && (() => {
          const rawSubject = selectedEntryForStudents.subject ?? selectedEntryForStudents.section_name ?? '';
          const subjectMatch = rawSubject.match(/^(.+?)\s+\d+-\d+$/);
          const subjectName = subjectMatch ? subjectMatch[1] : rawSubject;
          return (
            <SectionStudentsDialog
              open={studentsDialogOpen}
              onOpenChange={setStudentsDialogOpen}
              subjectName={subjectName}
              teacherName={selectedEntryForStudents.teacher_name ?? null}
              dayOfWeek={selectedEntryForStudents.weekday ?? null}
              period={selectedEntryForStudents.period ?? null}
              date={selectedDateForStudents}
            />
          );
        })()}

    </>
  );
};

/** 요일 머리의 쉬는 날·시험 표시 — 평소 수업일과 주말은 아무것도 그리지 않는다 */
function SchoolDayChip({ info, onBrand = false }: { info: SchoolDayInfo | undefined; onBrand?: boolean }) {
  if (!info || info.kind === 'weekend') return null;
  // 일부 학년만 수업이 없는 날 — 그 학년 칸만 흐려지므로 머리에서 이유를 말한다
  const partial = info.kind === 'school' || info.kind === 'exam' ? info.partialLabel : null;
  const label = info.kind === 'school' ? partial : info.label;
  if (!label) return null;
  const exam = info.kind === 'exam' && !partial;
  const tone = onBrand
    ? 'bg-white/20 text-white'
    : exam
      ? 'bg-amber-100 text-amber-800'
      : 'bg-rose-50 text-rose-700';
  const title = partial
    ? `${partial} — 그 학년 수업 없음`
    : exam ? `${info.label} — 평소 시간표와 다를 수 있습니다` : `${info.label} — 수업 없음`;
  return (
    <span
      title={title}
      className={`mt-0.5 inline-block max-w-full truncate rounded px-1 text-[9px] font-semibold leading-4 sm:text-[10px] ${tone}`}
    >
      {partial ?? label}
    </span>
  );
}
