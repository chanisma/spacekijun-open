// ========================================
// 일정 설문 결과 — 수합 + 일정 만들기
//
// 주최자·admin 만 연다(RLS 가 응답 전체를 주는 것도 이 두 경우뿐).
// '이 날짜로 일정 만들기'는 여기서 직접 만들지 않고 호스트에 요청한다 —
// 일정 만들기 모달은 전체 폼이라 이 모달 안에 중첩하지 않고 형제로 띄운다
// (task-spec-submission 의 SpecSubmissionComposerDialog 와 같은 방식).
// ========================================

import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  scheduleComposeDialogClass,
  ScheduleComposeHeader,
} from '@/components/schedule/ScheduleComposeLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NamePreview } from '@/components/ui/name-list-overlay';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowUpDown,
  CalendarPlus,
  CheckCircle2,
  Lock,
  LockOpen,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  useSurveyResponses,
  useSurveyPeople,
  useSetSurveyStatus,
  useDeleteScheduleSurvey,
} from '../hooks/useScheduleSurveys';
import { aggregateSurvey, suggestTitleForDate, type SurveyDateOrder } from '../utils/surveyAggregate';
import type { ScheduleSurvey } from '../types';

export interface CreateFromSurveyRequest {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** 담당자 resource.id */
  assignee: string[];
  surveyId: string;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  survey: ScheduleSurvey;
  onEdit: (survey: ScheduleSurvey) => void;
  onCreateSchedule: (request: CreateFromSurveyRequest) => void;
}

function formatDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'M월 d일 (E)', { locale: ko });
}

