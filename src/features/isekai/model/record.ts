/**
 * 이세계 사회인 «내 기록» — 서버 `isekai3d_my_record()` 의 답을 읽고 화면이 쓸 통계로 바꾼다(순수 함수, 회귀가 직접 부른다).
 *
 * - `days[].used` 는 **게임 속 분**이다(오락기 동전으로 산 시간) — 실제 시간이 아니다. 화면은 «게임 속 근무»로 부른다.
 * - 세이브 요약(날짜·자산·가족)은 게임이 올린 값이라 보이기만 한다(업적 보상은 작게 — SQL 머리글).
 * - 질문·장면 글의 `{n:은/는}` 은 게임이 주인공 이름으로 바꾸는 자리 — 여기서는 «주인공»으로.
 */

export interface SavePerson { name: string; hair?: string; skin?: string; shirt?: string }
export interface SaveSlot { slot: number; day: number | null; money: number | null; people: SavePerson[]; savedAt: number | null }
export interface PlayDay { day: string; used: number; coins: number; paid: number }
/** approach = 근무 카드에서 고른 방식(self·together·safe) — 서버가 게임의 섞인 번호를 되돌려 읽는다(20261028140000) */
export interface AnswerRow { id: string; kind: 'career' | 'life' | 'explore' | string; career: string | null; level: number | null; event: string | null; ask: string; picked: string | null; approach: string | null; text: string | null; at: string }
export interface EpisodeRow { id: string; title: string; genre: string; logline: string; status: 'active' | 'done' | 'dropped' | string; career: string | null; createdAt: string; cast: string[]; scenes: number; answered: number; picks: string[] }
export interface IsekaiRecord {
  saves: SaveSlot[];
  days: PlayDay[];
  bestStreak: number;
  answers: AnswerRow[];
  asked: number;
  episodes: EpisodeRow[];
  tally: Record<string, number>;
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : []);

export function parseIsekaiRecord(raw: unknown): IsekaiRecord {
  const j = (raw ?? {}) as Json;
  const tally: Record<string, number> = {};
  if (j.tally && typeof j.tally === 'object') for (const [k, v] of Object.entries(j.tally as Json)) if (typeof v === 'number') tally[k] = v;
  return {
    saves: arr(j.saves).map((s) => ({
      slot: Number(s.slot) || 0,
      day: numOrNull(s.day),
      money: numOrNull(s.money),
      people: arr(s.people).map((p) => ({ name: str(p.name) || '이름 없음', hair: str(p.hair) || undefined, skin: str(p.skin) || undefined, shirt: str(p.shirt) || undefined })),
      savedAt: numOrNull(s.saved_at),
    })),
    days: arr(j.days).map((d) => ({ day: str(d.day), used: Number(d.used) || 0, coins: Number(d.coins) || 0, paid: Number(d.paid) || 0 })).filter((d) => d.day),
    bestStreak: Number(j.best_streak) || 0,
    answers: arr(j.answers).map((a) => ({
      id: str(a.id), kind: str(a.kind), career: str(a.career) || null, level: numOrNull(a.level), event: str(a.event) || null,
      ask: str(a.ask), picked: str(a.picked) || null, approach: str(a.approach) || null, text: str(a.text) || null, at: str(a.at),
    })),
    asked: Number(j.asked) || 0,
    episodes: arr(j.episodes).map((e) => ({
      id: str(e.id), title: str(e.title) || '제목 없는 이야기', genre: str(e.genre), logline: str(e.logline), status: str(e.status),
      career: str(e.career) || null, createdAt: str(e.created_at), cast: Array.isArray(e.cast) ? (e.cast as unknown[]).map(String) : [],
      scenes: Number(e.scenes) || 0, answered: Number(e.answered) || 0,
      picks: Array.isArray(e.picks) ? (e.picks as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    })),
    tally,
  };
}

/** 게임 속 이름 자리 `{n:은/는}` → «주인공은» (받침 있는 낱말이라 앞쪽 조사) */
export const fillName = (s: string, who = '주인공') =>
  s.replace(/\{n:([^/}]*)\/[^}]*\}/g, `${who}$1`).replace(/\{n\}/g, who);

