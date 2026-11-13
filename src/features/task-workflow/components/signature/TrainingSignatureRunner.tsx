/**
 * 작업 「연수 참석 서명 받기」 실행 화면 (2026-09-24).
 *
 * 전자서명과 **다른 시스템**이다 — 서명이 `training_signature` 에 행으로 쌓이고, 대상은 문서가
 * 아니라 **일정의 참석자 명단**(`meeting.meta.assignee`)이며, 받는 수단이 QR·출력이다.
 * 그래서 작업 유형을 나눴다(합치면 설정이 «둘 중 무엇인가»를 먼저 묻는 갈림길로 시작한다).
 *
 * 여기서 하는 일은 **어느 연수인지 가리키고 현황을 보여 주는 것**뿐이다. 서명을 받는 화면
 * (QR·직접 서명·출력)은 일정 상세가 이미 갖고 있으므로 그리로 보낸다 — 두 벌로 만들면
 * 서명 방식이 갈린다.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarRange, ExternalLink, PenTool } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import { parseTrainingAssignees } from '@/lib/trainingSignature';
import { useTrainingSignatures } from '@/hooks/useTrainingSignatures';
import { ManualCompletionRecord } from '../ManualCompletionRecord';
import { mergeTaskActionConfig } from '../../services/taskActionService';
import { taskActionKeys } from '../../hooks/useTaskActions';
import {
  buildTrainingSignaturePatch,
  isTrainingSignatureComplete,
  readTrainingSignatureConfig,
} from '../../utils/trainingSignatureAction';
import type { TaskAction } from '../../types';

interface TrainingMeeting {
  id: string;
  title: string;
  starts_at: string;
  meta: unknown;
}

/** 최근 연수 일정 — 고를 수 있어야 하므로 지난 것도 함께 준다(대개 끝난 뒤 서명을 받는다) */
function useTrainingMeetings() {
  return useQuery({
    queryKey: ['task-action', 'training-meetings'],
    staleTime: 60_000,
    queryFn: async (): Promise<TrainingMeeting[]> => {
      const { data, error } = await supabase
        .from('meeting')
        .select('id, title, starts_at, meta')
        .eq('kind', 'training')
        .order('starts_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as TrainingMeeting[];
    },
  });
}

export function TrainingSignatureRunner({
  action,
  workflowId,
  /** 남의 업무 흐름에서 열었다 — 가리키는 연수를 바꾸지 않고 현황만 본다 */
  guideOnly = false,
}: {
  action: TaskAction;
  workflowId: string | null;
  guideOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: meetings = [], isLoading } = useTrainingMeetings();
  const { meetingId } = readTrainingSignatureConfig(action.config);
  const [saving, setSaving] = useState(false);

  const meeting = meetings.find((item) => item.id === meetingId) ?? null;
  const { data: signatures = [] } = useTrainingSignatures(meetingId ?? undefined, Boolean(meetingId));
  const assignees = useMemo(
    () => parseTrainingAssignees((meeting?.meta as { assignee?: unknown } | null)?.assignee),
    [meeting],
  );

  const items = useMemo(
    () =>
      meetings.map((item) => ({
        value: item.id,
        label: item.title,
        description: new Date(item.starts_at).toLocaleDateString('ko-KR', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
      })),
    [meetings],
  );

  const handlePick = async (value: string) => {
    setSaving(true);
    try {
      await mergeTaskActionConfig(action.id, buildTrainingSignaturePatch(value));
      await queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '연수를 지정하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const signed = signatures.length;
  const total = assignees.length;
  const done = isTrainingSignatureComplete(signed, total);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-pink-50/40 p-4">
        <p className="text-sm font-semibold text-slate-800">연수 참석 서명 받기</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          연수 일정의 참석자에게 서명을 받습니다. QR을 띄워 현장에서 받거나, 참석자가 직접
          일정에서 서명할 수 있고, 명단은 그대로 출력됩니다.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
          어느 연수인가요
        </Label>
        {guideOnly ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {meeting?.title ?? '아직 지정되지 않았습니다.'}
          </p>
        ) : (
          <SearchableSelect
            items={items}
            selectedValue={meetingId ?? undefined}
            onValueChange={(value) => void handlePick(value)}
            placeholder={isLoading ? '연수 일정 불러오는 중…' : '연수 일정 선택'}
            pickerTitle="연수 일정 선택"
            disabled={saving || isLoading}
          />
        )}
        <p className="text-[10px] leading-4 text-slate-400">
          스케줄에서 만든 «연수» 일정만 보입니다. 없으면 먼저 일정을 만들어 참석자를 넣어 주세요.
        </p>
      </div>

      {meeting && (
        <section className="space-y-2 rounded-2xl border border-pink-200 bg-pink-50/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-pink-800">
              <PenTool className="h-3.5 w-3.5" />
              서명 현황
            </span>
            <span className={cn('text-xs font-bold tabular-nums', done ? 'text-emerald-600' : 'text-pink-900')}>
              {signed} / {total}명
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white">
            <div
              className={cn('h-full rounded-full transition-all', done ? 'bg-emerald-500' : 'bg-pink-500')}
              style={{ width: `${total > 0 ? Math.min(100, (signed / total) * 100) : 0}%` }}
            />
          </div>
          {total === 0 && (
            <p className="text-[11px] leading-4 text-pink-700">
              이 연수에 참석자가 없습니다 — 일정에서 참석자를 먼저 지정하세요.
            </p>
          )}
          <Button asChild variant="outline" size="sm" className="w-full bg-white">
            <Link to={`/schedule?event=${meeting.id}`} target="_blank" rel="noreferrer">
              일정에서 서명 받기(QR·출력)
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </section>
      )}

      {!guideOnly && (
        <ManualCompletionRecord
          action={action}
          workflowId={workflowId}
          snapshot={{ mode: 'signature.training', meetingId, signed, total }}
        />
      )}
    </div>
  );
}
