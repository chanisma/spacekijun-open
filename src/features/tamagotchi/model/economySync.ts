/**
 * 관리자 코인 설정 → 다마고찌 화면 상수(2026-10-21). 이 파일을 불러오기만 하면 등록된다(TamagotchiPage).
 * 키 이름은 DB `coin_economy_setting` 과 같다 — 회귀 `scripts/coin-economy-test/run.mts` 가 시드와 대조한다.
 */
import { coinValue, onCoinEconomy } from '@/lib/coinEconomy';
import { CREDIT_KINDS, CREDIT_RULES, setCreditEconomy, type CreditKind } from './credit';
import { GACHA_MACHINES } from './gachaMachines';
import { SLOT_PRICES } from './petSlots';
import { ACHIEVEMENTS } from './achievements';
import { DECOR_PRICES } from '../services/decorService';
import { CHARACTER_PRICE, setCharacterPrice } from '../services/socialService';

/** 코드 기본값(처음 불러올 때의 값) — 설정이 빠진 키는 이 값으로 되돌린다 */
const DEFAULTS = {
  credit: Object.fromEntries(CREDIT_KINDS.map((k) => [k, { amount: CREDIT_RULES[k].amount, cap: CREDIT_RULES[k].cap }])) as unknown as Record<CreditKind, { amount: number; cap: number }>,
  gacha: GACHA_MACHINES.map((m) => ({ price: m.price, refund: m.refund })),
  slots: [...SLOT_PRICES],
  achievements: ACHIEVEMENTS.map((a) => a.reward),
  decor: { ...DECOR_PRICES },
  character: CHARACTER_PRICE,
  planning: 5,
};

/** `tama.decor.<키>` — 바닥·선반·벽은 «other» 하나다(서버 tama_decor_write 와 같은 묶음) */
const DECOR_KEY: Record<keyof typeof DECOR_PRICES, string> = {
  device: 'device', shell: 'shell', wallpaper: 'wallpaper', rug: 'rug', floor: 'other', shelf: 'other', wall: 'other',
};

onCoinEconomy((v) => {
  setCreditEconomy(
    Object.fromEntries(CREDIT_KINDS.map((k) => [k, {
      amount: coinValue(v, `tama.${k}.amount`, DEFAULTS.credit[k].amount),
      cap: coinValue(v, `tama.${k}.cap`, DEFAULTS.credit[k].cap),
    }])),
    coinValue(v, 'academy.planning_reward', DEFAULTS.planning),
  );
  GACHA_MACHINES.forEach((m, i) => {
    m.price = coinValue(v, `tama.gacha.${m.id}.price`, DEFAULTS.gacha[i].price);
    m.refund = coinValue(v, `tama.gacha.${m.id}.refund`, DEFAULTS.gacha[i].refund);
  });
  DEFAULTS.slots.forEach((d, i) => { SLOT_PRICES[i] = coinValue(v, `tama.pet_slot.${i + 1}`, d); });
  ACHIEVEMENTS.forEach((a, i) => { a.reward = coinValue(v, `tama.achievement.${a.id}`, DEFAULTS.achievements[i]); });
  for (const slot of Object.keys(DECOR_PRICES) as (keyof typeof DECOR_PRICES)[]) {
    DECOR_PRICES[slot] = coinValue(v, `tama.decor.${DECOR_KEY[slot]}`, DEFAULTS.decor[slot]);
  }
  setCharacterPrice(coinValue(v, 'tama.character_order', DEFAULTS.character));
});
