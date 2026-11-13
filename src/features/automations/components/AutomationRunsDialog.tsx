// ========================================
// 실행 기록 (2026-10-23) — 회차마다 상태·사유·쿨메신저 결과. 대기 회차는 취소할 수 있다.
// «확인 필요»(unknown)는 나갔을 수도 있다는 뜻이라 다시 보내지 않는다 — 화면이 그렇게 말한다.
// ========================================
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, History, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { NamePreview } from '@/components/ui/name-list-overlay';
import { RUN_STATUS_LABEL, RUN_STATUS_TONE } from '@/lib/automationConfig';
import { formatRunAt } from '@/lib/automationCron';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { automationRunsKey, cancelAutomationRun, listAutomationRuns, type Automation, type AutomationRun } from '../automationService';

interface Props {
  automation: Automation | null;
  onOpenChange: (open: boolean) => void;
}

function resultLine(run: AutomationRun): string | null {
  if (run.status === 'sent') return [run.arrival ? `도착 ${run.arrival}` : null, run.message_key ? `보낸 쪽지 #${run.message_key}` : null].filter(Boolean).join(' · ') || null;
  if (run.status === 'unknown') return `${run.error ?? '발송 여부를 확인하지 못했습니다'} — 쿨메신저 «보낸 쪽지»를 확인해 주세요. 다시 보내지 않습니다.`;
  if (run.status === 'failed') return run.error;
  if (run.status === 'skipped' || run.status === 'cancelled') return run.skip_reason;
  if (run.status === 'expired') return '서버가 유효 시간 안에 가져가지 못했습니다.';
  return null;
}

export function AutomationRunsDialog({ automation, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const key = automationRunsKey(automation?.id ?? null);
  const runs = useQuery({
    queryKey: key,
    queryFn: () => listAutomationRuns(automation!.id),
    enabled: Boolean(automation),
    refetchInterval: 30_000,
  });

  async function cancel(run: AutomationRun) {
    setBusy(run.id);
    try {
      await cancelAutomationRun(run.id);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '취소하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={Boolean(automation)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-3">
            <TitleIconChip icon={History} />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base" title={automation?.title}>{automation?.title ?? ''} — 기록</DialogTitle>
              <DialogDescription className="text-xs">최근 100회차 · 30초마다 새로 고칩니다.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto px-2 py-2 sm:px-4">
          {runs.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : runs.isError ? (
            <p className="px-2 py-6 text-center text-xs text-rose-600">{runs.error instanceof Error ? runs.error.message : '불러오지 못했습니다.'}</p>
          ) : (runs.data ?? []).length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">아직 실행한 회차가 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {(runs.data ?? []).map((run) => {
                const line = resultLine(run);
                const expanded = openId === run.id;
                return (
                  <li key={run.id} className="min-w-0 px-2 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn('flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium', RUN_STATUS_TONE[run.status])}>
                        {RUN_STATUS_LABEL[run.status]}
                      </span>
                      <span className="flex-shrink-0 text-sm tabular-nums text-slate-700">{formatRunAt(Date.parse(run.scheduled_for))}</span>
                      {run.is_test && <span className="flex-shrink-0 rounded bg-indigo-50 px-1 text-[11px] text-indigo-700">시험</span>}
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                        {run.recipients.length > 0 && <NamePreview names={run.recipients.map((r) => r.name)} />}
                      </span>
                      {run.status === 'pending' && (
                        <Button variant="ghost" size="sm" className="h-7 flex-shrink-0 px-2 text-xs text-rose-600 hover:bg-rose-50"
                          disabled={busy !== null} onClick={() => cancel(run)}>
                          {busy === run.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          취소
                        </Button>
                      )}
                      {run.body && (
                        <Button variant="ghost" size="sm" className="h-7 flex-shrink-0 px-2" aria-expanded={expanded}
                          aria-label="쪽지 내용" onClick={() => setOpenId(expanded ? null : run.id)}>
                          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                        </Button>
                      )}
                    </div>
                    {line && <p className={cn('mt-1 break-words text-xs', run.status === 'unknown' ? 'text-amber-800' : run.status === 'failed' ? 'text-rose-600' : 'text-slate-500')}>{line}</p>}
                    {expanded && run.body && (
                      <div className="mt-2 min-w-0 rounded-lg border bg-slate-50">
                        <p className="truncate border-b px-3 py-1 text-xs font-medium text-slate-700" title={run.title ?? ''}>{run.title}</p>
                        <pre className="whitespace-pre-wrap break-words px-3 py-2 font-sans text-sm text-slate-700">{run.body}</pre>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
