import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, PenLine, Quote, Reply, Send, UserRound, Users } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect, type SearchableSelectItem } from '@/components/ui/searchable-select';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useIsMobileModal } from '@/hooks/useIsMobileModal';
import {
  needsRecipientChoice,
  rememberKeyFor,
  resolveReplyTarget,
  type ReplyPerson,
  type ReplyTarget,
} from '@/lib/notificationReply';
import { readReplyMemory, rememberReplyChoice } from '@/lib/notificationReplyMemory';
import { fetchReplyRoster, sendNotificationReply } from '@/services/notificationReplyService';
import type { NotificationEvent } from '@/hooks/useNotifications';

const MAX_BODY = 2000;

interface NotificationReplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification: NotificationEvent;
  onSent?: () => void;
}

const typeLabel = (p: ReplyPerson) => (p.type === 'staff' ? '직원' : '선생님');

/** 받는 사람이 정해지지 않은 이유 — 사용자가 "왜 골라야 하는지"를 알아야 고를 수 있다 */
function choiceReasonText(target: ReplyTarget): string {
  const label = target.senderLabel ? `'${target.senderLabel}'` : '';
  switch (target.reason) {
    case 'duplicate':
      return `${label} 이름의 교직원이 ${target.candidates.length}명입니다. 받을 분을 고르세요.`;
    case 'partial':
      return `보낸 사람 표시 이름 ${label}과 정확히 같은 교직원이 없습니다. 아래 분이 맞는지 확인하고 고르세요.`;
    case 'unknown':
      return `${label}은(는) 교직원 명단에 없는 이름입니다(부서·외부 이름일 수 있습니다). 받을 분을 직접 고르세요.`;
    case 'batch':
      return '여러 쪽지를 묶은 알림이라 보낸 사람이 한 명으로 정해지지 않습니다. 답장할 분을 고르세요.';
    default:
      return '보낸 사람 정보가 없는 알림입니다. 받을 분을 직접 고르세요.';
  }
}

/**
 * 알림 [답장] — SPACEKIJUN 안의 교직원에게 알림으로 보낸다 (2026-09-22).
 *
 * 받는 사람은 `resolveReplyTarget` 이 정한다. **이름이 교직원 한 명과 정확히 일치할 때만**
 * 바로 특정하고, 그 밖(접두어 붙은 이름·부서명·묶음 알림·정보 없음)은 사용자가 고른다.
 * 확정된 경우에도 [다른 사람]으로 바꿀 수 있다 — 쿨메신저 쪽의 동명이인은 명단이 모른다.
 */
