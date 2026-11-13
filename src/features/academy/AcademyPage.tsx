import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AcademyGame } from './game/AcademyGame';
import { isGamePlace } from './game/world';
import { rotatedFrameSrc, safeAcademyPath, UNROTATE_MESSAGE } from './game/screenRotation';
import { useScreenOrientation, type ScreenOrientationControl } from './game/useScreenOrientation';
import css from './game/game.module.css';
import { useCoinEconomy } from '@/lib/coinEconomy';
import './game/economySync';

export default function AcademyPage() {
  const { place } = useParams();
  const location = useLocation();
  const orientation = useScreenOrientation(location.pathname);
  useCoinEconomy(); // 관리자 코인 설정 — 장 보상·공방·자습 보상 문구
  // 돌린 화면(아이폰 등 화면 잠금을 못 하는 브라우저) — 게임을 이 문서에서 내리고, 같은 아카데미를 돌린 iframe 으로 띄운다.
  if (orientation.rotation !== 0) return <RotatedAcademy orientation={orientation} />;
  return <AcademyGame place={isGamePlace(place) ? place : 'plaza'} orientation={orientation} />;
}

function RotatedAcademy({ orientation }: { orientation: ScreenOrientationControl }) {
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  // 처음 연 주소로 고정한다 — iframe 안에서 장소를 옮겨도 다시 그리지 않는다(다시 그리면 처음부터 불러온다).
  const src = useRef(rotatedFrameSrc(window.location.pathname, window.location.search)).current;
  const { reset } = orientation;
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; path?: unknown } | null;
      if (data?.type !== UNROTATE_MESSAGE) return;
      navigate(safeAcademyPath(data.path), { replace: true });
      reset();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate, reset]);
  return <div className={css.rotatedShell} data-rotate={orientation.rotation}>
    <iframe ref={frame} className={css.rotatedFrame} src={src} title="가로로 돌린 별빛 아카데미" allow="fullscreen" />
  </div>;
}
