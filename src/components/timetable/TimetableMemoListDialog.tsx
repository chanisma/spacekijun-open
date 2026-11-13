import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, DIALOG_FOOTER_CLASS, TitleIconChip } from './timetableDialogDesign';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { TeacherMemo, useDeleteMemo, useTeacherMemos, useUpsertMemo } from '@/hooks/useTeacherMemo';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, startOfWeek, addDays, addWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';
import { StickyNote, Pencil, Trash2, Calendar, Grid3x3, List, Plus, ChevronLeft, ChevronRight, ArrowLeft, Save, Users } from 'lucide-react';
import { useAllTeacherStudentMemos } from '@/hooks/useClassStudentMemos';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { formatPeriodTime } from '@/lib/timeUtils';
import { TimetableEntry } from '@/hooks/useTimetable';

type MemoViewMode = 'list' | 'week' | 'students';

interface EditingSlot {
  date: Date;
  period: number;
  existingMemo?: TeacherMemo;
  subjectName?: string;
}

interface TimetableMemoListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memos: TeacherMemo[];
  onEditMemo?: (memo: TeacherMemo) => void;
  onCreateMemo?: (date: Date, period: number, subjectName?: string) => void;
  currentWeek?: Date;
  timetableEntries?: TimetableEntry[];
  resourceId?: string;
}

