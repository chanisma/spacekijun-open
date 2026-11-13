/**
 * 별까지 쌓기 — 학교 전체 «별을 쌓은 사람들» 순위(2026-10-20 사용자 요청 «다마고치 참고», docs/features/star-tower.md §12).
 * 순서는 서버 `tower_ranking`(tower_private.ranking 한 곳)이 정한다 — 완성한 탑(등성) → 지금 탑 층 수 → 누적 집중 → 먼저 시작.
 * 화면은 그리기만. 주인 표시(다마고찌와 같은 사용자 결정): 나 = «나», 별빛 친구 = 이름, 그 밖 = «N학년»/«선생님».
 */

export const RANKING_SIZE = 20;

export interface RankingRow {
  rank: number;
  towers: number;
  /** 지금 탑의 층(아래 → 위) — 줄마다 작은 탑을 그린다 */
  floors: string[];
  focusSeconds: number;
  mine: boolean;
  friend: boolean;
  /** «나» · 친구 이름 · «2학년» · «선생님» */
  owner: string;
}

export interface RankingData {
  size: number;
  rows: RankingRow[];
  /** 내 자리(순위 밖이어도) — 아직 층이 없거나 관리자면 null */
  me: { rank: number; towers: number; floors: number } | null;
  /** 관리자 — 재화 무한이라 순위에서 빠진다 */
  excluded: boolean;
  /** 층을 하나라도 지은 사람 수(관리자 제외) */
  players: number;
}

/** 순위 칸의 메달 — 1·2·3위만 */
export const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/** 순서를 정하는 규칙 — 판이 그대로 말한다(서버 tower_private.ranking 과 짝) */
export const RANKING_ORDER_NOTE = '완성한 탑이 많을수록(등성이 밝을수록) 위예요. 같으면 지금 탑이 높은 사람, 그것도 같으면 오래 집중한 사람이 위예요.';

type Json = Record<string, unknown>;

/** 서버가 준 값이 순위 모양인지 — 모양이 틀린 줄은 버린다(깨진 줄 하나로 판 전체를 죽이지 않는다) */
export function parseRanking(raw: unknown): RankingData {
  const j = (raw ?? {}) as Json;
  const rows = Array.isArray(j.rows) ? (j.rows as Json[]) : [];
  const me = j.me as Json | null | undefined;
  return {
    size: typeof j.size === 'number' ? j.size : RANKING_SIZE,
    rows: rows
      .filter((r) => !!r && typeof r.rank === 'number' && typeof r.owner === 'string')
      .map((r) => ({
        rank: Number(r.rank),
        towers: Number(r.towers ?? 0),
        floors: Array.isArray(r.floors) ? (r.floors as unknown[]).map(String) : [],
        focusSeconds: Number(r.focus_seconds ?? 0),
        mine: r.mine === true,
        friend: r.friend === true,
        owner: String(r.owner),
      })),
    me: me && typeof me.rank === 'number' ? { rank: Number(me.rank), towers: Number(me.towers ?? 0), floors: Number(me.floors ?? 0) } : null,
    excluded: j.excluded === true,
    players: Number(j.players ?? 0),
  };
}

/** 줄의 주인 — 내 줄은 «나», 친구는 «○○의 탑», 그 밖은 서버가 준 «N학년»/«선생님» 그대로 */
export function ownerLabel(r: Pick<RankingRow, 'mine' | 'friend' | 'owner'>): string {
  if (r.mine) return '나의 탑';
  if (r.friend) return `${r.owner}의 탑`;
  return r.owner;
}
