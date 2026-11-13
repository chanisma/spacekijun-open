/**
 * 에이전트 작업 요청 — 받은 쪽(2026-11-11 요청).
 * 다른 선생님의 에이전트가 «이 일을 이렇게 해 달라»(무엇을 · 어떤 SPACEKIJUN 기능·스킬로)를 보내면, 받는 선생님은 알림
 * (notification_events type 'agent_request', meta {request_id, batch_id, sender_name, sender_resource_id})으로 받고,
 * 모바일 «에이전트» 탭 · 웹 «에이전트»(/agents) · 데스크에서 원하는 PC 에이전트(대화 방)에게 한 번에 넘긴다.
 * 맡길 말(prompt)은 서버가 한 곳에서 만든다 — 여기서 꾸미지 않는다.
 * 서버 = 마이그레이션 20261111120000_mcp_agent_request.sql 의 사람 전용 RPC(agent_request_*, 에이전트 토큰은 DB 입구 훅이 막는다).
 * 보내는 길은 desk_agent_phone_send 그대로라 보낸 기기는 'phone:<phoneDevice()>' 로 적힌다(웹도 같은 값을 쓴다).
 */
import { supabase } from '@/integrations/supabase/client';
import { phoneDevice, type AgentRoom } from './agents';

export type AgentRequestStatus = 'sent' | 'handed' | 'done' | 'declined' | 'cancelled';
export type AgentRequestVia = 'desk' | 'phone' | 'web';
export interface AgentRequestRef { kind: string; id?: string; title: string }
export interface AgentRequestHanded { via?: AgentRequestVia; label?: string; agent?: string; message_id?: string }
export interface AgentRequest {
  id: string; batch_id: string;
  /** 보낸 사람 · 받는 사람 이름 */
  from: string; to: string;
  title: string; status: AgentRequestStatus; status_text: string;
  due_date: string | null; handed_to: AgentRequestHanded | null; result: string | null;
  /** 'YYYY-MM-DD HH:MI' (한국 시간) */
  at: string; closed_at: string | null;
  body: string; steps: string[]; refs: AgentRequestRef[];
}
export interface AgentRequestWithPrompt extends AgentRequest { prompt: string }

export const AGENT_REQUESTS_KEY = ['agent-requests'] as const;
export const isClosedRequest = (status: AgentRequestStatus) => status === 'done' || status === 'declined' || status === 'cancelled';

// 🚨 supabase.rpc 를 떼어 쓰면 this 를 잃어 «reading 'rest'» 로 죽는다(2026-10-30, agents.ts 와 같다) — bind 로 붙인다
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

export class AgentRequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}
const fail = (error: { message: string; code?: string }) => new AgentRequestError(error.message, error.code);

/** 서버에 아직 함수가 없다(마이그레이션 전) — 화면은 요청 칸을 감춘다 */
export const isNotDeployed = (error: unknown) =>
  error instanceof AgentRequestError && (error.code === 'PGRST202' || error.code === '42883');

function normalize<T extends AgentRequest>(value: T): T {
  return { ...value, steps: Array.isArray(value.steps) ? value.steps : [], refs: Array.isArray(value.refs) ? value.refs : [] };
}

/** 받은 요청 — open = 아직 안 끝난 것(sent · handed), all = 끝난 것까지. 최근 것이 위 */
export async function agentRequestInbox(status: 'open' | 'all' = 'open', limit = 50): Promise<AgentRequest[]> {
  const { data, error } = await rpc('agent_request_inbox', { p_status: status, p_limit: limit });
  if (error) throw fail(error);
  return ((data ?? []) as AgentRequest[]).map(normalize);
}

/** 에이전트에게 넘길 말 그대로 — 끝난 요청은 서버가 거절한다 */
export async function agentRequestPrompt(id: string): Promise<AgentRequestWithPrompt> {
  const { data, error } = await rpc('agent_request_prompt', { p_id: id });
  if (error) throw fail(error);
  return normalize(data as AgentRequestWithPrompt);
}

/** 그 방(데스크 칸의 대화)의 에이전트에게 맡길 말을 보내고 «에이전트에게 넘김»으로 적는다 */
export async function agentRequestSendToAgent(id: string, room: Pick<AgentRoom, 'device' | 'agent' | 'thread'>,
                                              via: 'phone' | 'web') {
  const { data, error } = await rpc('agent_request_send_to_agent', {
    p_id: id, p_phone: phoneDevice(), p_to_device: room.device, p_to_agent: room.agent,
    p_thread: room.thread ?? null, p_via: via });
  if (error) throw fail(error);
  return data as { sent: { id: string; label: string; agent: string }; request: Omit<AgentRequest, 'body' | 'steps' | 'refs'> };
}

/** 데스크가 입력칸에 넣은 뒤 부른다(모바일·웹은 agentRequestSendToAgent 가 대신 적는다) */
export async function agentRequestMarkHanded(id: string, via: AgentRequestVia, label?: string, agent?: string) {
  const { data, error } = await rpc('agent_request_mark_handed', { p_id: id, p_via: via, p_label: label ?? null, p_agent: agent ?? null });
  if (error) throw fail(error);
  return data as Omit<AgentRequest, 'body' | 'steps' | 'refs'>;
}

/** 모바일 앱에서 작업 요청 알림의 목적지 — «에이전트» 탭의 받은 요청 카드(그 요청을 펼친 채). 웹은 notificationNavigation 의 /agents */
export const agentRequestPath = (meta: Record<string, unknown> | null | undefined) => {
  const id = typeof meta?.request_id === 'string' ? meta.request_id : '';
  return id ? `/m/agents?request=${encodeURIComponent(id)}` : '/m/agents';
};

export const REF_KIND_TEXT: Record<string, string> = {
  work: '업무', task: '할 일', action: '작업', document_generation: '문서 생성', skill: '스킬',
};
export const VIA_TEXT: Record<AgentRequestVia, string> = { desk: '데스크', phone: '휴대폰', web: '웹' };
