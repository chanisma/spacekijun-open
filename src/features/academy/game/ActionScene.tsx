import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { GameSurfaceContext } from './surfaceContext';
import styles from './game.module.css';

const scenes = {
  telescope: { image: 'ria-telescope-assisted.png', title: '함께 별을 관측하는 시간', caption: '리아가 망원경을 들여다보자, 카시안이 곁에서 초점을 맞추는 것을 도와줍니다.', next: '별자리 바라보기', npc: 'professor' },
  book: { image: 'ria-reading-assisted.png', title: '함께 첫 장을 펼치는 시간', caption: '리아가 오래된 책을 펼치자, 엘리안이 곁에서 기록을 안내해 줍니다.', next: '책 속으로 들어가기', npc: 'librarian-male' },
};
export function ActionScene({ action, reduced, onComplete, onCancel }: { action: keyof typeof scenes; reduced: boolean; onComplete: () => void; onCancel: () => void }) {
  const surface = useContext(GameSurfaceContext);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const scene = scenes[action];
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => complete.current(), reduced ? 1400 : 3600);
    return () => window.clearTimeout(timer);
  }, [ready, reduced]);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => { setFailed(true); setReady(true); }, 8000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  if (!surface) return null;
  return createPortal(<FocusScope trapped loop asChild><section className={styles.actionScene} data-reduced={reduced} aria-label={scene.title} tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}>
    {!failed ? <img className={styles.actionIllustration} src={`/images/academy-game/${scene.image}`} alt={scene.caption} onLoad={() => setReady(true)} onError={() => { setFailed(true); setReady(true); }} /> : <div className={styles.actionFallback}><img src="/images/academy-game/ria-player.png" alt="리아" /><img src={`/images/academy-game/${scene.npc}.png`} alt={action === 'book' ? '엘리안' : '카시안'} /></div>}
    <div className={styles.actionCaption}><span className={styles.kicker}>RIA · {action === 'book' ? 'THE FIRST PAGE' : 'AMONG THE STARS'}</span><h2>{scene.title}</h2><p>{scene.caption}</p><button onClick={onComplete}>{scene.next} →</button></div>
    <button className={styles.actionSkip} onClick={onComplete}>장면 건너뛰기</button>
  </section></FocusScope>, surface);
}
