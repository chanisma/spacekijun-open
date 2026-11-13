import { useContext, useEffect, useState } from 'react';
import { GameModal } from './GameModal';
import { ChapterImage } from './ChapterImage';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { postChapterObjective, postChapterStory, postChapterTitle, type PostBeat } from './postChapterStory';
import type { ChapterState } from './chapterService';
import { useChapterPlayback } from './useChapterPlayback';
import styles from './game.module.css';
import css from './chapter.module.css';
import { academyRewards } from './economySync';

export function PostChapterScene({ state, busy, error, readOnly, reduced, onClose, onNext, onAction, onRecord }: {
  state: ChapterState; busy: boolean; error: string; readOnly: boolean; reduced: boolean; onClose: () => void;
  onNext: () => void; onAction: (action: NonNullable<PostBeat['action']>) => void; onRecord: () => void;
}) {
  const record = state.post ?? null, outfit = useContext(WardrobeContext);
  const playback = useChapterPlayback(record?.step ?? 0), { step, reviewing } = playback;
  const beat = postChapterStory[step], speaker = beat?.speaker ?? 'ria';
  const text = beat?.text ?? '새로운 소식에 나의 질문을 남겼습니다. 노엘과 더 많은 편지를 펼쳐 보세요.';
  const [letters, setLetters] = useState(0);
  useEffect(() => { setLetters(0); if (reduced) return; const timer = setInterval(() => setLetters(v => Math.min(v + 2, text.length)), 24); return () => clearInterval(timer); }, [text, reduced]);
  const revealed = reduced || letters >= text.length, complete = step === 30;
  const art = beat?.art ?? (complete ? 'chapter-post-complete' : null);
  return <GameModal title={`제4장 · ${postChapterTitle}`} reduced={reduced} onClose={() => { if (!busy) onClose(); }} className={`${styles.characterScene} ${css.scene} ${css.dormScene}`}>
    {art ? <ChapterImage className={css.arrival} src={gameAsset(art)} alt={beat?.alt ?? (complete ? '관측 일지를 완성한 리아와 루온, 노엘' : '새로운 소식이 도착하는 우편국')} /> : <ChapterImage key={speaker} className={css.portrait} data-ria={speaker === 'ria'} src={gameAsset(outfit[speaker])} alt={{ ria: '리아', luon: '루온', postmaster: '노엘' }[speaker]} />}
    <header className={css.heading}><small>{step < 13 ? 'INTERLUDE · 아침이 열린 광장' : complete ? 'CHAPTER IV · COMPLETE' : 'CHAPTER IV'}</small><h2>{postChapterTitle}</h2><p>{postChapterObjective(step)}</p></header>
    <div className={css.dialogue} data-arrival={!!art}>
      <strong className={css.speaker}>{complete ? '제4장 완료' : { ria: '리아', luon: '루온', postmaster: '노엘' }[speaker]}{beat?.thought && ' · 속마음'}</strong>
      <p className={css.speech} aria-live="polite">{revealed ? text : text.slice(0, letters)}</p>
      {complete && <p className={css.reward} role="status">✦ 챕터 완료 보상 · {academyRewards.chapter}코인 획득</p>}
      {record?.news_title && step >= 21 && <p className={css.design}>✉ 읽은 편지 · {record.news_title}</p>}
      {readOnly && <p className={css.notice}>학생 시점 열람 · 관측 일지와 챕터 진행은 학생 본인만 기록할 수 있어요.</p>}
      {!reviewing && error && <p className={css.error} role="alert">{error}</p>}
      <div className={css.actions}>
        <button disabled={busy || step === 0} onClick={playback.back}>← 이전 대사</button>
        {reviewing && <button disabled={busy} onClick={playback.resume}>현재 진행으로 돌아가기</button>}
        {!revealed ? <button onClick={() => setLetters(text.length)}>대사 바로 보기</button> : reviewing ? <button disabled={busy} onClick={playback.forward}>다음 대사 →</button> : complete ? <button onClick={onClose}>우편국 계속 둘러보기</button> : <button disabled={busy || readOnly} onClick={() => beat.action ? onAction(beat.action) : onNext()}>{busy ? '책갈피를 보관하는 중…' : !record && error ? '책갈피 저장 다시 시도' : beat.label ?? '다음 이야기 →'}</button>}
        {!reviewing && step === 22 && state.postNoteReady && <button disabled={busy || readOnly} onClick={onRecord}>이미 저장한 일지로 노엘과 이어가기</button>}
      </div>
      <small className={css.bookmark}>{complete ? '다음 편지에도 새로운 가능성이 기다립니다.' : `${step + 1} / 30 · ${reviewing ? '이전 대사 감상 중 · 실제 진행은 그대로 보관돼요.' : '이야기는 여기부터 다시 이어집니다.'}`}</small>
    </div>
  </GameModal>;
}
