import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { useModalBackClose } from '@/components/ui/modal-back';
import { GameSurfaceContext } from './surfaceContext';
import { gameAsset } from './gameAsset';
import { YOUTUBE_EMBED_ORIGIN, YOUTUBE_LISTENING_MESSAGE, prologueFilm, prologueFilmEmbedUrl, prologueFilmWatchUrl, readYouTubeState } from './prologueFilm';
import css from './prologueTheater.module.css';

type Stage = 'poster' | 'playing' | 'ended';

/**
 * 프롤로그 영상 극장 — 타이틀 · 여정 메뉴 · 글 프롤로그 머리에서 연다.
 * 포스터(우리 삽화)를 눌러야 유튜브를 불러오고, 막이 열리듯 재생한다. 끝나면 «막이 내렸어요» 카드.
 * `returnLabel` = 끝 카드의 주행동(어디로 돌아가는지) — 여는 곳이 정한다.
 */
export function PrologueTheater({ reduced, returnLabel, onClose }: { reduced: boolean; returnLabel: string; onClose: () => void }) {
  const surface = useContext(GameSurfaceContext);
  const [stage, setStage] = useState<Stage>('poster');
  const [take, setTake] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const heard = useRef(false);
  useModalBackClose(Boolean(surface), onClose);

  // 위젯이 상태를 알려 주기 시작할 때까지 몇 번만 «듣고 있다»고 말한다. 끝내 대답이 없어도 감상은 그대로다.
  const listen = useCallback(() => {
    heard.current = false;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (heard.current || ++tries > 6) { window.clearInterval(timer); return; }
      frame.current?.contentWindow?.postMessage(YOUTUBE_LISTENING_MESSAGE, YOUTUBE_EMBED_ORIGIN);
    }, 700);
    frame.current?.contentWindow?.postMessage(YOUTUBE_LISTENING_MESSAGE, YOUTUBE_EMBED_ORIGIN);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (stage === 'poster') return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== YOUTUBE_EMBED_ORIGIN || event.source !== frame.current?.contentWindow) return;
      const state = readYouTubeState(event.data);
      if (state === null) return;
      heard.current = true;
      if (state === 0) setStage('ended');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [stage]);

  function play() { setTake(value => value + 1); setStage('playing'); }
  if (!surface) return null;
  const origin = typeof window === 'undefined' ? null : window.location.origin;
  return createPortal(<FocusScope trapped loop asChild onMountAutoFocus={event => { event.preventDefault(); playButton.current?.focus(); }}>
    <section className={css.theater} data-reduced={reduced || undefined} role="dialog" aria-modal="true" aria-label={`프롤로그 영상 · ${prologueFilm.title}`} tabIndex={-1}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <img className={css.backdrop} src={gameAsset(prologueFilm.poster)} alt="" aria-hidden="true" />
      <div className={css.sky} aria-hidden="true" />
      <header className={css.header}>
        <div><span className={css.kicker}>PROLOGUE FILM · 별빛 아카데미</span><h2>{prologueFilm.title}</h2></div>
        <button className={css.close} onClick={onClose} aria-label="영상 닫기"><span className={css.closeMark} aria-hidden="true" /></button>
      </header>
      <div className={css.stage}>
        <div className={css.screen} data-stage={stage}>
          {(['tl', 'tr', 'bl', 'br'] as const).map(corner => <span key={corner} className={css.corner} data-corner={corner} aria-hidden="true">✦</span>)}
          {stage === 'poster' ? <button ref={playButton} className={css.poster} onClick={play} aria-label={`프롤로그 영상 «${prologueFilm.title}» 재생`}>
            <img src={gameAsset(prologueFilm.poster)} alt="" />
            <span className={css.posterCopy}>
              <span className={css.play} aria-hidden="true"><i /></span>
              <strong>영상으로 보는 리아의 첫날</strong>
              <small>소리를 켜고 보면 더 좋아요 · YouTube 로 재생돼요</small>
            </span>
          </button> : <>
            <iframe key={take} ref={frame} className={css.film} src={prologueFilmEmbedUrl(origin)} title={`프롤로그 영상 · ${prologueFilm.title}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={listen} />
            {!reduced && <div key={`curtain-${take}`} className={css.curtain} aria-hidden="true"><i /><i /></div>}
          </>}
          {stage === 'ended' && <div className={css.endCard} role="status">
            <span className={css.endStar} aria-hidden="true">✦</span>
            <h3>막이 내렸어요</h3>
            <p>문 너머에서 리아의 이야기가 기다리고 있어요.</p>
            <div><button onClick={play}>↺ 처음부터 다시 보기</button><button className={css.primary} onClick={onClose}>{returnLabel}</button></div>
          </div>}
        </div>
        <p className={css.rotateHint}><i aria-hidden="true" />휴대폰을 가로로 돌리면 더 크게 볼 수 있어요</p>
      </div>
      <footer className={css.footer}>
        <p>{stage === 'poster' ? '방과 후의 교실에서 어제는 없던 문을 연 리아의 이야기' : '전체 화면은 영상 오른쪽 아래 단추로 볼 수 있어요'}</p>
        <a href={prologueFilmWatchUrl()} target="_blank" rel="noopener noreferrer">영상이 안 보이면 YouTube 에서 열기 ↗</a>
      </footer>
    </section>
  </FocusScope>, surface);
}
