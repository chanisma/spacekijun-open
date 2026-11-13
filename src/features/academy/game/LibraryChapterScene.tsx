import { useContext, useEffect, useState } from 'react';
import { GameModal } from './GameModal';
import { ChapterImage } from './ChapterImage';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { libraryChapterObjective, libraryChapterStory, libraryChapterTitle, type LibraryBeat } from './libraryChapterStory';
import type { LibraryChapterRecord } from './chapterService';
import styles from './game.module.css';
import css from './chapter.module.css';
import { useChapterPlayback } from './useChapterPlayback';
import { academyRewards } from './economySync';
import { keywordLine, useRecordKeywords } from './libraryRecords';

export function LibraryChapterScene({ record, busy, error, readOnly, reduced, onClose, onNext, onAction, onBooks, onPropose }: {
  record: LibraryChapterRecord | null; busy: boolean; error: string; readOnly: boolean; reduced: boolean;
  onClose: () => void; onNext: () => void; onAction: (action: NonNullable<LibraryBeat['action']>) => void; onBooks: () => void; onPropose: () => void;
}) {
  const playback = useChapterPlayback(record?.step ?? 0);
  // 서버 기록의 activity_title 은 선배 활동의 구체적인 주제라 보이지 않는다 — 그 기록의 키워드로(2026-10-22).
  const recordKeywords = useRecordKeywords(record?.question && (record.step ?? 0) >= 15 ? record.activity_id : null);
  const { step, reviewing } = playback, beat = libraryChapterStory[step], outfit = useContext(WardrobeContext);
  const text = beat?.text ?? '다른 사람의 이야기에서, 나만의 질문이 자라났습니다.';
  const [letters, setLetters] = useState(0);
  useEffect(() => { setLetters(0); if (reduced) return; const timer = setInterval(() => setLetters(v => Math.min(v + 2, text.length)), 24); return () => clearInterval(timer); }, [text, reduced]);
  const revealed = reduced || letters >= text.length;
  const speaker = beat?.speaker ?? 'ria';
  const names = { ria: '리아', luon: '루온', librarian: '엘리안' };
  const art = beat?.art ?? (step === 18 ? 'chapter-library-shelves' : null);
  return <GameModal title={`제2장 · ${libraryChapterTitle}`} reduced={reduced} onClose={() => { if (!busy) onClose(); }} className={`${styles.characterScene} ${css.scene} ${css.libraryScene}`}>
    {art ? <ChapterImage className={css.arrival} src={gameAsset(art)} alt={beat?.alt ?? '리아와 루온이 함께 발견한 도서관의 이야기'} /> : <ChapterImage key={speaker} className={css.portrait} data-ria={speaker === 'ria'} src={gameAsset(outfit[speaker])} alt={names[speaker]} />}
    <header className={css.heading}><small>{step < 6 ? 'INTERLUDE · 루온의 이야기' : step === 18 ? 'CHAPTER II · COMPLETE' : 'CHAPTER II'}</small><h2>{libraryChapterTitle}</h2><p>{libraryChapterObjective(step)}</p></header>
    <div className={css.dialogue} data-arrival={!!art}>
      <strong className={css.speaker}>{step === 18 ? '제2장 완료' : names[speaker]}{beat?.thought && ' · 속마음'}</strong>
      <p className={css.speech} aria-live="polite">{revealed ? text : text.slice(0, letters)}</p>
      {step === 18 && <p className={css.reward} role="status">✦ 챕터 완료 보상 · {academyRewards.chapter}코인 획득</p>}
      {record?.question && step >= 15 && <details><summary>책에서 발견한 나의 질문</summary><p>키워드 · {recordKeywords.data ? keywordLine(recordKeywords.data) : '…'}</p><p>{record.question}</p><p>궁금해진 이유 · {record.curiosity_reason}</p></details>}
      {readOnly && <p className={css.notice}>학생 시점 열람 · 챕터 진행과 질문 기록은 학생 본인만 할 수 있어요.</p>}
      {!reviewing && error && <p role="alert" className={css.error}>{error}</p>}
      <div className={css.actions}><button disabled={busy || step === 0} onClick={playback.back}>← 이전 대사</button>{reviewing && <button disabled={busy} onClick={playback.resume}>현재 진행으로 돌아가기</button>}{!revealed ? <button onClick={() => setLetters(text.length)}>대사 바로 보기</button> : reviewing ? <button disabled={busy} onClick={playback.forward}>다음 대사 →</button> : step === 18 ? <><button onClick={onBooks}>다른 책도 살펴보기</button><button disabled={readOnly} onClick={onPropose}>엘리안에게 새 이야기 제안하기</button><button onClick={onClose}>아카데미 계속 둘러보기</button></> : <button disabled={busy || readOnly} onClick={() => beat.action ? onAction(beat.action) : onNext()}>{busy ? '책갈피를 보관하는 중…' : !record && error ? '책갈피 저장 다시 시도' : beat.label ?? '다음 이야기 →'}</button>}</div>
      <small className={css.bookmark}>{step === 18 ? '질문과 그 이유는 이 장의 기록에 남아 있습니다.' : `${step + 1} / 18 · ${reviewing ? '이전 대사 감상 중 · 실제 진행은 그대로 보관돼요.' : '이야기는 여기부터 다시 이어집니다.'}`}</small>
    </div>
  </GameModal>;
}

export function LibraryChapterNote({ open, record, busy, error, readOnly, reduced, onClose, onSave }: {
  open: boolean; record: LibraryChapterRecord | null; busy: boolean; error: string; readOnly: boolean; reduced: boolean;
  onClose: () => void; onSave: (question: string, reason: string) => void;
}) {
  const [question, setQuestion] = useState(''), [reason, setReason] = useState('');
  const recordKeywords = useRecordKeywords(open ? record?.activity_id : null);
  if (!open) return null;
  return <GameModal title="책에서 발견한 질문 기록" onClose={() => { if (!busy) onClose(); }} reduced={reduced} className={styles.journal}>
    <span className={styles.kicker}>CHAPTER II · 리아의 기록</span><h2>책갈피 사이에서 찾은 질문</h2>
    <p>엘리안 · “왜 이 활동에 눈길이 갔는지, 네 생각을 남겨 보세요.”</p><p>읽은 기록의 키워드 · {!record?.activity_id ? '기록을 먼저 골라 주세요.' : recordKeywords.data ? keywordLine(recordKeywords.data) : '…'}</p>
    <form onSubmit={e => { e.preventDefault(); onSave(question.trim(), reason.trim()); }}>
      <label>내가 발견한 질문<textarea value={question} onChange={e => setQuestion(e.target.value)} minLength={10} maxLength={1000} required disabled={busy || readOnly} placeholder="이 활동에서 조건을 바꾸면 어떤 결과가 나올까요?" /></label>
      <label>궁금해진 이유<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={1000} required disabled={busy || readOnly} placeholder="어떤 기록이 내 경험이나 관심과 이어졌나요? 왜 더 알아보고 싶나요?" /></label>
      <small>질문과 이유를 각각 10~1,000자로 적어 주세요.</small>
      <button className={styles.goldButton} disabled={busy || readOnly || !record?.activity_id || question.trim().length < 10 || reason.trim().length < 10}>{busy ? '수첩에 기록 중…' : '질문과 이유를 기록하고 엘리안에게 들려주기'}</button>
    </form>{error && <p role="alert" className={styles.error}>{error}</p>}
  </GameModal>;
}
