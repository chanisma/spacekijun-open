/**
 * 내 PC 의 에이전트 터미널 — 휴대폰에서 목록을 보고 메시지를 보내고 결과를 읽는다(2026-10-29 요청).
 * 서버 = `desk_agent_phone_overview` · `desk_agent_phone_send`(마이그레이션 20261029130000_desk_agent_phone.sql).
 * 받는 쪽은 스페이스기전 데스크(NEIS_helper `app/core/agent_peer.py`) — 에이전트 터미널 위쪽 «휴대폰» 스위치를 켜 두면(«다른 PC» 와 따로),
 * «내 휴대폰에서 보낸 메시지 받기»가 켜져 있으면 묻지 않고 에이전트에게 넣는다. 결과는 에이전트가 `/peer/reply` 로 돌려준다.
 * 예약 업무 (2026-11-07): 데스크의 «예약»이 정한 시각에 돌린 결과도 kind='cron' 묶음으로 온다(`desk_agent_cron_post`,
 * 마이그레이션 20261107090000_desk_agent_cron.sql) — title = 예약 이름, body = 시킨 일, replies = 결과.
 * 채팅방 (2026-11-10): 방 = 데스크 칸의 «대화» 하나(thread). 이름(claude-1)은 칸을 닫고 다시 열면 또 쓰이므로 방을 이름으로 가르지 않는다.
 * 칸을 닫고 같은 이름으로 다시 열거나 /clear·/resume 로 대화가 바뀌면 새 방이고, 끝난 방에는 보낼 수 없다
 * (서버 desk_agent_phone_send 가 그 방이 지금 열려 있는지 보고, 그 사이 닫히면 데스크가 거절한다 — 마이그레이션 20261110130000).
 * thread 가 없는 것(옛 데스크·방 구분 전 기록)은 PC·이름으로 묶는다.
 */
import { supabase } from '@/integrations/supabase/client';

export const AGENT_MESSAGE_LIMIT = 8000;
/** 방 목록 쿼리 키 — 모바일 «에이전트» 탭과 웹 /agents 가 같은 키를 쓴다(보내기 뒤 새로 읽기) */
export const AGENTS_QUERY_KEY = ['m-agents'] as const;
const PHONE_KEY = 'spacekijun-phone-device';

export interface DeskAgent { name: string; title: string; tool: string; status: string; thread?: string | null }
export interface DeskPc { device: string; label: string; online: boolean; seen_at: string; agents: DeskAgent[] }
export interface AgentReply { id: string; body: string; created_at: string; agent: string; label: string }
export type CronResult = 'done' | 'stopped' | 'error' | 'login' | 'busy' | 'timeout';
export interface AgentMessage {
  id: string; body: string; created_at: string; status: 'sent' | 'delivered' | 'refused' | 'expired'; note: string | null;
  to_device: string; to_label: string; to_agent: string; replies: AgentReply[];
  /** 'phone' = 휴대폰에서 보낸 것, 'cron' = 데스크 예약 업무의 결과 (옛 서버는 없음 → phone) */
  kind?: 'phone' | 'cron'; title?: string | null; result_status?: CronResult | null; late?: boolean;
  /** 채팅방(데스크 칸의 대화) id — 없으면 옛 기록 */
  thread?: string | null;
}
export interface AgentOverview { me: string; pcs: DeskPc[]; messages: AgentMessage[] }

// 🚨 supabase.rpc 를 떼어 쓰면 this 를 잃어 «reading 'rest'» 로 죽는다(2026-10-30) — bind 로 붙인다
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

/** 이 휴대폰(브라우저)의 표시 — 32자 hex. 서버는 보낸 기기를 'phone:<이것>' 으로 적는다 */
export function phoneDevice(): string {
  try {
    const saved = localStorage.getItem(PHONE_KEY);
    if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
  } catch { /* 저장 못 하면 이번만 쓰는 값 */ }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const made = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(PHONE_KEY, made); } catch { /* 위와 같다 */ }
  return made;
}

export async function agentOverview(): Promise<AgentOverview> {
  const { data, error } = await rpc('desk_agent_phone_overview');
  if (error) throw new Error(error.message);
  const value = (data ?? {}) as Partial<AgentOverview>;
  return { me: value.me ?? '', pcs: value.pcs ?? [], messages: value.messages ?? [] };
}

/** thread 를 주면 그 방(대화)이 지금 열려 있을 때만 보낸다 — 같은 이름의 새 칸으로 새지 않게 */
export async function sendToAgent(device: string, agent: string, body: string, thread?: string | null) {
  const text = body.trim();
  if (!text) throw new Error('보낼 내용을 써 주세요.');
  if (text.length > AGENT_MESSAGE_LIMIT) throw new Error(`메시지는 ${AGENT_MESSAGE_LIMIT}자까지 보낼 수 있습니다.`);
  const { data, error } = await rpc('desk_agent_phone_send', {
    p_phone: phoneDevice(), p_to_device: device, p_to_agent: agent, p_body: text, ...(thread ? { p_thread: thread } : {}) });
  if (error) throw new Error(error.message);
  return data as { id: string; label: string; agent: string };
}

