import { useEffect, useState } from 'react';
import { CharacterPanel } from './CharacterPanel';
import styles from './game.module.css';
import { npcDetails, type Npc } from './world';

export interface Conversation {
  npc: Npc;
  expression?: number;
  text: string;
  choices: { label: string; action: () => void }[];
}
export function Dialogue({ conversation, onClose, reduced, busy, error, onFreeTalk }: { conversation: Conversation; onClose: () => void; reduced: boolean; busy: boolean; error: string; onFreeTalk?: () => void }) {
  const [letters, setLetters] = useState(0);
  useEffect(() => {
    setLetters(0);
    if (reduced) return;
    const timer = window.setInterval(() => setLetters(n => Math.min(n + 2, conversation.text.length)), 28);
    return () => window.clearInterval(timer);
  }, [conversation.text, reduced]);
  const complete = reduced || letters >= conversation.text.length;
  const npc = npcDetails[conversation.npc];
  return <CharacterPanel npc={conversation.npc} title={`${npc.name}과 대화`} onClose={onClose} className={styles.dialogue} reduced={reduced}>
    <div className={styles.speech}>
      <span className={styles.kicker}>{npc.role} · 리아에게</span>
      <h2>{npc.name}</h2>
      <p aria-label={conversation.text}><span aria-hidden="true">{complete ? conversation.text : conversation.text.slice(0, letters)}{!complete && <span className={styles.cursor}>▍</span>}</span></p>
      {!complete && <button className={styles.textButton} onClick={() => setLetters(conversation.text.length)}>대사 바로 보기 ▷</button>}
      <div className={styles.choices}>{conversation.choices.map(choice => <button key={choice.label} disabled={busy} onClick={choice.action}>✧ {choice.label}</button>)}</div>
      {onFreeTalk && <button className={styles.textButton} disabled={busy} onClick={onFreeTalk}>직접 말 걸기 · AI 자유 대화</button>}
      {busy && <small role="status">여행 수첩에 기록하는 중…</small>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  </CharacterPanel>;
}