export function ScheduleSurveyResultDialog({
  open,
  onOpenChange,
  survey,
  onEdit,
  onCreateSchedule,
}: Props) {
  const [order, setOrder] = useState<SurveyDateOrder>('availability');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assigneeMode, setAssigneeMode] = useState<'targets' | 'available'>('targets');

  const { data: responses = [], isLoading } = useSurveyResponses(open ? survey.id : null);
  const setStatus = useSetSurveyStatus();
  const deleteSurvey = useDeleteScheduleSurvey();

  const aggregate = useMemo(
    () => aggregateSurvey(survey, responses, order),
    [survey, responses, order]
  );

  const { data: people = {} } = useSurveyPeople(survey.target_resource_ids);
  const pendingNames = aggregate.pendingTargetIds.map(
    (id) => people[id]?.name || '(이름 확인 중)'
  );

  // 이름 → resource.id (그 날짜에 가능한 사람만 담당자로 넣을 때 필요)
  const nameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const response of responses) {
      const name = response.respondent_name?.trim();
      if (name) map.set(name, response.respondent_resource_id);
    }
    return map;
  }, [responses]);

  const handleCreate = (date: string, availableNames: string[]) => {
    const availableIds = availableNames
      .map((name) => nameToId.get(name))
      .filter((id): id is string => !!id);
    onCreateSchedule({
      date,
      title: suggestTitleForDate(aggregate.dates.find((d) => d.date === date)!) || survey.title,
      assignee: assigneeMode === 'available' ? availableIds : survey.target_resource_ids,
      surveyId: survey.id,
      description: survey.description ?? '',
    });
  };

  const progressPct =
    aggregate.targetCount > 0
      ? Math.round((aggregate.respondedCount / aggregate.targetCount) * 100)
      : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={scheduleComposeDialogClass}>
          <ScheduleComposeHeader
            title={survey.title}
            label={survey.status === 'closed' ? '마감됨' : '수합 중'}
            description="모인 답을 보고, 원하는 날짜로 바로 일정을 만드세요."
          />

          <div className="schedule-compose-scroll schedule-compose-fields space-y-5">
            {/* 진행 현황 */}
            <section className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">응답 현황</h3>
                <span className="text-sm font-semibold tabular-nums text-slate-700">
                  {aggregate.respondedCount} / {aggregate.targetCount}명
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {pendingNames.length > 0 ? (
                <div className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-xs text-slate-500">
                  <span className="shrink-0 font-medium">아직 응답하지 않음:</span>
                  <NamePreview names={pendingNames} />
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  대상자 전원이 응답했습니다.
                </p>
              )}
            </section>

            {/* 날짜별 결과 */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  날짜별 결과
                  <span className="ml-2 text-[11px] font-normal text-slate-400">
                    {order === 'availability' ? '가능 인원 많은 순' : '날짜순'}
                  </span>
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() =>
                    setOrder((prev) => (prev === 'availability' ? 'date' : 'availability'))
                  }
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {order === 'availability' ? '날짜순으로' : '가능 인원순으로'}
                </Button>
              </div>

              {/* 담당자 기준 — 만들 일정에 누구를 넣을지 */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <Users className="h-3.5 w-3.5" />
                  일정 담당자
                </span>
                <div className="flex items-center gap-0.5 rounded-lg border border-slate-100 bg-slate-100/60 p-1">
                  {(
                    [
                      { value: 'targets' as const, label: `대상자 전원 (${aggregate.targetCount})` },
                      { value: 'available' as const, label: '그날 가능한 사람' },
                    ]
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAssigneeMode(option.value)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        assigneeMode === option.value
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">
                  응답을 불러오는 중…
                </p>
              ) : aggregate.dates.length === 0 ? (
                <p className="rounded-xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-12 text-center text-sm text-slate-500">
                  아직 후보 날짜도 응답도 없습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {aggregate.dates.map((tally) => (
                    <li
                      key={tally.date}
                      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm"
                    >
                      <div
                        className={cn(
                          'absolute inset-x-0 top-0 h-1',
                          tally.availableCount === 0
                            ? 'bg-slate-200'
                            : tally.availableCount === aggregate.targetCount
                              ? 'bg-emerald-500'
                              : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400'
                        )}
                      />
                      <div className="space-y-2.5 p-3.5 pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {formatDate(tally.date)}
                            </span>
                            {!tally.isCandidate && (
                              <Badge
                                variant="secondary"
                                className="bg-violet-100 text-[10px] text-violet-700 hover:bg-violet-100"
                              >
                                제안된 날짜
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-emerald-700">
                            가능 {tally.availableCount}명
                          </span>
                        </div>

                        {tally.availableNames.length > 0 && (
                          <div className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-xs text-slate-600">
                            <span className="shrink-0 text-emerald-700">가능</span>
                            <NamePreview names={tally.availableNames} />
                          </div>
                        )}
                        {tally.unavailableNames.length > 0 && (
                          <div className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-xs text-slate-500">
                            <span className="shrink-0 text-rose-600">불가</span>
                            <NamePreview names={tally.unavailableNames} />
                          </div>
                        )}

                        {tally.activities.length > 0 && (
                          <div className="space-y-1 rounded-xl bg-slate-50 p-2.5">
                            <p className="text-[11px] font-medium text-slate-500">
                              이날 하면 좋을 일
                            </p>
                            <ul className="space-y-0.5">
                              {tally.activities.map((entry, index) => (
                                <li
                                  key={`${entry.name}-${index}`}
                                  className="flex min-w-0 gap-1.5 text-xs text-slate-700"
                                >
                                  <span className="shrink-0 text-slate-400">{entry.name}</span>
                                  <span className="min-w-0 break-words">{entry.activity}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => handleCreate(tally.date, tally.availableNames)}
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            이 날짜로 일정 만들기
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 응답에 붙은 말 */}
            {responses.some((response) => response.comment?.trim()) && (
              <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-800">남긴 말</h3>
                <ul className="space-y-1.5">
                  {responses
                    .filter((response) => response.comment?.trim())
                    .map((response) => (
                      <li key={response.id} className="flex min-w-0 gap-2 text-xs text-slate-700">
                        <span className="shrink-0 font-medium text-slate-500">
                          {response.respondent_name ?? '(이름 없음)'}
                        </span>
                        <span className="min-w-0 break-words">{response.comment}</span>
                      </li>
                    ))}
                </ul>
              </section>
            )}

            <div className="schedule-compose-footer">
              <Button
                type="button"
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                삭제
              </Button>
              <Button type="button" variant="ghost" onClick={() => onEdit(survey)}>
                <Pencil className="mr-1.5 h-4 w-4" />
                수정
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({
                    id: survey.id,
                    status: survey.status === 'open' ? 'closed' : 'open',
                  })
                }
              >
                {survey.status === 'open' ? (
                  <>
                    <Lock className="mr-1.5 h-4 w-4" />
                    설문 마감
                  </>
                ) : (
                  <>
                    <LockOpen className="mr-1.5 h-4 w-4" />
                    다시 열기
                  </>
                )}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                닫기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>설문을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              «{survey.title}» 과 모인 응답 {responses.length}건이 함께 삭제되며 되돌릴 수 없습니다.
              이 설문으로 이미 만든 일정과 공지는 남습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async (event) => {
                // 비동기 작업이므로 기본 즉시 닫기를 막는다 — 실패하면 모달이 남아야 한다
                event.preventDefault();
                try {
                  await deleteSurvey.mutateAsync(survey.id);
                  setConfirmDelete(false);
                  onOpenChange(false);
                } catch {
                  // mutation onError 토스트가 이미 표시됨
                }
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
