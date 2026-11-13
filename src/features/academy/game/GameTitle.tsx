import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { GameExitButton } from './GameExitButton';
import { GameSurfaceContext } from './surfaceContext';
import styles from './game.module.css';

export function GameTitle({ startLabel, loading, error, canReplay, onStart, onReplay, onFilm, onRetry }: { startLabel: string; loading: boolean; error: boolean; canReplay: boolean; onStart: () => void; onReplay: () => void; onFilm: () => void; onRetry: () => void }) {
  const surface = useContext(GameSurfaceContext);
  if (!surface) return null;
  return createPortal(<FocusScope trapped loop asChild><section className={styles.titleScene} aria-label="별빛 아카데미 타이틀" tabIndex={-1}>
    <div className={styles.titleCast} aria-hidden="true"><img src="/images/academy-game/ria-player.png" alt="" /><img src="/images/academy-game/luon.png" alt="" /></div>
    <div className={styles.titleCopy}><span className={styles.kicker}>RIA & LUON · A STORY OF YOUR OWN</span><span className={styles.titleStar}>✧</span><h1>별빛<br />아카데미</h1><p>아직 이름 없는 별도,<br />당신의 질문을 따라 빛나기 시작합니다.</p>
      <div className={styles.titleMenu}><button className={styles.titleStart} onClick={onStart} disabled={loading || error}>{loading ? '여행의 책갈피를 찾는 중…' : startLabel}<span aria-hidden="true">✦</span></button><button className={styles.titleFilm} onClick={onFilm}><span aria-hidden="true">▶</span>프롤로그 영상 보기</button>{canReplay && <button onClick={onReplay}>프롤로그 감상하기</button>}</div>
      {error && <p role="alert">여행 기록을 불러오지 못했어요. <button onClick={onRetry}>다시 불러오기</button></p>}
      <small>나의 첫 질문에서 시작되는 이야기</small>
    </div><GameExitButton className={styles.titleExit}>← 나가기</GameExitButton>
  </section></FocusScope>, surface);
}
