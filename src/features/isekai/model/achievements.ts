/**
 * 이세계 사회인 업적(2026-10-28 사용자 요청 «업적 시스템도 추가해서 적용») — 별까지 쌓기 업적과 같은 방식.
 *
 * - **진행도는 서버가 센다**(`isekai3d_private.achievement_progress`). 코인이 걸리므로 화면도 서버 값을 그린다.
 *   여기에는 이름·설명·목표·기본 보상·칭호만.
 * - 보상 = 업적마다 한 번(통합 지갑 원장 유일 키 · kind 'isekai3d_achievement' · source_id = 업적 id).
 *   값의 정본은 관리자 «코인 경제» `isekai3d.achievement.<id>` — 서버가 `rewards` 로 준다. 여기 reward 는 시드 기본값(회귀가 대조).
 * - 목표(goal)·순서는 SQL `isekai3d_private.achievement_table` 과 두 벌 — 회귀 `scripts/isekai-test` 가 대조한다.
 * - 관리자는 받을 수 없다(진행도만).
 * - 사회생활·역량·열망(2026-10-28 사용자 요청 «사회 생활 체험 · 다양한 역량 · 다양한 열망») — 세이브 state(클라이언트 값)로 세는
 *   것은 보상 ≤ 15, 근무 카드 «방식»(함께·스스로·원칙)만 서버 기록이다(마이그레이션 20261028140000).
 */

export type AchievementGroup = 'work' | 'society' | 'skill' | 'dream' | 'life' | 'talk' | 'drama';

export interface IsekaiAchievementDef {
  id: string;
  group: AchievementGroup;
  title: string;
  /** 달성하면 사원증에 달 수 있는 칭호 */
  badge: string;
  desc: string;
  goal: number;
  /** 시드 기본 코인 — 화면은 서버 rewards 를 먼저 쓴다 */
  reward: number;
  /** 진행 표시 단위(«일»·«개»·«원») */
  unit: string;
}

export const ACHIEVEMENT_GROUPS: { id: AchievementGroup; label: string; hint: string }[] = [
  { id: 'work', label: '근태', hint: '출근 도장과 오락기' },
  { id: 'society', label: '사회생활', hint: '취업·승진·인맥, 그리고 일터에서 문제를 푸는 방식' },
  { id: 'skill', label: '역량', hint: '일터가 원하는 힘 — 의사소통·공감·리더십·논리·디지털·마음' },
  { id: 'dream', label: '열망', hint: '세이브 속 사람이 품은 꿈을 고르고 이루기' },
  { id: 'life', label: '이세계 생활', hint: '세이브에 쌓인 나날' },
  { id: 'talk', label: '사내 면담', hint: '게임 속 질문에 답하기' },
  { id: 'drama', label: '사내 드라마', hint: '에피소드를 끝까지' },
];

