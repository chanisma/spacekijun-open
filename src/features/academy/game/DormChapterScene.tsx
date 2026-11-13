import { useContext, useEffect, useState } from 'react';
import { GameModal } from './GameModal';
import { ChapterImage } from './ChapterImage';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { dormChapterObjective, dormChapterStory, dormChapterTitle, type DormBeat } from './dormChapterStory';
import type { ChapterState } from './chapterService';
import { useChapterPlayback } from './useChapterPlayback';
import styles from './game.module.css';
import css from './chapter.module.css';
import { academyRewards } from './economySync';

export function DormChapterScene({ state, busy, error, readOnly, reduced, onClose, onNext, onAction, onRecord }: {
  state: ChapterState; busy: boolean; error: string; readOnly: boolean; reduced: boolean; onClose: () => void;
  onNext: () => void; onAction: (action: NonNullable<DormBeat['action']>) => void; onRecord: (action: 'goal' | 'plan', id: string) => void;
}) {
  const record = state.dorm ?? null, outfit = useContext(WardrobeContext);
  const playback = useChapterPlayback(record?.step ?? 0), { step, reviewing } = playback;
  const beat = dormChapterStory[step], speaker = beat?.speaker ?? 'ria';
  const text = beat?.text ?? '내일을 위한 작은 약속을 남겼습니다. 이곳에서 나의 속도로 하루를 이어가세요.';
  const [letters, setLetters] = useState(0);
  useEffect(() => { setLetters(0); if (reduced) return; const timer = setInterval(() => setLetters(v => Math.min(v + 2, text.length)), 24); return () => clearInterval(timer); }, [text, reduced]);
  const revealed = reduced || letters >= text.length, complete = step === 36;
  const art = beat?.art ?? (complete ? 'chapter-dorm-night' : null);
  const candidates = step === 20 ? state.dormGoals : step === 26 ? state.dormPlans : [];
  return <GameModal title={`제3장 · ${dormChapterTitle}`} reduced={reduced} onClose={() => { if (!busy) onClose(); }} className={`${styles.characterScene} ${css.scene} ${css.dormScene}`}>
    {art ? <ChapterImage className={css.arrival} src={gameAsset(art)} alt={beat?.alt ?? (complete ? '별빛 아래 잠드는 리아' : '세린과 함께하는 기숙사의 첫날')} /> : <ChapterImage key={speaker} className={css.portrait} data-ria={speaker === 'ria'} src={gameAsset(outfit[speaker])} alt={{ ria: '리아', luon: '루온', serin: '세린' }[speaker]} />}
    <header className={css.heading}><small>{step < 7 ? 'INTERLUDE · 별빛이 내려앉은 밤' : complete ? 'CHAPTER III · COMPLETE' : 'CHAPTER III'}</small><h2>{dormChapterTitle}</h2><p>{dormChapterObjective(step)}</p></header>
    <div className={css.dialogue} data-arrival={!!art}>
      <strong className={css.speaker}>{complete ? '제3장 완료' : { ria: '리아', luon: '루온', serin: '세린' }[speaker]}{beat?.thought && ' · 속마음'}</strong>
      <p className={css.speech} aria-live="polite">{revealed ? text : text.slice(0, letters)}</p>
      {complete && <p className={css.reward} role="status">✦ 챕터 완료 보상 · {academyRewards.chapter}코인 획득</p>}
      {record?.goal_title && step >= 21 && <p className={css.design}>✧ 나의 목표 · {record.goal_title}{record.task_title && step >= 27 && <><br />☽ 첫 계획 · {record.task_title}</>}</p>}
      {readOnly && <p className={css.notice}>학생 시점 열람 · 목표와 계획은 학생 본인만 기록할 수 있어요.</p>}
      {!reviewing && error && <p className={css.error} role="alert">{error}</p>}
      <div className={css.actions}>
        <button disabled={busy || step === 0} onClick={playback.back}>← 이전 대사</button>
        {reviewing && <button disabled={busy} onClick={playback.resume}>현재 진행으로 돌아가기</button>}
        {!revealed ? <button onClick={() => setLetters(text.length)}>대사 바로 보기</button> : reviewing ? <button disabled={busy} onClick={playback.forward}>다음 대사 →</button> : complete ? <button onClick={onClose}>기숙사에서 하루 이어가기</button> : <button disabled={busy || readOnly} onClick={() => beat.action ? onAction(beat.action) : onNext()}>{busy ? '책갈피를 보관하는 중…' : !record && error ? '책갈피 저장 다시 시도' : beat.label ?? '다음 이야기 →'}</button>}
        {!reviewing && revealed && !!candidates?.length && <details><summary>이미 기록한 내용으로 세린과 이어가기</summary>{candidates.map(item => <button key={item.id} disabled={busy || readOnly} onClick={() => onRecord(step === 20 ? 'goal' : 'plan', item.id)}>{item.title} · 세린에게 보여 주기</button>)}</details>}
      </div>
      <small className={css.bookmark}>{complete ? '작은 약속이 내일의 나를 기다립니다.' : `${step + 1} / 36 · ${reviewing ? '이전 대사 감상 중 · 실제 진행은 그대로 보관돼요.' : '이야기는 여기부터 다시 이어집니다.'}`}</small>
    </div>
  </GameModal>;
}
