// ========================================
// 일정 설문 만들기 / 수정
//
// 디자인은 '새 일정 만들기'(ScheduleCreateDialog)와 같은 어휘를 쓴다 —
// scheduleComposeDialogClass / ScheduleComposeHeader / schedule-compose-* 클래스.
// 같은 메뉴 안에서 모달마다 폭·여백·푸터가 달라지면 다른 앱처럼 보인다.
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  scheduleComposeDialogClass,
  ScheduleComposeHeader,
} from '@/components/schedule/ScheduleComposeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, Megaphone, Users, X, AlertTriangle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toDateKey } from '@/lib/scheduleUtils';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useDepartments } from '@/hooks/useDepartments';
import { useCreateNotice } from '@/features/notice-board/hooks/useNotices';
import { makeNoticeLinkToken } from '@/features/notice-board/utils/noticeLinks';
import {
  useCreateScheduleSurvey,
  useUpdateScheduleSurvey,
  useSurveyPeople,
} from '../hooks/useScheduleSurveys';
import { notifySurveyTargets } from '../services/scheduleSurveyNotify';
import type { ScheduleSurvey } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 수정 대상 — null 이면 새 설문 */
  editing?: ScheduleSurvey | null;
  /** 후보 날짜 초깃값 (달력에서 날짜를 고른 뒤 열었을 때) */
  initialDate?: Date;
}

/** 종료일 기본값: 시작일 + 14일 */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return toDateKey(date);
}

