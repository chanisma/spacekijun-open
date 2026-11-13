/**
 * 펫의 종(種)(2026-10-26 — docs/plans/2026-10-26-tamagotchi-species-link.md). 순수 표 — 생명 모델·그림·서버 대조 회귀가 같이 읽는다.
 *
 * 사용자 요청: «친구와 통신을 하면 새로운 캐릭터(통신을 통해서만 얻을 수 있는)… 알부터 어른까지, 특수한 조건으로 해금되는 모습까지» ·
 * «펫 디자인 추가(알부터~). 해당 디자인은 기존에 캐릭터를 어떻게 키웠느냐에 따라 해금됨».
 *
 * - `star` = 지금 별 가족(상태 JSON 에 `species` 키가 없다 — 옛 펫 모양 그대로). 어른 모습 = 습관 가지 4 + 별지기(branch.ts).
 * - `signal` = 통신으로만(새 친구와 첫 통신 → 알 표). 특수 어른 «별우체부» = 부화~어른 사이 서로 다른 친구 2명과 교환 완료.
 * - `tide`·`moon`·`sprout` = 키운 방식으로 해금(판정 = 서버 `tama_private.species_unlocked` 한 곳, 화면은 서버 답을 그리기만).
 * 종은 알을 받을 때 정하고 바뀌지 않는다(서버 트리거 tama_pet_keep_species — 모드와 같은 모양).
 */
import { BRANCH_INFO, type BranchOrBasic } from './branch';

export type Species = 'star' | 'signal' | 'tide' | 'moon' | 'sprout';
export const SPECIES: readonly Species[] = ['star', 'signal', 'tide', 'moon', 'sprout'];
/** 새 종 — 그림 묶음이 따로 있는 종(별 가족은 기존 그림) */
export const NEW_SPECIES: readonly Exclude<Species, 'star'>[] = ['signal', 'tide', 'moon', 'sprout'];
/** 키운 방식으로 해금되는 종(알 받을 때 고른다) — signal 은 알 표로만 */
export const UNLOCK_SPECIES: readonly Exclude<Species, 'star' | 'signal'>[] = ['tide', 'moon', 'sprout'];

/** 새 종의 어른 모습 — signal 만 특수 모습이 있다 */
export type SpeciesForm = 'basic' | 'courier';
/** 상태 JSON 의 branch 칸 — 별 가족은 가지, 새 종은 어른 모습 */
export type PetBranch = BranchOrBasic | 'courier';

export const SPECIES_INFO: Record<Species, {
  family: string;
  /** 단계 이름(알 · 아기 · 어린이 · 청소년 · 어른) — 새 종만. 별 가족은 기존 화면 글 */
  names?: { baby: string; child: string; teen: string; adult: string; courier?: string };
  /** 해금 방법 한 줄(만난 뒤에 보인다) · 수수께끼(못 만났을 때) */
  how: string;
  hint: string;
}> = {
  star: { family: '별 가족', how: '처음부터 함께해요', hint: '' },
  signal: {
    family: '전파 가족',
    names: { baby: '삐리', child: '뻬리', teen: '찌리', adult: '별전파', courier: '별우체부' },
    how: '친구와 처음 통신하면 알을 받아요',
    hint: '누군가와 신호를 주고받으면…',
  },
  tide: {
    family: '물결 가족',
    names: { baby: '몽', child: '몽글', teen: '몽글몽글', adult: '별해파리' },
    how: '개복치(하드) 펫을 어른까지 키웠어요',
    hint: '아주 작은 일에도 별이 되는 친구를 끝까지 지켜 내면…',
  },
  moon: {
    family: '달 가족',
    names: { baby: '토', child: '토실', teen: '토실이', adult: '별달토끼' },
    how: '한 펫을 30일 동안 돌봤어요',
    hint: '한 친구를 오래오래 돌봐 주면…',
  },
  sprout: {
    family: '숲 가족',
    names: { baby: '꼬', child: '꼬물', teen: '꼬무리', adult: '별숲지기' },
    how: '습관으로 자라는 어른 모습 넷을 모두 만났어요',
    hint: '서로 다른 습관으로 여러 번 키워 보면…',
  },
};

/** 특수 어른 «별우체부» — 부화~어른 사이 서로 다른 친구와 교환을 마친 수 */
export const COURIER_TRADE_PARTNERS = 2;

export const isSpecies = (v: unknown): v is Species => typeof v === 'string' && (SPECIES as readonly string[]).includes(v);
/** 상태의 종 — 키가 없거나 모르는 값이면 별 가족(깨진 값으로 화면을 죽이지 않는다) */
export const speciesOf = (state: { species?: unknown }): Species => (isSpecies(state.species) ? state.species : 'star');

/** 어른이 될 때 새 종의 모습 — 별 가족은 chooseBranch(습관) */
export function chooseForm(species: Exclude<Species, 'star'>, facts: { tradePartners?: number | null }): SpeciesForm {
  if (species === 'signal' && (facts.tradePartners ?? 0) >= COURIER_TRADE_PARTNERS) return 'courier';
  return 'basic';
}

/**
 * 그림 고르기 열쇠 — 그림 함수들의 «branch» 자리에 넣는다. 별 가족 = 가지 그대로(어른만 의미가 있다),
 * 새 종 = `sp:<종>:<모습>`(모든 단계가 그 종의 그림이다).
 */
export type SpeciesLook = `sp:${Exclude<Species, 'star'>}:${SpeciesForm}`;
export type LookKey = BranchOrBasic | SpeciesLook;

export function lookOf(species: Species, branch?: PetBranch | null): LookKey | undefined {
  if (species === 'star') return branch && branch !== 'courier' ? branch : undefined;
  return `sp:${species}:${branch === 'courier' ? 'courier' : 'basic'}`;
}
export const isSpeciesLook = (k: unknown): k is SpeciesLook => typeof k === 'string' && k.startsWith('sp:');
export function parseLook(k: SpeciesLook): { species: Exclude<Species, 'star'>; form: SpeciesForm } {
  const [, species, form] = k.split(':');
  return { species: species as Exclude<Species, 'star'>, form: form === 'courier' ? 'courier' : 'basic' };
}

/** 어른 모습 이름(줄 끝 « · 별설계자»·« · 별우체부») — 없으면 null. 별 가족 = 가지(별지기는 말하지 않는다), 새 종 = 그 종 이름 */
export function lookName(species: Species, stage: string, branch?: PetBranch | null): string | null {
  if (species === 'star') return stage === 'adult' && branch && branch !== 'basic' && branch !== 'courier' ? BRANCH_INFO[branch].name : null;
  return speciesStageName(species, (stage === 'egg' || stage === 'baby' || stage === 'child' || stage === 'teen' || stage === 'adult') ? stage : 'baby', branch);
}

/** 단계 이름 — 새 종은 그 종의 이름, 별 가족은 null(기존 글을 쓴다) */
export function speciesStageName(species: Species, stage: 'egg' | 'baby' | 'child' | 'teen' | 'adult', branch?: PetBranch | null): string | null {
  const n = SPECIES_INFO[species].names;
  if (!n || stage === 'egg') return null;
  if (stage === 'adult' && branch === 'courier' && n.courier) return n.courier;
  return n[stage];
}
