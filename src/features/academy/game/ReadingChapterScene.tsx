import { useContext, useEffect, useState } from 'react';
import { GameModal } from './GameModal';
import { ChapterImage } from './ChapterImage';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { READING_CHAPTER_END, readingChapterObjective, readingChapterStory, readingChapterText, readingChapterTitle, type ReadingBeat } from './readingChapterStory';
import type { ReadingChapterRecord } from './readingService';
import { useChapterPlayback } from './useChapterPlayback';
import styles from './game.module.css';
import css from './chapter.module.css';
import { academyRewards } from './economySync';

/** 제6장 장면 — 제2장(도서관) 장면과 같은 틀. 새 삽화는 없고 도서관 삽화 둘을 다시 쓴다. */
export function ReadingChapterScene({ record, busy, error, readOnly, reduced, onClose, onNext, onAction }: {
  record: ReadingChapterRecord | null; busy: boolean; error: string; readOnly: boolean; reduced: boolean;
  onClose: () => void; onNext: () => void; onAction: (action: NonNullable<ReadingBeat['action']>) => void;
}) {
  const playback = useChapterPlayback(record?.step ?? 0);
  const { step, reviewing } = playback, beat = readingChapterStory[step], outfit = useContext(WardrobeContext), complete = step === READING_CHAPTER_END;
  const text = readingChapterText(step, record?.reading_book_title);
  const [letters, setLetters] = useState(0);
  useEffect(() => { setLetters(0); if (reduced) return; const timer = window.setInterval(() => setLetters(v => Math.min(v + 2, text.length)), 24); return () => window.clearInterval(timer); }, [text, reduced]);
  const revealed = reduced || letters >= text.length, speaker = beat?.speaker ?? 'ria', names = { ria: '리아', serin: '세린' };
  const art = beat?.art ?? null;
  return <GameModal title={`제6장 · ${readingChapterTitle}`} reduced={reduced} onClose={() => { if (!busy) onClose(); }} className={`${styles.characterScene} ${css.scene} ${css.libraryScene}`}>
    {art ? <ChapterImage className={css.arrival} src={gameAsset(art)} alt={beat?.alt ?? '도서관의 리아와 세린'} /> : <ChapterImage key={speaker} className={css.portrait} data-ria={speaker === 'ria'} src={gameAsset(outfit[speaker])} alt={names[speaker]} />}
    <header className={css.heading}><small>{complete ? 'CHAPTER VI · COMPLETE' : 'CHAPTER VI'}</small><h2>{readingChapterTitle}</h2><p>{readingChapterObjective(step)}</p></header>
    <div className={css.dialogue} data-arrival={!!art}>
      <strong className={css.speaker}>{complete ? '제6장 완료' : names[speaker]}{beat?.thought && ' · 속마음'}</strong>
      <p className={css.speech} aria-live="polite">{revealed ? text : text.slice(0, letters)}</p>
      {complete && <p className={css.reward} role="status">✦ 챕터 완료 보상 · {academyRewards.chapter}코인 획득</p>}
      {record?.reading_book_title && step >= 9 && <p className={css.design}>▤ 읽어 볼 책 · {record.reading_book_title}</p>}
      {readOnly && <p className={css.notice}>학생 시점 열람 · 챕터 진행과 설명 카드는 학생 본인만 기록할 수 있어요.</p>}
      {!reviewing && error && <p role="alert" className={css.error}>{error}</p>}
      <div className={css.actions}><button disabled={busy || step === 0} onClick={playback.back}>← 이전 대사</button>{reviewing && <button disabled={busy} onClick={playback.resume}>현재 진행으로 돌아가기</button>}
        {!revealed ? <button onClick={() => setLetters(text.length)}>대사 바로 보기</button> : reviewing ? <button disabled={busy} onClick={playback.forward}>다음 대사 →</button> : complete ? <button onClick={onClose}>세린의 서가 계속 보기</button> : <button disabled={busy || readOnly} onClick={() => beat?.action ? onAction(beat.action) : onNext()}>{busy ? '책갈피를 보관하는 중…' : beat?.label ?? '다음 이야기 →'}</button>}
      </div>
      <small className={css.bookmark}>{complete ? '설명 카드는 세린의 서가에 남아 있습니다.' : `${step + 1} / ${READING_CHAPTER_END} · ${reviewing ? '이전 대사 감상 중' : '이야기는 여기부터 다시 이어집니다.'}`}</small>
    </div>
  </GameModal>;
}
