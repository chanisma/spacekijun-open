import { useEffect, useState } from 'react';
import { gameAsset } from './game/gameAsset';
import styles from './academy-loading.module.css';

// 게임의 기본 장소가 plaza 라(AcademyPage) 들어가면 어차피 받을 그림이다. 두 번째 방문부터는 캐시에서 즉시 나온다.
const ART = gameAsset('plaza');

/** 진행률에 따라 바뀌는 한 줄 — 무엇을 기다리는지 말해 준다(숫자만 오르면 멈춘 것처럼 보인다). */
function stageLine(percent: number | null) {
  if (percent === null) return '아카데미로 가는 길을 찾는 중…';
  if (percent < 20) return '별빛 지도를 펼치는 중…';
  if (percent < 45) return '도서관의 등불을 켜는 중…';
  if (percent < 70) return '연구시설의 망원경을 닦는 중…';
  if (percent < 92) return '기숙사의 문을 여는 중…';
  return '곧 문이 열려요';
}

/**
 * 별빛 탐구 아카데미 로딩 화면 (2026-10-04 개편 — 사용자 요청 «로딩 화면을 더 세련되게 · 로딩 퍼센티지를 볼 수 있도록»).
 *
 * 두 자리에서 같은 모습으로 쓴다 — 이음매가 보이지 않게:
 *  ① 라우트 청크를 받는 동안(App 의 Suspense, `AcademyLoadingScreen`) — 진행률을 알 수 없어 숫자 없이 흐르는 막대.
 *  ② 게임 그림을 받는 동안(AcademyGame) — Phaser 로더의 진행률 + 지금 장소의 «좌우로 늘린 배경»까지 % 로.
 * 게임 루트(.game)와 같은 전체 화면 자리(position:fixed)를 쓴다 — 전환 순간 화면이 튀지 않게.
 */
export function AcademyLoadingView({ progress = null, label }: { progress?: number | null; label?: string }) {
  const [artReady, setArtReady] = useState(false);
  useEffect(() => {
    const img = new Image();
    // 기다리는 것은 게임이다 — 이 그림(약 3MB)이 우선순위를 가져가면 로딩 화면이 로딩을 늦춘다.
    img.setAttribute('fetchpriority', 'low');
    img.decoding = 'async';
    const done = () => setArtReady(true);
    img.addEventListener('load', done);
    img.src = ART;
    if (img.complete) done(); // 캐시에 있으면 load 가 오지 않을 수 있다
    return () => img.removeEventListener('load', done);
  }, []);
  const percent = progress === null ? null : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className={styles.screen} role="status" aria-live="polite">
      <div className={styles.stars} aria-hidden />
      <div className={styles.art} data-ready={artReady} style={{ backgroundImage: `url("${ART}")` }} aria-hidden />
      <div className={styles.frame}>
        <svg className={styles.emblem} viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r="54" className={styles.ringOuter} />
          <circle cx="60" cy="60" r="42" className={styles.ringInner} />
          <g className={styles.orbit}><circle cx="60" cy="6" r="3.2" /><circle cx="114" cy="60" r="1.8" /></g>
          <path d="M60 30 L65.5 54.5 L90 60 L65.5 65.5 L60 90 L54.5 65.5 L30 60 L54.5 54.5 Z" className={styles.star} />
        </svg>
        <p className={styles.eyebrow}>STARLIGHT INQUIRY ACADEMY</p>
        <h1 className={styles.title}>별빛 탐구 아카데미</h1>
        <div className={styles.meter} role="progressbar" aria-label="아카데미 불러오기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} data-indeterminate={percent === null}>
          <span className={styles.fill} style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
        <div className={styles.readout}>
          <p className={styles.label}>{label ?? stageLine(percent)}</p>
          {percent !== null && <p className={styles.percent}>{percent}<small>%</small></p>}
        </div>
      </div>
    </div>
  );
}

/** 라우트 청크를 받는 동안(App 의 Suspense fallback) — 진행률을 알 수 없다. */
export function AcademyLoadingScreen({ label }: { label?: string }) {
  return <AcademyLoadingView progress={null} label={label} />;
}
