export function seoulDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function offsetDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function validPlanTimes(start: string, end: string) {
  return (!start && !end) || (/^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end);
}

/**
 * 주간 계획 (2026-10-03). 주는 월요일에 시작한다(학교 시간표와 같은 주).
 * 읽기 RPC `academy_dormitory_read(p_date)` 는 **p_date 앞뒤 3일(7일)** 의 할 일을 돌려주므로,
 * 그 주의 목요일(`weekCenter`)로 한 번만 부르면 월~일이 정확히 온다 — 날마다 7번 부르지 않는다.
 */
export function weekStartOf(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0=일
  return offsetDay(day, weekday === 0 ? -6 : 1 - weekday);
}
export function weekDays(start: string) {
  return Array.from({ length: 7 }, (_, i) => offsetDay(start, i));
}
export function weekCenter(start: string) {
  return offsetDay(start, 3);
}
/** «10월 1주차» — 그 주의 목요일이 속한 달 기준(ISO 주차와 같은 규칙이라 월말·월초 주가 한 달에만 속한다). */
export function weekLabel(start: string) {
  const thursday = weekCenter(start);
  const [, month, date] = thursday.split('-').map(Number);
  return `${month}월 ${Math.ceil(date / 7)}주차`;
}
/** 목표마다 늘 같은 색 — id 해시로 고른다(목록 순서가 바뀌어도 색이 바뀌지 않는다). */
export const GOAL_COLORS = ['#3f8f6f', '#4f6fb3', '#b0663b', '#8a5bb0', '#b04d6a', '#2f8a99', '#8a7a2c'] as const;
export function goalColor(goalId: string | null | undefined) {
  if (!goalId) return null;
  let h = 0;
  for (let i = 0; i < goalId.length; i++) h = (h * 31 + goalId.charCodeAt(i)) >>> 0;
  return GOAL_COLORS[h % GOAL_COLORS.length];
}
/** 날짜를 옮길 때 저장 함수에 보낼 값 — 같은 실천의 계획·목표는 그대로, 날짜만 바뀐다. */
export function movePayload(task: { id: string; title: string; priority: string; related_goal_id: string | null; memo: string | null; start_time: string | null; end_time: string | null }, nextDay: string) {
  return { id: task.id, title: task.title, task_date: nextDay, priority: task.priority, related_goal_id: task.related_goal_id ?? '', memo: task.memo ?? '', start_time: task.start_time ?? '', end_time: task.end_time ?? '' };
}

/**
 * 목표 두 층의 이름 (2026-10-03 사용자 요청 «큰 목표와 단기 목표» — «은유적일 필요는 없어 보인다»).
 * 화면 문구는 전부 여기서 읽는다 — 이름을 바꾸려면 이 표 한 곳만 고친다.
 */
export const GOAL_LABELS = { long: '장기 목표', short: '단기 목표' } as const;
export const goalHorizon = (goal: { horizon?: string | null }) => (goal.horizon === 'long' ? 'long' : 'short') as 'long' | 'short';
/** 장기 목표마다 묶인 단기 목표(보관 포함) + 어디에도 묶이지 않은 단기 목표. 장기 목표 순서는 받은 순서. */
export function goalTree<G extends { id: string; horizon?: string | null; parent_goal_id?: string | null }>(goals: G[]) {
  const longs = goals.filter(g => goalHorizon(g) === 'long');
  const longIds = new Set(longs.map(g => g.id));
  const childrenOf = (id: string) => goals.filter(g => goalHorizon(g) === 'short' && g.parent_goal_id === id);
  const loose = goals.filter(g => goalHorizon(g) === 'short' && !(g.parent_goal_id && longIds.has(g.parent_goal_id)));
  return { longs, childrenOf, loose };
}