/** 순서 = 화면 순서 = SQL 순서 */
export const ISEKAI_ACHIEVEMENTS: IsekaiAchievementDef[] = [
  { id: 'first_day', group: 'work', title: '첫 출근', badge: '신입', desc: '이세계 사회인을 처음 플레이해요.', goal: 1, reward: 5, unit: '일' },
  { id: 'days_7', group: 'work', title: '수습 딱지 떼기', badge: '수습 수료', desc: '서로 다른 7일 동안 플레이해요.', goal: 7, reward: 15, unit: '일' },
  { id: 'days_30', group: 'work', title: '근속 한 달', badge: '근속 사원', desc: '서로 다른 30일 동안 플레이해요.', goal: 30, reward: 50, unit: '일' },
  { id: 'streak_5', group: 'work', title: '개근상', badge: '개근왕', desc: '5일 연속으로 출근해요.', goal: 5, reward: 20, unit: '일' },
  { id: 'coins_10', group: 'work', title: '오락실 단골', badge: '오락실 VIP', desc: '오락기에 동전을 모두 10개 넣어요(무료 동전 포함).', goal: 10, reward: 10, unit: '개' },
  { id: 'game_day_30', group: 'life', title: '이세계 한 달', badge: '이세계 정착민', desc: '한 세이브에서 게임 속 30일을 살아요.', goal: 30, reward: 10, unit: '일' },
  { id: 'game_day_100', group: 'life', title: '이세계 백일', badge: '백일 잔치', desc: '한 세이브에서 게임 속 100일을 살아요.', goal: 100, reward: 15, unit: '일' },
  { id: 'money_10k', group: 'life', title: '첫 목돈', badge: '알뜰 살림꾼', desc: '세이브의 자산이 10,000원을 넘어요.', goal: 10000, reward: 10, unit: '원' },
  { id: 'money_50k', group: 'life', title: '이세계 자산가', badge: '큰손', desc: '세이브의 자산이 50,000원을 넘어요.', goal: 50000, reward: 15, unit: '원' },
  { id: 'family_3', group: 'life', title: '한 지붕 세 식구', badge: '가장', desc: '한 세이브에 세 사람이 함께 살아요.', goal: 3, reward: 5, unit: '명' },
  { id: 'answer_1', group: 'talk', title: '첫 면담', badge: '면담 데뷔', desc: '게임 속 질문에 처음 답해요.', goal: 1, reward: 5, unit: '개' },
  { id: 'answer_10', group: 'talk', title: '성실한 사원', badge: '성실 사원', desc: '게임 속 질문에 10번 답해요.', goal: 10, reward: 20, unit: '개' },
  { id: 'answer_30', group: 'talk', title: '사내 인터뷰 스타', badge: '사보 표지 모델', desc: '게임 속 질문에 30번 답해요.', goal: 30, reward: 40, unit: '개' },
  { id: 'careers_3', group: 'talk', title: 'N잡러', badge: 'N잡러', desc: '서로 다른 3가지 직업의 질문에 답해요.', goal: 3, reward: 20, unit: '개' },
  { id: 'life_5', group: 'talk', title: '인생 상담소', badge: '인생 상담가', desc: '인생 질문(첫 직장·이사 같은 순간)에 5번 답해요.', goal: 5, reward: 15, unit: '개' },
  { id: 'episode_1', group: 'drama', title: '첫 드라마 완결', badge: '주인공', desc: '사내 드라마 에피소드 하나를 끝까지 봐요.', goal: 1, reward: 15, unit: '편' },
  { id: 'episode_5', group: 'drama', title: '드라마 작가', badge: '드라마 작가', desc: '에피소드 5편을 완결해요.', goal: 5, reward: 40, unit: '편' },
  { id: 'scenes_20', group: 'drama', title: '명장면 제조기', badge: '명장면 제조기', desc: '드라마 장면에서 20번 선택해요.', goal: 20, reward: 20, unit: '번' },
  { id: 'job_first', group: 'society', title: '첫 취업', badge: '사회 초년생', desc: '세이브 속 가족 중 한 사람이 직업을 가져요.', goal: 1, reward: 5, unit: '명' },
  { id: 'promo_3', group: 'society', title: '첫 승진의 맛', badge: '승진 사원', desc: '한 직업에서 승진을 3번 해요.', goal: 3, reward: 10, unit: '번' },
  { id: 'promo_7', group: 'society', title: '커리어 하이', badge: '에이스', desc: '한 직업에서 승진을 7번 해요.', goal: 7, reward: 15, unit: '번' },
  { id: 'workdays_30', group: 'society', title: '일터의 터줏대감', badge: '터줏대감', desc: '게임 속 일터에 30일 출근해요.', goal: 30, reward: 15, unit: '일' },
  { id: 'friends_5', group: 'society', title: '인맥 부자', badge: '인싸', desc: '한 세이브에서 «친구» 이상인 사이를 5개 만들어요.', goal: 5, reward: 10, unit: '개' },
  { id: 'team_10', group: 'society', title: '팀플레이어', badge: '팀플레이어', desc: '근무 카드에서 동료·손님과 «함께 푸는» 답을 10번 골라요.', goal: 10, reward: 20, unit: '번' },
  { id: 'self_10', group: 'society', title: '해결사', badge: '해결사', desc: '근무 카드에서 내 실력으로 «스스로 해결하는» 답을 10번 골라요.', goal: 10, reward: 20, unit: '번' },
  { id: 'safe_5', group: 'society', title: '원칙을 지키는 사람', badge: '원칙주의자', desc: '근무 카드에서 절차·안전을 «원칙대로» 지키는 답을 5번 골라요.', goal: 5, reward: 10, unit: '번' },
  { id: 'balance_3', group: 'society', title: '균형 감각', badge: '상황 판단왕', desc: '함께·스스로·원칙대로, 세 방식을 3번씩 골라요. 정답은 하나가 아니에요.', goal: 3, reward: 15, unit: '번' },
  { id: 'skill_any_5', group: 'skill', title: '한 우물 파기', badge: '숙련자', desc: '어떤 역량이든 하나를 5레벨까지 키워요.', goal: 5, reward: 10, unit: '레벨' },
  { id: 'skill_any_10', group: 'skill', title: '장인 정신', badge: '장인', desc: '어떤 역량이든 하나를 최고 10레벨까지 키워요.', goal: 10, reward: 15, unit: '레벨' },
  { id: 'skill_wide_5', group: 'skill', title: '팔방미인', badge: '팔방미인', desc: '한 사람이 서로 다른 역량 5가지를 3레벨 이상으로 키워요.', goal: 5, reward: 10, unit: '가지' },
  { id: 'skill_comm', group: 'skill', title: '말이 통하는 사람', badge: '소통왕', desc: '의사소통 역량을 5레벨까지 키워요.', goal: 5, reward: 10, unit: '레벨' },
  { id: 'skill_empathy', group: 'skill', title: '마음을 읽는 동료', badge: '배려왕', desc: '공감·배려 역량을 5레벨까지 키워요.', goal: 5, reward: 10, unit: '레벨' },
  { id: 'skill_leader', group: 'skill', title: '리더의 자질', badge: '리더', desc: '리더십 역량을 5레벨까지 키워요.', goal: 5, reward: 10, unit: '레벨' },
  { id: 'skill_logic', group: 'skill', title: '논리왕', badge: '분석가', desc: '논리·수리 역량을 5레벨까지 키워요.', goal: 5, reward: 10, unit: '레벨' },
  { id: 'skill_digital', group: 'skill', title: '디지털 인재', badge: '디지털 인재', desc: '디지털·코딩 역량을 5레벨까지 키워요.', goal: 5, reward: 10, unit: '레벨' },
  { id: 'skill_mind', group: 'skill', title: '마음 근육', badge: '단단한 마음', desc: '한 사람의 끈기·회복탄력성·절제력·호기심을 모두 3레벨 이상으로 키워요.', goal: 4, reward: 15, unit: '가지' },
  { id: 'asp_pick', group: 'dream', title: '꿈을 품다', badge: '꿈나무', desc: '세이브 속 사람에게 열망을 하나 정해 줘요.', goal: 1, reward: 5, unit: '명' },
  { id: 'asp_try_3', group: 'dream', title: '꿈 탐험가', badge: '꿈 탐험가', desc: '서로 다른 열망 3가지에 도전해요(바꿔도 한 일은 남아요).', goal: 3, reward: 10, unit: '가지' },
  { id: 'asp_step_5', group: 'dream', title: '한 계단씩', badge: '꾸준한 걸음', desc: '한 세이브에서 열망 단계를 모두 5개 이뤄요.', goal: 5, reward: 10, unit: '단계' },
  { id: 'asp_done_1', group: 'dream', title: '꿈을 이루다', badge: '꿈을 이룬 사람', desc: '열망 하나를 마지막 단계까지 이뤄요.', goal: 1, reward: 15, unit: '개' },
  { id: 'asp_areas_3', group: 'dream', title: '다채로운 꿈', badge: '다재다능', desc: '서로 다른 영역 3곳의 열망을 이뤄요.', goal: 3, reward: 15, unit: '곳' },
  { id: 'asp_self', group: 'dream', title: '나를 찾았다', badge: '나침반', desc: '«🧭 나를 찾아가기» 영역의 열망을 이뤄요.', goal: 1, reward: 10, unit: '개' },
  { id: 'asp_work', group: 'dream', title: '일하며 이루기', badge: '프로 일잘러', desc: '«💼 일하고 이루기» 영역의 열망(직업 유형 해 보기·실력 인정받기 등)을 이뤄요.', goal: 1, reward: 10, unit: '개' },
  { id: 'asp_bond', group: 'dream', title: '함께라서', badge: '따뜻한 사람', desc: '«🤝 함께하기»나 «💛 돕고 나누기» 영역의 열망을 이뤄요.', goal: 1, reward: 10, unit: '개' },
];

