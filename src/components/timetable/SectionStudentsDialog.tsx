import React, { useState, useRef, useEffect } from 'react';
import { DIALOG_HEADER_CLASS, DIALOG_FOOTER_CLASS } from './timetableDialogDesign';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Users, PenLine, Check, Clock, Calendar } from 'lucide-react';
import { useSectionStudents } from '@/hooks/useSectionStudents';
import { useClassStudentMemos } from '@/hooks/useClassStudentMemos';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface SectionStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName: string;
  teacherName: string | null;
  dayOfWeek: number | null;
  period: number | null;
  date?: Date | null;
}

const WEEKDAY_LABELS = ['', '월', '화', '수', '목', '금'];

const getAvatarColor = (number: number | null): string => {
  const colors = [
    'bg-brand-100 text-brand-700',
    'bg-emerald-100 text-emerald-700',
    'bg-violet-100 text-violet-700',
    'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700',
    'bg-cyan-100 text-cyan-700',
    'bg-amber-100 text-amber-700',
    'bg-indigo-100 text-indigo-700',
  ];
  if (!number) return colors[0];
  return colors[(number - 1) % colors.length];
};

/** 서랍형 메모 패널 — 학생 카드 아래로 슬라이드 */
const MemoDrawer: React.FC<{
  studentCode: string;
  studentName: string | null;
  existingContent: string;
  subject: string;
  teacherName: string | null;
  grade: number | null;
  classNum: number | null;
  dayOfWeek: number | null;
  period: number | null;
  memoDate?: Date | null;
  updatedAt?: string;
  onSave: (content: string) => Promise<void>;
}> = ({ studentCode: _studentCode, studentName, existingContent, memoDate, updatedAt, onSave }) => {
  const [content, setContent] = useState(existingContent);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 열릴 때 포커스 및 커서 끝으로
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(content.length, content.length);
    }
  }, []);

  const isDirty = content !== existingContent;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(content);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 mx-1 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-slate-50 shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-1.5">
          <PenLine className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-700">
            {studentName} 메모
          </span>
          {memoDate && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-indigo-500 bg-indigo-100 rounded px-1.5 py-0.5">
              <Calendar className="h-2.5 w-2.5" />
              {format(memoDate, 'M월 d일 (E)', { locale: ko })}
            </span>
          )}
        </div>
        {updatedAt && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock className="h-3 w-3" />
            <span>{format(new Date(updatedAt), 'M/d HH:mm', { locale: ko })}</span>
          </div>
        )}
      </div>

      {/* 텍스트 영역 */}
      <div className="px-3 pb-2">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="학생에 대한 메모를 입력하세요..."
          className="min-h-[80px] max-h-[160px] text-sm resize-none border-indigo-100 focus:border-indigo-300 bg-white/80 rounded-lg placeholder:text-slate-300"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (isDirty) handleSave();
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-slate-300">Ctrl+Enter로 저장</span>
          <Button
            size="sm"
            disabled={!isDirty || saving}
            onClick={handleSave}
            className="h-7 px-3 text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40"
          >
            {saving ? (
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                저장 중
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                저장
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const SectionStudentsDialog: React.FC<SectionStudentsDialogProps> = ({
  open,
  onOpenChange,
  subjectName,
  teacherName,
  dayOfWeek,
  period,
  date,
}) => {
  const { toast } = useToast();
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  const { data: students = [], isLoading: studentsLoading } = useSectionStudents({
    teacherName,
    dayOfWeek,
    period,
    enabled: open,
  });

  const memoDateStr = date ? format(date, 'yyyy-MM-dd') : null;

  // 메모의 year 는 달력연도가 아니라 학년도다. 1~2월은 달력연도가 넘어가도 학년도는
  // 그대로이므로 new Date().getFullYear() 를 쓰면 class_student_memos 의 유니크 키
  // (student_code, year, subject, created_by, day_of_week, period, memo_date)가 갈라진다.
  const { term } = useTimetableTerm();
  const memoYear = term?.year ?? new Date().getFullYear();

  const { data: memoMap = {}, upsertMemo } = useClassStudentMemos({
    subject: subjectName,
    teacherName,
    year: memoYear,
    dayOfWeek,
    period,
    memoDate: memoDateStr,
    enabled: open,
  });

  // 다이얼로그 닫힐 때 선택 초기화
  useEffect(() => {
    if (!open) setExpandedCodes(new Set());
  }, [open]);

  const periodLabel = dayOfWeek && period
    ? `${WEEKDAY_LABELS[dayOfWeek]}요일 ${period}교시`
    : '';

  const handleCardClick = (studentCode: string | null) => {
    if (!studentCode) return;
    setExpandedCodes(prev => {
      const next = new Set(prev);
      next.has(studentCode) ? next.delete(studentCode) : next.add(studentCode);
      return next;
    });
  };

  const handleSaveMemo = async (student: typeof students[0], content: string) => {
    if (!student.student_code) return;
    if (!memoDateStr || !dayOfWeek || !period) {
      toast({ title: '저장 불가', description: '날짜·요일·교시 정보가 필요합니다.', variant: 'destructive' });
      return;
    }
    try {
      await upsertMemo.mutateAsync({
        student_code: student.student_code,
        student_name: student.student_name,
        year: memoYear,
        subject: subjectName,
        teacher_name: teacherName,
        grade: student.grade,
        class_num: student.class_num,
        day_of_week: dayOfWeek,
        period: period,
        memo_date: memoDateStr,
        content,
      });
      toast({ title: '메모 저장됨', description: `${student.student_name} 메모가 저장되었습니다.` });
    } catch {
      toast({ title: '저장 실패', description: '메모 저장 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Users className="h-5 w-5 text-brand-500" />
            <span>{subjectName}</span>
            {periodLabel && (
              <Badge variant="secondary" className="ml-1 text-xs font-medium bg-brand-50 text-brand-700 border-brand-100">
                {periodLabel}
              </Badge>
            )}
          </DialogTitle>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {teacherName && (
              <span className="text-xs text-slate-500">담당: <span className="font-medium text-slate-700">{teacherName}</span></span>
            )}
            {!studentsLoading && (
              <span className="text-xs text-slate-500">
                총 <span className="font-semibold text-slate-700">{students.length}</span>명
              </span>
            )}
            <span className="text-xs text-slate-400">학생 카드를 클릭하면 메모 작성</span>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 space-y-2">
          {studentsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100">
                  <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="h-10 w-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium">학생 정보가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {students.map((student) => {
                const code = student.student_code ?? '';
                const isExpanded = expandedCodes.has(code);
                const existingMemo = code ? memoMap[code] : undefined;
                const hasMemo = existingMemo && existingMemo.content.trim().length > 0;
                const initials = student.student_name ? student.student_name.slice(0, 1) : '?';
                const avatarColor = getAvatarColor(student.number);

                return (
                  <div key={student.resource_id} className="col-span-1">
                    {/* 학생 카드 */}
                    <div
                      onClick={() => handleCardClick(code)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                        isExpanded
                          ? 'border-indigo-200 bg-indigo-50/60 shadow-sm'
                          : 'border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        {student.picture && (
                          <AvatarImage src={student.picture} alt={student.student_name ?? ''} className="object-cover" />
                        )}
                        <AvatarFallback className={`text-sm font-bold ${avatarColor}`}>
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-slate-800 text-sm truncate">
                            {student.student_name ?? '이름 없음'}
                          </span>
                          {hasMemo && (
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {student.grade && student.class_num ? `${student.grade}-${student.class_num}` : ''}
                          {student.number != null ? ` ${student.number}번` : ''}
                        </div>
                        {student.student_code && (
                          <div className="text-[10px] text-slate-300 mt-0.5 truncate font-mono">
                            {student.student_code}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 서랍형 메모 패널 */}
                    <div
                      className="overflow-hidden transition-all duration-300 ease-in-out"
                      style={{ maxHeight: isExpanded ? '320px' : '0px' }}
                    >
                      {isExpanded && (
                        <MemoDrawer
                          studentCode={code}
                          studentName={student.student_name}
                          existingContent={existingMemo?.content ?? ''}
                          subject={subjectName}
                          teacherName={teacherName}
                          grade={student.grade}
                          classNum={student.class_num}
                          dayOfWeek={dayOfWeek}
                          period={period}
                          memoDate={existingMemo?.memo_date ? new Date(existingMemo.memo_date) : date}
                          updatedAt={existingMemo?.updated_at}
                          onSave={(content) => handleSaveMemo(student, content)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
