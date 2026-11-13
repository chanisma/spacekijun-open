/**
 * 펫 앨범 · 도감(Phase 6) — 순수 규칙(화면·회귀 공용). 앨범 행은 서버 트리거가 쌓는다(`tama_album`).
 */
import { STAGE_LABEL, type Stage } from './petModel';
import { BRANCH_INFO, type BranchOrBasic } from './branch';
import { josa } from './messages';
import { deathCauseOf, isDeathCause } from './petModes';
import { NEW_SPECIES, SPECIES_INFO, isSpecies, lookName, type PetBranch, type Species } from './species';

export interface AlbumEntry {
  id: number;
  pet_id: string | null;
  pet_name: string;
  kind: 'adopt' | 'hatch' | 'evolve' | 'branch' | 'sick' | 'healed' | 'character' | 'death' | 'abroad';
  stage: string | null;
  branch: string | null;
  note: string | null;
  at: string;
  /** 종(2026-10-26) — 없으면 별 가족(서버 트리거가 그 펫의 상태에서 채운다) */
  species?: string | null;
}

/** 앨범 한 줄 — 무엇이 있었는지 한 문장 */
export function albumLine(e: Pick<AlbumEntry, 'kind' | 'stage' | 'branch' | 'note' | 'pet_name'> & { species?: string | null }): string {
  const stage = e.stage && e.stage in STAGE_LABEL ? STAGE_LABEL[e.stage as Stage] : '';
  // 받침에 맞춘 조사(«첫째가», «달이가» · «청소년이», «아기가»)
  const who = `${e.pet_name}${josa(e.pet_name, '이', '가')}`;
  const sp: Species = isSpecies(e.species) ? e.species : 'star';
  const branchName = sp === 'star'
    ? BRANCH_INFO[(e.branch ?? 'basic') as BranchOrBasic]?.name ?? '어른'
    : lookName(sp, 'adult', e.branch as PetBranch | null) ?? '어른';
  switch (e.kind) {
    case 'adopt': return `${e.pet_name}의 알을 받았어요`;
    case 'hatch': return `${who} 알에서 나왔어요`;
    case 'evolve': return `${who} ${stage}${josa(stage, '이', '가')} 되었어요`;
    case 'branch': return `${who} «${branchName}»${josa(branchName, '으로', '로')} 자랐어요`;
    case 'sick': return `${who} 아팠어요`;
    case 'healed': return `${who} 나았어요`;
    case 'character': return `«${e.note ?? '새 캐릭터'}» 캐릭터가 도착했어요`;
    // 모드(2026-10-19) — note = 왜 별이 됐는가(하드는 개복치의 이유). 옛 행·노멀의 «오래 아파서»는 단계만
    // 유학(2026-10-26) — 되돌릴 수 없이 떠났다(별이 된 것이 아니다)
    case 'abroad': return `${who} 다른 별로 유학을 떠났어요`;
    case 'death': return isDeathCause(e.note) && e.note !== 'sick'
      ? `${who} ${deathCauseOf(e.note).phrase} 별이 되었어요`
      : `${who} ${stage ? `${stage}의 모습으로 ` : ''}별이 되었어요`;
  }
}

/** 도감 칸 — 만날 수 있는 모습(알 제외). 어른 기본 + 가지 넷 */
export const DEX: { key: string; stage: Stage; branch?: BranchOrBasic; label: string }[] = [
  { key: 'baby', stage: 'baby', label: STAGE_LABEL.baby },
  { key: 'child', stage: 'child', label: STAGE_LABEL.child },
  { key: 'teen', stage: 'teen', label: STAGE_LABEL.teen },
  { key: 'adult', stage: 'adult', branch: 'basic', label: `${STAGE_LABEL.adult}(기본)` },
  ...(['planner', 'thinker', 'focus', 'heart'] as const).map((b) => ({ key: b, stage: 'adult' as Stage, branch: b as BranchOrBasic, label: BRANCH_INFO[b].name })),
];

/** 앨범에서 만난 도감 칸 — 부화 = 아기, 진화 = 그 단계, 가지 = 그 가지(기본 가지 = 어른 기본) */
export function dexSeen(entries: Pick<AlbumEntry, 'kind' | 'stage' | 'branch'>[]): Set<string> {
  const seen = new Set<string>();
  for (const e of entries) {
    // 새 종의 모습은 별 가족 도감에 넣지 않는다(서버 achievement_progress 의 dex 와 같다)
    if ((e as { species?: string | null }).species) continue;
    if (e.kind === 'hatch') seen.add('baby');
    if (e.kind === 'evolve' && e.stage && e.stage !== 'adult') seen.add(e.stage);
    if (e.kind === 'branch' && e.branch) seen.add(e.branch === 'basic' ? 'adult' : e.branch);
  }
  return seen;
}

/** 새 종 도감 칸(2026-10-26) — 아기 · 어린이 · 청소년 · 어른(+ 특수 어른) */
export function speciesDex(species: Exclude<Species, 'star'>): { key: string; stage: Stage; form?: PetBranch; label: string }[] {
  const n = SPECIES_INFO[species].names!;
  return [
    { key: 'baby', stage: 'baby', label: n.baby },
    { key: 'child', stage: 'child', label: n.child },
    { key: 'teen', stage: 'teen', label: n.teen },
    { key: 'adult', stage: 'adult', form: 'basic', label: n.adult },
    ...(n.courier ? [{ key: 'courier', stage: 'adult' as Stage, form: 'courier' as PetBranch, label: n.courier }] : []),
  ];
}

/** 앨범에서 만난 새 종 도감 칸 — 그 종의 줄만 */
export function speciesDexSeen(entries: Pick<AlbumEntry, 'kind' | 'stage' | 'branch' | 'species'>[], species: Exclude<Species, 'star'>): Set<string> {
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.species !== species) continue;
    if (e.kind === 'hatch') seen.add('baby');
    if (e.kind === 'evolve' && e.stage && e.stage !== 'adult') seen.add(e.stage);
    if (e.kind === 'branch' && e.branch) seen.add(e.branch === 'courier' ? 'courier' : 'adult');
  }
  return seen;
}

export { NEW_SPECIES };
