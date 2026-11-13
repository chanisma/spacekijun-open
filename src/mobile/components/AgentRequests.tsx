/**
 * 받은 에이전트 작업 요청 — 카드 목록과 «에이전트에게 맡기기»(2026-11-11 요청).
 * 모바일 «에이전트» 탭(via 'phone')과 웹 /agents(via 'web')가 같이 쓴다. 데이터 = data/agentRequests.ts.
 * 맡기기 = 지금 열린 방(state 'live') 하나를 고르고 → 보낼 곳을 다시 보여 확인 → agent_request_send_to_agent
 *   (맡길 말은 서버가 만든다 — desk_agent_phone_send 와 같은 길이라 PC 데스크가 묻지 않고 그 에이전트 입력칸에 넣는다).
 * 모달 없이 카드 안에서 펼친다 — 모바일 묶음에 본 앱 모달 부품을 들이지 않기 위해서다.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CalendarDays, ChevronDown, ChevronUp, Copy, FileText, Link2, Loader2, Send, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { AGENTS_QUERY_KEY, roomState, type AgentRoom } from '../data/agents';
import {
  AGENT_REQUESTS_KEY, REF_KIND_TEXT, VIA_TEXT, agentRequestInbox, agentRequestPrompt, agentRequestSendToAgent,
  isClosedRequest, isNotDeployed, type AgentRequest, type AgentRequestStatus,
} from '../data/agentRequests';

const STATUS_TONE: Record<AgentRequestStatus, string> = {
  sent: 'bg-slate-100 text-slate-700',
  handed: 'bg-blue-50 text-blue-700',
  done: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-rose-50 text-rose-700',
};

/**
 * 받은 작업 요청 칸. 서버에 함수가 아직 없으면(마이그레이션 전) 아무것도 그리지 않는다.
 * focusId = 알림에서 들어온 요청(?request=) — 펼쳐 보이고 그 카드로 스크롤한다.
 */
export function AgentRequestSection({ rooms, via, focusId, onSent, className, hideWhenEmpty = true }: {
  rooms: AgentRoom[]; via: 'phone' | 'web'; focusId?: string | null;
  /** 진행 중인 요청이 없으면 칸을 통째로 비운다(모바일) — 웹은 자리를 지킨다 */
  hideWhenEmpty?: boolean;
  /** 보낸 뒤 — 그 방을 열어 넘어간 말을 보여 주는 데 쓴다 */
  onSent?: (roomKey: string) => void;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: [...AGENT_REQUESTS_KEY, all ? 'all' : 'open'],
    queryFn: () => agentRequestInbox(all ? 'all' : 'open', 50),
    refetchInterval: 30 * 1000,
    retry: (count, failed) => !isNotDeployed(failed) && count < 2,
  });
  // 알림에서 온 요청이 이미 끝났으면 진행 중 목록에 없다 — 끝난 것까지 읽어 그 카드를 보인다
  useEffect(() => {
    if (focusId && data && !all && !data.some((item) => item.id === focusId)) setAll(true);
  }, [focusId, data, all]);
  if (error && isNotDeployed(error)) return null;
  const list = data ?? [];
  const waiting = list.filter((item) => item.status === 'sent').length;
  if (hideWhenEmpty && !isLoading && !error && !list.length && !all && !focusId) return null;

  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold text-slate-500">
          받은 작업 요청{waiting > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{waiting}</span>}
        </h2>
        <button onClick={() => setAll((value) => !value)} className="px-1 py-1 text-xs text-slate-500">
          {all ? '진행 중인 것만' : '끝난 것도 보기'}
        </button>
      </div>
      {isLoading && <p className="flex items-center gap-2 rounded-2xl bg-white p-4 text-xs text-slate-500 shadow-sm"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중…</p>}
      {error && <p className="rounded-2xl bg-white p-4 text-xs text-rose-600 shadow-sm">{(error as Error).message}</p>}
      {!isLoading && !error && !list.length && (
        <p className="rounded-2xl bg-white p-4 text-center text-xs text-slate-500 shadow-sm">
          {all ? '받은 작업 요청이 없습니다.' : '진행 중인 작업 요청이 없습니다.'}</p>
      )}
      {list.map((item) => (
        <AgentRequestCard key={item.id} request={item} rooms={rooms} via={via} focused={item.id === focusId} onSent={onSent} />
      ))}
    </section>
  );
}