export const CAREER_NAMES: Record<string, string> = {
  academyTutor: '학원 강사', barista: '바리스타', doctor: '의사', entertainer: '엔터테이너', filmmaker: '영화감독',
  gameDeveloper: '게임 개발자', nurse: '간호사', pilot: '파일럿', scientist: '과학자', singer: '가수',
  taxiDriver: '택시 기사', teacher: '선생님', tech: 'IT 개발자', writer: '작가',
};
export const careerName = (id: string | null | undefined) => (id ? CAREER_NAMES[id] ?? id : '');

export const CAREER_EMOJI: Record<string, string> = {
  academyTutor: '📚', barista: '☕', doctor: '🩺', entertainer: '🎤', filmmaker: '🎬', gameDeveloper: '🎮', nurse: '💉',
  pilot: '✈️', scientist: '🔬', singer: '🎵', taxiDriver: '🚕', teacher: '🍎', tech: '💻', writer: '✒️',
};

export const SKILL_NAMES: Record<string, string> = {
  logic: '논리', singing: '노래', medicine: '의학', programming: '프로그래밍', empathy: '공감', charisma: '카리스마',
  writing: '글쓰기', cooking: '요리', fitness: '체력', creativity: '창의', handiness: '손재주', music: '음악', science: '과학',
};

export const KIND_LABEL: Record<string, string> = { career: '직업 질문', life: '인생 질문', explore: '탐색 질문' };

/** 근무 카드의 문제를 푸는 방식(게임 학생에게는 안 보이는 칸 — 여기서는 지난 답을 돌아보는 표시로) */
export const APPROACH_LABEL: Record<string, string> = { self: '💪 스스로 해결', together: '🤝 함께 해결', safe: '📋 원칙대로' };

/** 게임 분 → «N일 N시간» */
export function gameDuration(minutes: number): string {
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60);
  if (d && h) return `${d}일 ${h}시간`;
  if (d) return `${d}일`;
  if (h) return `${h}시간`;
  return `${minutes}분`;
}

export interface Persona { title: string; line: string; risky: number; winRate: number | null }

/**
 * 직업 카드 선택으로 읽는 성향 — tally 의 card.safe / card.risky / card.won / card.lost(게임이 센 값).
 * 카드가 5장 미만이면 «아직 탐색 중».
 */
export function personaOf(t: Record<string, number>): Persona {
  const safe = t['card.safe'] ?? 0, risky = t['card.risky'] ?? 0, won = t['card.won'] ?? 0, lost = t['card.lost'] ?? 0;
  const picks = safe + risky, games = won + lost;
  const winRate = games ? won / games : null;
  if (picks < 5) return { title: '탐색 중인 신입', line: '직업 카드를 다섯 장쯤 고르면 성향이 드러나요.', risky: picks ? risky / picks : 0.5, winRate };
  const r = risky / picks;
  const lucky = winRate !== null && winRate >= 0.7;
  if (r >= 0.6) return { title: lucky ? '타고난 승부사' : '겁 없는 도전자', line: lucky ? '모험을 걸고 대부분 이겨요. 팀장님이 몰래 기대하는 타입.' : '어려운 길을 골라요. 넘어져도 다시 일어나는 근성.', risky: r, winRate };
  if (r <= 0.4) return { title: lucky ? '빈틈없는 전략가' : '든든한 안전주의자', line: lucky ? '확실한 수를 골라 확실히 이겨요.' : '무리하지 않고 꾸준히. 회사가 믿고 맡기는 사람.', risky: r, winRate };
  return { title: lucky ? '균형 잡힌 에이스' : '유연한 실용주의자', line: '상황에 따라 안전과 모험을 오가요.', risky: r, winRate };
}

