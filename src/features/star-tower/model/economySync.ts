/**
 * 관리자 코인 설정 → 별까지 쌓기 «별 조각·남는 병 → 코인» 상수(2026-10-21 · 병은 2026-10-23). 불러오기만 하면 등록된다(StarTowerPage).
 * 하네스(mock api)는 이 파일을 부르지 않아 기본값으로 돈다.
 * 업적 보상은 여기서 바꾸지 않는다 — 서버 tower_achievements() 가 rewards 로 준다(화면은 그 값을 먼저 쓴다).
 */
import { coinValue, onCoinEconomy } from '@/lib/coinEconomy';
import { BOTTLE_COIN, STAR_COIN } from './catalog';

const DEFAULTS = { rate: STAR_COIN.rate, dailyCap: STAR_COIN.dailyCap, bottleRate: BOTTLE_COIN.rate, bottleCap: BOTTLE_COIN.dailyCap };

onCoinEconomy((v) => {
  STAR_COIN.rate = coinValue(v, 'tower.star_rate', DEFAULTS.rate);
  STAR_COIN.dailyCap = coinValue(v, 'tower.star_daily_cap', DEFAULTS.dailyCap);
  BOTTLE_COIN.rate = coinValue(v, 'tower.bottle_rate', DEFAULTS.bottleRate);
  BOTTLE_COIN.dailyCap = coinValue(v, 'tower.bottle_daily_cap', DEFAULTS.bottleCap);
});
