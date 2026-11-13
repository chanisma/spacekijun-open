/**
 * 에이전트(MCP) 연결을 허용한 사람 — 관리자 «연결한 사람» 탭의 판정 (2026-10-25).
 *
 * 원본 = RPC `admin_mcp_connections()`(관리자 전용) — 동의(auth.oauth_consents) 한 줄 = 사람 × 에이전트 등록 하나.
 * Claude Code 같은 에이전트는 다시 연결할 때마다 **새 클라이언트로 등록**되므로 한 사람이 같은 이름으로 여러 줄을 갖는다.
 * 화면은 사람 단위로 묶고, 에이전트는 이름별 개수로 보인다.
 *
 * «마지막 사용» = 세션 갱신·기록된 호출 중 늦은 것. 호출 기록(mcp_call_log)은 학생 정보를 읽거나 무언가를 바꾼
 * 호출만 남으므로 호출 수는 «기록된 호출»이다 — 전체 사용량이 아니다.
 */

export interface McpConnectionRow {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  resource_id: string | null;
  client_id: string;
  client_name: string;
  scopes: string | null;
  granted_at: string;
  revoked_at: string | null;
  active_sessions: number;
  last_session_at: string | null;
  calls_30d: number;
  last_call_at: string | null;
}

export interface McpConnectedPerson {
  userId: string;
  name: string;
  email: string;
  role: string | null;
  resourceId: string | null;
  /** 해제되지 않은 동의가 하나라도 있으면 true */
  active: boolean;
  /** 이름별 등록 수(해제되지 않은 것) — 해제만 남았으면 해제된 것 */
  agents: Array<{ name: string; count: number }>;
  connections: number;
  revokedConnections: number;
  firstGrantedAt: string;
  lastUsedAt: string | null;
  activeSessions: number;
  calls30d: number;
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

export function groupMcpConnections(rows: McpConnectionRow[]): McpConnectedPerson[] {
  const byUser = new Map<string, McpConnectionRow[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const people = [...byUser.values()].map((list): McpConnectedPerson => {
    const live = list.filter((r) => !r.revoked_at);
    const counted = live.length > 0 ? live : list;
    const agentCount = new Map<string, number>();
    for (const r of counted) agentCount.set(r.client_name, (agentCount.get(r.client_name) ?? 0) + 1);
    const first = list[0];
    return {
      userId: first.user_id,
      name: first.name || first.email || '(이름 없음)',
      email: first.email ?? '',
      role: first.role,
      resourceId: list.find((r) => r.resource_id)?.resource_id ?? null,
      active: live.length > 0,
      agents: [...agentCount].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko')),
      connections: live.length,
      revokedConnections: list.length - live.length,
      firstGrantedAt: list.map((r) => r.granted_at).reduce(earlier),
      lastUsedAt: list.reduce<string | null>((acc, r) => later(acc, later(r.last_call_at, r.last_session_at)), null),
      // 해제된 동의의 세션은 쓸 수 없으므로 세지 않는다
      activeSessions: live.reduce((n, r) => n + (r.active_sessions ?? 0), 0),
      calls30d: list.reduce((n, r) => n + (r.calls_30d ?? 0), 0),
    };
  });

  // 연결 중 먼저 → 한 번이라도 쓴 사람 먼저(최근 사용 순) → 안 쓴 사람은 최근 허용 순
  return people.sort((a, b) =>
    Number(b.active) - Number(a.active)
    || Number(Boolean(b.lastUsedAt)) - Number(Boolean(a.lastUsedAt))
    || (b.lastUsedAt ?? b.firstGrantedAt).localeCompare(a.lastUsedAt ?? a.firstGrantedAt)
    || a.name.localeCompare(b.name, 'ko'));
}

/** 표에 보일 «언제» — 오늘이면 시각, 아니면 날짜 */
export function formatWhen(iso: string | null, now = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameDay = d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) === now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  return sameDay
    ? `오늘 ${d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })}`
    : d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' });
}
