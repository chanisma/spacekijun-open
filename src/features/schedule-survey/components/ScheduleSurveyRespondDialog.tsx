// ========================================
// 일정 설문 응답
//
// 후보 날짜마다 [가능 체크 + 그날 할 일] 한 줄.
// 주최자가 허용했으면 달력에서 다른 날짜도 제안할 수 있다.
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  scheduleComposeDialogClass,
  ScheduleComposeHeader,
} from '@/components/schedule/ScheduleComposeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarPlus, CheckCircle2, Clock, Lock, X } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toDateKey } from '@/lib/scheduleUtils';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useSaveSurveyResponse, useSurveyResponses } from '../hooks/useScheduleSurveys';
import { canRespondToSurvey, daysUntilDue } from '../utils/surveyAggregate';
import type { ScheduleSurvey, SurveyResponseItem } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  survey: ScheduleSurvey;
}

interface Row {
  date: string;
  available: boolean;
  activity: string;
  /** 주최자가 제시한 후보인가 (아니면 내가 제안한 날짜 — 지울 수 있다) */
  isCandidate: boolean;
}

function formatDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'M월 d일 (E)', { locale: ko });
}

export function ScheduleSurveyRespondDialog({ open, onOpenChange, survey }: Props) {
  const { profile } = useAuth();
  const { data: myResourceId } = useCurrentResourceId();
  const saveResponse = useSaveSurveyResponse();

  // 내 기존 응답 — RLS 때문에 응답자에게는 자기 행만 온다
  const { data: responses = [], isLoading } = useSurveyResponses(open ? survey.id : null);
  const myResponse = useMemo(
    () => responses.find((r) => r.respondent_resource_id === myResourceId) ?? null,
    [responses, myResourceId]
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [comment, setComment] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * 폼을 채운 설문 id.
   *
   * ⚠ 이 효과를 `[myResponse, survey.candidate_dates]` 로만 묶으면 **작성 중인 입력이 지워진다**.
   *   설문 객체는 목록 쿼리에서 매번 새로 만들어지고(useMemo over surveys) 응답 쿼리도
   *   창 포커스마다 refetch 하므로, 사용자가 타이핑하는 중에 식별자만 바뀌어 효과가 다시 돈다.
   *   한 번 열릴 때 한 번만 채우고, 그 뒤로는 사용자의 편집이 정본이다.
   */
  const filledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      filledForRef.current = null;
      return;
    }
    if (isLoading || filledForRef.current === survey.id) return;
    filledForRef.current = survey.id;

    const saved = new Map(myResponse?.items.map((item) => [item.date, item]) ?? []);
    const candidateRows: Row[] = survey.candidate_dates.map((date) => ({
      date,
      available: saved.get(date)?.available ?? false,
      activity: saved.get(date)?.activity ?? '',
      isCandidate: true,
    }));
    const extraRows: Row[] = [...saved.values()]
      .filter((item) => !survey.candidate_dates.includes(item.date))
      .map((item) => ({
        date: item.date,
        available: item.available,
        activity: item.activity ?? '',
        isCandidate: false,
      }));
    setRows(
      [...candidateRows, ...extraRows].sort((a, b) => a.date.localeCompare(b.date))
    );
    setComment(myResponse?.comment ?? '');
  }, [open, isLoading, myResponse, survey.id, survey.candidate_dates]);

  const canRespond = canRespondToSurvey(survey, myResourceId);
  const dueIn = daysUntilDue(survey.due_date);
  const selectedCount = rows.filter((row) => row.available).length;

  const patchRow = (date: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.date === date ? { ...row, ...patch } : row)));
  };

  const addCustomDate = (date: Date | undefined) => {
    if (!date) return;
    const key = toDateKey(date);
    setPickerOpen(false);
    if (rows.some((row) => row.date === key)) {
      toast.error('이미 목록에 있는 날짜입니다.');
      return;
    }
    setRows((prev) =>
      [...prev, { date: key, available: true, activity: '', isCandidate: false }].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    );
  };

  const removeRow = (date: string) => {
    setRows((prev) => prev.filter((row) => row.date !== date));
  };

  const handleSubmit = async () => {
    if (!myResourceId) {
      toast.error('내 리소스 정보를 확인할 수 없어 응답할 수 없습니다.');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      // 후보 날짜는 "불가능"도 뜻이 있으므로 전부 보낸다.
      // 내가 제안한 날짜는 가능 표시를 뗐으면 제안 철회로 보고 뺀다.
      const items: SurveyResponseItem[] = rows
        .filter((row) => row.isCandidate || row.available || row.activity.trim())
        .map((row) => ({
          date: row.date,
          available: row.available,
          ...(row.activity.trim() ? { activity: row.activity.trim() } : {}),
        }));

      await saveResponse.mutateAsync({
        input: { survey_id: survey.id, items, comment },
        respondentResourceId: myResourceId,
        respondentName: profile?.name ?? null,
      });
      toast.success(
        selectedCount > 0
          ? `응답을 저장했습니다. (가능한 날짜 ${selectedCount}개)`
          : '응답을 저장했습니다. (가능한 날짜 없음)'
      );
      onOpenChange(false);
    } catch {
      // mutation onError 에서 토스트 처리됨
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
          title={survey.title}
          label={survey.status === 'closed' ? '마감됨' : '설문 응답'}
          description={
            survey.description?.trim() ||
            '가능한 날짜를 고르고, 그날 무엇을 하면 좋을지 적어 주세요.'
          }
        />

        <div className="schedule-compose-scroll schedule-compose-fields space-y-5">
          {/* 안내 줄 */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              요청 {survey.owner_name ?? '알 수 없음'}
            </span>
            {survey.due_date && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
                  dueIn !== null && dueIn < 0
                    ? 'bg-rose-50 text-rose-700'
                    : dueIn !== null && dueIn <= 2
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                )}
              >
                <Clock className="h-3 w-3" />
                마감 {survey.due_date}
                {dueIn !== null && (dueIn < 0 ? ' (지남)' : dueIn === 0 ? ' (오늘)' : ` (D-${dueIn})`)}
              </span>
            )}
            {myResponse && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                응답함 · 수정하면 덮어씁니다
              </span>
            )}
          </div>

          {!canRespond && (
            <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {survey.status === 'closed'
                ? '마감된 설문이라 응답을 저장할 수 없습니다. 아래는 내가 낸 답입니다.'
                : '이 설문의 대상자가 아니어서 응답할 수 없습니다.'}
            </p>
          )}

          {/* 날짜별 응답 */}
          <section className="schedule-compose-section space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">
                날짜별 응답
                <span className="ml-2 text-[11px] font-normal text-slate-400">
                  가능 {selectedCount} / {rows.length}
                </span>
              </h3>

              {survey.allow_custom_dates && canRespond && (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <CalendarPlus className="h-3.5 w-3.5" />
                      다른 날짜 제안
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" onSelect={addCustomDate} locale={ko} initialFocus />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">
                {survey.allow_custom_dates
                  ? '‘다른 날짜 제안’을 눌러 가능한 날짜를 추가해 주세요.'
                  : '후보 날짜가 없습니다. 주최자에게 문의해 주세요.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li
                    key={row.date}
                    className={cn(
                      'flex min-w-0 flex-col gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center',
                      row.available
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-slate-200 bg-white'
                    )}
                  >
                    <label className="flex shrink-0 cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={row.available}
                        disabled={!canRespond}
                        onCheckedChange={(checked) =>
                          patchRow(row.date, { available: checked === true })
                        }
                      />
                      <span className="text-sm font-medium text-slate-800">
                        {formatDate(row.date)}
                      </span>
                      {!row.isCandidate && (
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                          내 제안
                        </span>
                      )}
                    </label>

                    <Input
                      className="min-w-0 flex-1 bg-white"
                      value={row.activity}
                      disabled={!canRespond}
                      onChange={(e) => patchRow(row.date, { activity: e.target.value })}
                      placeholder="그날 무엇을 하면 좋을까요? (선택)"
                      aria-label={`${row.date} 할 일`}
                    />

                    {!row.isCandidate && canRespond && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.date)}
                        aria-label={`${row.date} 제안 삭제`}
                        className="shrink-0 self-end rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:self-auto"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div>
            <Label htmlFor="survey-comment">남기고 싶은 말</Label>
            <Textarea
              id="survey-comment"
              rows={2}
              value={comment}
              disabled={!canRespond}
              onChange={(e) => setComment(e.target.value)}
              placeholder="예: 오전에만 가능합니다 (선택)"
            />
          </div>

          <div className="schedule-compose-footer">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              닫기
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canRespond || saving}>
              {saving ? '저장 중...' : myResponse ? '응답 수정' : '응답 저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
