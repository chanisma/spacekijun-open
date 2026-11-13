export const dailyNpcs = ['luon', 'librarian', 'professor', 'postmaster'] as const;
export type DailyNpc = typeof dailyNpcs[number];
export interface DailyTurn { role: 'user' | 'assistant'; content: string; kind: 'waiting' | 'question' | 'message'; at: string }
export interface DailyConversation {
  user_id: string; day: string; npc: DailyNpc; question: string | null;
  status: 'generating' | 'ready' | 'failed'; turns: DailyTurn[];
  revision: number; lease_until: string | null; pending_message: string | null;
}
export interface DailyState { day: string; npc: DailyNpc; conversation: DailyConversation | null }
export function koreaDay(date = new Date()): string { return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10); }
export function dailyNpc(userId: string, day: string): DailyNpc {
  return dailyNpcs[Array.from(userId + day).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4];
}
export function parseDailyRequest(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('대화 형식을 확인해 주세요.');
  const v = value as Record<string, unknown>;
  if (typeof v.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) throw new Error('대화 날짜를 확인해 주세요.');
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0) throw new Error('대화 기록을 다시 불러와 주세요.');
  if (v.message != null && (typeof v.message !== 'string' || !v.message.trim() || v.message.length > 2000)) throw new Error('답변은 1~2,000자로 적어 주세요.');
  return { day: v.day, revision: Number(v.revision), message: typeof v.message === 'string' ? v.message.trim() : null };
}
export function parseDailyReply(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid daily response');
  const reply = (value as Record<string, unknown>).reply;
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 2000) throw new Error('Invalid daily response');
  return reply.trim();
}