export function NotificationReplyDialog({
  open, onOpenChange, notification, onSent,
}: NotificationReplyDialogProps) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobileModal();

  const rosterQuery = useQuery({
    queryKey: ['notification-reply-roster'],
    queryFn: fetchReplyRoster,
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  const roster = rosterQuery.data;

  // 기억은 열 때마다 새로 읽는다 — 다른 알림에서 방금 고른 사람이 반영되도록
  const memory = useMemo(() => (open ? readReplyMemory() : {}), [open]);

  const target = useMemo(
    () => (roster ? resolveReplyTarget(notification, roster, memory) : null),
    [notification, roster, memory],
  );

  // 초기 선택은 **열린 직후 한 번만** — 명단이 다시 불러와질 때 사용자의 선택을 덮지 않는다
  useEffect(() => {
    if (!open) {
      setInitialized(false);
      return;
    }
    if (initialized || !target) return;
    setSelectedId(target.resolved?.id ?? target.remembered?.id ?? null);
    setChanging(false);
    setError(null);
    setInitialized(true);
  }, [open, target, initialized]);

  const selected: ReplyPerson | null = useMemo(() => {
    if (!selectedId) return null;
    return roster?.find((p) => p.id === selectedId)
      ?? (target?.resolved?.id === selectedId ? target.resolved : null);
  }, [selectedId, roster, target]);

  const choosing = !!target && (needsRecipientChoice(target) || changing);

  // 빠른 선택 칩 = 후보 + (후보에 없으면) 지난번 선택
  const chips = useMemo(() => {
    if (!target) return [] as Array<{ person: ReplyPerson; remembered: boolean }>;
    const list = target.candidates.map((person) => ({
      person, remembered: person.id === target.remembered?.id,
    }));
    if (target.remembered && !list.some((c) => c.person.id === target.remembered!.id)) {
      list.unshift({ person: target.remembered, remembered: true });
    }
    return list;
  }, [target]);

  const pickerItems: SearchableSelectItem[] = useMemo(
    () => (roster ?? []).map((p) => ({
      value: p.id,
      label: p.name,
      description: p.linked ? typeLabel(p) : `${typeLabel(p)} · SPACEKIJUN 미가입`,
    })),
    [roster],
  );

  const trimmed = body.trim();
  const canSend = !!selected && trimmed.length > 0 && trimmed.length <= MAX_BODY && !sending;

  const handleClose = (next: boolean) => {
    if (sending) return;
    onOpenChange(next);
  };

  const handleSend = async () => {
    if (!selected || !target || !canSend) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendNotificationReply({
        recipientResourceId: selected.id,
        body: trimmed,
        replyToNotificationId: notification.id,
      });

      // 직접 고른 경우에만 기억한다(확정 판정은 키가 null) — 같은 표시 이름이 다음에 오면 미리 선택된다
      const key = rememberKeyFor(target);
      if (key) rememberReplyChoice(key, selected.id);

      toast.success(`${result.recipientName || selected.name} 님께 답장을 보냈습니다`, {
        description: result.recipientLinked
          ? undefined
          : '아직 SPACEKIJUN 에 로그인한 적이 없는 분이라, 처음 로그인하면 보게 됩니다.',
      });
      // 원래 알림에 서버가 '답장함'·읽음을 기록했다 → 목록을 다시 읽는다
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setBody('');
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      console.error('알림 답장 발송 오류:', e);
      setError(e instanceof Error ? e.message : '답장을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSending(false);
    }
  };

  const originalSender = typeof notification.meta?.sender === 'string' ? notification.meta.sender : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* DialogContent 에 overflow 를 주지 않는다 — 이름 검색 드롭다운이 Content 안으로 포털되어 잘린다 */}
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          // 받는 사람이 이미 정해졌으면 할 일은 쓰는 것뿐이다 → 입력칸으로. 기본값(첫 버튼)은
          // [다른 사람]을 잡아 한 번 더 눌러야 했다. 휴대폰은 키보드가 모달을 가리므로 기본 동작.
          if (isMobile || !target?.resolved) return;
          e.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={Reply} />
            답장 보내기
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs text-slate-500">
            받는 분의 SPACEKIJUN 알림으로 전달됩니다.
            {notification.type === 'coolmessenger' && ' 쿨메신저로는 보내지 않습니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {/* 받는 사람 */}
          <div className="space-y-2">
            <SectionLabel icon={UserRound}>받는 사람</SectionLabel>

            {rosterQuery.isLoading && (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> 교직원 명단을 불러오는 중…
              </p>
            )}

            {rosterQuery.isError && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-sm text-rose-700">
                <span>교직원 명단을 불러오지 못했습니다.</span>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => rosterQuery.refetch()}>
                  다시 시도
                </Button>
              </div>
            )}

            {target && !choosing && target.resolved && (
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                  {target.resolved.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800" title={target.resolved.name}>
                    {target.resolved.name}
                    <span className="ml-1.5 text-xs font-normal text-slate-500">{typeLabel(target.resolved)}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {target.reason === 'reply'
                      ? '이 답장을 보낸 분'
                      : originalSender
                        ? `보낸 사람 '${originalSender}'과 이름이 같은 교직원`
                        : '보낸 사람과 이름이 같은 교직원'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-xs text-slate-600"
                  onClick={() => setChanging(true)}
                >
                  다른 사람
                </Button>
              </div>
            )}

            {target && choosing && (
              <div className="space-y-2.5">
                {changing ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>다른 받는 분을 고르세요.</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setChanging(false);
                        setSelectedId(target.resolved?.id ?? null);
                      }}
                    >
                      {target.resolved?.name}(으)로 되돌리기
                    </Button>
                  </div>
                ) : (
                  <p className="flex gap-1.5 rounded-lg bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-800">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-words">{choiceReasonText(target)}</span>
                  </p>
                )}

                {!changing && chips.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel icon={Users}>
                      {target.reason === 'batch' ? '이 알림의 보낸 사람' : '후보'}
                    </SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {chips.map(({ person, remembered }) => {
                        const active = person.id === selectedId;
                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => setSelectedId(active ? null : person.id)}
                            aria-pressed={active}
                            className={cn(
                              'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors sm:min-h-8 sm:text-xs',
                              active
                                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                            )}
                          >
                            <span className="font-medium">{person.name}</span>
                            <span className={active ? 'text-blue-500' : 'text-slate-400'}>{typeLabel(person)}</span>
                            {remembered && (
                              <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">지난번 선택</span>
                            )}
                            {!person.linked && (
                              <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">미가입</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!changing && target.unmatchedLabels.length > 0 && (
                  <p className="break-words text-xs text-slate-400">
                    명단에서 찾지 못한 이름: {target.unmatchedLabels.join(' · ')}
                  </p>
                )}

                <SearchableSelect
                  items={pickerItems}
                  selectedValue={selectedId ?? undefined}
                  onValueChange={(v) => setSelectedId(v ?? null)}
                  placeholder={chips.length > 0 ? '목록에 없으면 이름으로 찾기' : '교직원 이름으로 찾기'}
                  searchPlaceholder="이름 검색 (초성 가능)"
                  emptyText="일치하는 교직원이 없습니다."
                  pickerTitle="받는 사람 고르기"
                />
              </div>
            )}

            {selected && !selected.linked && (
              <p className="text-xs leading-relaxed text-amber-700">
                {selected.name} 님은 아직 SPACEKIJUN 에 로그인한 적이 없습니다. 답장은 저장되고,
                처음 로그인하면 보게 됩니다.
              </p>
            )}
          </div>

          {/* 원문 — 무엇에 답하는지 */}
          {notification.message && (
            <div className="space-y-1.5">
              <SectionLabel icon={Quote}>원문</SectionLabel>
              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {notification.message}
              </div>
            </div>
          )}

          {/* 답장 */}
          <div className="space-y-1.5">
            <SectionLabel
              icon={PenLine}
              trailing={
                <span className={cn('text-[11px]', trimmed.length > MAX_BODY ? 'text-rose-600' : 'text-slate-400')}>
                  {trimmed.length}/{MAX_BODY}
                </span>
              }
            >
              답장
            </SectionLabel>
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="답장 내용을 입력하세요"
              rows={5}
              disabled={sending}
            />
          </div>

          {error && (
            <p className="break-words rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={sending}
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="h-8 gap-1.5 bg-blue-600 px-3 text-xs hover:bg-blue-700"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {selected ? `${selected.name} 님께 보내기` : '보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
