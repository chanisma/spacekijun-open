// ========================================
// 일정 설문 오케스트레이터
//
// Schedule 페이지가 이 하나만 마운트하면 목록·생성·응답·결과·일정 만들기가 모두 붙는다.
//
// ⚠ '일정 만들기'는 결과 모달 **안에** 중첩하지 않는다 — 일정 추가 모달은 전체 폼이라
//   중첩하면 스크롤 두 겹에 푸터가 두 개가 된다. 결과 모달을 잠깐 닫았다가
//   일정 모달이 닫히면 되돌린다(task-spec-submission 의 호스트와 같은 방식).
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { ScheduleCreateDialog } from '@/components/schedule/ScheduleCreateDialog';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useScheduleSurveys } from '../hooks/useScheduleSurveys';
import { canManageSurvey, isSurveyTarget } from '../utils/surveyAggregate';
import { ScheduleSurveyHubDialog } from './ScheduleSurveyHubDialog';
import { ScheduleSurveyCreateDialog } from './ScheduleSurveyCreateDialog';
import { ScheduleSurveyRespondDialog } from './ScheduleSurveyRespondDialog';
import {
  ScheduleSurveyResultDialog,
  type CreateFromSurveyRequest,
} from './ScheduleSurveyResultDialog';
import type { ScheduleSurvey } from '../types';

interface Props {
  /** 목록(허브) 모달 열림 상태 — 헤더 버튼이 제어한다 */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 설문을 만들 수 있는가 (교사·직원·admin) */
  canCreate: boolean;
  /** 공지·알림 딥링크로 들어온 설문 id (`/schedule?survey=…`) */
  deepLinkSurveyId?: string | null;
  /** 딥링크를 처리했으니 URL 에서 지워도 된다 */
  onDeepLinkConsumed?: () => void;
  /** Schedule 페이지의 일정 생성 핸들러를 그대로 받는다 */
  onCreateEvent: (eventData: Parameters<
    React.ComponentProps<typeof ScheduleCreateDialog>['onCreateEvent']
  >[0]) => Promise<string | boolean>;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function ScheduleSurveyHost({
  open,
  onOpenChange,
  canCreate,
  deepLinkSurveyId,
  onDeepLinkConsumed,
  onCreateEvent,
}: Props) {
  const { isAdmin, user } = useAuth();
  const { data: myResourceId } = useCurrentResourceId();

  // 딥링크가 있으면 허브가 닫혀 있어도 설문을 찾아야 하므로 목록을 켠다
  const surveysEnabled = open || !!deepLinkSurveyId;
  const { data: surveys = [], isLoading } = useScheduleSurveys({ enabled: surveysEnabled });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleSurvey | null>(null);
  const [respondSurveyId, setRespondSurveyId] = useState<string | null>(null);
  const [resultSurveyId, setResultSurveyId] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<CreateFromSurveyRequest | null>(null);

  // 목록이 갱신돼도 열려 있는 모달이 최신 설문을 보도록 id로 다시 찾는다
  const respondSurvey = useMemo(
    () => surveys.find((survey) => survey.id === respondSurveyId) ?? null,
    [surveys, respondSurveyId]
  );
  const resultSurvey = useMemo(
    () => surveys.find((survey) => survey.id === resultSurveyId) ?? null,
    [surveys, resultSurveyId]
  );

  // 딥링크 — 관리할 수 있으면 결과, 아니면 응답 화면
  useEffect(() => {
    if (!deepLinkSurveyId || isLoading) return;
    const survey = surveys.find((item) => item.id === deepLinkSurveyId);
    if (!survey) {
      toast.error('설문을 찾을 수 없습니다. 삭제되었거나 대상자가 아닐 수 있습니다.');
    } else if (canManageSurvey(survey, user?.id, isAdmin)) {
      setResultSurveyId(survey.id);
    } else if (isSurveyTarget(survey, myResourceId)) {
      setRespondSurveyId(survey.id);
    } else {
      toast.error('이 설문의 대상자가 아닙니다.');
    }
    onDeepLinkConsumed?.();
  }, [deepLinkSurveyId, isLoading, surveys, user?.id, isAdmin, myResourceId, onDeepLinkConsumed]);

  const handleCreateFromSurvey = (request: CreateFromSurveyRequest) => {
    setPendingCreate(request);
    // 결과 모달은 잠시 닫고, 일정 모달이 닫히면 되돌린다
    setResultSurveyId(null);
  };

  const closeScheduleComposer = () => {
    const surveyId = pendingCreate?.surveyId ?? null;
    setPendingCreate(null);
    if (surveyId) setResultSurveyId(surveyId);
  };

  return (
    <>
      <ScheduleSurveyHubDialog
        open={open}
        onOpenChange={onOpenChange}
        canCreate={canCreate}
        onCreate={() => {
          setEditing(null);
          setEditorOpen(true);
        }}
        onRespond={(survey) => setRespondSurveyId(survey.id)}
        onOpenResult={(survey) => setResultSurveyId(survey.id)}
      />

      {canCreate && (
        <ScheduleSurveyCreateDialog
          open={editorOpen}
          onOpenChange={(next) => {
            setEditorOpen(next);
            if (!next) setEditing(null);
          }}
          editing={editing}
        />
      )}

      {respondSurvey && (
        <ScheduleSurveyRespondDialog
          open
          onOpenChange={(next) => {
            if (!next) setRespondSurveyId(null);
          }}
          survey={respondSurvey}
        />
      )}

      {resultSurvey && (
        <ScheduleSurveyResultDialog
          open
          onOpenChange={(next) => {
            if (!next) setResultSurveyId(null);
          }}
          survey={resultSurvey}
          onEdit={(survey) => {
            setEditing(survey);
            setEditorOpen(true);
          }}
          onCreateSchedule={handleCreateFromSurvey}
        />
      )}

      {/* 설문 결과 → 일정 만들기 (형제로 띄운다) */}
      {pendingCreate && (
        <ScheduleCreateDialog
          open
          onOpenChange={(next) => {
            if (!next) closeScheduleComposer();
          }}
          onCreateEvent={onCreateEvent}
          selectedDate={parseDateKey(pendingCreate.date)}
          initialValues={{
            // 담당자 의미가 분명한 '업무'로 시작한다(모달에서 바꿀 수 있다).
            // 학사일정(schedule)은 담당자를 JSONB 로 정규화하지 않아 명단이 이름으로 남지 않는다.
            kind: 'duty',
            title: pendingCreate.title,
            description: pendingCreate.description,
            assignee: pendingCreate.assignee,
            surveyId: pendingCreate.surveyId,
          }}
        />
      )}
    </>
  );
}
