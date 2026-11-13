// «앞 단계에서 넘어온 것» — L1 보여주기 + L2 채워주기 + L3 AI 글 정리(버튼).
// 흐름 판정 = src/lib/workPipeline.ts(availableFlows). 적용 = src/services/workPipelineService.ts
// (서버 RPC 가 매니저 권한·잠금을 다시 본다 — 여기서 흉내 내지 않는다).

import { useState } from 'react';
import { ArrowRightLeft, Copy, FileText, Inbox, Loader2, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import {
  availableFlows,
  outputHasContent,
  outputPeople,
  outputToText,
  peopleForAudience,
  type OutputKind,
  type PipelineActionLike,
  type ResolvedOutput,
} from '@/lib/workPipeline';
import {
  applyPeopleToCollectAudience,
  applyPeopleToMessageAudience,
  applyTextToMessageBody,
} from '@/services/workPipelineService';
import { recordSuggestionDecision, runTableToText, type AiSuggestionRecord, type TableToTextResult } from '@/services/workAiService';
import { useInvalidatePipeline } from '@/hooks/useWorkPipeline';
import { OutputBodyView } from './OutputView';

type Pending =
  | { key: string; kind: 'audience'; action: PipelineActionLike; ids: string[]; names: string[]; dropped: string[] }
  /** aiKey = AI 글 카드에서 넣는 경우 — 적용이 **성공한 뒤에만** 그 카드의 결정을 «적용»으로 남긴다 */
  | { key: string; kind: 'body'; action: PipelineActionLike; text: string; aiKey?: string };

export function UpstreamPanel({
  workId,
  currentTaskId,
  upstream,
  actions,
  ownKind,
  canManage,
  loading,
  isFirstStage,
  isOneTime = false,
}: {
  workId: string;
  currentTaskId: string;
  upstream: { taskTitle: string; outputs: ResolvedOutput[] }[];
  /** 지금 할 일의 작업들 */
  actions: PipelineActionLike[];
  ownKind: OutputKind;
  canManage: boolean;
  loading: boolean;
  isFirstStage: boolean;
  /** 순서 없는 할 일(일회성) — 앞 단계라는 것이 없다 */
  isOneTime?: boolean;
}) {
  const invalidate = useInvalidatePipeline(workId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusyKey, setAiBusyKey] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, AiSuggestionRecord<TableToTextResult>>>({});
  const [aiDecided, setAiDecided] = useState<Record<string, string>>({});

  const actionTypes = actions.map((a) => a.action_type);
  const messageActions = actions.filter((a) => a.action_type === 'message.send');
  const collectActions = actions.filter((a) => a.action_type === 'collect.input');

  if (isFirstStage) {
    return (
      <section className="space-y-2">
        <SectionLabel icon={Inbox}>앞 단계에서 넘어온 것</SectionLabel>
        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
          {isOneTime ? '순서 없는 할 일이라 앞 단계가 없습니다.' : '첫 단계입니다 — 넘어온 것이 없습니다.'}
        </p>
      </section>
    );
  }

  const apply = async (mode: 'add' | 'replace' | 'append') => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'audience') {
        if (pending.action.action_type === 'message.send') {
          await applyPeopleToMessageAudience(pending.action.id, pending.ids, mode === 'replace' ? 'replace' : 'add');
        } else {
          const { warning } = await applyPeopleToCollectAudience(pending.action.id, pending.ids, mode === 'replace' ? 'replace' : 'add');
          if (warning) toast.warning(warning);
        }
        toast.success(`「${pending.action.title}」의 받는 사람에 ${pending.ids.length}명을 ${mode === 'replace' ? '넣었습니다(기존 조건 교체)' : '더했습니다'}. 보내기 전에 받는 사람 미리보기를 확인하세요.`);
      } else {
        await applyTextToMessageBody(pending.action.id, pending.text, mode === 'replace' ? 'replace' : 'append');
        // AI 글이면 **성공한 뒤에** «적용»으로 남긴다(취소·실패가 적용으로 세지지 않게)
        if (pending.aiKey) decideAi(pending.aiKey, 'applied');
        toast.success(`「${pending.action.title}」 본문에 ${mode === 'replace' ? '넣었습니다(기존 본문 교체)' : '덧붙였습니다'}. 보내기 전에 확인하세요.`);
      }
      setPending(null);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runAiText = async (output: ResolvedOutput, key: string, force = false) => {
    if (output.body.kind !== 'table') return;
    setAiBusyKey(key);
    try {
      const res = await runTableToText({
        workId,
        taskId: currentTaskId,
        title: output.sourceLabel,
        table: output.body,
        purpose: messageActions[0]?.title ?? '다음 단계 안내',
        force,
      });
      setAiResults((prev) => ({ ...prev, [key]: res }));
      setAiDecided((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiBusyKey(null);
    }
  };

  const decideAi = (key: string, decision: 'applied' | 'dismissed' | 'copied') => {
    const rec = aiResults[key];
    if (!rec) return;
    setAiDecided((prev) => ({ ...prev, [key]: decision }));
    void recordSuggestionDecision(rec.id, 'text', decision);
  };

  const hasAny = upstream.some((u) => u.outputs.some((o) => outputHasContent(o.body) || o.unavailable));

  return (
    <section className="space-y-2">
      <SectionLabel icon={Inbox}>앞 단계에서 넘어온 것</SectionLabel>
      {loading && <p className="flex items-center gap-1 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 읽는 중…</p>}
      {!loading && !hasAny && (
        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
          앞 단계가 «끝났다»는 신호 말고는 남긴 것이 없습니다. 앞 단계 할 일에서 «남기는 것»(값·명단·표)을 정하면 여기로 넘어옵니다.
        </p>
      )}
      {upstream.map((u) => u.outputs
        .filter((o) => outputHasContent(o.body) || o.unavailable)
        .map((o) => {
          const key = `${o.taskId}|${o.sourceType}|${o.sourceLabel}`;
          const flows = canManage ? availableFlows(o.body, actionTypes, ownKind) : [];
          const people = outputPeople(o.body);
          const { ids, dropped } = peopleForAudience(people);
          // 넘어갈 사람의 이름 — 서버가 저장할 때 resource.name 으로 다시 써 둔 이름이다(위조 방지)
          const names = people.filter((p) => p.resourceId).map((p) => p.name);
          const ai = aiResults[key];
          return (
            <div key={key} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800" title={u.taskTitle}>{u.taskTitle}</p>
                <p className="truncate text-[10px] text-slate-400" title={o.sourceLabel}>
                  {o.sourceLabel}{o.updatedByName ? ` · ${o.updatedByName}` : ''}
                </p>
              </div>
              {o.unavailable && <p className="text-[11px] text-amber-700">{o.unavailable}</p>}
              <OutputBodyView body={o.body} compact />

              {/* L2 채워주기 */}
              {flows.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-1.5">
                  {flows.includes('message_audience') && messageActions.map((a) => (
                    <Button key={`ma-${a.id}`} type="button" variant="outline" size="sm" className="h-8 max-w-full text-[11px]"
                      title={`${ids.length}명 → 「${a.title}」 받는 사람`}
                      onClick={() => setPending({ key, kind: 'audience', action: a, ids, names, dropped })}>
                      <Users className="mr-1 h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{ids.length}명 → 「{a.title}」 받는 사람</span>
                    </Button>
                  ))}
                  {flows.includes('collect_audience') && collectActions.map((a) => (
                    <Button key={`ca-${a.id}`} type="button" variant="outline" size="sm" className="h-8 max-w-full text-[11px]"
                      title={`${ids.length}명 → 「${a.title}」 대상`}
                      onClick={() => setPending({ key, kind: 'audience', action: a, ids, names, dropped })}>
                      <Users className="mr-1 h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{ids.length}명 → 「{a.title}」 대상</span>
                    </Button>
                  ))}
                  {flows.includes('message_body') && messageActions.map((a) => (
                    <Button key={`mb-${a.id}`} type="button" variant="outline" size="sm" className="h-8 max-w-full text-[11px]"
                      title={`내용 → 「${a.title}」 본문`}
                      onClick={() => setPending({ key, kind: 'body', action: a, text: outputToText(o.body) })}>
                      <ArrowRightLeft className="mr-1 h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">내용 → 「{a.title}」 본문</span>
                    </Button>
                  ))}
                  {o.body.kind === 'table' && messageActions.length > 0 && (
                    <Button type="button" variant="outline" size="sm" className="h-8 border-violet-200 text-[11px] text-violet-700"
                      onClick={() => runAiText(o, key)} disabled={aiBusyKey === key}>
                      {aiBusyKey === key ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                      AI 글로 정리
                    </Button>
                  )}
                </div>
              )}
              {flows.includes('spec_context') && (
                <p className="flex items-start gap-1 text-[10px] text-indigo-700">
                  <FileText className="mt-px h-3 w-3 shrink-0" />
                  문서 작성 창을 열면 이 내용이 «앞 단계» 맥락으로 함께 들어갑니다(뺄 수 있습니다).
                </p>
              )}
              {flows.includes('table_pick') && (
                <p className="text-[10px] text-slate-500">아래 «이 할 일이 남기는 것»에서 이 표의 줄을 골라 가져올 수 있습니다.</p>
              )}

              {/* 확인 — 다른 작업의 설정을 바꾸므로 한 번 묻는다 */}
              {pending?.key === key && (
                <div className="space-y-1.5 rounded-lg bg-blue-50 p-2 text-[11px] text-slate-700">
                  {pending.kind === 'audience' ? (
                    <div className="space-y-1">
                      <p>
                        「{pending.action.title}」의 받는 사람에 <b>{pending.ids.length}명</b>을 넣습니다.
                        {pending.dropped.length > 0 && <> 계정이 없는 <b>{pending.dropped.length}명</b>({pending.dropped.slice(0, 3).join(', ')}{pending.dropped.length > 3 ? ' 외' : ''})은 빠집니다.</>}
                      </p>
                      {/* 숫자만 보여 주면 누구에게 가는지 확인할 수 없다(적대적 검증 2026-09-27) */}
                      <p className="max-h-24 overflow-y-auto break-words rounded bg-white/70 px-1.5 py-1 text-[10px] text-slate-600">
                        {pending.names.join(', ')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p>「{pending.action.title}」 본문에 넣을 내용:</p>
                      {/* 잘라 보여 주지 않는다 — 발송 본문에 들어갈 글 전부를 확인하고 넣어야 한다 */}
                      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-white/70 px-1.5 py-1 text-[11px] text-slate-700">{pending.text}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => setPending(null)} disabled={busy}>취소</Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => apply('replace')} disabled={busy}>바꾸기</Button>
                    <Button type="button" size="sm" className="h-8 bg-blue-600 text-[11px] hover:bg-blue-700" onClick={() => apply(pending.kind === 'audience' ? 'add' : 'append')} disabled={busy}>
                      {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                      {pending.kind === 'audience' ? '더하기' : '덧붙이기'}
                    </Button>
                  </div>
                </div>
              )}

              {/* L3 AI 결과 카드 */}
              {ai && (
                <div className="space-y-1.5 rounded-lg border border-violet-100 bg-violet-50/50 p-2">
                  <p className="text-[10px] text-violet-700">AI 가 표 자료로 쓴 글입니다. 자료 칸에 적힌 지시문은 따르지 않도록 했지만, 보내기 전에 내용을 확인하세요.</p>
                  {(ai.result.removedSentences ?? []).length > 0 && (
                    <p className="rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">
                      표 칸에서 AI 를 향한 지시문으로 보이는 문장 {ai.result.removedSentences.length}개를 빼고 정리했습니다 — 표 자료를 확인하세요.
                    </p>
                  )}
                  {(ai.result.unverifiedNumbers ?? []).length > 0 && (
                    <p className="rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">
                      표·합계에 없는 숫자가 있습니다: <b>{ai.result.unverifiedNumbers.join(', ')}</b> — 계산이 맞는지 확인하세요.
                    </p>
                  )}
                  {ai.recordError && <p className="text-[10px] text-slate-400">결과 기록에 실패해 결정이 남지 않습니다.</p>}
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">{ai.result.text}</p>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {ai.cached && (
                      <button type="button" className="mr-auto text-[10px] text-slate-400 hover:text-slate-600" onClick={() => runAiText(o, key, true)}>
                        저장된 결과 · 다시 받기
                      </button>
                    )}
                    {aiDecided[key] && aiDecided[key] !== 'copied' ? (
                      <span className="text-[10px] text-slate-500">{aiDecided[key] === 'applied' ? '본문에 넣음' : aiDecided[key] === 'copied' ? '복사함' : '무시함'}</span>
                    ) : (
                      <>
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => decideAi(key, 'dismissed')}>무시</Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-[11px]"
                          onClick={() => { void navigator.clipboard?.writeText(ai.result.text); decideAi(key, 'copied'); toast.success('복사했습니다.'); }}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> 복사
                        </Button>
                        {messageActions.map((a) => (
                          <Button key={a.id} type="button" size="sm" className="h-8 max-w-full bg-blue-600 text-[11px] hover:bg-blue-700"
                            onClick={() => setPending({ key, kind: 'body', action: a, text: ai.result.text, aiKey: key })}>
                            <span className="truncate">「{a.title}」 본문에 넣기</span>
                          </Button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        }))}
    </section>
  );
}
