import { useState } from 'react';
import { ScenePanel } from './GameSurface';
import styles from './game.module.css';

export function ResearchTable({ onSelect, onClose, chapterGuide = false, busy = false, error = '' }: { onSelect: (view: 'design' | 'history') => void; onClose: () => void; chapterGuide?: boolean; busy?: boolean; error?: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <ScenePanel title="리아의 연구대" onClose={onClose} className={styles.tableScene}>
    <header className={styles.tableTitle}><span className={styles.kicker}>{chapterGuide ? 'CHAPTER I · 카시안의 연구대 수업' : "RIA'S RESEARCH TABLE"}</span><h2>리아의 연구대</h2><p>{chapterGuide ? '“지도 위의 빈 종이를 눌러 보렴. 질문과 방법을 적고, 네 이유로 탐구를 확정하는 거야.”' : '새 종이에 질문을 남기거나, 수첩에 쌓인 이야기를 펼쳐 보세요.'}</p>{error && <p role="alert">{error}</p>}</header>
    <div className={styles.tablePlane}>
      <img key={attempt} data-ready={ready} src="/images/academy-game/research-desk.png" alt="별자리 지도 위에 설계지와 보라색 연구 수첩이 놓인 연구대" onLoad={() => setReady(true)} onError={() => setFailed(true)} />
      <button className={styles.tablePaper} disabled={!ready || busy} onClick={() => onSelect('design')} aria-label="새 별 찾기 · 설계지 펼치기"><span>✧ 새 별 찾기<small>설계지 펼치기</small></span></button>
      <button className={styles.tableNotebook} disabled={!ready || busy} onClick={() => onSelect('history')} aria-label="연구 수첩 펼치기"><span>▤ 연구 수첩<small>나의 기록 펼치기</small></span></button>
    </div>
    {!ready && <div className={styles.tableLoading} role="status">{failed ? <>연구대 그림을 불러오지 못했어요. <button onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>다시 살펴보기</button></> : '연구대 위에 별자리 지도와 수첩을 펼치고 있어요…'}</div>}
  </ScenePanel>;
}
