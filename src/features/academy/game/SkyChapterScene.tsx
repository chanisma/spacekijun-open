import { useContext, useEffect, useState } from 'react';
import { GameModal } from './GameModal';
import { ChapterImage } from './ChapterImage';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { skyChapterObjective, skyChapterStory, skyChapterText, skyChapterTitle, type SkyBeat } from './skyChapterStory';
import type { ChapterState } from './chapterService';
import { useChapterPlayback } from './useChapterPlayback';
import styles from './game.module.css';
import css from './chapter.module.css';
import { academyRewards } from './economySync';

export function SkyChapterScene({ state, busy, error, readOnly, reduced, onClose, onNext, onAction }: {
  state: ChapterState; busy: boolean; error: string; readOnly: boolean; reduced: boolean; onClose: () => void;
  onNext: () => void; onAction: (action: NonNullable<SkyBeat['action']>) => void;
}) {
  const record=state.sky??null, outfit=useContext(WardrobeContext), playback=useChapterPlayback(record?.step??0);
  const {step,reviewing}=playback, beat=skyChapterStory[step], speaker=beat?.speaker??'ria', complete=step===29;
  const text=skyChapterText(step,!!state.skyDormPracticed,state.dorm?.task_title), [letters,setLetters]=useState(0);
  useEffect(()=>{setLetters(0);if(reduced)return;const timer=window.setInterval(()=>setLetters(v=>Math.min(v+2,text.length)),24);return()=>window.clearInterval(timer);},[text,reduced]);
  const revealed=reduced||letters>=text.length, art=beat?.art??(complete?'chapter-sky-complete':null), names={ria:'리아',luon:'루온',serin:'세린',lamplighter:'테오'};
  return <GameModal title={`제5장 · ${skyChapterTitle}`} reduced={reduced} onClose={()=>{if(!busy)onClose();}} className={`${styles.characterScene} ${css.scene} ${css.skyScene}`}>
    {art?<ChapterImage className={css.arrival} src={gameAsset(art)} alt={beat?.alt??'창가에 첫 별을 남긴 리아와 세린'}/>:<ChapterImage className={css.portrait} data-ria={speaker==='ria'} src={gameAsset(speaker==='lamplighter'?'lamplighter':outfit[speaker])} alt={names[speaker]}/>}
    <header className={css.heading}><small>{complete?'CHAPTER V · COMPLETE':'CHAPTER V'}</small><h2>{skyChapterTitle}</h2><p>{skyChapterObjective(step)}</p></header>
    <div className={css.dialogue} data-arrival={!!art}><strong className={css.speaker}>{complete?'제5장 완료':names[speaker]}{beat?.thought&&' · 속마음'}</strong><p className={css.speech} aria-live="polite">{revealed?text:text.slice(0,letters)}</p>
      {complete&&<p className={css.reward} role="status">✦ 챕터 완료 보상 · {academyRewards.chapter}코인 획득</p>}
      {record?.sky_plan_title&&step>=22&&<p className={css.design}>✦ 첫 빛 · {record.sky_plan_title}</p>}
      {readOnly&&<p className={css.notice}>학생 시점 열람 · 실천과 별은 본인만 기록할 수 있어요.</p>}
      {!reviewing&&error&&<p className={css.error} role="alert">{error}</p>}
      <div className={css.actions}><button disabled={busy||step===0} onClick={playback.back}>← 이전 대사</button>{reviewing&&<button onClick={playback.resume}>현재 진행으로 돌아가기</button>}
        {!revealed?<button onClick={()=>setLetters(text.length)}>대사 바로 보기</button>:reviewing?<button onClick={playback.forward}>다음 대사 →</button>:complete?<button onClick={onClose}>창가의 하늘 계속 보기</button>:<button disabled={busy||readOnly} onClick={()=>beat.action?onAction(beat.action):onNext()}>{busy?'책갈피를 보관하는 중…':beat.label??'다음 이야기 →'}</button>}
      </div><small className={css.bookmark}>{complete?'하늘은 다음 실천을 기다립니다.':`${step+1} / 29 · ${reviewing?'이전 대사 감상 중':'이야기는 여기부터 다시 이어집니다.'}`}</small>
    </div>
  </GameModal>;
}