/** tally 의 career.* — 가장 많이 한 직업 순 */
export function careerTally(t: Record<string, number>): { id: string; name: string; n: number }[] {
  return Object.entries(t).filter(([k]) => k.startsWith('career.')).map(([k, n]) => ({ id: k.slice(7), name: careerName(k.slice(7)), n }))
    .sort((a, b) => b.n - a.n);
}

/** tally 의 win.* — 이긴 기술 */
export function skillWins(t: Record<string, number>): { id: string; name: string; n: number }[] {
  return Object.entries(t).filter(([k]) => k.startsWith('win.')).map(([k, n]) => ({ id: k.slice(4), name: SKILL_NAMES[k.slice(4)] ?? k.slice(4), n }))
    .sort((a, b) => b.n - a.n);
}

export interface RecordStats {
  playDays: number; gameMinutes: number; coins: number; paid: number; firstDay: string | null; lastDay: string | null;
  bestDay: number; bestMoney: number; answered: number; episodesDone: number; scenesPicked: number;
}

export function recordStats(r: IsekaiRecord): RecordStats {
  const days = [...r.days].sort((a, b) => a.day.localeCompare(b.day));
  return {
    playDays: days.length,
    gameMinutes: days.reduce((s, d) => s + d.used, 0),
    coins: days.reduce((s, d) => s + d.coins, 0),
    paid: days.reduce((s, d) => s + d.paid, 0),
    firstDay: days[0]?.day ?? null,
    lastDay: days[days.length - 1]?.day ?? null,
    bestDay: Math.max(0, ...r.saves.map((s) => s.day ?? 0)),
    bestMoney: Math.max(0, ...r.saves.map((s) => s.money ?? 0)),
    answered: r.answers.length,
    episodesDone: r.episodes.filter((e) => e.status === 'done').length,
    scenesPicked: r.episodes.reduce((s, e) => s + e.answered, 0),
  };
}

/** 한국 날짜 YYYY-MM-DD */
export function seoulDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const addDays = (iso: string, n: number) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

export interface HeatCell { day: string; used: number; coins: number; level: 0 | 1 | 2 | 3 | 4; future: boolean }

/**
 * 근무 기록부 잔디 — 오늘을 포함한 주까지 `weeks` 주, 열 = 주(월요일 시작), 행 = 요일.
 * 단계 = 그날 게임 속 근무 분(0 · ~6시간 · ~1일 · ~2일 · 그 이상).
 */
export function heatmap(days: PlayDay[], today: string, weeks = 16): HeatCell[][] {
  const by = new Map(days.map((d) => [d.day, d]));
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0
  const start = addDays(today, -dow - (weeks - 1) * 7);
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, w * 7 + i);
      const d = by.get(day);
      const used = d?.used ?? 0;
      const level = (!d ? 0 : used <= 360 ? 1 : used <= 1440 ? 2 : used <= 2880 ? 3 : 4) as HeatCell['level'];
      col.push({ day, used, coins: d?.coins ?? 0, level, future: day > today });
    }
    cols.push(col);
  }
  return cols;
}

/** 지금 이어지는 연속 출근(오늘이나 어제까지 이어진 것) */
export function currentStreak(days: PlayDay[], today: string): number {
  const set = new Set(days.map((d) => d.day));
  let cur = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}

const MEMOS = [
  '오늘은 커피 한 잔 하고 시작해요. 이세계 탕비실 원두가 새로 들어왔대요.',
  '팀장님이 오늘 기분이 좋아 보여요. 결재 올리기 좋은 날!',
  '퇴근 시간 지키기 캠페인 중입니다. 게임 속에서도요.',
  '옆자리 동료가 간식을 나눠 줄 것 같은 예감이 들어요.',
  '이번 주 사보 인터뷰 후보에 이름이 올랐다는 소문이…',
  '회의실 예약은 미리미리. 이세계에도 회의실은 늘 모자라요.',
  '오늘의 행운 직업 카드는 «모험»일지도 몰라요.',
  '야근은 금지! 내일의 나에게 일을 조금 남겨 두세요.',
  '엘리베이터에서 사장님을 만나면 웃으며 인사해요. 승진 점수가 올라갈지도?',
  '오늘 고른 선택이 다음 드라마의 복선이 될 수 있어요.',
];