function AgentRequestCard({ request, rooms, via, focused, onSent }: {
  request: AgentRequest; rooms: AgentRoom[]; via: 'phone' | 'web'; focused: boolean; onSent?: (roomKey: string) => void;
}) {
  const closed = isClosedRequest(request.status);
  const [expanded, setExpanded] = useState(focused || request.status === 'sent');
  const [showPrompt, setShowPrompt] = useState(false);
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<AgentRoom | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const client = useQueryClient();

  useEffect(() => {
    if (focused) card.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);

  const prompt = useQuery({
    queryKey: [...AGENT_REQUESTS_KEY, 'prompt', request.id],
    queryFn: () => agentRequestPrompt(request.id),
    enabled: showPrompt && !closed,
    staleTime: 60 * 1000,
  });

  const send = useMutation({
    mutationFn: (room: AgentRoom) => agentRequestSendToAgent(request.id, room, via),
    onSuccess: (result, room) => {
      toast.success(`${result.sent?.label ?? room.pcLabel} 의 ${room.title} 에게 맡겼습니다`);
      setPicking(false); setTarget(null);
      void client.invalidateQueries({ queryKey: AGENT_REQUESTS_KEY });
      void client.invalidateQueries({ queryKey: AGENTS_QUERY_KEY });
      onSent?.(room.key);
    },
    onError: (failed: Error) => toast.error(failed.message),
  });

  const live = rooms.filter((room) => room.state === 'live');
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('복사했습니다'), () => undefined);
  const handed = request.handed_to;

  return (
    <div ref={card} className={cn('rounded-2xl bg-white p-3 shadow-sm', focused && 'ring-2 ring-blue-300', closed && 'opacity-80')}>
      <button onClick={() => setExpanded((value) => !value)} className="block w-full text-left">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600"><Bot className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{request.title}</span>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_TONE[request.status])}>{request.status_text}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
              <span>{request.from} 선생님</span>
              <span>{request.at}</span>
              {request.due_date && <span className="flex items-center gap-0.5 text-amber-700"><CalendarDays className="h-3 w-3" />기한 {request.due_date}</span>}
            </div>
          </div>
          {expanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-slate-300" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-300" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-10">
          <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{request.body}</p>
          {request.steps.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500">수행 안내</div>
              <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-xs text-slate-700">
                {request.steps.map((step, index) => <li key={index} className="break-words">{step}</li>)}
              </ol>
            </div>
          )}
          {request.refs.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500">연결 항목</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {request.refs.map((ref, index) => (
                  <span key={`${ref.kind}-${ref.id ?? index}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                    <Link2 className="h-3 w-3 shrink-0" />
                    <span className="shrink-0 text-slate-500">{REF_KIND_TEXT[ref.kind] ?? ref.kind}</span>
                    <span className="truncate">{ref.title}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {handed && (handed.label || handed.agent) && (
            <p className="text-[11px] text-blue-700">
              넘김: {[handed.label, handed.agent].filter(Boolean).join(' · ')}{handed.via ? ` (${VIA_TEXT[handed.via] ?? handed.via})` : ''}
            </p>
          )}
          {request.result && (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="text-[11px] font-semibold text-slate-500">결과{request.closed_at ? ` · ${request.closed_at}` : ''}</div>
              <p className="whitespace-pre-wrap break-words">{request.result}</p>
            </div>
          )}
          {closed && !request.result && request.closed_at && <p className="text-[11px] text-slate-500">{request.status_text} · {request.closed_at}</p>}

          {!closed && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => { setPicking((value) => !value); setTarget(null); }}
                      className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white active:bg-blue-700">
                <Send className="h-4 w-4" />{request.status === 'handed' ? '다른 에이전트에게 다시 맡기기' : '에이전트에게 맡기기'}
              </button>
              <button onClick={() => setShowPrompt((value) => !value)}
                      className="flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-sm text-slate-700 active:bg-slate-50">
                <FileText className="h-4 w-4" />{showPrompt ? '내용 닫기' : '내용 보기'}
              </button>
            </div>
          )}

          {showPrompt && !closed && (
            <div className="rounded-xl border bg-slate-50 p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>에이전트에게 넘어갈 말 그대로</span>
                {prompt.data && (
                  <button onClick={() => copy(prompt.data.prompt)} className="flex items-center gap-1 px-1 py-0.5"><Copy className="h-3 w-3" />복사</button>
                )}
              </div>
              {prompt.isLoading && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />불러오는 중…</p>}
              {prompt.error && <p className="text-xs text-rose-600">{(prompt.error as Error).message}</p>}
              {prompt.data && (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-slate-800">{prompt.data.prompt}</pre>
              )}
            </div>
          )}

          {picking && !closed && (
            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-2">
              {!target && (
                <>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>맡길 에이전트를 고르세요</span>
                    <button onClick={() => setPicking(false)} aria-label="닫기" className="p-1 text-slate-400"><X className="h-4 w-4" /></button>
                  </div>
                  {!live.length ? (
                    <p className="text-xs leading-relaxed text-slate-600">
                      지금 맡길 수 있는 에이전트가 없습니다. PC 의 스페이스기전 데스크에서 <b>에이전트 터미널</b> 위쪽 <b>휴대폰</b> 스위치를 켜고,
                      «에이전트끼리 보기»를 켠 채 에이전트를 하나 열어 두세요. 열리면 여기에 나옵니다.
                    </p>
                  ) : (
                    <div className="divide-y overflow-hidden rounded-xl bg-white">
                      {live.map((room) => (
                        <button key={room.key} onClick={() => setTarget(room)}
                                className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left active:bg-slate-50">
                          <Bot className="h-4 w-4 shrink-0 text-blue-600" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">{room.title}</span>
                            <span className="block truncate text-[11px] text-slate-500">{room.pcLabel} · {room.agent}{room.tool ? ` · ${room.tool}` : ''} · {roomState(room)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {target && (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-slate-700">
                    <b>{target.pcLabel}</b> 의 <b>{target.title}</b>({target.agent}) 에게 이 요청을 보냅니다.
                    PC 의 데스크가 묻지 않고 에이전트 입력칸에 넣습니다.{target.status === 'working' ? ' (이 에이전트는 지금 다른 일을 하는 중입니다)' : ''}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => send.mutate(target)} disabled={send.isPending}
                            className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50">
                      {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}보내기
                    </button>
                    <button onClick={() => setTarget(null)} disabled={send.isPending}
                            className="min-h-[40px] rounded-xl border bg-white px-4 text-sm text-slate-700 disabled:opacity-50">다시 고르기</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