// ── 채팅방 ────────────────────────────────────────────────
/** live = 지금 보낼 수 있다 · offline = 그 PC 가 연결돼 있지 않다 · ended = 대화가 끝났다(칸을 닫았거나 새 대화) */
export type RoomState = 'live' | 'offline' | 'ended';
export interface AgentRoom {
  key: string; device: string; pcLabel: string; agent: string; title: string; tool: string;
  thread: string | null; state: RoomState; status: string | null;
  /** 오래된 것부터 */
  messages: AgentMessage[];
  lastAt: string | null;
  /** 끝난 방 — 같은 PC·같은 이름으로 지금 열린 방(있으면) */
  successor: string | null;
}

export const roomKey = (device: string, agent: string, thread?: string | null) =>
  thread ? `t:${thread}` : `n:${device}:${agent}`;

const lastOf = (message: AgentMessage) =>
  message.replies.reduce((at, reply) => (reply.created_at > at ? reply.created_at : at), message.created_at);

/** 열린 칸(PC 가 알린 에이전트)과 메시지를 방으로 묶는다. 열린 방이 먼저, 그 안에서는 최근 것이 위 */
export function buildRooms(overview: AgentOverview): AgentRoom[] {
  const rooms = new Map<string, AgentRoom>();
  for (const pc of overview.pcs) {
    for (const agent of pc.agents) {
      const key = roomKey(pc.device, agent.name, agent.thread);
      if (rooms.has(key)) continue;
      rooms.set(key, { key, device: pc.device, pcLabel: pc.label, agent: agent.name, title: agent.title || agent.name,
                       tool: agent.tool, thread: agent.thread ?? null, state: pc.online ? 'live' : 'offline',
                       status: pc.online ? agent.status : null, messages: [], lastAt: null, successor: null });
    }
  }
  for (const message of overview.messages) {
    const key = roomKey(message.to_device, message.to_agent, message.thread);
    let room = rooms.get(key);
    if (!room) {
      room = { key, device: message.to_device, pcLabel: message.to_label, agent: message.to_agent, title: message.to_agent,
               tool: '', thread: message.thread ?? null, state: 'ended', status: null, messages: [], lastAt: null, successor: null };
      rooms.set(key, room);
    }
    room.messages.push(message);
    const at = lastOf(message);
    if (!room.lastAt || at > room.lastAt) room.lastAt = at;
  }
  const list = [...rooms.values()];
  for (const room of list) {
    room.messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (room.state === 'ended') {
      room.successor = list.find((other) => other.state === 'live' && other.device === room.device
                                            && other.agent === room.agent)?.key ?? null;
    }
  }
  const rank: Record<RoomState, number> = { live: 0, offline: 1, ended: 2 };
  return list.sort((a, b) => rank[a.state] - rank[b.state] || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}

const AGENT_STATE: Record<string, string> = {
  idle: '입력 기다림', working: '일하는 중', 'waiting-for-user-choice': '선택 기다림', 'agent-exited': '꺼짐', ended: '꺼짐',
};
/** 방 상태 한 마디 — 끝난 대화 · PC 연결 끊김 · (열린 방은) 에이전트 상태 */
export const roomState = (room: AgentRoom) =>
  room.state === 'ended' ? '끝난 대화' : room.state === 'offline' ? 'PC 연결 끊김' : AGENT_STATE[room.status ?? ''] ?? room.status ?? '';

// 방마다 마지막으로 본 시각 — 이 기기에만 (못 읽으면 모두 읽은 것으로)
const SEEN_KEY = 'spacekijun-agent-room-seen';
function seenMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>; } catch { return {}; }
}
export function roomUnread(room: AgentRoom): boolean {
  const seen = seenMap()[room.key];
  const lastReply = room.messages.flatMap((m) => m.replies.map((r) => r.created_at)).sort().pop();
  return !!lastReply && (!seen || lastReply > seen);
}
export function markRoomSeen(room: AgentRoom) {
  if (!room.lastAt) return;
  try {
    const map = seenMap();
    if (map[room.key] === room.lastAt) return;
    map[room.key] = room.lastAt;
    const keys = Object.keys(map);           // 오래된 방은 서버에서 7일 뒤 지워진다 — 표시도 너무 쌓이지 않게
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach((key) => delete map[key]);
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch { /* 저장 못 하면 다음에 또 새것으로 보인다 */ }
}

export const CRON_TEXT: Record<CronResult, string> = {
  done: '완료', stopped: '멈춤', error: '실패', login: '로그인 필요', busy: '건너뜀', timeout: '시간 초과',
};

export const STATUS_TEXT: Record<AgentMessage['status'], string> = {
  sent: 'PC 가 받기를 기다리는 중',
  delivered: '에이전트에게 전달됨',
  refused: '전달되지 않음',
  expired: 'PC 가 받아 가지 않음',
};
