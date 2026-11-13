// 업무 점검 — 코드 규칙(항상) + AI 교차 점검(버튼).
// 근거 = docs/plans/2026-09-27-task-automation-research.md §5
//   코드 규칙은 라이브 32건 중 27건에서 무언가를 잡았고 비용이 0 → 항상 보여 준다.
//   AI 점검은 업무 안의 글끼리 맞지 않는 곳을 찾는다 — 글이 없으면 할 말이 없다(그래서 버튼).
// 규칙 = src/lib/workChecks.ts · AI 프롬프트·인용 대조 = src/lib/workAi.ts

import { useMemo, useState } from 'react';
import { AlertTriangle, Info, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { runWorkChecks } from '@/lib/workChecks';
import { buildWorkCheckInput, droppedTotal, WORK_CHECK_KIND_LABEL, type SuggestionDecision } from '@/lib/workAi';
import { getTaskDeadlines } from '@/lib/taskDeadlines';
import type { PipelineActionLike, PipelineTaskLike } from '@/lib/workPipeline';
import { recordSuggestionDecision, runWorkAiCheck, type AiSuggestionRecord, type WorkCheckResult } from '@/services/workAiService';

export function WorkCheckPanel({
  work,
  tasks,
  actions,
  onSelectTask,
}: {
  work: { id: string; name: string; description?: string | null; status: string };
  tasks: PipelineTaskLike[];
  actions: PipelineActionLike[];
  onSelectTask: (taskId: string) => void;
}) {
  const findings = useMemo(() => runWorkChecks({ work, tasks, actions }), [work, tasks, actions]);
  const titleOf = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  const [running, setRunning] = useState(false);
  const [ai, setAi] = useState<AiSuggestionRecord<WorkCheckResult> | null>(null);
  const [decisions, setDecisions] = useState<Record<string, SuggestionDecision>>({});

  const runAi = async (force = false) => {
    setRunning(true);
    try {
      const input = buildWorkCheckInput(
        { name: work.name, description: work.description },
        tasks.map((t) => ({
          order: t.order_index,
          title: t.title,
          description: t.description ?? null,
          due: t.due_date?.slice(0, 10) ?? null,
          deadlines: getTaskDeadlines({ due_date: t.due_date ?? null, meta: (t.meta ?? {}) as never }),
          actions: actions.filter((a) => a.task_id === t.id).map((a) => ({ type: a.action_type, title: a.title, config: a.config ?? null })),
        })),
      );
      const res = await runWorkAiCheck({ workId: work.id, checkInput: input, force });
      setAi(res);
      setDecisions(res.decisions);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const decide = (id: string, decision: SuggestionDecision) => {
    if (!ai) return;
    setDecisions((prev) => ({ ...prev, [id]: decision }));
    void recordSuggestionDecision(ai.id, id, decision);
  };

  return (
    <section className="space-y-2">
      <SectionLabel icon={ShieldCheck}>점검</SectionLabel>

      {findings.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700">규칙으로 찾은 문제가 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {findings.map((f, i) => (
            <li
              key={`${f.rule}-${i}`}
              className={cn(
                'rounded-lg border px-2.5 py-2 text-xs',
                f.severity === 'warn' ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/70',
              )}
            >
              <p className={cn('flex items-start gap-1.5 font-medium', f.severity === 'warn' ? 'text-amber-800' : 'text-slate-700')}>
                {f.severity === 'warn'
                  ? <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  : <Info className="mt-px h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 break-words">{f.message}</span>
              </p>
              {f.hint && <p className="mt-0.5 pl-5 text-[11px] text-slate-500">{f.hint}</p>}
              {f.taskIds.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 pl-5">
                  {f.taskIds.slice(0, 6).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectTask(id)}
                      className="max-w-[12rem] truncate rounded bg-white px-1.5 py-0.5 text-[10px] text-blue-700 ring-1 ring-slate-200 hover:bg-blue-50"
                      title={titleOf.get(id)}
                    >
                      {titleOf.get(id) ?? '할 일'}
                    </button>
                  ))}
                  {f.taskIds.length > 6 && <span className="text-[10px] text-slate-400">외 {f.taskIds.length - 6}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5 rounded-lg border border-violet-100 bg-violet-50/40 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 border-violet-200 text-xs text-violet-700" onClick={() => runAi()} disabled={running}>
            {running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            AI 점검
          </Button>
          <span className="text-[10px] text-slate-500">안내문·설명·입력 항목끼리 맞지 않는 곳을 찾습니다.</span>
          {ai?.cached && (
            <button type="button" className="text-[10px] text-slate-400 hover:text-slate-600" onClick={() => runAi(true)}>
              저장된 결과 · 다시 받기
            </button>
          )}
        </div>
        {ai && (ai.result.removedSentences ?? []).length > 0 && (
          // 누군가 할 일 설명·안내문에 AI 를 향한 지시를 적어 두었다 — 결과를 조작하려는 것일 수 있다
          <div className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-800">
            <p className="font-medium">AI 점검기를 향한 지시문으로 보이는 문장 {ai.result.removedSentences.length}개를 빼고 점검했습니다.</p>
            <ul className="mt-0.5 list-disc pl-4">
              {ai.result.removedSentences.slice(0, 3).map((t, i) => <li key={i} className="line-clamp-2 break-words">{t}</li>)}
            </ul>
          </div>
        )}
        {ai && ai.result.findings.length === 0 && (
          <p className="text-[11px] text-slate-600">AI 가 근거를 들어 지적할 곳을 찾지 못했습니다.</p>
        )}
        {ai && ai.result.findings.length > 0 && (
          <p className="text-[10px] text-violet-700">AI 가 이 업무의 설명·안내문(누구나 고칠 수 있는 글)을 읽고 만든 제안입니다. 근거 인용이 원문에 있는 것만 보여 줍니다.</p>
        )}
        {ai && ai.result.findings.map((f) => {
          const d = decisions[f.id];
          return (
            <div key={f.id} className="space-y-1 rounded-md bg-white p-2 text-[11px]">
              <p className="font-medium text-slate-800">
                <span className="mr-1 rounded bg-violet-100 px-1 text-[10px] text-violet-700">{WORK_CHECK_KIND_LABEL[f.kind]}</span>
                {f.message}
              </p>
              <ul className="space-y-0.5 border-l-2 border-slate-200 pl-2 text-[10px] text-slate-500">
                {f.evidence.map((q, i) => <li key={i} className="line-clamp-2 break-words">“{q}”</li>)}
              </ul>
              {f.suggestion && <p className="text-slate-600">→ {f.suggestion}</p>}
              <div className="flex justify-end gap-1">
                {d ? (
                  <span className="text-[10px] text-slate-400">{d === 'applied' ? '확인함' : '무시함'}</span>
                ) : (
                  <>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => decide(f.id, 'dismissed')}>무시</Button>
                    <Button type="button" size="sm" className="h-7 bg-blue-600 px-2 text-[11px] hover:bg-blue-700" onClick={() => decide(f.id, 'applied')}>맞아요 · 고칠게요</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {ai && droppedTotal(ai.result.dropped) > 0 && (
          // 까닭을 섞어 말하지 않는다 — «근거 없음»과 «입력 양식 없음»과 «지시문 섞임»은 다른 이야기다
          <p className="text-[10px] text-slate-400">
            뺀 지적:{' '}
            {[
              ai.result.dropped.unverified > 0 && `근거 인용이 원문에 없음 ${ai.result.dropped.unverified}건`,
              ai.result.dropped.guarded > 0 && `입력 양식이 없는 할 일에 «받지 않는 정보» ${ai.result.dropped.guarded}건`,
              ai.result.dropped.suspicious > 0 && `자료 속 지시문이 섞임 ${ai.result.dropped.suspicious}건`,
              ai.result.dropped.invalid > 0 && `형식 오류 ${ai.result.dropped.invalid}건`,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
        {ai?.recordError && <p className="text-[10px] text-slate-400">결과 기록에 실패해 결정이 남지 않습니다.</p>}
      </div>
    </section>
  );
}