export const TimetableMemoListDialog: React.FC<TimetableMemoListDialogProps> = ({
  open,
  onOpenChange,
  memos: externalMemos,
  currentWeek = new Date(),
  timetableEntries = [],
  resourceId,
}) => {
  const [viewMode, setViewMode] = useState<MemoViewMode>('week');
  const [selectedWeek, setSelectedWeek] = useState<Date>(currentWeek);
  const [editingSlot, setEditingSlot] = useState<EditingSlot | null>(null);
  const [editContent, setEditContent] = useState('');
  const { toast } = useToast();
  const deleteMemo = useDeleteMemo();
  const upsertMemo = useUpsertMemo();
  // 메모의 year 는 학년도(학사력) 기준 — SectionStudentsDialog 저장 시와 같은 값이어야 한다.
  const { term } = useTimetableTerm();
  const { data: studentMemos = [] } = useAllTeacherStudentMemos(
    term?.year ?? new Date().getFullYear(),
    open && viewMode === 'students'
  );

  // 다이얼로그가 열릴 때 외부 currentWeek으로 리셋
  useEffect(() => {
    if (open) {
      setSelectedWeek(currentWeek);
      setEditingSlot(null);
    }
  }, [open, currentWeek]);

  // 주차가 변경되면 독립적으로 메모를 fetch
  const isNavigatedWeek = selectedWeek.getTime() !== currentWeek.getTime();
  const { data: navigatedMemos = [] } = useTeacherMemos(
    isNavigatedWeek ? resourceId : undefined,
    selectedWeek
  );

  // 현재 주차면 외부 memos, 다른 주차면 내부 fetch 결과 사용
  const memos = isNavigatedWeek ? navigatedMemos : externalMemos;

  const navigateWeek = (direction: 'prev' | 'next') => {
    setSelectedWeek(prev => addWeeks(prev, direction === 'next' ? 1 : -1));
  };

  // 인라인 편집 시작
  const startEditing = (slot: EditingSlot) => {
    setEditingSlot(slot);
    setEditContent(slot.existingMemo?.content || '');
  };

  // 인라인 편집 저장
  const handleSave = async () => {
    if (!editingSlot || !resourceId || !editContent.trim()) {
      if (!editContent.trim()) {
        toast({ title: '메모 내용을 입력해주세요.', variant: 'destructive' });
      }
      return;
    }

    try {
      await upsertMemo.mutateAsync({
        resource_id: resourceId,
        memo_date: format(editingSlot.date, 'yyyy-MM-dd'),
        period: editingSlot.period,
        content: editContent.trim(),
      });
      toast({ title: editingSlot.existingMemo ? '메모가 수정되었습니다.' : '메모가 저장되었습니다.' });
      setEditingSlot(null);
    } catch {
      toast({ title: '메모 저장에 실패했습니다.', variant: 'destructive' });
    }
  };

  const handleDelete = async (memoId: string, returnToList = false) => {
    try {
      await deleteMemo.mutateAsync(memoId);
      if (returnToList) setEditingSlot(null);
    } catch {
      toast({ title: '메모 삭제에 실패했습니다.', variant: 'destructive' });
    }
  };

  // 주간 그리드용 데이터
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekDays = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()]
  );
  const periods = [1, 2, 3, 4, 5, 6, 7];

  // 메모를 날짜+교시로 빠르게 조회하기 위한 맵
  const memoMap = useMemo(() => {
    const map = new Map<string, TeacherMemo>();
    memos.forEach(m => map.set(`${m.memo_date}-${m.period}`, m));
    return map;
  }, [memos]);

  // 시간표 엔트리를 요일+교시로 조회하기 위한 맵 (한 슬롯에 여러 일정 허용)
  // 수업(pattern) 외에는 모두 숨김 — meeting_kind 가 있는 항목은 전부 메모 모달에서 제외
  const MEMO_HIDDEN_MEETING_KINDS = new Set(['duty', 'personal', 'training', 'document_submission']);
  const timetableMap = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>();
    timetableEntries
      .filter(entry => !entry.meeting_kind || !MEMO_HIDDEN_MEETING_KINDS.has(entry.meeting_kind))
      .forEach(entry => {
        const key = `${entry.weekday}-${entry.period}`;
        const list = map.get(key);
        if (list) list.push(entry);
        else map.set(key, [entry]);
      });
    return map;
  }, [timetableEntries]);

  // 단일 엔트리의 과목명 + 학년-반 추출 유틸
  const getSubjectInfo = (entry: TimetableEntry | undefined) => {
    if (!entry?.subject) return undefined;
    const match = entry.subject.match(/^(.+?)\s+(\d+-\d+)$/);
    return match
      ? { name: match[1], classInfo: match[2] }
      : { name: entry.subject, classInfo: undefined };
  };

  // 슬롯 단위 라벨: 다중 엔트리 중 첫 번째를 대표값으로 사용 (편집 시 subjectName 전달용)
  const getPrimarySubjectInfo = (entries: TimetableEntry[] | undefined) => {
    if (!entries || entries.length === 0) return undefined;
    return getSubjectInfo(entries[0]);
  };

  // 날짜별로 그룹핑 (리스트 뷰용)
  const groupedMemos = memos.reduce<Record<string, TeacherMemo[]>>((acc, memo) => {
    const dateKey = memo.memo_date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(memo);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedMemos).sort();

  const emptyState = (
    <div className="py-12 text-center text-muted-foreground">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-50 mb-3">
        <Calendar className="h-7 w-7 text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500">이번 주에 작성된 메모가 없습니다.</p>
      <p className="text-xs text-slate-400 mt-1">시간표에서 우클릭하여 메모를 작성해보세요.</p>
    </div>
  );

  // 인라인 편집 뷰
  const editView = editingSlot && (
    <div className="space-y-4">
      {/* 뒤로 가기 + 슬롯 정보 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditingSlot(null)}
          className="h-7 w-7 p-0 hover:bg-slate-100 rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-1 flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-700">
            {format(editingSlot.date, 'M월 d일 (EEEE)', { locale: ko })}
          </span>
          <span className="text-slate-400">|</span>
          <span className="font-medium text-slate-700">{editingSlot.period}교시</span>
          {editingSlot.subjectName && (
            <>
              <span className="text-slate-400">|</span>
              <span className="text-brand-600 font-medium">{editingSlot.subjectName}</span>
            </>
          )}
        </div>
      </div>

      {/* 메모 입력 */}
      <Textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        placeholder="메모를 입력하세요..."
        aria-label="수업 메모"
        className="min-h-44 resize-y rounded-xl border-slate-200 leading-relaxed"
        autoFocus
      />


    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${viewMode === 'week' && !editingSlot ? 'max-w-3xl' : viewMode === 'students' ? 'max-w-2xl' : 'max-w-lg'} max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0 transition-all`}>
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
              <TitleIconChip icon={StickyNote} />
              {editingSlot ? (editingSlot.existingMemo ? '메모 수정' : '메모 작성') : '메모'}
              {!editingSlot && memos.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {memos.length}개
                </Badge>
              )}
            </DialogTitle>

            {/* 뷰 모드 토글 - 편집 모드에서는 숨김 */}
            {!editingSlot && (
              <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 gap-0.5 border border-slate-200/50">
                <Button
                  variant={viewMode === 'week' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('week')}
                  className={`h-7 px-2 rounded-md transition-all text-xs ${viewMode === 'week' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Grid3x3 className="h-3.5 w-3.5 mr-1" />
                  주간
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={`h-7 px-2 rounded-md transition-all text-xs ${viewMode === 'list' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <List className="h-3.5 w-3.5 mr-1" />
                  목록
                </Button>
                <Button
                  variant={viewMode === 'students' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('students')}
                  className={`h-7 px-2 rounded-md transition-all text-xs ${viewMode === 'students' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Users className="h-3.5 w-3.5 mr-1" />
                  학생 메모
                  {studentMemos.length > 0 && (
                    <span className="ml-1 bg-indigo-100 text-indigo-600 rounded-full px-1 text-[10px] font-semibold">
                      {studentMemos.length}
                    </span>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* 주차 네비게이션 - 편집 모드 및 학생 메모 모드에서는 숨김 */}
          {!editingSlot && viewMode !== 'students' && (
            <div className="flex items-center justify-center gap-1 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateWeek('prev')}
                className="h-7 w-7 p-0 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedWeek(currentWeek)}
                className="text-sm font-semibold text-slate-700 hover:bg-slate-100 px-3 h-7 rounded-lg"
              >
                {format(weekStart, 'M/d', { locale: ko })} - {format(addDays(weekStart, 4), 'M/d', { locale: ko })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateWeek('next')}
                className="h-7 w-7 p-0 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {isNavigatedWeek && (
                <Badge
                  variant="outline"
                  className="ml-1 text-[10px] cursor-pointer hover:bg-slate-100 h-5"
                  onClick={() => setSelectedWeek(currentWeek)}
                >
                  이번 주로
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {/* 인라인 편집 모드 */}
          {editingSlot ? editView : (
            <>
              {/* 주간 그리드 뷰 - 메모가 없어도 시간표와 함께 항상 표시 */}
              {viewMode === 'week' ? (
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-6 gap-1 min-w-[500px]">
                    {/* 헤더: 교시 + 요일 */}
                    <div className="font-semibold text-center bg-slate-50 rounded-md p-2 text-xs text-slate-500">
                      교시
                    </div>
                    {weekDays.map((day, i) => {
                      const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                      return (
                        <div
                          key={i}
                          className={`font-medium text-center rounded-md p-2 ${isToday ? 'bg-brand-500 text-white' : 'bg-slate-50 text-slate-700'}`}
                        >
                          <div className="font-bold text-xs">{format(day, 'E', { locale: ko })}</div>
                          <div className={`text-[10px] ${isToday ? 'text-brand-100' : 'text-slate-400'}`}>
                            {format(day, 'M/d')}
                          </div>
                        </div>
                      );
                    })}

                    {/* 교시별 행 — Fragment 래퍼 대신 flatMap으로 키 있는 셀 배열을 직접 전개.
                        (dev 전용 lovable-tagger가 React.Fragment에도 data-lov-id를 주입해
                        "Invalid prop supplied to React.Fragment" 경고를 내던 문제 회피) */}
                    {periods.flatMap((period) => [
                      /* 교시 헤더 */
                      <div
                        key={`period-header-${period}`}
                        className="font-semibold text-center bg-slate-50 rounded-md p-2 flex flex-col items-center justify-center"
                      >
                        <div className="text-xs font-bold text-slate-700">{period}</div>
                        <div className="text-[9px] text-slate-400">{formatPeriodTime(period)}</div>
                      </div>,

                      /* 각 요일 셀 */
                      ...weekDays.map((day, dayIdx) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const weekday = dayIdx + 1; // 1=월, 2=화, ...
                          const memo = memoMap.get(`${dateStr}-${period}`);
                          const slotEntries = timetableMap.get(`${weekday}-${period}`) || [];
                          const primarySubjectInfo = getPrimarySubjectInfo(slotEntries);
                          const hasClass = slotEntries.length > 0;
                          // 엔트리 수에 따라 동적 min-height (한 줄 라벨 ~16px)
                          const extraEntries = Math.max(0, slotEntries.length - 1);
                          const minHeightPx = 60 + extraEntries * 16;

                          return (
                            <div
                              key={`${period}-${dayIdx}`}
                              style={{ minHeight: `${minHeightPx}px` }}
                              className={`rounded-md border p-1.5 transition-all ${
                                memo
                                  ? 'bg-amber-50/80 border-amber-200 hover:bg-amber-50 cursor-pointer group'
                                  : hasClass
                                    ? 'bg-brand-50/30 border-brand-100 hover:bg-brand-50/60 cursor-pointer group'
                                    : 'bg-white/40 border-slate-100'
                              }`}
                              onClick={() => {
                                if (memo || hasClass) {
                                  startEditing({
                                    date: day,
                                    period,
                                    existingMemo: memo,
                                    subjectName: primarySubjectInfo?.name,
                                  });
                                }
                              }}
                            >
                              {memo ? (
                                <div className="relative h-full">
                                  {/* 과목명 + 학년-반 — 다중 일정 있으면 모두 나열 */}
                                  {slotEntries.length > 0 && (
                                    <div className="text-[9px] font-semibold text-brand-600/70 mb-0.5 space-y-0.5">
                                      {slotEntries.map((e, i) => {
                                        const info = getSubjectInfo(e);
                                        if (!info) return null;
                                        return (
                                          <div key={i} className="truncate">
                                            {info.name}
                                            {info.classInfo && <span className="text-brand-400/70 ml-0.5">{info.classInfo}</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <p className="text-[11px] text-slate-700 leading-relaxed line-clamp-2 whitespace-pre-wrap break-words">
                                    {memo.content}
                                  </p>
                                  <div className="absolute -top-0.5 -right-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                                    <button
                                      className="h-5 w-5 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
                                      onClick={(e) => { e.stopPropagation(); handleDelete(memo.id); }}
                                    >
                                      <Trash2 className="h-2.5 w-2.5 text-red-600" />
                                    </button>
                                  </div>
                                </div>
                              ) : hasClass ? (
                                <div className="relative h-full flex flex-col items-center justify-center gap-0.5">
                                  {slotEntries.map((e, i) => {
                                    const info = getSubjectInfo(e);
                                    if (!info) return null;
                                    return (
                                      <div key={i} className="text-[10px] font-medium text-brand-800/60 truncate w-full text-center">
                                        {info.name}
                                        {info.classInfo && <span className="text-brand-600/40 ml-0.5">{info.classInfo}</span>}
                                      </div>
                                    );
                                  })}
                                  <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Plus className="h-3.5 w-3.5 text-slate-400" />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        }),
                    ])}
                  </div>
                </div>
              ) : viewMode !== 'list' ? null : memos.length === 0 ? (
                emptyState
              ) : (
                <div className="space-y-4">
                  {sortedDates.map((dateStr) => {
                    const date = parseISO(dateStr);
                    const dayMemos = groupedMemos[dateStr].sort((a, b) => a.period - b.period);
                    const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;

                    return (
                      <div key={dateStr} className="space-y-2">
                        {/* 날짜 헤더 */}
                        <div className="flex items-center gap-2 sticky top-0 bg-white/95 backdrop-blur-sm py-1 z-10">
                          <div className={`text-sm font-bold ${isToday ? 'text-brand-600' : 'text-slate-700'}`}>
                            {format(date, 'M월 d일 (EEEE)', { locale: ko })}
                          </div>
                          {isToday && (
                            <Badge variant="default" className="bg-brand-500 border-0 h-4 px-1.5 text-[9px]">
                              오늘
                            </Badge>
                          )}
                          <div className="flex-1 border-b border-dashed border-slate-200" />
                        </div>

                        {/* 메모 목록 */}
                        <div className="space-y-2 pl-2">
                          {dayMemos.map((memo) => {
                            const memoDate = parseISO(memo.memo_date);
                            const memoWeekday = memoDate.getDay() === 0 ? 7 : memoDate.getDay(); // 1=월 ~ 5=금
                            const memoSubjectInfo = getPrimarySubjectInfo(timetableMap.get(`${memoWeekday}-${memo.period}`));

                            return (
                            <div
                              key={memo.id}
                              className="group flex gap-3 p-3 rounded-lg border border-amber-100 bg-amber-50/50 hover:bg-amber-50 transition-colors"
                            >
                              <div className="flex-shrink-0 w-14 text-center">
                                <div className="text-sm font-bold text-slate-700">{memo.period}교시</div>
                                <div className="text-[10px] text-slate-400">{formatPeriodTime(memo.period)}</div>
                              </div>
                              <div className="w-px bg-amber-200 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                {memoSubjectInfo && (
                                  <div className="text-[11px] font-semibold text-brand-600/70 mb-1">
                                    {memoSubjectInfo.name}
                                    {memoSubjectInfo.classInfo && <span className="text-brand-400/70 ml-1">{memoSubjectInfo.classInfo}</span>}
                                  </div>
                                )}
                                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                                  {memo.content}
                                </p>
                              </div>
                              <div className="flex-shrink-0 flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-amber-100 hover:text-amber-700"
                                  onClick={() => startEditing({
                                    date: parseISO(memo.memo_date),
                                    period: memo.period,
                                    existingMemo: memo,
                                  })}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600"
                                  onClick={() => handleDelete(memo.id)}
                                  disabled={deleteMemo.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* 학생 메모 표 */}
          {viewMode === 'students' && (
            <div className="flex-1 overflow-auto">
              {studentMemos.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Users className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                  <p className="text-sm font-medium">작성한 학생 메모가 없습니다</p>
                  <p className="text-xs mt-1 text-slate-300">학생 보기에서 메모를 작성하면 여기에 표시됩니다</p>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 sticky top-0">
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">과목</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-16">수업</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-20 hidden sm:table-cell">날짜</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-20">학생</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-12 hidden sm:table-cell">학년-반</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500">내용</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">수정시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentMemos.map((memo) => {
                      const dowLabels = ['', '월', '화', '수', '목', '금'];
                      const lessonLabel = memo.day_of_week && memo.period
                        ? `${dowLabels[memo.day_of_week]}요일 ${memo.period}교시`
                        : '-';
                      const dateLabel = memo.memo_date
                        ? format(new Date(memo.memo_date), 'M월 d일 (E)', { locale: ko })
                        : null;
                      return (
                      <tr
                        key={memo.id}
                        className="border-b border-slate-50 hover:bg-indigo-50/30 transition-colors group"
                      >
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium truncate max-w-[88px]">
                            {memo.subject}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-600 text-[11px] font-medium whitespace-nowrap">
                            {lessonLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          {dateLabel ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-medium whitespace-nowrap">
                              {dateLabel}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800 text-xs">
                          {memo.student_name ?? '-'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 hidden sm:table-cell">
                          {memo.grade && memo.class_num ? `${memo.grade}-${memo.class_num}` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[200px]">
                          <p className="line-clamp-2 leading-relaxed">{memo.content}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[10px] text-slate-400 whitespace-nowrap">
                          {format(new Date(memo.updated_at), 'M/d HH:mm', { locale: ko })}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        {editingSlot ? (
          <DialogFooter className={`${DIALOG_FOOTER_CLASS} justify-between`}>
            <div>
              {editingSlot.existingMemo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(editingSlot.existingMemo!.id, true)}
                  disabled={deleteMemo.isPending}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  삭제
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingSlot(null)}>
                취소
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="h-9 rounded-xl bg-slate-900 hover:bg-slate-800"
                disabled={upsertMemo.isPending || !editContent.trim()}
              >
                <Save className="h-4 w-4 mr-1" />
                {editingSlot.existingMemo ? '수정' : '저장'}
              </Button>
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter className={DIALOG_FOOTER_CLASS}>
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>닫기</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
