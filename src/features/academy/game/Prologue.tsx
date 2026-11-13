import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { GameSurfaceContext } from './surfaceContext';
import { prologueScenes, prologueStory, prologueTitle, resumePrologueIndex } from './prologueStory';
import styles from './game.module.css';

export function Prologue({ initialIndex = 0, reduced, replay, onSave, onDone, onExit, onFilm }: { initialIndex?: number; reduced: boolean; replay: boolean; onFilm: () => void; onSave: (index: number, finish?: 'completed' | 'skipped') => Promise<void>; onDone: () => void; onExit: () => void }) {
  const surface = useContext(GameSurfaceContext);
  const [index, setIndex] = useState(() => resumePrologueIndex(initialIndex));
  const [letters, setLetters] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmSkip, setConfirmSkip] = useState(false);
  const lock = useRef(false);
  const typing = useRef<number>();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const beat = prologueStory[index];
  const scene = prologueScenes[beat.scene];
  const revealed = reduced || letters >= beat.text.length;
  const last = index === prologueStory.length - 1;
  useEffect(() => {
    setLetters(0);
    if (reduced) return;
    let count = 0;
    const timer = window.setInterval(() => { count += 2; setLetters(count); if (count >= beat.text.length) window.clearInterval(timer); }, 24);
    typing.current = timer;
    return () => window.clearInterval(timer);
  }, [beat.text, reduced]);
  useEffect(() => { Object.values(prologueScenes).forEach(value => { const img = new Image(); img.src = `/images/academy-game/${value.image}`; }); }, []);
  async function move(next: number, finish?: 'completed' | 'skipped') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await onSave(next, replay ? undefined : finish);
      if (!alive.current) return;
      if (finish) onDone(); else setIndex(next);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '책갈피를 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function next() {
    if (!revealed) { window.clearInterval(typing.current); setLetters(beat.text.length); return; }
    void move(last ? index : index + 1, last ? 'completed' : undefined);
  }
  if (!surface) return null;
  return createPortal(<FocusScope trapped loop asChild><section className={styles.prologue} data-reduced={reduced} aria-label={`프롤로그 · ${prologueTitle}`} tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); if (confirmSkip) setConfirmSkip(false); else onExit(); }
    if ((event.key === 'ArrowRight' || event.key === ' ') && event.target === event.currentTarget && !busy && !confirmSkip) { event.preventDefault(); next(); }
  }}>
    <img key={beat.scene} className={styles.prologueArt} src={`/images/academy-game/${scene.image}`} alt={{ school: '현실 학교에서 진로를 고민하는 리아', door: '학교의 낯선 문을 열고 빛을 마주하는 리아', arrival: '아카데미 입구에서 리아를 맞이하는 루온', threshold: '빛 속에서 아카데미로 첫걸음을 내딛는 리아', tour: '왕립 도서관과 연구시설이 펼쳐진 아카데미 전경', notebook: '루온이 등불을 비춰 주는 동안 첫 질문을 수첩에 적는 리아' }[beat.scene]} onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />
    <header className={styles.prologueHeader}><div><span className={styles.kicker}>PROLOGUE · {prologueTitle}</span><p>{scene.title}</p></div><div><button className={styles.prologueFilm} disabled={busy} onClick={onFilm}><span aria-hidden="true">▶</span> 영상으로 보기</button><button disabled={busy} onClick={onExit}>{replay ? '감상 닫기' : '타이틀로'}</button><button disabled={busy} onClick={() => setConfirmSkip(true)}>건너뛰기</button></div></header>
    <div className={styles.prologueDialogue}>
      <span className={styles.prologueSpeaker}>{beat.speaker === '이야기' ? prologueTitle : beat.speaker}</span>
      <button className={styles.prologueText} onClick={next} disabled={busy || confirmSkip} aria-label={beat.text}><span aria-hidden="true">{revealed ? beat.text : beat.text.slice(0, letters)}{!revealed && <span className={styles.cursor}>▍</span>}</span></button>
      {confirmSkip ? <div className={styles.prologueSkip}><p>{replay ? '프롤로그 감상을 마칠까요?' : '프롤로그를 건너뛰고 제1장 ‘나의 첫 별’을 시작할까요? 나중에 다시 감상할 수 있어요.'}</p><button disabled={busy} onClick={() => setConfirmSkip(false)}>계속 읽기</button><button disabled={busy} onClick={() => void move(index, 'skipped')}>건너뛰고 시작하기</button></div> : <nav aria-label="프롤로그 장면"><button disabled={busy || index === 0} onClick={() => { setIndex(value => value - 1); setError(''); }}>← 이전</button><small>{index + 1} / {prologueStory.length}{replay ? ' · 다시 감상' : ''}</small><button disabled={busy} onClick={next}>{busy ? '책갈피 보관 중…' : !revealed ? '대사 바로 보기' : last ? replay ? '감상 마치기' : '루온과 함께 들어가기' : '다음 →'}</button></nav>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  </section></FocusScope>, surface);
}
