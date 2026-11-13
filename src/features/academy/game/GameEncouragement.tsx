import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CharacterPanel } from './CharacterPanel';
import { fetchEncouragement, generateEncouragement } from './encouragementService';
import styles from './game.module.css';

export function GameEncouragement({ userId, studentId, readOnly, reduced, onClose }: { userId: string; studentId: string | null; readOnly: boolean; reduced: boolean; onClose: () => void }) {
  const cache = useQueryClient();
  const key = ['academy-encouragement', userId, readOnly, studentId];
  const query = useQuery({ queryKey: key, queryFn: () => fetchEncouragement(readOnly ? studentId : null), refetchInterval: q => q.state.data?.entries.some(e => e.status === 'generating') ? 2000 : 30000, retry: 1 });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
  const initial = useRef(false), lock = useRef(false);
  const entry = query.data?.entries.find(e => e.day === query.data?.day);
  const waiting = entry?.status === 'generating' && !!entry.lease_until && new Date(entry.lease_until).getTime() > now;
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const begin = useRef<() => Promise<void>>(async () => {});
  begin.current = async () => {
    if (readOnly || lock.current || waiting || entry?.message) return;
    lock.current = true; setBusy(true); setError('');
    try { await generateEncouragement(); }
    catch (e) { setError((e as Error).message); }
    finally { await cache.invalidateQueries({ queryKey: key }); lock.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!readOnly && query.isSuccess && !initial.current) {
      initial.current = true;
      if (!entry) void begin.current();
    }
  }, [readOnly, query.isSuccess, entry]);
  return <CharacterPanel npc="luon" title="루온의 오늘의 격려" reduced={reduced} onClose={onClose}>
    <span className={styles.kicker}>LUON · 당신에게 건네는 한마디</span><h2>리아에게 하고 싶은 말</h2>
    {readOnly && <p className={styles.preview}>학생 시점 열람 · 새로운 격려는 학생 본인만 받을 수 있어요.</p>}
    {query.isPending ? <p role="status">루온이 당신을 향해 고개를 돌립니다…</p> : query.isError ? <p role="alert">{query.error.message} <button onClick={() => void query.refetch()}>다시 펼치기</button></p> : <>
      <small>{query.data?.day} · 한국 시간</small>
      {entry?.message ? <p className={styles.chatBubble}>{entry.message}</p> : busy || waiting ? <p role="status">“아, 리아. 마침 잘 만났네요.”<br /><small>루온이 살짝 웃으며 잠시 말을 고릅니다.</small></p> : <><p>“참, 리아에게 해주고 싶은 말이 있었어요.”</p><button className={styles.goldButton} disabled={readOnly} onClick={() => void begin.current()}>{entry?.status === 'failed' ? '루온, 다시 들려줘' : '오늘의 격려 듣기'}</button></>}
      <p className={styles.chatNote}>오늘 나눈 말은 여기 간직해 둘게요. 한국 시간 자정이 지나면 새로운 이야기를 들을 수 있어요.</p>
      {query.data?.entries.some(e => e.day !== query.data?.day && e.message) && <details><summary>지난 격려 펼치기</summary>{query.data.entries.filter(e => e.day !== query.data.day && e.message).map(e => <article key={e.day}><small>{e.day}</small><p>{e.message}</p></article>)}</details>}
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </CharacterPanel>;
}
