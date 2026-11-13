/**
 * 별까지 쌓기 업적(2026-10-23 사용자 요청 «업적 시스템 추가(코인 보상)») — 다마고찌 업적과 같은 방식.
 *
 * - **진행도는 서버가 센다**(`tower_private.achievement_progress` — tower_state 한 줄). 코인이 걸리므로 화면 계산을 믿지 않고
 *   화면도 서버 값을 그린다(두 벌 계산이면 «달성인데 못 받음»이 생긴다). 여기에는 이름·설명·목표·기본 보상만.
 * - 보상 = 업적마다 한 번(통합 지갑 원장 유일 키 · kind 'tower_achievement' · source_id = 업적 id).
 * - 보상 값은 관리자 «코인 경제» 설정 `tower.achievement.<id>` 가 정본이고 서버가 `rewards` 로 준다. 여기 reward 는 시드 기본값(회귀가 대조).
 * - 목표(goal)·순서는 SQL `tower_private.achievement_rule` 과 두 벌 — 회귀가 대조한다.
 * - 관리자는 받을 수 없다(재화 무한이라 탑 업적이 무에서 코인을 만든다 — 별 조각 판매와 같은 규칙). 진행도는 보인다.
 */
import { ALL_CATCHES, RARE_CATCHES } from './catalog';
import { VISITORS } from './visitors';
import { LETTERS, letterKindCounts } from './letters';

export interface TowerAchievementDef {
  id: string;
  title: string;
  /** 달성 조건 — 잠긴 업적에도 보여 준다(무엇을 하면 되는지) */
  desc: string;
  goal: number;
  /** 달성하고 받는 코인(한 번) — 시드 기본값. 화면은 서버 rewards 를 먼저 쓴다 */
  reward: number;
}

const kinds = letterKindCounts([]);

/** 순서 = 화면 순서 */
export const TOWER_ACHIEVEMENTS: TowerAchievementDef[] = [
  { id: 'first_floor', title: '첫 층', desc: '탑에 첫 층을 올려요.', goal: 1, reward: 5 },
  { id: 'clouds', title: '구름 위로', desc: '탑을 구름층(7층)까지 쌓아요.', goal: 7, reward: 10 },
  { id: 'first_tower', title: '하늘에 닿다', desc: '탑 하나를 16층까지 완성해요.', goal: 1, reward: 30 },
  { id: 'tower_3', title: '세 개의 탑', desc: '탑을 3개 완성해요(4등성).', goal: 3, reward: 50 },
  { id: 'tower_6', title: '1등성', desc: '탑을 6개 완성해 나의 별을 1등성으로.', goal: 6, reward: 100 },
  { id: 'tower_8', title: '새벽별', desc: '탑을 8개 완성해 등성 별자리를 모두 밝혀요.', goal: 8, reward: 150 },
  { id: 'focus_10h', title: '열 시간의 바다', desc: '집중 시간을 모두 10시간 모아요.', goal: 10, reward: 20 },
  { id: 'focus_50h', title: '쉰 시간의 바다', desc: '집중 시간을 모두 50시간 모아요.', goal: 50, reward: 60 },
  { id: 'focus_100h', title: '백 시간의 바다', desc: '집중 시간을 모두 100시간 모아요.', goal: 100, reward: 120 },
  { id: 'sessions_50', title: '끝까지 쉰 번', desc: '집중을 끝까지 50번 채워요.', goal: 50, reward: 30 },
  { id: 'rare_4', title: '희귀한 손님', desc: '희귀 물고기를 4종 낚아요.', goal: 4, reward: 20 },
  { id: 'rare_all', title: '사계절 낚시꾼', desc: `희귀 물고기 ${RARE_CATCHES.length}종을 모두 낚아요(계절마다 다른 물고기).`, goal: RARE_CATCHES.length, reward: 80 },
  { id: 'fish_all', title: '낚시 도감 완성', desc: `낚을 수 있는 것 ${ALL_CATCHES.length}가지를 모두 낚아요(깊은 바다 물고기 포함).`, goal: ALL_CATCHES.length, reward: 50 },
  { id: 'visitors_all', title: '하늘의 친구들', desc: `하늘 방문자 ${VISITORS.length}종을 모두 만나 인사해요.`, goal: VISITORS.length, reward: 40 },
  { id: 'letters_story', title: '별지기의 편지', desc: `별지기의 편지 ${kinds.story.total}통을 모두 읽어요.`, goal: kinds.story.total, reward: 20 },
  { id: 'letters_love', title: '러브레터 수집가', desc: `러브레터 ${kinds.love.total}통을 모두 주워요.`, goal: kinds.love.total, reward: 20 },
  { id: 'letters_prank', title: '장난꾸러기 바다', desc: `장난 편지 ${kinds.prank.total}통을 모두 주워요.`, goal: kinds.prank.total, reward: 20 },
  { id: 'letters_far', title: '먼 곳의 친구들', desc: `먼 곳의 편지 ${kinds.far.total}통을 모두 주워요.`, goal: kinds.far.total, reward: 20 },
  { id: 'letters_all', title: '바다의 우체국', desc: `병 편지 ${LETTERS.length}통을 모두 모아요.`, goal: LETTERS.length, reward: 60 },
];

/** 서버 tower_achievements() 의 답 */
export interface TowerAchievementsData {
  progress: Record<string, number>;
  claimed: string[];
  /** 보상(관리자 코인 설정 — 서버 값). 없으면 정의의 reward */
  rewards: Record<string, number>;
  /** 관리자 — 받을 수 없다(진행도만) */
  admin: boolean;
}

type Json = Record<string, unknown>;

export function parseTowerAchievements(raw: unknown): TowerAchievementsData {
  const j = (raw ?? {}) as Json;
  const num = (o: unknown) => Object.fromEntries(Object.entries((o ?? {}) as Json).map(([k, v]) => [k, Number(v) || 0]));
  return {
    progress: num(j.progress),
    claimed: Array.isArray(j.claimed) ? (j.claimed as unknown[]).map(String) : [],
    rewards: num(j.rewards),
    admin: j.admin === true,
  };
}

export type AchievementState = 'locked' | 'ready' | 'claimed';

/** 한 업적의 상태 — 받았으면 claimed, 진행도가 목표에 닿았으면 ready(받기 단추), 아니면 locked */
export function achievementState(def: TowerAchievementDef, d: TowerAchievementsData): AchievementState {
  if (d.claimed.includes(def.id)) return 'claimed';
  return (d.progress[def.id] ?? 0) >= def.goal ? 'ready' : 'locked';
}

/** 지금 받을 수 있는 업적 수 — 도감 단추 배지(관리자는 0: 받을 수 없다) */
export function readyCount(d: TowerAchievementsData | null): number {
  if (!d || d.admin) return 0;
  return TOWER_ACHIEVEMENTS.filter((a) => achievementState(a, d) === 'ready').length;
}

export function rewardOf(def: TowerAchievementDef, d: TowerAchievementsData | null): number {
  return d?.rewards[def.id] ?? def.reward;
}
