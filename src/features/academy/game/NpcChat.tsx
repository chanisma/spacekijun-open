import { useEffect, useRef, useState } from 'react';
import { npcDetails } from './world';
import type { NpcIdentity, NpcReply, NpcTurn, NpcSource } from '../../../../supabase/functions/_shared/academyNpc';
import { CharacterPanel } from './CharacterPanel';
import { talkToNpc } from './npcService';
import styles from './game.module.css';

export function NpcChat({ npc, newsId = null, onClose, reduced, onReference, onRecord }: { npc: NpcIdentity; newsId?: number | null; onClose: () => void; reduced: boolean; onReference: (source: NpcSource) => void; onRecord?: (text: string) => void }) {
  const character = npcDetails[npc];
  const [turns, setTurns] = useState<NpcTurn[]>([]);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<NpcReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' }); }, [turns, busy, reduced]);
  const lastThought = [...turns].reverse().find(t => t.role === 'user')?.content;
  async function send() {
    const text = message.trim();
    if (!text || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      // The installed Functions client has no AbortSignal option. Ignore late replies
      // after closing; the server still bounds provider execution to 45 seconds.
      const result = await talkToNpc(npc, text, turns, newsId);
      if (controller.signal.aborted) return;
      setTurns(previous => [...previous, { role: 'user', content: text }, { role: 'assistant', content: result.reply }]);
      setReply(result); setMessage('');
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.'); }
    finally { if (!controller.signal.aborted) { setBusy(false); request.current = null; } }
  }
  return <CharacterPanel npc={npc} title={`${character.name}와 AI 자유 대화`} onClose={onClose} className={styles.chatPanel} reduced={reduced}>
    <header className={styles.chatHeader}><img className={styles.chatPortrait} src={`/images/academy-game/${character.asset}.png`} alt={character.name} /><div><span className={styles.kicker}>AI CHARACTER DIALOGUE</span><h2>{character.name}와 이야기 나누기</h2><p>당신의 호기심에 귀 기울이고 있어요.</p></div></header>
    <div className={styles.chatLog} role="log" aria-label="NPC 대화 기록" aria-live="polite">
      {!turns.length && <p className={styles.chatWelcome}>{npc === 'luon' ? '무엇이 궁금한가요? 탐구를 시작하기 어려운 마음도, 새롭게 떠오른 생각도 들려주세요.' : '읽은 활동에서 어떤 점이 마음에 남았나요? 여행 수첩의 질문을 함께 더 구체적으로 생각해 볼까요?'}</p>}
      {turns.map((turn, i) => <div key={i} className={styles.chatBubble} data-speaker={turn.role}><small>{turn.role === 'user' ? '리아' : character.name}</small><p>{turn.content}</p></div>)}
      {busy && <p role="status" className={styles.chatThinking}>✧ 당신의 이야기를 곰곰이 생각하고 있어요…</p>}<div ref={end} />
    </div>
    {reply?.source && <button className={styles.textButton} onClick={() => onReference(reply.source!)}>함께 참고한 기록: {reply.source.name} 펼치기 →</button>}
    {!!reply?.memories?.length && <details className={styles.researchRecord}><summary>기억하고 있는 이야기 · {reply.memories.length}개</summary>{reply.memories.map((m, i) => <article key={i}><small>{m.at.slice(0, 10)} · {m.label}</small><p>{m.excerpt}</p>{m.previous && <p>이전에 확인한 문장 · {m.previous}</p>}</article>)}</details>}
    {lastThought && onRecord && <button className={styles.mapButton} onClick={() => onRecord(lastThought)}>내 마지막 생각을 관측 일지로 가져가기</button>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form onSubmit={e => { e.preventDefault(); void send(); }}><label htmlFor="npc-message" className={styles.srOnly}>인물에게 할 말</label><textarea id="npc-message" value={message} onChange={e => setMessage(e.target.value)} disabled={busy} maxLength={1200} rows={3} placeholder="궁금한 점이나 내 생각을 들려주세요…" /><button className={styles.goldButton} disabled={busy || !message.trim()}>{busy ? '답변 기다리는 중…' : error ? '같은 말로 다시 대화하기' : '말 건네기 ✧'}</button></form>
    <p className={styles.chatNote}>AI가 생성한 대화입니다. 최근 4번의 대화를 참고하며, 창을 닫으면 대화 기록은 사라집니다.</p>
  </CharacterPanel>;
}
