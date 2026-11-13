import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { InquiryConversationMessage } from '../services/inquiryDesignService';

interface InquiryConversationBoxProps {
  messages: InquiryConversationMessage[];
  // assistantTurnCount is how many assistant turns have already been produced.
  // Min 2 turns are required before End is offered. After 8+ assistant turns
  // the model itself proposes closure (`suggestEnd` from the server).
  assistantTurnCount: number;
  suggestEnd: boolean;
  sending: boolean;
  onSend: (userMessage: string) => void;
  onCancel: () => void;
  onFinish: () => void;
}

const MIN_TURNS_BEFORE_FINISH = 2;
// 하드 상한(입력창이 잠기는 지점). 서버는 8턴부터 코치가 마무리를 제안하게
// 하므로(openai-proxy `suggestEnd = turn >= 8`) 실제 대화는 대개 8턴 근처에서
// 끝나고, 남은 2턴은 학생이 더 파고들고 싶을 때의 여유다. **둘은 함께 움직여야
// 한다** — MAX_TURNS만 올리면 코치가 남은 턴 내내 종료만 반복 제안한다.
//
// 상한을 정한 것은 모델이 아니라 사람이다(2026-08-11 실측): 대화 1턴이 더하는
// 컨텍스트는 코치 답변이 max_tokens 220으로 묶여 있어 학생 답변까지 250자
// 남짓이라, 100턴을 해도 Solar Pro 4 컨텍스트의 6% 수준이다. 10턴은 학생이
// 질문 10개에 답해야 한다는 대화 피로 쪽에서 온 값이다.
const MAX_TURNS = 10;

export function InquiryConversationBox({
  messages,
  assistantTurnCount,
  suggestEnd,
  sending,
  onSend,
  onCancel,
  onFinish,
}: InquiryConversationBoxProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll to the latest message as it arrives. We watch on messages.length
  // (and sending, which flips the typing indicator) rather than the array
  // reference so we don't run for every parent re-render.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const canFinish = assistantTurnCount >= MIN_TURNS_BEFORE_FINISH;
  const reachedMax = assistantTurnCount >= MAX_TURNS;

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setDraft('');
  };

  return (
    <div className="space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
          <MessageSquare className="h-3.5 w-3.5" />
          대화로 방향 결정
          <span className="ml-1 rounded-full bg-brand-200 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-brand-900">
            {assistantTurnCount}/{MAX_TURNS} 턴
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-brand-400 transition duration-200 hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label="대화 취소"
          title="대화 취소 (입력 내용은 사라집니다)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="h-56 rounded border border-brand-200 bg-white">
        <div ref={scrollRef} className="space-y-2 px-3 py-2 text-xs">
          {messages.length === 0 && (
            <p className="py-6 text-center text-[11px] text-slate-400">
              메시지 입력으로 코치와의 대화를 시작하세요.
            </p>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'flex',
                message.role === 'assistant' ? 'justify-start' : 'justify-end'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-md px-2.5 py-1.5 leading-relaxed',
                  message.role === 'assistant'
                    ? 'bg-brand-100 text-brand-950'
                    : 'bg-slate-900 text-slate-50'
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-md bg-brand-100 px-2.5 py-1.5 text-brand-700">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-[11px]">코치 응답 작성 중…</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={
          reachedMax
            ? '대화 턴이 가득 찼습니다. "설계 시작"을 눌러주세요.'
            : '여기에 답을 적고 보내기 (⌘/Ctrl + Enter)'
        }
        className="min-h-16 resize-none text-sm"
        disabled={sending || reachedMax}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">
          {suggestEnd
            ? '코치가 마무리를 제안했어요.'
            : canFinish
              ? '원하면 지금 설계를 시작할 수 있어요.'
              : `최소 ${MIN_TURNS_BEFORE_FINISH}턴 진행 후 종료할 수 있습니다.`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSubmit}
            disabled={!draft.trim() || sending || reachedMax}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            보내기
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onFinish}
            disabled={!canFinish || sending}
            className={cn(
              suggestEnd || reachedMax
                ? 'bg-brand-600 hover:bg-brand-700'
                : ''
            )}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            설계 시작
          </Button>
        </div>
      </div>
    </div>
  );
}
