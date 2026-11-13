// ========================================
// 할 일 작업 「메시지 보내기」 러너 (작업 창 [열기])
//   · 메시지 작성(직접 · AI 초안) + 받는 사람(입력 받기와 같은 대상 규칙)
//   · [알림 보내기] = SPACEKIJUN 알림(서버 send_task_message)
//   · 쿨메신저는 자동으로 보내지 않는다 — 본문·받는 사람을 복사해 사람이 보내도록 안내
//
// 2026-10-06 정리(UI 검토): 쓰던 글은 **자동 저장**(종전엔 [저장]을 안 누르고 닫으면 사라졌다) ·
//   이미 보냈으면 머리에 «보냄 N회», 다시 보낼 때 확인창이 그 사실을 말한다(같은 사람에게 또 간다) ·
//   [알림 보내기]는 아래 고정 줄에 + 꺼진 이유 · AI 초안이 덮어쓴 글을 되돌릴 수 있다 ·
//   확인창에 받는 사람 이름 · 보낸 기록은 눌러 펼쳐 받은 사람·전문을 본다(툴팁 금지)
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Copy, History, Loader2, MessageSquareText, Send, Sparkles, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { AudienceRuleBuilder } from '@/components/audience/AudienceRuleBuilder';
import { AudiencePreview } from '@/components/audience/AudiencePreview';
import { describeAudienceRule, summarizeResolution, validateAudienceRule } from '@/lib/audienceRule';
import {
  MESSAGE_BODY_MAX,
  coolMessengerText,
  parseMessageConfig,
  recipientNamesText,
  serializeMessageConfig,
  validateMessageConfig,
  type TaskMessageConfig,
} from '@/lib/taskMessage';
import { cn } from '@/lib/utils';
import { NamePreview } from '@/components/ui/name-list-overlay';
import { useRunnerUnsaved } from '../runnerUnsaved';
import type { TaskAction } from '../../types';
import { taskActionKeys } from '../../hooks/useTaskActions';
import { useAudiencePreview } from '../../hooks/useCollectInput';
import {
  generateMessageDraft,
  listTaskMessageSends,
  sendTaskMessage,
  updateMessageConfig,
} from '../../services/taskMessageService';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what}을(를) 복사했습니다.`);
  } catch {
    toast.error('복사하지 못했습니다. 직접 선택해 복사해 주세요.');
  }
}

export function MessageSendRunner({ action }: { action: TaskAction }) {
  const queryClient = useQueryClient();
  const saved = useMemo(() => parseMessageConfig(action.config), [action.config]);
  const [draft, setDraft] = useState<TaskMessageConfig>(saved);
  const [dirty, setDirty] = useState(false);
  // 저장이 돌아와도 초안을 덮지 않는다 — 창을 연 순간의 action 은 낡은 값일 수 있어, 덮으면 방금 쓴 글이
  // 옛 글로 돌아간다. 남이 고친 값(내가 보낸 것이 아닌 것)일 때만 맞춘다.
  const sentRef = useRef<string | null>(null);
  useEffect(() => {
    if (dirty) return;
    const incoming = JSON.stringify(serializeMessageConfig(saved));
    if (sentRef.current !== null) return; // 내가 한 번이라도 저장했으면 이 창의 초안이 정본이다
    if (incoming !== JSON.stringify(serializeMessageConfig(draft))) setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, dirty]);
  const set = (patch: Partial<TaskMessageConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const [bodyTouched, setBodyTouched] = useState(false);

  const { data: canManage, isLoading: permLoading } = useQuery({
    queryKey: ['task-action', 'can-manage', action.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_manage_task_action', { p_action_id: action.id });
      if (error) throw error;
      return Boolean(data);
    },
  });

  // AI 초안의 맥락 — 업무·할 일 이름·설명·마감
  const { data: context } = useQuery({
    queryKey: ['task-action', 'message-context', action.task_id],
    enabled: Boolean(action.task_id),
    queryFn: async () => {
      const { data: task } = await supabase
        .from('task').select('title, description, due_date, event_id').eq('id', action.task_id!).maybeSingle();
      const { data: work } = task?.event_id
        ? await supabase.from('work').select('name').eq('id', task.event_id).maybeSingle()
        : { data: null };
      return { task, workName: (work as { name?: string } | null)?.name ?? null };
    },
  });

  // 할 일 맥락을 함께 넘긴다 — «이 할 일의 담당자» 조건을 지금의 담당자로 풀어 미리 보인다(서버도 보낼 때 같은 식으로 푼다, 20261006100000)
  const preview = useAudiencePreview(draft.audience, 'person', Boolean(canManage), action.task_id);
  const summary = preview.data ? summarizeResolution(preview.data.rows) : null;
  const linkedNames = (preview.data?.rows ?? []).filter((r) => r.resource_id).map((r) => r.name);
  const unlinkedNames = (preview.data?.rows ?? []).filter((r) => !r.resource_id).map((r) => r.name);

  const { data: sends = [] } = useQuery({
    queryKey: ['task-action', 'message-sends', action.id],
    enabled: Boolean(canManage),
    queryFn: () => listTaskMessageSends(action.id),
  });

  const save = useMutation({
    mutationFn: (next: TaskMessageConfig) => {
      sentRef.current = JSON.stringify(serializeMessageConfig(next));
      return updateMessageConfig(action.id, serializeMessageConfig(next));
    },
    onSuccess: (_data, next) => {
      // 저장하는 사이 더 고쳤으면 아직 «바뀐 것이 있다»로 둔다
      setDraft((current) => {
        if (JSON.stringify(serializeMessageConfig(current)) === JSON.stringify(serializeMessageConfig(next))) setDirty(false);
        return current;
      });
      void queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
    },
  });
  // 자동 저장 — 입력을 멈추고 1.5초 뒤. 오류(본문 없음 등)가 있어도 쓰던 글은 남긴다(서버가 거부하면 그때 말한다)
  useEffect(() => {
    if (!dirty || canManage !== true) return;
    const timer = window.setTimeout(() => {
      save.mutate(draft, { onError: (e: Error) => toast.error(`자동 저장하지 못했습니다: ${e.message}`) });
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, canManage]);
  useRunnerUnsaved(dirty, '메시지를 아직 저장하지 못했습니다. 닫으면 마지막 몇 초간 쓴 내용이 사라질 수 있습니다.');
  const send = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync(draft);
      return sendTaskMessage(action.id);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['task-action', 'message-sends', action.id] });
      toast.success(
        `${result.notified}명에게 SPACEKIJUN 알림을 보냈습니다.` +
          (result.unlinked_names.length > 0 ? ` ${result.unlinked_names.join(', ')}님은 쿨메신저로 따로 보내 주세요.` : ''),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [request, setRequest] = useState('');
  // AI 초안이 덮어쓰기 전의 글 — 손으로 고친 글을 한 번에 잃지 않게 되돌리기를 준다
  const [beforeAi, setBeforeAi] = useState<{ title: string; body: string } | null>(null);
  const aiDraft = useMutation({
    mutationFn: () =>
      generateMessageDraft({
        workTitle: context?.workName,
        taskTitle: context?.task?.title,
        taskDescription: context?.task?.description,
        dueDate: context?.task?.due_date,
        request,
        audienceText: describeAudienceRule(draft.audience),
      }),
    onSuccess: (result) => {
      if (draft.body.trim()) setBeforeAi({ title: draft.title, body: draft.body });
      set({ title: result.title || draft.title, body: result.body });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [confirming, setConfirming] = useState(false);
  const error = validateMessageConfig(draft) ?? validateAudienceRule(draft.audience);
  // [알림 보내기]가 꺼진 이유 — 본문 오류는 한 번이라도 쓴 뒤에만(열자마자 경고가 뜨지 않게)
  const sendBlockedReason =
    (error && (bodyTouched || draft.body.trim() || error !== validateMessageConfig({ ...draft, body: 'x' }) ) ? error : null)
    ?? (preview.error && !summary ? '대상을 계산하지 못했습니다 — 잠시 뒤 다시 열거나 조건을 확인하세요.'
      : preview.isFetching && !summary ? '받는 사람 확인 중…'
      : !summary ? '받는 사람 조건을 정하면 보낼 수 있습니다.'
      : summary.people === 0 ? '받을 사람이 0명입니다.'
      : null);
  const lastSend = sends[0] ?? null;

  if (permLoading) {
    return <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중</p>;
  }
  if (!canManage) {
    return (
      <div className="space-y-2 py-10 text-center text-sm text-slate-500">
        <MessageSquareText className="mx-auto h-6 w-6 text-slate-300" />
        <p>이 할 일의 책임자가 보내는 메시지입니다. 받은 메시지는 알림에서 확인합니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-slate-500">{[context?.workName, context?.task?.title].filter(Boolean).join(' › ')}</p>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
          lastSend ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
        )}>
          {lastSend
            ? `보냄 ${sends.length}회 · 마지막 ${new Date(lastSend.sent_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
            : '아직 안 보냄'}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 메시지 ── */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <MessageSquareText className="h-3.5 w-3.5" />메시지
            <span className="ml-auto text-[11px] font-normal text-slate-500">
              {save.isPending ? '저장 중…' : dirty ? '저장 대기' : sentRef.current ? '저장됨' : ''}
            </span>
          </h3>
          <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="제목 (알림 제목 · 쿨메신저에서는 첫 줄)" aria-label="제목" />
          <Textarea
            value={draft.body}
            onChange={(e) => { set({ body: e.target.value }); setBodyTouched(true); }}
            rows={9}
            placeholder="보낼 내용"
            aria-label="본문"
            className="text-sm"
          />
          <p className={cn('text-right text-[11px] tabular-nums', draft.body.length > MESSAGE_BODY_MAX ? 'text-rose-600' : 'text-slate-400')}>
            {draft.body.length.toLocaleString()}/{MESSAGE_BODY_MAX.toLocaleString()}
          </p>

          {/* AI 초안 — 무엇을 알릴지 한 줄이면 할 일의 맥락(업무·할 일·마감)을 붙여 초안을 쓴다 */}
          <div className="space-y-1.5 rounded-lg border border-violet-100 bg-violet-50/40 p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-violet-800">
              <Sparkles className="h-3.5 w-3.5" />메시지 만들기 도움
            </div>
            <Textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={2}
              placeholder="무엇을 알릴지 적으세요 (예: 1차 정기시험 문항 점검을 10월 2일까지 입력 받기에 해 달라고)"
              className="bg-white text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">할 일 이름·설명·마감을 함께 참고합니다. 만든 초안은 고쳐서 보내세요.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 shrink-0 gap-1 border-violet-200 text-xs text-violet-700 hover:bg-violet-50 sm:h-8"
                disabled={!request.trim() || aiDraft.isPending}
                onClick={() => aiDraft.mutate()}
              >
                {aiDraft.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {draft.body.trim() ? '초안으로 바꾸기' : '초안 만들기'}
              </Button>
            </div>
            {beforeAi && (
              <button
                type="button"
                className="text-[11px] font-medium text-violet-700 underline-offset-2 hover:underline"
                onClick={() => { set(beforeAi); setBeforeAi(null); }}
              >
                초안 전의 글로 되돌리기
              </button>
            )}
          </div>
        </section>

        {/* ── 받는 사람 ── */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Users className="h-3.5 w-3.5" />받는 사람
          </h3>
          <AudienceRuleBuilder value={draft.audience} onChange={(audience) => set({ audience })} allowTaskScoped />
          <div className="rounded-lg border bg-white p-3">
            <AudiencePreview
              resolution={preview.data}
              loading={preview.isFetching}
              error={preview.error as Error | null}
              empty={draft.audience.include.length === 0}
            />
          </div>
        </section>
      </div>

      {/* ── 보내기 ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
            <Bell className="h-4 w-4" />SPACEKIJUN 알림
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            받는 사람의 알림함에 들어가고, 누르면 이 할 일로 갑니다. 보내기는 아래 [알림 보내기]로 — 보낸 기록이 남고 여러 번 보낼 수 있습니다.
          </p>
        </div>

        {/* 쿨메신저 — 자동 발송하지 않는다. 사람이 보내도록 필요한 것을 복사해 준다 */}
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <MessageSquareText className="h-4 w-4 text-sky-600" />쿨메신저로도 보내기
          </div>
          <ol className="list-decimal space-y-0.5 pl-4 text-xs leading-relaxed text-slate-600">
            <li>쿨메신저에서 새 쪽지(메시지)를 엽니다.</li>
            <li>[받는 사람 복사]한 이름으로 받는 사람을 찾아 넣습니다.</li>
            <li>[본문 복사]한 내용을 붙여 넣고 보냅니다.</li>
          </ol>
          {unlinkedNames.length > 0 && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              {unlinkedNames.join(', ')}님은 SPACEKIJUN 계정이 연결되지 않아 알림을 받지 못합니다 — 쿨메신저로 꼭 보내 주세요.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-11 gap-1 text-xs sm:h-8" disabled={!draft.body.trim()} onClick={() => void copy(coolMessengerText(draft), '본문')}>
              <Copy className="h-3.5 w-3.5" />본문 복사
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1 text-xs sm:h-8"
              disabled={linkedNames.length + unlinkedNames.length === 0}
              onClick={() => void copy(recipientNamesText([...linkedNames, ...unlinkedNames]), '받는 사람')}
            >
              <Copy className="h-3.5 w-3.5" />받는 사람 복사 ({new Set([...linkedNames, ...unlinkedNames]).size}명)
            </Button>
          </div>
        </div>
      </div>

      {/* ── 보낸 기록 ── */}
      {sends.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <History className="h-3.5 w-3.5" />보낸 기록 {sends.length}
          </h3>
          <ul className="divide-y rounded-xl border bg-white">
            {sends.map((s) => (
              <li key={s.id}>
                <details className="group px-3 py-2">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-slate-800">{s.title}</span>
                    <span className="text-slate-500">{new Date(s.sent_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {s.sender_name && <span className="text-slate-500">· {s.sender_name}</span>}
                    <span className="ml-auto text-slate-500">{s.recipient_names.length}명{s.unlinked_names.length > 0 && ` (+미연결 ${s.unlinked_names.length})`} · 펼치기</span>
                  </summary>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[11px] text-slate-500 group-open:line-clamp-none">{s.body}</p>
                  <div className="mt-1.5 hidden space-y-1 text-[11px] text-slate-600 group-open:block">
                    <div>받은 사람 <NamePreview names={s.recipient_names} /></div>
                    {s.unlinked_names.length > 0 && <div className="text-amber-800">못 받은 사람(계정 미연결) <NamePreview names={s.unlinked_names} /></div>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-white/95 py-3 backdrop-blur">
        {sendBlockedReason && <span className="mr-auto text-xs text-amber-700">{sendBlockedReason}</span>}
        <Button
          size="sm"
          className="h-11 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700 sm:h-9"
          disabled={Boolean(sendBlockedReason) || Boolean(error) || send.isPending}
          onClick={() => setConfirming(true)}
        >
          <Send className="h-3.5 w-3.5" />{lastSend ? '알림 다시 보내기' : '알림 보내기'}
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lastSend ? `다시 보낼까요? — ${summary?.people ?? 0}명` : `${summary?.people ?? 0}명에게 알림을 보낼까요?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-sm">
                {lastSend && (
                  <p className="font-medium text-amber-800">
                    이미 {sends.length}번 보냈습니다(마지막 {new Date(lastSend.sent_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}). 같은 사람에게 또 갑니다.
                  </p>
                )}
                <p>「{draft.title.trim() || context?.task?.title || '메시지'}」가 받는 사람의 SPACEKIJUN 알림함에 들어갑니다. 보낸 알림은 되돌릴 수 없습니다.</p>
                {linkedNames.length > 0 && <div className="text-xs text-slate-600">받는 사람 <NamePreview names={linkedNames} /></div>}
                {unlinkedNames.length > 0 && <p className="text-xs text-amber-800">계정이 연결되지 않은 {unlinkedNames.length}명은 받지 못하니 쿨메신저로 보내 주세요.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={send.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              disabled={send.isPending}
              onClick={(e) => {
                e.preventDefault(); // 실패하면 창이 남아 있어야 한다
                send.mutate(undefined, { onSuccess: () => setConfirming(false) });
              }}
            >
              {send.isPending ? '보내는 중…' : '보내기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
