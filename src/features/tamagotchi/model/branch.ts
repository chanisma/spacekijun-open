/**
 * 진화 가지(Phase 3, 기획 §7 «내 습관이 펫 모양이 된다») — 어른이 될 때 그동안의 습관으로 모습이 갈린다.
 *
 * 근거 = 펫이 태어난 뒤 받은 코인의 종류별 횟수(`tama_credit_read().lifetime`). 가장 많은 습관이 가지를 정하고,
 * 습관이 거의 없으면(합 3 미만) 기본 «별지기»로 자란다. 한 번 정해지면 바뀌지 않는다(`PetState.branch` 에 남는다).
 */
import type { CreditKind } from './credit';

export type Branch = 'planner' | 'thinker' | 'focus' | 'heart';
export type BranchOrBasic = Branch | 'basic';

/**
 * `hint` = 도감에서 아직 못 만난 모습에 보이는 수수께끼 한 줄. 이름·메뉴 이름(계획·돌아보기·집중·일기)을
 * 그대로 말하지 않고 «무엇을 하면» 만나는지만 비춘다 — 정답(`habit`)은 만난 뒤에 보인다.
 */
export const BRANCH_INFO: Record<BranchOrBasic, { name: string; habit: string; hint: string }> = {
  basic: { name: '별지기', habit: '', hint: '' },
  planner: { name: '별설계자', habit: '계획을 꾸준히 세워서', hint: '내일을 미리 그려 두면…' },
  thinker: { name: '별현자', habit: '하루를 자주 돌아봐서', hint: '지난 하루를 되짚어 보면…' },
  focus: { name: '별기사', habit: '함께 집중을 자주 해서', hint: '누군가와 나란히 몰두하면…' },
  heart: { name: '별시인', habit: '일기를 자주 들려줘서', hint: '속마음을 털어놓으면…' },
};

const FROM_KIND: Record<CreditKind, Branch> = { plan: 'planner', reflect: 'thinker', focus: 'focus', diary: 'heart' };
/** 같은 횟수일 때의 순서 — 하기 어려운 습관이 앞 */
const TIE_ORDER: CreditKind[] = ['focus', 'reflect', 'diary', 'plan'];
export const BRANCH_MIN_HABITS = 3;

export function chooseBranch(lifetime: Partial<Record<CreditKind, number>> | null | undefined): BranchOrBasic {
  if (!lifetime) return 'basic';
  const total = TIE_ORDER.reduce((s, k) => s + (lifetime[k] ?? 0), 0);
  if (total < BRANCH_MIN_HABITS) return 'basic';
  const best = TIE_ORDER.reduce((a, k) => ((lifetime[k] ?? 0) > (lifetime[a] ?? 0) ? k : a), TIE_ORDER[0]);
  return FROM_KIND[best];
}
