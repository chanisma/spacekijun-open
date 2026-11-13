import { useContext, useEffect, useState } from 'react';
import { GameModal } from './GameModal';
import { ChapterImage } from './ChapterImage';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { chapterObjective, chapterStory, chapterTitle, type ChapterBeat } from './chapterStory';
import type { ChapterState } from './chapterService';
import styles from './game.module.css';
import css from './chapter.module.css';
import { useChapterPlayback } from './useChapterPlayback';
import { academyRewards } from './economySync';

export function ChapterScene({ state, busy, error, readOnly, reduced, onClose, onNext, onAction, onDesign, onTalk }: {
  state: ChapterState; busy: boolean; error: string; readOnly: boolean; reduced: boolean; onClose: () => void;
  onNext: () => void; onAction: (action: NonNullable<ChapterBeat['action']>) => void; onDesign: (id: string) => void; onTalk: () => void;
}) {
  const playback = useChapterPlayback(state.chapter?.step ?? 0);
  const { step, reviewing } = playback, beat = chapterStory[step], outfit = useContext(WardrobeContext);
  const text = (state.chapter?.has_stars === false && beat?.emptyText) || beat?.text || '별의 연구시설에서 나의 첫 탐구 설계를 완성했습니다.';
  const [letters, setLetters] = useState(0);
  useEffect(() => { setLetters(0); if (reduced) return; const timer = setInterval(() => setLetters(v => Math.min(v + 2, text.length)), 24); return () => clearInterval(timer); }, [text, reduced]);
  const revealed = reduced || letters >= text.length;
  const speaker = beat?.speaker ?? 'ria';
  const names = { ria: '리아', luon: '루온', professor: '카시안' };
  const completed = step === 16, arrival = step === 3;
  if (completed) return <GameModal title={`제1장 · ${chapterTitle}`} reduced={reduced} onClose={onClose} className={`${styles.characterScene} ${css.completion}`}>
    <ChapterImage className={css.completionArt} src={gameAsset('chapter-first-star-complete')} alt="첫 별을 찾고 기뻐하는 리아와 함께 축하하는 루온, 카시안 교수" />
    <div className={css.starRise} aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ left: `${8 + i * 7.5}%`, animationDelay: `${i * .17}s` }}>✦</span>)}</div>
    <section className={css.completionCard} aria-label="제1장 완료">
      <small className={css.completionSeal}>✦ CHAPTER I · COMPLETE ✦</small>
      <h2>제1장, 나의 첫 별</h2><p className={css.completionMessage}>당신의 첫 번째 이야기가 완성되었습니다.</p>
      <p className={css.completionQuote}>“나도… 내 별을 찾았어!”</p>
      {state.chapter?.design_title && <p className={css.completionDesign}>첫 탐구 설계 · {state.chapter.design_title}</p>}
      <p className={css.completionPraise}>루온과 카시안이 리아의 첫걸음을 함께 축하합니다.</p>
      <p className={css.reward} role="status">✦ 챕터 완료 보상 · {academyRewards.chapter}코인 획득</p>
      <div className={css.actions}><button disabled={busy} onClick={playback.back}>← 이전 대사</button><button disabled={readOnly} onClick={onTalk}>교수와 이야기 나누기</button><button onClick={onClose}>아카데미 계속 둘러보기</button></div>
    </section>
  </GameModal>;
  return <GameModal title={`제1장 · ${chapterTitle}`} reduced={reduced} onClose={() => { if (!busy) onClose(); }} className={`${styles.characterScene} ${css.scene}`}>
    {arrival ? <ChapterImage className={css.arrival} src={gameAsset('chapter-observatory-arrival')} alt="별빛으로 가득한 연구시설에 놀라는 리아와 곁에서 미소 짓는 루온" /> : <ChapterImage key={speaker} className={css.portrait} data-ria={speaker === 'ria'} src={gameAsset(outfit[speaker])} alt={names[speaker]} />}
    <header className={css.heading}><small>CHAPTER I{completed ? ' · COMPLETE' : ''}</small><h2>{chapterTitle}</h2><p>{chapterObjective(step)}</p></header>
    <div className={css.dialogue} data-arrival={arrival}>
      <strong className={css.speaker}>{completed ? '나의 첫 별을 찾는 지도' : names[speaker]}{beat?.thought && ' · 속마음'}</strong>
      <p className={css.speech} aria-live="polite">{revealed ? text : text.slice(0, letters)}{!revealed && <span aria-hidden="true">▍</span>}</p>
      {arrival && revealed && <p className={css.reply}><strong>루온</strong> {beat.reply}</p>}
      {state.chapter?.design_title && step >= 12 && <p className={css.design}>✧ {state.chapter.design_title}</p>}
      {readOnly && <p className={css.notice}>학생 시점 열람 · 챕터 진행과 탐구 확정은 학생 본인만 할 수 있어요.</p>}
      {!reviewing && error && <p role="alert" className={css.error}>{error}</p>}
      <div className={css.actions}><button disabled={busy || step === 0} onClick={playback.back}>← 이전 대사</button>{reviewing && <button disabled={busy} onClick={playback.resume}>현재 진행으로 돌아가기</button>}{!revealed ? <button onClick={() => setLetters(text.length)}>대사 바로 보기</button> : reviewing ? <button disabled={busy} onClick={playback.forward}>다음 대사 →</button> : <>
        <button disabled={busy || readOnly} onClick={() => beat.action ? onAction(beat.action) : onNext()}>{busy ? '책갈피를 보관하는 중…' : beat.label ?? (step === 15 ? '나의 첫 별 · 제1장 마치기' : '다음 이야기 →')}</button>
        {step === 11 && state.designs.length > 0 && <details><summary>이미 확정한 탐구로 이야기 이어가기</summary>{state.designs.map(d => <button key={d.id} disabled={busy || readOnly} onClick={() => onDesign(d.id)}>{d.title} · 교수에게 보여 드리기</button>)}</details>}
      </>}</div>
      <small className={css.bookmark}>{step + 1} / 16 · {reviewing ? '이전 대사 감상 중 · 실제 진행은 그대로 보관돼요.' : '이야기는 여기부터 다시 이어집니다.'}</small>
    </div>
  </GameModal>;
}
