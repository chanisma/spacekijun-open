/**
 * 내 PC 의 에이전트 채팅방 부품 — 모바일 «에이전트» 탭(pages/AgentsPage.tsx)과 웹 /agents(pages/Agents.tsx)가 같이 쓴다
 * (2026-11-11 «모바일 앱의 에이전트 기능을 일반 웹에도 적용»). 방 묶기·보내기 규칙은 data/agents.ts 한 곳.
 * ⚠️ 모바일 묶음에 들어간다 — 본 앱 틀(Layout·shadcn 부품)을 들이지 말 것.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Bot, ChevronRight, Copy, Laptop, Send } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  AGENTS_QUERY_KEY, AGENT_MESSAGE_LIMIT, CRON_TEXT, STATUS_TEXT, markRoomSeen, roomState, roomUnread, sendToAgent,
  type AgentMessage, type AgentOverview, type AgentReply, type AgentRoom,
} from '../data/agents';

const time = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const clock = (value: string) => new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const day = (value: string) => new Date(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

/** 열린 대화 · 끝난 대화 두 묶음(빈 상태 안내 포함) */
export function RoomSections({ overview, rooms, onOpen, activeKey }: {
  overview: AgentOverview | undefined; rooms: AgentRoom[]; onOpen: (key: string) => void; activeKey?: string | null;
}) {
  const pcs = overview?.pcs ?? [];
  const live = rooms.filter((item) => item.state !== 'ended');
  const ended = rooms.filter((item) => item.state === 'ended');
  return (
    <>
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold text-slate-500">열린 대화</h2>
        {!pcs.length && (
          <div className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
            켜져 있는 데스크가 없습니다. PC 의 스페이스기전 데스크에서 <b>에이전트 터미널</b>을 열고 위쪽 <b>휴대폰</b> 스위치를 켜 두면 여기에 보입니다.</div>
        )}
        {pcs.length > 0 && !live.length && (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
            결과를 돌려보낼 수 있는 에이전트가 없습니다. «에이전트끼리 보기»를 켜고 연 에이전트만 보입니다.</p>
        )}
        {live.length > 0 && <RoomList rooms={live} onOpen={onOpen} activeKey={activeKey} />}
      </section>
      {ended.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold text-slate-500">끝난 대화 <span className="font-normal">· 7일 보관 · 읽기만</span></h2>
          <RoomList rooms={ended} onOpen={onOpen} activeKey={activeKey} />
        </section>
      )}
    </>
  );
}

export function RoomList({ rooms, onOpen, activeKey }: { rooms: AgentRoom[]; onOpen: (key: string) => void; activeKey?: string | null }) {
  return (
    <div className="divide-y overflow-hidden rounded-2xl bg-white shadow-sm">
      {rooms.map((room) => {
        const last = room.messages[room.messages.length - 1];
        const lastReply = last?.replies[last.replies.length - 1];
        const preview = lastReply?.body ?? (last ? (last.kind === 'cron' ? `⏰ ${last.title ?? '예약'}` : `나: ${last.body}`) : '');
        const unread = roomUnread(room);
        return (
          <button key={room.key} onClick={() => onOpen(room.key)}
                  className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-slate-50', room.state === 'ended' && 'opacity-70',
                                activeKey === room.key && 'bg-blue-50')}>
            <span className={cn('relative grid h-9 w-9 shrink-0 place-items-center rounded-full',
                                room.state === 'live' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400')}>
              <Bot className="h-5 w-5" />
              {room.state === 'live' && room.status === 'working' && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-white bg-emerald-500" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-slate-900">{room.title}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{room.pcLabel}</span>
                {room.lastAt && <span className="ml-auto shrink-0 text-[11px] text-slate-400">{time(room.lastAt)}</span>}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{preview || roomState(room)}</span>
                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="새 답" />}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        );
      })}
    </div>
  );
}

