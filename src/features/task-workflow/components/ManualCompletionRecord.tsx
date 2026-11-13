// ========================================
// 수동 완료 기록 — 바로가기형(link)·NEIS(external) 실행이 함께 쓴다 (2026-09-23 분리)
//
// 처리는 앱 밖(다른 화면·나이스)에서 사람이 했으므로 앱이 검증할 것이 없다.
// 그래서 RUN 을 바로 `needs_review` 로 닫고, 확인은 사람 검수에 맡긴다.
// ========================================

import { useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useFinalizeTaskActionRun, useStartTaskActionRun } from '../hooks/useTaskActions';
import type { TaskAction } from '../types';

export function ManualCompletionRecord({
  action,
  workflowId,
  snapshot,
}: {
  action: TaskAction;
  workflowId: string | null;
  /** RUN 입력·출력 요약에 함께 남길 값 — 무엇을 가리킨 실행이었는지 */
  snapshot: Record<string, unknown>;
}) {
  const startRun = useStartTaskActionRun();
  const finalizeRun = useFinalizeTaskActionRun(action.id);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);

  const complete = async () => {
    setBusy(true);
    let runId: string | null = null;
    try {
      const run = await startRun.mutateAsync({
        actionId: action.id,
        workflowId,
        inputSnapshot: snapshot,
      });
      runId = run.id;
      await finalizeRun.mutateAsync({
        runId,
        status: 'needs_review',
        outputSummary: { ...snapshot, memo: memo.trim().slice(0, 500) },
        checks: [],
        artifacts: [],
      });
      toast.success('처리 완료를 기록했습니다 — 오른쪽 이력에서 검수하세요.');
      setMemo('');
    } catch (e) {
      const message = e instanceof Error ? e.message : '완료 기록에 실패했습니다.';
      if (runId) {
        try {
          await finalizeRun.mutateAsync({ runId, status: 'failed', errorSummary: message.slice(0, 500) });
        } catch { /* 이중 실패는 이력에 남김 */ }
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600">처리 완료 기록</p>
      <Textarea
        rows={3}
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="처리한 내용을 간단히 남기세요(선택) — 검수자가 확인합니다."
      />
      <Button size="sm" disabled={busy} onClick={() => void complete()}>
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />}
        처리 완료 기록(검수 대기)
      </Button>
      <p className="text-[11px] leading-4 text-slate-400">
        완료 기록은 즉시 완료 처리되지 않고 검수 대기(RUN)로 남습니다.
      </p>
    </div>
  );
}
