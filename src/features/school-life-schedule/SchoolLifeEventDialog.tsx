import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { BookOpen, Clock3, LockKeyhole, Users, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { scheduleComposeDialogClass, ScheduleComposeHeader, ScheduleTypeOption } from '@/components/schedule/ScheduleComposeLayout';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useAssignmentCourses } from './useAssignmentCourses';
import { assignmentCourseLabel, assignmentCourseOptions, validateSchoolLifeDraft, type SchoolLifeContext, type SchoolLifeDraft, type SchoolLifeEvent } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  context: SchoolLifeContext | undefined;
  event?: SchoolLifeEvent | null;
  onSave: (draft: SchoolLifeDraft, id?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  embedded?: boolean;
  initialVisibility?: 'personal' | 'homeroom';
  isStudent?: boolean;
}

export function SchoolLifeEventDialog({ open, onOpenChange, selectedDate, context, event, onSave, onDelete, embedded = false, initialVisibility = 'personal', isStudent = false }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SchoolLifeEvent['visibility']>('personal');
  const [courseId, setCourseId] = useState('');
  const [classKey, setClassKey] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [dateOnly, setDateOnly] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editable = !!context?.can_create && (!event || event.created_by === context.user_id);
  const visibilityLabel = visibility === 'assignment' ? '과제일정' : visibility === 'personal' ? '개인일정' : isStudent ? '학생일정' : '학급일정';
  const courses = useAssignmentCourses(context, open && visibility === 'assignment' && editable);
  const courseOptions = assignmentCourseOptions(courses.data ?? []);
  if (event?.course_offering && !courseOptions.some((option) => option.value === event.course_offering_id)) {
    courseOptions.unshift({ value: event.course_offering.id, label: assignmentCourseLabel(event.course_offering), description: '저장된 수업' });
  }
  useEffect(() => {
    if (!open) return;
    const day = format(selectedDate, 'yyyy-MM-dd');
    setTitle(event?.title ?? '');
    setDescription(event?.description ?? '');
    setVisibility(event?.visibility ?? initialVisibility);
    setCourseId(event?.course_offering_id ?? '');
    const firstClass = context?.classes[0];
    setClassKey(event?.grade ? `${event.grade}-${event.class_num}` : firstClass ? `${firstClass.grade}-${firstClass.class_num}` : '');
    setStart(event ? format(new Date(event.starts_at), "yyyy-MM-dd'T'HH:mm") : `${day}T09:00`);
    setEnd(event ? format(new Date(event.ends_at), "yyyy-MM-dd'T'HH:mm") : `${day}T10:00`);
    setDateOnly(event?.date_only ?? false);
    setError('');
  }, [open, event, selectedDate, context, initialVisibility]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!context || !editable) return;
    if (visibility === 'assignment' && courseId !== event?.course_offering_id
      && !courses.data?.some((course) => course.id === courseId)) {
      setError('현재 학기의 과목·학급·담당 교사를 선택해 주세요.'); return;
    }
    const [grade, classNum] = classKey.split('-').map(Number);
    const startsAt = new Date(dateOnly ? `${start.slice(0, 10)}T00:00:00` : start);
    const endsAt = new Date(dateOnly ? `${end.slice(0, 10)}T23:59:59.999` : end);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) { setError('날짜와 시간을 입력해 주세요.'); return; }
    const draft: SchoolLifeDraft = {
      title, description, visibility, date_only: dateOnly,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      academic_year: event?.academic_year ?? context.academic_year,
      grade: visibility === 'homeroom' ? grade : null,
      class_num: visibility === 'homeroom' ? classNum : null,
      course_offering_id: visibility === 'assignment' ? courseId || null : null,
    };
    const message = validateSchoolLifeDraft(draft, context);
    if (message) { setError(message); return; }
    setBusy(true);
    try { await onSave(draft, event?.id); onOpenChange(false); }
    catch { setError('저장하지 못했습니다. 학급 정보와 권한을 확인한 뒤 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };

  const form = (
        <form onSubmit={submit} className={cn('schedule-compose-fields space-y-5', !embedded && 'schedule-compose-scroll')}>
          <fieldset disabled={!editable || busy} className="min-w-0 space-y-5">
            {!embedded && !event && <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-500">일정 유형</p>
              <div className={`grid gap-2 ${isStudent ? 'grid-cols-3' : 'grid-cols-2'}`} role="group" aria-label="일정 유형">
              {(['personal', 'homeroom', ...(isStudent ? ['assignment'] as const : [])] as const).map((kind) => (
                <ScheduleTypeOption key={kind} selected={visibility === kind}
                  label={kind === 'assignment' ? '과제일정' : kind === 'personal' ? '개인일정' : isStudent ? '학생일정' : '학급일정'}
                  icon={kind === 'assignment' ? <BookOpen /> : kind === 'personal' ? <LockKeyhole /> : <Users />}
                  tone={kind === 'assignment' ? 'amber' : kind === 'personal' ? 'indigo' : 'teal'}
                  disabled={kind === 'homeroom' && !context?.classes.length}
                  onClick={() => setVisibility(kind)} />
              ))}
              </div>
            </div>}
            <div className="space-y-1.5"><Label htmlFor="life-title">제목</Label><Input id="life-title" className="h-12 text-base" placeholder={visibility === 'assignment' ? '어떤 과제를 해야 하나요?' : '어떤 일정을 계획하고 있나요?'} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></div>
            {visibility === 'assignment' && <div className="schedule-compose-section space-y-2">
              <Label>과목 · 학급 · 담당 교사</Label>
              {courses.term && <p className="text-xs text-muted-foreground">{courses.term.year}학년도 {courses.term.semester}학기 · 내 수업을 먼저 표시합니다.</p>}
              <SearchableMultiSelect
                items={courseOptions}
                selectedValues={courseId ? [courseId] : []}
                onSelectionChange={(values) => setCourseId(values[0] ?? '')}
                singleSelect
                disabled={!editable || busy || courses.isLoading}
                placeholder={courses.isLoading ? '수업을 불러오는 중…' : '과목·학급·담당 교사 선택'}
                searchPlaceholder="과목명, 학급 또는 교사명 검색"
                emptyText="선택할 수 있는 수업이 없습니다."
              />
              {courses.isError && <p role="alert" className="text-xs text-red-600">수업 목록을 불러오지 못했습니다. <button type="button" className="underline" onClick={() => courses.refetch()}>다시 시도</button></p>}
              {!courses.isLoading && !courses.term && <p className="text-xs text-muted-foreground">현재 학기 설정이 필요합니다.</p>}
            </div>}
            {visibility === 'homeroom' && <div className="space-y-1.5"><Label htmlFor="life-class">대상 학급</Label>
              <select id="life-class" value={classKey} disabled={!!event || context?.classes.length === 1} onChange={(e) => setClassKey(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {context?.classes.map((c) => <option key={`${c.grade}-${c.class_num}`} value={`${c.grade}-${c.class_num}`}>{c.grade}학년 {c.class_num}반</option>)}
              </select>
            </div>}
            <section className="space-y-4 rounded-2xl bg-slate-50 p-4" aria-label="날짜와 시간">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Clock3 className="h-4 w-4 text-slate-400" />날짜와 시간</h3>
                <div className="flex items-center gap-2"><Label htmlFor="life-all-day" className="text-xs font-normal">하루 종일</Label><Switch id="life-all-day" checked={dateOnly} onCheckedChange={setDateOnly} disabled={!editable || busy} /></div>
              </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="life-start">시작</Label><Input id="life-start" type={dateOnly ? 'date' : 'datetime-local'} value={dateOnly ? start.slice(0, 10) : start} onChange={(e) => setStart(dateOnly ? `${e.target.value}T09:00` : e.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="life-end">종료</Label><Input id="life-end" type={dateOnly ? 'date' : 'datetime-local'} value={dateOnly ? end.slice(0, 10) : end} onChange={(e) => setEnd(dateOnly ? `${e.target.value}T10:00` : e.target.value)} required /></div>
            </div>
            </section>
            <div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor="life-description">설명 <span className="ml-1 text-xs font-normal text-slate-400">선택</span></Label><span className="text-[11px] tabular-nums text-slate-400">{description.length.toLocaleString()} / 4,000</span></div><Textarea id="life-description" className="min-h-24 resize-y" placeholder="준비물이나 기억할 내용을 남겨보세요." rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </fieldset>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span>{visibility === 'assignment' ? '선택한 수업의 수강생과 작성자에게 표시됩니다. 수정·삭제는 작성자만 할 수 있습니다.' : visibility === 'personal' ? '개인일정은 본인에게만 표시됩니다.' : `${isStudent ? '학생일정' : '학급일정'}은 해당 반 학생과 담임교사에게 표시됩니다. 수정·삭제는 작성자만 할 수 있습니다.`}</span></p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="schedule-compose-footer">
            {event && editable && <Button type="button" variant="ghost" className="mr-auto gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={busy} onClick={async () => {
              if (!window.confirm('이 일정을 삭제하시겠습니까?')) return;
              setBusy(true);
              try { await onDelete(event.id); onOpenChange(false); } catch { setError('일정을 삭제하지 못했습니다. 다시 시도해 주세요.'); } finally { setBusy(false); }
            }}><Trash2 className="h-3.5 w-3.5" />삭제</Button>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>닫기</Button>
            {editable && <Button type="submit" disabled={busy}>{busy ? '저장 중…' : event ? '변경사항 저장' : '일정 추가'}</Button>}
          </div>
        </form>
  );
  if (embedded) return form;
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
      <DialogContent className={scheduleComposeDialogClass}>
        <ScheduleComposeHeader title={event ? editable ? '일정 수정' : '일정 보기' : '새 일정 만들기'} label={visibilityLabel}
          description={event ? '일정의 내용과 공유 대상을 확인하세요.' : '다가오는 할 일과 약속을 한곳에 기록하세요.'} />
        {form}
      </DialogContent>
    </Dialog>
  );
}
