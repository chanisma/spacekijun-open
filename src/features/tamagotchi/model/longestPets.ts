/**
 * «오래 함께한 펫» 순위(2026-10-19 사용자 요청 «가장 오래 키운 리스트 · 해당 캐릭터와 배경세팅과 함께») — 순수 규칙.
 * 순위는 서버 `tama_longest_pets`(tama_private.longest_pets 한 곳)가 정한다. 화면은 그리기만.
 *
 * 값 = 부화부터 «마지막으로 돌본 칸»까지(별이 된 펫은 별이 된 칸까지). 지금 시각으로 세지 않는다 — 버려 둔 펫이 저절로
 * 1등이 되지 않게. 쉬는 동안은 시계가 멈춰 늘지 않는다.
 * ★ 2026-10-26 시간 = «돌본 시간»(상태 JSON caredTicks — 배고픔 0·행복 0·똥·아픔으로 돌봄을 기다리는 칸은 세지 않는다, 이지·노멀·하드 모두).
 *   키가 생기기 전 펫은 예전 값(부화부터 마지막으로 연 칸까지)에서 이어 센다(사용자 결정). `ticks` 가 그 값이다.
 * ★ 2026-10-26 하드 판만 값 = «버텨 낸 위험»(사용자 «개복치는 돌봄의 횟수도 시간만큼이나 중요한 변수») — 점수 → 시간 → 부화 순.
 *   점수는 생명 모델이 쌓는다(petModel.ts `survived`). 키가 생기기 전 기록은 score·cares 가 null(«기록 전»).
 * 주인 표시(사용자 결정): 나 = «나», 별빛 친구 = 이름, 그 밖 = «N학년»/«선생님»(서버가 그렇게만 싣는다).
 */
import type { Equipped } from './catalog';
import type { CustomItemRow } from './decorDesign';
import type { DeathCause, PetMode } from './petModes';

export const LONGEST_PETS_SIZE = 20;
const TICKS_PER_HOUR = 12;
const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;

export interface LongestPet {
  rank: number;
  name: string;
  stage: string;
  branch: string | null;
  dead: boolean;
  death_cause: DeathCause | null;
  mode: PetMode;
  /** 종(2026-10-26) — 없으면 별 가족 */
  species?: string | null;
  ticks: number;
  /** 하드만 — 버텨 낸 위험(순위 값) · 무사히 넘긴 돌보기 횟수. 기록 전이면 null */
  score: number | null;
  cares: number | null;
  resting: boolean;
  mine: boolean;
  friend: boolean;
  /** «나» · 친구 이름 · «2학년» · «선생님» */
  owner: string;
  /** 방 꾸미기(캐릭터 칸은 빠져 있다 — 캐릭터는 이 펫의 skin_item · character) */
  equipped: Equipped;
  custom: CustomItemRow[];
  skin_item: string | null;
  character: { title: string; image_path: string | null } | null;
}

export interface LongestPetsData {
  size: number;
  pets: LongestPet[];
  /** 내 펫 중 가장 높은 자리(순위 밖이어도) — 펫이 없거나 아직 알이면 null */
  me: { rank: number; name: string; ticks: number; score: number | null } | null;
}

/** «12일 5시간» · «7시간» · «방금 깨어남» */
export function ageLabel(ticks: number): string {
  const t = Math.max(0, Math.floor(ticks));
  const days = Math.floor(t / TICKS_PER_DAY);
  const hours = Math.floor((t % TICKS_PER_DAY) / TICKS_PER_HOUR);
  if (days === 0 && hours === 0) return '방금 깨어남';
  if (days === 0) return `${hours}시간`;
  return hours ? `${days}일 ${hours}시간` : `${days}일`;
}

/** 하드 점수 «2.41점» — 기록 전(null)이면 «기록 전» */
export const scoreLabel = (score: number | null | undefined) => (typeof score === 'number' ? `${score.toFixed(2)}점` : '기록 전');

/** 유학을 떠난 펫(2026-10-26) — 기념 기록의 이유 study_abroad. 별이 된 펫이 아니다 */
export const isAbroad = (p: Pick<LongestPet, 'death_cause'>) => p.death_cause === 'study_abroad';

/** 순위 칸의 메달 — 1·2·3위만 */
export const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** numeric 은 PostgREST 가 숫자로 준다 — 그 밖(없음·문자열)은 null */
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 서버가 준 값이 순위 모양인지 — 모양이 틀린 줄은 버린다(깨진 줄로 목록 전체를 죽이지 않는다) */
export function parseLongestPets(raw: unknown): LongestPetsData {
  const r = (raw ?? {}) as Partial<LongestPetsData>;
  const pets = Array.isArray(r.pets) ? r.pets.filter((p): p is LongestPet =>
    !!p && typeof p.rank === 'number' && typeof p.name === 'string' && typeof p.ticks === 'number' && typeof p.owner === 'string') : [];
  const me = r.me && typeof r.me.rank === 'number' && typeof r.me.ticks === 'number' ? { ...r.me, score: num(r.me.score) } : null;
  return {
    size: typeof r.size === 'number' ? r.size : LONGEST_PETS_SIZE,
    pets: pets.map((p) => ({ ...p, score: num(p.score), cares: num(p.cares), equipped: p.equipped ?? {}, custom: Array.isArray(p.custom) ? p.custom : [], character: p.character ?? null })),
    me,
  };
}
