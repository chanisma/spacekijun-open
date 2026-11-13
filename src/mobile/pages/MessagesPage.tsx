import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, PenSquare, Search, Send, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { MobileLoading } from '../MobileShell';
import {
  IMAGE_LIMIT, MESSAGE_LIMIT, decideRequest, directory, endSession, loadConversations, loadImage, loadSessions, markRead, sendMessage, shrinkPhoto,
  type Conversation, type DeskMessage, type OutgoingImage, type Person, type SessionStatus,
} from '../data/deskMessages';

const time = (value: string) => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * 데스크 쪽지 — 학생과 주고받은 쪽지를 사람마다 묶어 보인다. 데스크(독의 쪽지)와 같은 서버 기록이라 어디서 읽어도 같다.
 * 대화를 열면 읽음으로, 답장은 마지막 받은 쪽지에 대한 답장으로 보낸다(학생 쪽에 인용이 붙는다).
 */
export default function MessagesPage() {
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['m-messages'], queryFn: loadConversations, refetchInterval: 20 * 1000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [newTo, setNewTo] = useState<Person | null>(null);
  const [picking, setPicking] = useState(false);
  const { data: session } = useQuery({ queryKey: ['m-message-sessions'], queryFn: loadSessions, refetchInterval: 20 * 1000 });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['m-messages'] });
    void client.invalidateQueries({ queryKey: ['m-unread'] });
    void client.invalidateQueries({ queryKey: ['m-message-sessions'] });
  };
  // 상태를 못 읽으면 막지 않는다 — 막는 것은 서버다
  const teacherStatus = (id: string): SessionStatus => (session?.role === 'teacher' ? session.sessions[id] ?? 'none' : 'active');

  if (picking) return <PersonPicker onPick={(person) => { setPicking(false); setNewTo(person); setOpenId(person.id); }} onClose={() => setPicking(false)} />;
  const thread = data?.find((item) => item.id === openId)
    ?? (openId && newTo ? { id: newTo.id, label: personLabel(newTo), messages: [], unread: 0, last: '' } : null);
  if (thread) return <Thread thread={thread} status={teacherStatus(thread.id)} onBack={() => { setOpenId(null); setNewTo(null); refresh(); }} onSent={refresh} />;
  if (isLoading) return <MobileLoading label="쪽지를 불러오는 중…" />;
  if (error) return <p className="rounded-2xl bg-white p-5 text-center text-sm text-rose-600 shadow-sm">{(error as Error).message}</p>;

  return (
    <div className="space-y-2">
      {!data?.length ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm">주고받은 쪽지가 없습니다.</p>
      ) : data.map((item) => {
        const last = item.messages.at(-1);
        return (
          <button key={item.id} onClick={() => setOpenId(item.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">{item.label.slice(-2)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-slate-900">{item.label}</span>
                {teacherStatus(item.id) === 'pending' && <span className="shrink-0 rounded-full bg-blue-50 px-1.5 text-[10px] font-bold leading-4 text-blue-600">허락 요청</span>}
                <span className="shrink-0 text-[10px] text-slate-400">{item.last ? time(item.last) : ''}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{last ? `${last.mine ? '나: ' : ''}${last.photoOnly ? '사진' : last.body}` : ''}</span>
            </span>
            {item.unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-5 text-white">{item.unread}</span>}
          </button>
        );
      })}
      <button onClick={() => setPicking(true)} aria-label="새 쪽지"
              className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-4 z-10 rounded-full bg-blue-600 p-4 text-white shadow-lg">
        <PenSquare className="h-6 w-6" />
      </button>
    </div>
  );
}

const personLabel = (person: Person) =>
  person.grade ? `${person.grade}-${person.class ?? ''} ${person.number ?? ''}번 ${person.name}`.replace(/\s+/g, ' ') : person.name;

function Thread({ thread, status, onBack, onSent }: { thread: Conversation; status: SessionStatus; onBack: () => void; onSent: () => void }) {
  const [text, setText] = useState('');
  const [pictures, setPictures] = useState<OutgoingImage[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const lastReceived = [...thread.messages].reverse().find((m) => !m.mine && m.kind !== 'session_event');
  const decide = useMutation({
    mutationFn: (approve: boolean) => decideRequest(thread.id, approve),
    onSuccess: (_, approve) => { onSent(); toast.success(approve ? '허락했습니다' : '거절했습니다'); },
    onError: (error: Error) => toast.error(error.message),
  });
  const finish = useMutation({
    mutationFn: () => endSession(thread.id),
    onSuccess: () => { onSent(); toast.success('대화를 종료했습니다'); },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    const unread = thread.messages.filter((m) => !m.mine && !m.read).map((m) => m.id);
    if (unread.length) markRead(unread).then(onSent).catch(() => undefined);
    end.current?.scrollIntoView();
    // 대화를 열 때 한 번만 — 새 쪽지가 오면 목록이 다시 읽어 온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, thread.messages.length]);

  const send = useMutation({
    mutationFn: () => sendMessage(thread.id, text, lastReceived?.id ?? null, pictures),
    onSuccess: () => { setText(''); setPictures([]); onSent(); toast.success('보냈습니다'); },
    onError: (error: Error) => toast.error(error.message),
  });

  const attach = async (files: FileList | null) => {
    const picked = [...(files ?? [])].slice(0, IMAGE_LIMIT - pictures.length);
    try {
      const shrunk = await Promise.all(picked.map(shrinkPhoto));
      setPictures((before) => [...before, ...shrunk].slice(0, IMAGE_LIMIT));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="-mx-3 -mt-3 flex min-h-[calc(100dvh-140px)] flex-col">
      <div className="sticky top-[calc(env(safe-area-inset-top)+52px)] z-10 flex items-center gap-2 border-b bg-white px-2 py-2">
        <button onClick={onBack} className="rounded-full p-2" aria-label="목록"><ArrowLeft className="h-5 w-5" /></button>
        <span className="min-w-0 flex-1 truncate font-semibold">{thread.label}</span>
        {status === 'active' && thread.messages.length > 0 && (
          <button disabled={finish.isPending} className="shrink-0 rounded-full border px-3 py-1 text-xs text-slate-600 disabled:opacity-40"
                  onClick={() => { if (window.confirm('대화를 종료할까요? 학생은 다시 허락을 구해야 메시지를 보낼 수 있습니다.')) finish.mutate(); }}>대화 종료</button>
        )}
      </div>
      <div className="flex-1 space-y-2 px-3 py-3">
        {thread.messages.map((message) => <Bubble key={message.id} message={message} />)}
        <div ref={end} />
      </div>
      {status === 'pending' ? (
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+64px)] flex items-center gap-2 border-t bg-blue-50 p-3 text-xs text-slate-700">
        <span className="min-w-0 flex-1">이 학생이 메시지를 보내도 되는지 묻고 있습니다.</span>
        <button disabled={decide.isPending} onClick={() => decide.mutate(true)} className="shrink-0 rounded-full bg-blue-600 px-4 py-1.5 font-semibold text-white disabled:opacity-40">허락</button>
        <button disabled={decide.isPending} onClick={() => decide.mutate(false)} className="shrink-0 rounded-full border bg-white px-4 py-1.5 font-semibold text-slate-700 disabled:opacity-40">거절</button>
      </div>
      ) : (
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+64px)] border-t bg-white p-2">
        {(status === 'ended' || status === 'declined') && <p className="mb-2 text-xs text-slate-500">{status === 'ended' ? '종료한 대화입니다.' : '거절한 요청입니다.'} 쪽지를 보내면 대화가 다시 열립니다.</p>}
        {pictures.length > 0 && (
          <div className="mb-2 flex gap-2">
            {pictures.map((picture, index) => (
              <span key={index} className="relative">
                <img src={`data:${picture.mime};base64,${picture.data}`} alt="" className="h-14 w-14 rounded-lg object-cover" />
                <button className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5 text-white" aria-label="빼기"
                        onClick={() => setPictures(pictures.filter((_, at) => at !== index))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button onClick={() => file.current?.click()} disabled={pictures.length >= IMAGE_LIMIT} className="rounded-full p-2 text-slate-500 disabled:opacity-40" aria-label="사진">
            <ImagePlus className="h-5 w-5" />
          </button>
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(event) => { void attach(event.target.files); event.target.value = ''; }} />
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={MESSAGE_LIMIT} rows={1}
                    placeholder={lastReceived ? '답장 쓰기' : '쪽지 쓰기'}
                    className="max-h-32 flex-1 resize-none rounded-2xl border bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400" />
          <button onClick={() => send.mutate()} disabled={send.isPending || (!text.trim() && !pictures.length)}
                  className="rounded-full bg-blue-600 p-2.5 text-white disabled:opacity-40" aria-label="보내기"><Send className="h-4 w-4" /></button>
        </div>
      </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: DeskMessage }) {
  if (message.kind === 'session_event') {
    return <p className="text-center text-[11px] text-slate-500">{message.body} · {time(message.time)}</p>;
  }
  return (
    <div className={cn('flex flex-col', message.mine ? 'items-end' : 'items-start')}>
      {message.quote && <div className="mb-0.5 max-w-[80%] truncate rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-500">↪ {message.quote}</div>}
      <div className={cn('max-w-[80%] space-y-1.5 rounded-2xl px-3 py-2 text-sm', message.mine ? 'bg-blue-600 text-white' : 'bg-white text-slate-900 shadow-sm')}>
        {message.kind === 'session_request' && <div className="text-[11px] font-bold opacity-80">메시지 요청</div>}
        {message.images.map((image) => <Photo key={image.id} id={image.id} />)}
        {!message.photoOnly && message.body && <div className="whitespace-pre-wrap break-words">{message.body}</div>}
      </div>
      <span className="mt-0.5 text-[10px] text-slate-400">{time(message.time)}</span>
    </div>
  );
}

function Photo({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['m-photo', id], queryFn: () => loadImage(id), staleTime: Infinity });
  if (isLoading) return <div className="h-32 w-40 animate-pulse rounded-xl bg-slate-200" />;
  if (!data) return <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">사진 보관 기간(7일)이 지났습니다</div>;
  return <a href={data} target="_blank" rel="noreferrer"><img src={data} alt="" className="max-h-64 rounded-xl" /></a>;
}

function PersonPicker({ onPick, onClose }: { onPick: (person: Person) => void; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['m-directory'], queryFn: directory, staleTime: 30 * 60 * 1000 });
  const [query, setQuery] = useState('');
  const found = useMemo(() => {
    const words = query.trim().split(/\s+/).filter(Boolean);
    return (data?.people ?? []).filter((person) => words.every((word) => personLabel(person).includes(word))).slice(0, 80);
  }, [data, query]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="rounded-full p-2" aria-label="닫기"><ArrowLeft className="h-5 w-5" /></button>
        <label className="flex flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 1-3 처럼 학년-반"
                 className="flex-1 bg-transparent text-sm outline-none" />
        </label>
      </div>
      {isLoading ? <MobileLoading label="명단을 불러오는 중…" /> : error ? (
        <p className="p-4 text-center text-sm text-rose-600">{(error as Error).message}</p>
      ) : found.map((person) => (
        <button key={person.id} onClick={() => onPick(person)} className="block w-full rounded-xl bg-white px-3 py-2.5 text-left text-sm shadow-sm">
          {personLabel(person)}
        </button>
      ))}
    </div>
  );
}
