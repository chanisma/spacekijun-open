import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyConversation, DailyState } from '../../../../supabase/functions/_shared/academyDaily';
import { continueDaily, fetchDailyHistory, fetchDailyState } from './dailyService';
import { CharacterPanel } from './CharacterPanel';
import { npcDetails } from './world';
import styles from './game.module.css';

export function DailyEncounter({ userId, initial, onClose, reduced }: { userId: string; initial: DailyState; onClose: () => void; reduced: boolean }) {
  const cache = useQueryClient();
  const key = ['academy-daily', userId];
  const today = useQuery({ queryKey: key, queryFn: fetchDailyState, initialData: initial, refetchInterval: 3000 });
  const history = useQuery({ queryKey: ['academy-daily-history', userId], queryFn: () => fetchDailyHistory(userId) });
  const [past, setPast] = useState<DailyConversation | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const lock = useRef(false);
  const alive = useRef(true);
  const end = useRef<HTMLDivElement>(null);
  const record = past ?? today.data.conversation;
  const npc = npcDetails[record?.npc ?? today.data.npc];
  const inFlight = record?.status === 'generating' && !!record.lease_until && new Date(record.lease_until).getTime() > clock;
  useEffect(() => { alive.current = true; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => { alive.current = false; clearInterval(timer); }; }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' }); }, [record?.turns.length, busy, reduced]);
  async function send(text: string | null) {
    if (past || lock.current || inFlight) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await continueDaily(today.data.day, record?.revision ?? 0, text);
      await cache.invalidateQueries({ queryKey: key });
      void cache.invalidateQueries({ queryKey: ['academy-daily-history', userId] });
      if (!alive.current) return;
      // A stale concurrent request returns the winning conversation; preserve an
      // unsent different draft so it can be submitted after the other turn finishes.
      const sentThisTurn = text && result.turns.slice(record?.turns.length ?? 0).some(t => t.role === 'user' && t.content === text);
      const resumedAnswer = !text && record?.pending_message === message && result.status === 'ready' && !result.pending_message;
      if (sentThisTurn || resumedAnswer) setMessage('');
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '다시 시도해 주세요.'); await cache.invalidateQueries({ queryKey: key }); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <CharacterPanel npc={record?.npc ?? today.data.npc} title="오늘의 만남" reduced={reduced} onClose={onClose} className={styles.dailyPanel}>
    <header className={styles.facilityHeader}><img src={`/images/academy-game/${npc.asset}.png`} alt={npc.name} /><div><span className={styles.kicker}>A MOMENT WITH YOU · {past?.day ?? today.data.day}</span><h2>{npc.name}이 리아에게</h2><p>하루에 한 번, 너의 생각을 듣고 싶어.</p></div></header>
    <label>함께 나눈 이야기<select aria-label="날짜별 대화 기록" disabled={busy || !!inFlight} value={past?.day ?? ''} onChange={e => { setPast(history.data?.find(r => r.day === e.target.value) ?? null); setError(''); }}><option value="">오늘의 만남</option>{history.data?.filter(r => r.day !== today.data.day).map(r => <option key={r.day} value={r.day}>{r.day} · {npcDetails[r.npc].name}</option>)}</select></label>
    {history.isError && <p role="alert">지난 대화를 가져오지 못했어요. <button onClick={() => void history.refetch()}>다시 읽기</button></p>}
    <div className={styles.chatLog} role="log" aria-label="오늘의 만남 대화 기록" aria-live="polite">
      {!record && <p className={styles.chatWelcome}>“리아, 잠깐 시간 있어? 오늘은 네 생각이 궁금해.”</p>}
      {record?.turns.map((turn, i) => <div className={styles.chatBubble} data-speaker={turn.role} data-kind={turn.kind} key={i}><small>{turn.role === 'user' ? '리아' : npc.name}{turn.kind === 'question' ? ' · 오늘의 질문' : ''}</small><p>{turn.content}</p></div>)}
      {(busy || inFlight) && <p className={styles.chatThinking} role="status">✧ {npc.name}이 이야기를 준비하고 있어요<span className={styles.waitingDots}>…</span></p>}<div ref={end} />
    </div>
    {!past && !record?.question && <button className={styles.goldButton} disabled={busy || !!inFlight || today.isError} onClick={() => void send(null)}>{record ? '이야기를 이어서 준비해 줘' : '응, 어떤 이야기를 하고 싶어?'}</button>}
    {!past && !!record?.question && <form onSubmit={e => { e.preventDefault(); void send(record.status === 'ready' ? message.trim() : null); }}><label htmlFor="daily-answer">리아의 대답</label><textarea id="daily-answer" maxLength={2000} rows={3} disabled={busy || !!inFlight || record.status !== 'ready'} value={record.pending_message ?? message} onChange={e => setMessage(e.target.value)} placeholder="내 생각과 그 이유를 들려주세요…" /><button className={styles.goldButton} disabled={busy || !!inFlight || today.isError || (record.status === 'ready' && !message.trim())}>{record.status === 'ready' ? '내 생각 들려주기' : '멈춘 대화 이어가기'}</button></form>}
    {(error || today.isError) && <p className={styles.error} role="alert">{error || '대화를 다시 불러와 주세요.'}</p>}
    <p className={styles.chatNote}>질문은 말을 걸 때 AI가 만들어요. 질문과 대답, 기다리는 동안 나눈 대화도 내 계정에 보관됩니다. 하루의 기준은 한국 시간 자정입니다.</p>
  </CharacterPanel>;
}