/** 방 머리의 둘째 줄 — PC · 이름 · 도구 · 상태 */
export function RoomSubtitle({ room }: { room: AgentRoom }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-slate-500">
      <Laptop className="h-3 w-3" />{room.pcLabel} · {room.agent}{room.tool ? ` · ${room.tool}` : ''} ·{' '}
      <span className={cn(room.state === 'live' ? (room.status === 'working' ? 'text-emerald-600' : 'text-slate-600') : 'text-rose-500')}>
        {roomState(room)}
      </span>
    </div>
  );
}

type Item =
  | { type: 'mine'; at: string; message: AgentMessage }
  | { type: 'cron'; at: string; message: AgentMessage }
  | { type: 'reply'; at: string; reply: AgentReply; message: AgentMessage; quote: boolean };

/** 시간 순으로 편다 — 답이 다른 메시지 뒤에 오면 무엇에 대한 답인지 인용을 붙인다 */
function flatten(messages: AgentMessage[]): Item[] {
  const items: Item[] = [];
  for (const message of messages) {
    items.push({ type: message.kind === 'cron' ? 'cron' : 'mine', at: message.created_at, message });
    for (const reply of message.replies) items.push({ type: 'reply', at: reply.created_at, reply, message, quote: false });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  items.forEach((item, index) => {
    if (item.type !== 'reply') return;
    const before = items[index - 1];
    item.quote = !before || before.message.id !== item.message.id;
  });
  return items;
}

/** 방의 주고받은 메시지 — 스스로 스크롤하는 칸(부모가 높이를 정한다). 열면 읽음으로 적는다 */
export function ChatMessages({ room }: { room: AgentRoom }) {
  const items = useMemo(() => flatten(room.messages), [room.messages]);
  const scroller = useRef<HTMLDivElement>(null);
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('복사했습니다'), () => undefined);
  const last = room.messages[room.messages.length - 1];
  const waiting = room.state === 'live' && last?.kind !== 'cron' && last?.status === 'delivered' && !last.replies.length;

  useEffect(() => { markRoomSeen(room); }, [room, room.lastAt]);
  // 이 칸만 맨 아래로 — scrollIntoView 는 웹에서 페이지 전체까지 끌어내린다
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, waiting, room.key]);

  return (
    <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
      {!items.length && (
        <p className="py-10 text-center text-sm text-slate-500">
          {room.state === 'live' ? '이 에이전트에게 맡길 일을 보내 보세요. 끝나면 결과가 여기로 돌아옵니다.' : '주고받은 메시지가 없습니다.'}
        </p>
      )}
      {items.map((item, index) => {
        const prev = items[index - 1];
        const divider = !prev || day(prev.at) !== day(item.at);
        return (
          <div key={item.type === 'reply' ? item.reply.id : item.message.id}>
            {divider && <div className="my-2 text-center text-[11px] text-slate-400">{day(item.at)}</div>}
            {item.type === 'mine' && <MineBubble message={item.message} />}
            {item.type === 'cron' && <CronCard message={item.message} />}
            {item.type === 'reply' && (
              <div className="flex justify-start">
                <div className="max-w-[85%] space-y-1">
                  {item.quote && (
                    <p className="line-clamp-1 border-l-2 border-slate-300 pl-2 text-[11px] text-slate-400">
                      ↪ {item.message.kind === 'cron' ? `예약 «${item.message.title ?? ''}»` : item.message.body}
                    </p>
                  )}
                  <div className="rounded-2xl rounded-tl-md bg-white px-3 py-2 shadow-sm">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{item.reply.body}</p>
                  </div>
                  <div className="flex items-center gap-2 pl-1 text-[10px] text-slate-400">
                    {clock(item.reply.created_at)}
                    <button onClick={() => copy(item.reply.body)} className="p-0.5" aria-label="복사"><Copy className="h-3 w-3" /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {waiting && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-tl-md bg-white px-3 py-2 text-xs text-slate-500 shadow-sm">
            {room.status === 'waiting-for-user-choice' ? 'PC 에서 선택을 기다리는 중 — PC 에서 답해 주세요' : '일하는 중…'}
          </div>
        </div>
      )}
    </div>
  );
}

function MineBubble({ message }: { message: AgentMessage }) {
  const failed = message.status === 'refused' || message.status === 'expired';
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-1">
        <div className={cn('rounded-2xl rounded-tr-md px-3 py-2 text-white', failed ? 'bg-slate-400' : 'bg-blue-600')}>
          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        </div>
        <p className={cn('pr-1 text-right text-[10px]', failed ? 'text-rose-600' : 'text-slate-400')}>
          {message.status !== 'delivered' || failed ? `${STATUS_TEXT[message.status]}${message.note ? ` — ${message.note}` : ''} · ` : ''}
          {clock(message.created_at)}
        </p>
      </div>
    </div>
  );
}

function CronCard({ message }: { message: AgentMessage }) {
  const bad = message.result_status && message.result_status !== 'done';
  return (
    <div className="mx-auto max-w-[90%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="flex items-center gap-1.5 font-semibold">
        <AlarmClock className="h-3.5 w-3.5" />예약 · {message.title ?? ''}
        {message.result_status && (
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', bad ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700')}>
            {CRON_TEXT[message.result_status] ?? message.result_status}
          </span>
        )}
        {message.late && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px]">늦게 실행</span>}
        <span className="ml-auto font-normal text-amber-700">{clock(message.created_at)}</span>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-amber-800">{message.body}</p>
    </div>
  );
}

/** 방 아래 — 열린 방은 입력칸, 아니면 왜 못 보내는지와 지금 대화로 가기. safeArea = 휴대폰 아래 여백 */
export function RoomFooter({ room, onOpen, safeArea = true }: { room: AgentRoom; onOpen: (key: string) => void; safeArea?: boolean }) {
  if (room.state === 'live') return <Composer room={room} safeArea={safeArea} />;
  return (
    <div className={cn('space-y-2 border-t bg-white p-3 text-center text-xs text-slate-500', safeArea && 'pb-[calc(env(safe-area-inset-bottom)+12px)]')}>
      {room.state === 'offline'
        ? <p>PC 가 연결돼 있지 않습니다. 데스크의 에이전트 터미널에서 «휴대폰» 스위치가 켜져 있는지 확인하세요.</p>
        : <p>끝난 대화입니다 — 이 에이전트 칸이 닫혔거나 새 대화로 바뀌었어요. 에이전트는 이 내용을 기억하지 못합니다.</p>}
      {room.successor && (
        <button onClick={() => onOpen(room.successor!)}
                className="w-full rounded-xl border py-2 text-xs font-semibold text-blue-600 active:bg-slate-50">
          {room.agent} 의 지금 대화로 가기
        </button>
      )}
    </div>
  );
}

function Composer({ room, safeArea }: { room: AgentRoom; safeArea: boolean }) {
  const client = useQueryClient();
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () => sendToAgent(room.device, room.agent, text, room.thread),
    onSuccess: () => { setText(''); void client.invalidateQueries({ queryKey: AGENTS_QUERY_KEY }); },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className={cn('border-t bg-white p-2', safeArea && 'pb-[calc(env(safe-area-inset-bottom)+8px)]')}>
      <div className="flex items-end gap-2">
        <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={AGENT_MESSAGE_LIMIT}
                  rows={Math.min(5, Math.max(1, text.split('\n').length))}
                  placeholder="에이전트에게 맡길 일"
                  onKeyDown={(event) => {
                    // Ctrl/⌘+Enter = 보내기(키보드가 있는 웹) — 그냥 Enter 는 줄바꿈
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && text.trim() && !send.isPending) {
                      event.preventDefault(); send.mutate();
                    }
                  }}
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        <button onClick={() => send.mutate()} disabled={send.isPending || !text.trim()} aria-label="보내기"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 px-1 text-[10px] text-slate-400">PC 의 데스크가 묻지 않고 에이전트에게 넣습니다. 지우기·보내기 같은 일은 PC 에서 확인하세요.</p>
    </div>
  );
}