/** 사내 메신저 한 줄 — 날짜·사람마다 정해진다(새로고침해도 같다) */
export function dailyMemo(seed: string, today: string): string {
  let h = 2166136261;
  for (const ch of `${seed}:${today}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return MEMOS[Math.abs(h) % MEMOS.length];
}

/** 교사·관리자 «예시로 보기» — 학생 데이터가 아니라 지어낸 기록 */
export function sampleRecord(today: string): IsekaiRecord {
  const days: PlayDay[] = [];
  [0, 1, 2, 3, 5, 8, 9, 12, 15, 16, 17, 22, 29, 30, 36, 43].forEach((back, i) =>
    days.push({ day: addDays(today, -back), used: [480, 1440, 2880, 720, 3600, 360][i % 6], coins: 1 + (i % 3), paid: (i % 3) * 5 }));
  return {
    saves: [
      { slot: 1, day: 42, money: 12850, people: [{ name: '하린', hair: '#2b1b10', skin: '#f8d9c0', shirt: '#1e88e5' }, { name: '도윤', hair: '#a0522d', skin: '#fde7da', shirt: '#43a047' }], savedAt: Date.now() - 3600_000 },
      { slot: 2, day: 7, money: 2400, people: [{ name: '서아', hair: '#5d4037', skin: '#f8d9c0', shirt: '#8e24aa' }], savedAt: Date.now() - 86400_000 * 5 },
    ],
    days,
    bestStreak: 4,
    answers: [
      { id: 's1', kind: 'career', career: 'barista', level: 2, event: null, ask: '단골손님이 오늘따라 말이 없어요. 어떻게 할까요?', picked: '부드럽게 마음 물어보기', approach: 'together', text: null, at: new Date().toISOString() },
      { id: 's2', kind: 'life', career: null, level: null, event: 'firstJob', ask: '처음 일을 시작한 오늘, 가장 마음에 남은 순간은?', picked: '힘들었지만 끝까지 해냈다는 느낌', approach: null, text: null, at: new Date(Date.now() - 86400_000).toISOString() },
      { id: 's3', kind: 'career', career: 'writer', level: 4, event: null, ask: '‘잠깐 쉬어 가는 법’이라는 주제로 원고를 쓴다면?', picked: null, approach: null, text: '비 오는 날 창가에서 차 마시는 장면으로 시작하고 싶어요.', at: new Date(Date.now() - 86400_000 * 3).toISOString() },
    ],
    asked: 5,
    episodes: [
      { id: 'e1', title: '한 번뿐인 무대', genre: '직장 성장극', logline: '대표곡을 어떻게 들려줄지, 완벽을 바라는 스타와 새 소리를 꿈꾸는 제작진이 맞붙어요.', status: 'done', career: 'singer', createdAt: new Date(Date.now() - 86400_000 * 6).toISOString(), cast: ['루미나', '하린', '은서'], scenes: 6, answered: 6, picks: ['리허설을 한 번 더 하자고 말하기', '새 편곡을 무대에서 처음 공개하기'] },
      { id: 'e2', title: '오늘의 원두', genre: '직장 코미디', logline: '새 원두를 들여온 날, 카페에 이상한 손님들이 하나둘 찾아와요.', status: 'active', career: 'barista', createdAt: new Date().toISOString(), cast: ['지아', '건우'], scenes: 2, answered: 1, picks: ['손님에게 시음 잔을 건네기'] },
    ],
    tally: { 'card.safe': 9, 'card.risky': 14, 'card.won': 17, 'card.lost': 6, 'career.barista': 9, 'career.writer': 5, 'career.singer': 7, 'win.empathy': 6, 'win.singing': 4, 'win.writing': 3 },
  };
}
