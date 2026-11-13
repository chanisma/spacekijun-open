/**
 * 관리자 코인 설정 → 별빛 아카데미 화면 상수(2026-10-21). 불러오기만 하면 등록된다(AcademyGame).
 * 키 이름은 DB `coin_economy_setting` 과 같다 — 회귀 `scripts/coin-economy-test/run.mts` 가 시드와 대조한다.
 */
import { coinValue, onCoinEconomy } from '@/lib/coinEconomy';
import { workshopEconomy } from './workshopModel';
import { setStudyEconomy, STUDY_DAILY_CAP, STUDY_REWARD } from './studyService';

/** 장 완료 보상 — 장면의 «챕터 완료 보상 · N코인» 문구 */
export const academyRewards = { chapter: 50 };

const DEFAULTS = { ...workshopEconomy, chapter: academyRewards.chapter, study: STUDY_REWARD, studyCap: STUDY_DAILY_CAP };

onCoinEconomy((v) => {
  workshopEconomy.orderCost = coinValue(v, 'academy.workshop_order_cost', DEFAULTS.orderCost);
  workshopEconomy.salePrice = coinValue(v, 'academy.workshop_sale_price', DEFAULTS.salePrice);
  workshopEconomy.commission = coinValue(v, 'academy.workshop_commission', DEFAULTS.commission);
  academyRewards.chapter = coinValue(v, 'academy.chapter_reward', DEFAULTS.chapter);
  setStudyEconomy(coinValue(v, 'study.attendance_reward', DEFAULTS.study), coinValue(v, 'study.daily_receipts', DEFAULTS.studyCap));
});