export function ScheduleSurveyCreateDialog({ open, onOpenChange, editing, initialDate }: Props) {
  const { profile } = useAuth();
  const { data: myResourceId } = useCurrentResourceId();
  const { departments } = useDepartments({ source: 'database', category: 'school' });

  const createSurvey = useCreateScheduleSurvey();
  const updateSurvey = useUpdateScheduleSurvey();
  const createNotice = useCreateNotice();

  const isEditing = !!editing;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [candidateDates, setCandidateDates] = useState<Date[]>([]);
  const [allowCustomDates, setAllowCustomDates] = useState(true);
  const [targets, setTargets] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string>('');
  const [calendarMonth, setCalendarMonth] = useState<Date>(initialDate ?? new Date());

  // 공지 연동 (새 설문일 때만 — 수정 중에 공지를 또 만들면 중복 공지가 쌓인다)
  const [announce, setAnnounce] = useState(false);
  const [noticeDepartment, setNoticeDepartment] = useState('');
  const [noticeStart, setNoticeStart] = useState(toDateKey(new Date()));
  const [noticeEnd, setNoticeEnd] = useState(addDays(toDateKey(new Date()), 14));

  const [saving, setSaving] = useState(false);

  // 열릴 때마다 초기화 (수정이면 기존 값)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? '');
      setCandidateDates(
        editing.candidate_dates.map((key) => {
          const [y, m, d] = key.split('-').map(Number);
          return new Date(y, m - 1, d);
        })
      );
      setAllowCustomDates(editing.allow_custom_dates);
      setTargets(editing.target_resource_ids);
      setDueDate(editing.due_date ?? '');
      setCalendarMonth(
        editing.candidate_dates.length > 0
          ? (() => {
              const [y, m] = editing.candidate_dates[0].split('-').map(Number);
              return new Date(y, m - 1, 1);
            })()
          : new Date()
      );
    } else {
      setTitle('');
      setDescription('');
      setCandidateDates(initialDate ? [initialDate] : []);
      setAllowCustomDates(true);
      setTargets([]);
      setDueDate('');
      setCalendarMonth(initialDate ?? new Date());
    }
    const today = toDateKey(new Date());
    setAnnounce(false);
    setNoticeDepartment('');
    setNoticeStart(today);
    setNoticeEnd(addDays(today, 14));
  }, [open, editing, initialDate]);

  const dateKeys = useMemo(
    () => [...new Set(candidateDates.map(toDateKey))].sort(),
    [candidateDates]
  );

  // 대상자에 학생이 섞였는지 — 학생은 공지사항을 아예 볼 수 없다
  const { data: targetPeople = {} } = useSurveyPeople(targets);
  const studentTargets = useMemo(
    () => Object.values(targetPeople).filter((person) => person.type === 'student').length,
    [targetPeople]
  );

  const canSubmit =
    title.trim().length > 0 &&
    targets.length > 0 &&
    (allowCustomDates || dateKeys.length > 0) &&
    (!announce || noticeDepartment.length > 0);

  const removeDate = (key: string) => {
    setCandidateDates((prev) => prev.filter((d) => toDateKey(d) !== key));
  };

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        target_resource_ids: targets,
        candidate_dates: dateKeys,
        allow_custom_dates: allowCustomDates,
        due_date: dueDate || null,
      };

      if (isEditing && editing) {
        await updateSurvey.mutateAsync({ id: editing.id, input });
        toast.success('설문을 수정했습니다.');
        onOpenChange(false);
        return;
      }

      const survey = await createSurvey.mutateAsync({
        input,
        ownerResourceId: myResourceId ?? null,
        ownerName: profile?.name ?? null,
      });

      // 알림 — 학생에게는 이것이 유일한 도달 경로다
      const notified = await notifySurveyTargets({
        type: 'schedule_survey_requested',
        surveyId: survey.id,
        surveyTitle: survey.title,
        resourceIds: targets,
        title: '일정 설문 요청',
        message: `${profile?.name ?? '동료'}님이 "${survey.title}" 설문에 응답을 요청했습니다.`,
      });

      // 공지 연동
      let noticeFailed = false;
      if (announce) {
        try {
          const token = makeNoticeLinkToken('survey', survey.id, survey.title);
          const lines = [
            description.trim(),
            '',
            `아래 설문에 응답해 주세요. ${token}`,
            dueDate ? `- 응답 마감: ${dueDate}` : '',
          ].filter(Boolean);
          await createNotice.mutateAsync({
            input: {
              department: noticeDepartment,
              title: survey.title,
              content: lines.join('\n'),
              start_date: noticeStart,
              end_date: noticeEnd,
              // 공지도 설문 대상자에게만 보이게 한다
              target_resource_ids: targets,
              survey_id: survey.id,
            },
            authorName: profile?.name ?? null,
          });
        } catch (error) {
          console.error('설문 공지 생성 실패:', error);
          noticeFailed = true;
        }
      }

      // 결과를 사실대로 알린다 — 알림·공지는 조용히 실패하면 아무도 모른다
      if (!notified.ok) {
        toast.error(`설문은 만들어졌지만 알림을 보내지 못했습니다. 대상자에게 직접 알려 주세요.`);
      } else if (noticeFailed) {
        toast.error(`설문을 만들고 ${notified.sent}명에게 알렸지만, 공지 등록에 실패했습니다.`);
      } else {
        toast.success(
          `설문을 만들고 ${notified.sent}명에게 알렸습니다.${announce ? ' 공지도 등록했습니다.' : ''}`
        );
      }
      onOpenChange(false);
    } catch (error) {
      console.error('설문 저장 실패:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className={scheduleComposeDialogClass}>
        <ScheduleComposeHeader
          title={isEditing ? '일정 설문 수정' : '일정 설문 만들기'}
          label="설문"
          description="언제 무엇을 하면 좋을지 물어보고, 모인 답으로 일정을 만듭니다."
        />

        <div className="schedule-compose-scroll schedule-compose-fields space-y-5">
          {/* 기본 정보 */}
          <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
            <div>
              <Label htmlFor="survey-title">설문 제목</Label>
              <Input
                id="survey-title"
                className="h-12 bg-white text-base"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2학기 학년 협의회 날짜 정하기"
              />
            </div>
            <div>
              <Label htmlFor="survey-desc">안내 문구</Label>
              <Textarea
                id="survey-desc"
                className="bg-white"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="응답자에게 보여줄 설명 (선택)"
              />
            </div>
            <div>
              <Label htmlFor="survey-due">응답 마감일</Label>
              <Input
                id="survey-due"
                type="date"
                className="bg-white"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                안내용입니다. 마감일이 지나도 설문을 직접 마감하기 전까지는 응답할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 후보 날짜 */}
          <section className="schedule-compose-section space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-slate-800">후보 날짜</h3>
              <span className="text-[11px] text-slate-400">여러 날짜를 고를 수 있습니다</span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="rounded-xl border border-slate-200 bg-white">
                <Calendar
                  mode="multiple"
                  selected={candidateDates}
                  onSelect={(dates) => setCandidateDates(dates ?? [])}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  locale={ko}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-medium text-slate-500">
                  선택한 날짜 {dateKeys.length}개
                </p>
                {dateKeys.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">
                    달력에서 날짜를 눌러 후보를 고르세요.
                    {allowCustomDates && ' 고르지 않으면 응답자가 직접 날짜를 제안합니다.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {dateKeys.map((key) => {
                      const [y, m, d] = key.split('-').map(Number);
                      return (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
                        >
                          {format(new Date(y, m - 1, d), 'M월 d일 (E)', { locale: ko })}
                          <button
                            type="button"
                            aria-label={`${key} 제거`}
                            onClick={() => removeDate(key)}
                            className="rounded-full p-0.5 hover:bg-emerald-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
                  <Switch
                    id="allow-custom"
                    checked={allowCustomDates}
                    onCheckedChange={setAllowCustomDates}
                  />
                  <div className="min-w-0">
                    <Label htmlFor="allow-custom" className="text-sm font-normal">
                      응답자가 다른 날짜도 제안할 수 있음
                    </Label>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                      끄면 위에서 고른 후보 날짜에 대해서만 답할 수 있습니다.
                    </p>
                  </div>
                </div>

                {!allowCustomDates && dateKeys.length === 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-rose-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    후보 날짜가 없고 자유 제안도 꺼져 있으면 아무도 응답할 수 없습니다.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* 대상자 */}
          <section className="schedule-compose-section space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-800">설문 대상</h3>
              <span className="text-[11px] text-slate-400">
                선택한 사람만 설문을 보고 응답할 수 있습니다
              </span>
            </div>
            <SearchableMultiSelect
              filterByTeacher
              filterByStudent
              enableTagSearch
              enableClassSearch
              selectedValues={targets}
              onSelectionChange={setTargets}
              placeholder="이름·부서 태그·학급으로 검색하세요"
              searchPlaceholder="예: 김교사, 1학년 담임, 2학년 3반"
              emptyText="검색 결과가 없습니다"
              maxSelectedDisplay={3}
            />
            {targets.length === 0 && (
              <p className="text-xs text-rose-600">대상자를 한 명 이상 선택해야 합니다.</p>
            )}
            {studentTargets > 0 && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                학생 {studentTargets}명이 포함되어 있습니다. <strong>공지사항은 학생에게 보이지
                않으므로</strong> 학생에게는 알림으로만 전달됩니다.
              </p>
            )}
          </section>

          {/* 공지 연동 — 새 설문일 때만 */}
          {!isEditing && (
            <section className="schedule-compose-section space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-slate-800">공지사항으로도 알리기</h3>
              </div>
              <div className="flex items-start gap-2">
                <Switch id="announce" checked={announce} onCheckedChange={setAnnounce} />
                <Label htmlFor="announce" className="text-sm font-normal">
                  공지사항에 이 설문 링크를 올립니다 (대상자에게만 보임)
                </Label>
              </div>

              {announce && (
                <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                  <div>
                    <Label htmlFor="notice-dept">부서</Label>
                    <Select value={noticeDepartment} onValueChange={setNoticeDepartment}>
                      <SelectTrigger id="notice-dept" className="bg-white">
                        <SelectValue placeholder="공지를 올릴 부서를 고르세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="notice-start">게시 시작</Label>
                      <Input
                        id="notice-start"
                        type="date"
                        className="bg-white"
                        value={noticeStart}
                        onChange={(e) => setNoticeStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="notice-end">게시 종료</Label>
                      <Input
                        id="notice-end"
                        type="date"
                        className="bg-white"
                        value={noticeEnd}
                        onChange={(e) => setNoticeEnd(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          <div className="schedule-compose-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit || saving}>
              {saving ? '저장 중...' : isEditing ? '설문 수정' : '설문 만들기'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
