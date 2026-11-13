// ========================================
// 일정 설문 목록 (허브)
//
// 두 묶음으로 나눈다 — 내가 답해야 할 설문 / 내가 만든 설문.
// 목록에 나오는 설문은 전부 RLS 가 이미 걸러 준 것(대상자·주최자·admin)이다.
// ========================================

import { useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  scheduleComposeDialogClass,
  ScheduleComposeHeader,
} from '@/components/schedule/ScheduleComposeLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useScheduleSurveys, useMySurveyResponses } from '../hooks/useScheduleSurveys';
import {
  canManageSurvey,
  canRespondToSurvey,
  daysUntilDue,
  isSurveyTarget,
} from '../utils/surveyAggregate';
import type { ScheduleSurvey } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onRespond: (survey: ScheduleSurvey) => void;
  onOpenResult: (survey: ScheduleSurvey) => void;
  /** 설문을 만들 수 있는가 (교사·직원·admin) */
  canCreate: boolean;
}

function SurveyCard({
  survey,
  responded,
  canRespond,
  canManage,
  onRespond,
  onOpenResult,
}: {
  survey: ScheduleSurvey;
  responded: boolean;
  canRespond: boolean;
  canManage: boolean;
  onRespond: () => void;
  onOpenResult: () => void;
}) {
  const dueIn = daysUntilDue(survey.due_date);
  const closed = survey.status === 'closed';

  return (
    <li className="relative overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm">
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          closed
            ? 'bg-slate-300'
            : responded
              ? 'bg-emerald-500'
              : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400'
        )}
      />
      <div className="space-y-2 p-3.5 pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={survey.title}>
            {survey.title}
          </h4>
          {closed && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              마감
            </Badge>
          )}
          {!closed && responded && (
            <Badge className="shrink-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              응답함
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            대상 {survey.target_resource_ids.length}명
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            후보 {survey.candidate_dates.length}일
            {survey.allow_custom_dates && ' · 자유 제안 가능'}
          </span>
          {survey.due_date && (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                dueIn !== null && dueIn < 0
                  ? 'text-rose-600'
                  : dueIn !== null && dueIn <= 2
                    ? 'text-amber-600'
                    : ''
              )}
            >
              <Clock className="h-3 w-3" />
              마감 {survey.due_date}
              {dueIn !== null && (dueIn < 0 ? ' (지남)' : dueIn === 0 ? ' (오늘)' : ` (D-${dueIn})`)}
            </span>
          )}
          {survey.owner_name && <span>요청 {survey.owner_name}</span>}
        </div>

        <div className="flex flex-wrap justify-end gap-1.5 pt-0.5">
          {canRespond && (
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onRespond}>
              {responded ? '응답 수정' : '응답하기'}
            </Button>
          )}
          {canManage && (
            <Button type="button" size="sm" className="h-8 text-xs" onClick={onOpenResult}>
              결과 보기
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function ScheduleSurveyHubDialog({
  open,
  onOpenChange,
  onCreate,
  onRespond,
  onOpenResult,
  canCreate,
}: Props) {
  const { profile, isAdmin, user } = useAuth();
  const { data: myResourceId } = useCurrentResourceId();
  const { data: surveys = [], isLoading } = useScheduleSurveys({ enabled: open });
  const { data: myResponses = [] } = useMySurveyResponses(open ? myResourceId : null);

  const respondedIds = useMemo(
    () => new Set(myResponses.map((response) => response.survey_id)),
    [myResponses]
  );

  const { toAnswer, mine } = useMemo(() => {
    const toAnswer: ScheduleSurvey[] = [];
    const mine: ScheduleSurvey[] = [];
    for (const survey of surveys) {
      if (canManageSurvey(survey, user?.id, isAdmin)) mine.push(survey);
      if (isSurveyTarget(survey, myResourceId)) toAnswer.push(survey);
    }
    // 아직 답하지 않은 것이 위로
    toAnswer.sort((a, b) => {
      const aDone = respondedIds.has(a.id) ? 1 : 0;
      const bDone = respondedIds.has(b.id) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    });
    return { toAnswer, mine };
  }, [surveys, user?.id, isAdmin, myResourceId, respondedIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={scheduleComposeDialogClass}>
        <ScheduleComposeHeader
          title="일정 설문"
          label={profile?.name ?? ''}
          description="언제 무엇을 하면 좋을지 물어보고, 모인 답으로 일정을 만듭니다."
        />

        <div className="schedule-compose-scroll schedule-compose-fields space-y-5">
          {canCreate && (
            <Button
              type="button"
              onClick={onCreate}
              className="w-full justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />새 일정 설문 만들기
            </Button>
          )}

          {isLoading ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">
              설문을 불러오는 중…
            </p>
          ) : surveys.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
                <ClipboardList className="h-7 w-7 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-slate-700">아직 일정 설문이 없습니다</p>
              <p className="mt-1 text-xs text-slate-500">
                {canCreate
                  ? '설문을 만들어 동료들에게 가능한 날짜를 물어보세요.'
                  : '나에게 온 설문이 생기면 여기에 표시됩니다.'}
              </p>
            </div>
          ) : (
            <>
              {toAnswer.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500">
                    나에게 온 설문 ({toAnswer.filter((s) => !respondedIds.has(s.id)).length}건 미응답)
                  </h3>
                  <ul className="space-y-2">
                    {toAnswer.map((survey) => (
                      <SurveyCard
                        key={survey.id}
                        survey={survey}
                        responded={respondedIds.has(survey.id)}
                        canRespond={canRespondToSurvey(survey, myResourceId)}
                        canManage={canManageSurvey(survey, user?.id, isAdmin)}
                        onRespond={() => onRespond(survey)}
                        onOpenResult={() => onOpenResult(survey)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {mine.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500">내가 만든 설문</h3>
                  <ul className="space-y-2">
                    {mine.map((survey) => (
                      <SurveyCard
                        key={survey.id}
                        survey={survey}
                        responded={respondedIds.has(survey.id)}
                        canRespond={canRespondToSurvey(survey, myResourceId)}
                        canManage
                        onRespond={() => onRespond(survey)}
                        onOpenResult={() => onOpenResult(survey)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <div className="schedule-compose-footer">
            <Button type="button" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