export interface IsekaiAchievementsData {
  progress: Record<string, number>;
  claimed: string[];
  rewards: Record<string, number>;
  admin: boolean;
}

type Json = Record<string, unknown>;

export function parseIsekaiAchievements(raw: unknown): IsekaiAchievementsData {
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

export function achievementState(def: IsekaiAchievementDef, d: IsekaiAchievementsData): AchievementState {
  if (d.claimed.includes(def.id)) return 'claimed';
  return (d.progress[def.id] ?? 0) >= def.goal ? 'ready' : 'locked';
}

export const rewardOf = (def: IsekaiAchievementDef, d: IsekaiAchievementsData) => d.rewards[def.id] ?? def.reward;

/** 달성(받았거나 받을 수 있는) 업적 수 — 직급과 칭호는 받기 전에도 열린다(관리자 미리보기도 같은 셈) */
export const achievedCount = (d: IsekaiAchievementsData) => ISEKAI_ACHIEVEMENTS.filter((a) => achievementState(a, d) !== 'locked').length;

/** 직급 사다리 — 달성한 업적 수로 오른다 */
export const RANKS: { name: string; min: number }[] = [
  { name: '인턴', min: 0 },
  { name: '사원', min: 3 },
  { name: '주임', min: 8 },
  { name: '대리', min: 14 },
  { name: '과장', min: 21 },
  { name: '부장', min: 29 },
  { name: '사장', min: 37 },
];

export function rankOf(achieved: number): { name: string; index: number; next: { name: string; need: number } | null } {
  let index = 0;
  RANKS.forEach((r, i) => { if (achieved >= r.min) index = i; });
  const n = RANKS[index + 1];
  return { name: RANKS[index].name, index, next: n ? { name: n.name, need: n.min - achieved } : null };
}

/** 교사·관리자 «예시로 보기» — 지어낸 진행도(받기는 안 된다) */
export function sampleAchievements(): IsekaiAchievementsData {
  const have: Record<string, number> = {
    first_day: 1, days_7: 7, days_30: 16, streak_5: 4, coins_10: 10, game_day_30: 30, game_day_100: 42, money_10k: 10000,
    money_50k: 12850, family_3: 2, answer_1: 1, answer_10: 10, answer_30: 14, careers_3: 3, life_5: 2, episode_1: 1, episode_5: 1, scenes_20: 7,
    job_first: 1, promo_3: 3, promo_7: 4, workdays_30: 18, friends_5: 3, team_10: 6, self_10: 4, safe_5: 3, balance_3: 3,
    skill_any_5: 5, skill_any_10: 7, skill_wide_5: 5, skill_comm: 4, skill_empathy: 5, skill_leader: 2, skill_logic: 3, skill_digital: 1, skill_mind: 3,
    asp_pick: 1, asp_try_3: 2, asp_step_5: 5, asp_done_1: 1, asp_areas_3: 1, asp_self: 0, asp_work: 0, asp_bond: 1,
  };
  return { progress: have, claimed: ['first_day', 'days_7', 'answer_1', 'answer_10', 'coins_10', 'job_first', 'asp_pick'], rewards: {}, admin: true };
}

/** 달 수 있는 칭호 = 달성한 업적의 badge */
export const unlockedBadges = (d: IsekaiAchievementsData) =>
  ISEKAI_ACHIEVEMENTS.filter((a) => achievementState(a, d) !== 'locked').map((a) => ({ id: a.id, badge: a.badge }));
