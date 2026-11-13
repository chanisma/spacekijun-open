/**
 * 별까지 쌓기 (`/star-tower`) — 집중하는 동안 낚시하고, 낚은 것으로 물 위의 탑을 하늘까지 쌓는 방치형 타이머 게임.
 * 전체 화면 앱(다마고찌·아카데미처럼 앱 껍데기 없이). docs/features/star-tower.md
 *
 * 학생·교사·관리자(라우트 `allowed` · 서버 `tower_private.actor()` · routeAccess 직원 차단 — 세 곳이 짝).
 * 메뉴 기본값은 관리자만(menuRegistry `defaultVisibleToUsers: false`) — 다듬은 뒤 공개.
 * `?mini=1` = 작은 팝업 창(Document PiP 를 못 쓰는 브라우저의 대체).
 */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StarTowerApp } from './StarTowerApp';
import { serverTowerApi } from './services/towerApi';
import { useCoinEconomy } from '@/lib/coinEconomy';
import './model/economySync';

export default function StarTowerPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useCoinEconomy(); // 관리자 코인 설정 — 별 조각 시세·하루 상한
  return <StarTowerApp api={serverTowerApi} mini={params.get('mini') === '1'} onExit={() => navigate('/')} />;
}
