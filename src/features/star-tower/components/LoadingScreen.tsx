/**
 * 첫 로딩 화면(2026-10-11) — 탑 기록 · 그림 · 글꼴이 다 될 때까지 장면을 덮고 «무엇을 기다리는지 · 몇 %»를 말한다.
 * 그림은 받는 중이라 쓸 수 없으므로 탑은 CSS 블록으로 한 층씩 쌓아 올린다.
 * 다 되면 잠깐 흐려지며 걷힌다 — 흐려지는 동안에도 장면을 누를 수 있게 pointer-events 를 먼저 끈다.
 * 서버를 못 읽으면 같은 자리에서 이유와 [다시 시도]를 보인다(로딩이 오류 화면으로 바뀌는 것이지 겹치지 않는다).
 */
import { ArrowLeft } from 'lucide-react';
import { LOAD_STEPS, loadProgress, type LoadState } from '../model/loading';

const STARS = Array.from({ length: 28 }, (_, i) => ({
  // 결정론적 배치 — 다시 그릴 때마다 별이 튀지 않게
  left: `${(i * 37 + 11) % 100}%`,
  top: `${(i * 53 + 7) % 62}%`,
  delay: `${((i * 7) % 20) / 10}s`,
  big: i % 5 === 0,
}));

export function LoadingScreen({ state, leaving, error, onRetry, onExit }: {
  state: LoadState; leaving: boolean; error: string | null; onRetry: () => void; onExit: () => void;
}) {
  const p = loadProgress(state);
  return (
    <div className="st-loading" data-st-loading={leaving ? 'leaving' : 'on'} aria-busy={!leaving}>
      <div className="st-loading-sky" aria-hidden="true">
        {STARS.map((s, i) => <i key={i} className={s.big ? 'big' : undefined} style={{ left: s.left, top: s.top, animationDelay: s.delay }} />)}
      </div>
      <div className="st-loading-sea" aria-hidden="true" />

      <button type="button" className="st-icon st-loading-exit" aria-label="나가기 — 홈으로" onClick={onExit}><ArrowLeft /><span>나가기</span></button>

      <div className="st-loading-body">
        <div className="st-loading-tower" aria-hidden="true">
          <span className="star">★</span>
          <b /><b /><b /><b />
          <span className="base" />
        </div>
        <h1 className="st-loading-title">별까지 쌓기</h1>

        {error ? (
          <div className="st-panel st-loading-card" role="alert">
            <span>탑을 불러오지 못했어요.</span>
            <span className="st-hint">{error}</span>
            <button type="button" className="st-btn primary" onClick={onRetry}>다시 시도</button>
          </div>
        ) : (
          <div className="st-panel st-loading-card" role="status" aria-live="polite">
            <span>{p.current ? `${p.current} 준비 중…` : '탑에 다 왔어요!'}</span>
            <div className="st-bar" role="progressbar" aria-label="불러오는 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent}>
              <i style={{ width: `${p.percent}%`, transition: 'width 0.25s' }} />
            </div>
            <div className="st-loading-steps">
              {LOAD_STEPS.map((st) => {
                const done = st.key === 'art' ? state.art.done : state[st.key];
                return (
                  <span key={st.key} className={done ? 'st-good' : 'st-hint'}>
                    {done ? '✓ ' : '· '}{st.label}{st.key === 'art' && !done && state.art.total > 0 ? ` ${state.art.loaded}/${state.art.total}` : ''}
                  </span>
                );
              })}
              <b className="st-loading-pct">{p.percent}%</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
