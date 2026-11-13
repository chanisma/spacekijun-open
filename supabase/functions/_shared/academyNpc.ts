export type NpcIdentity = 'luon' | 'librarian' | 'professor' | 'postmaster';
export interface NpcTurn { role: 'user' | 'assistant'; content: string }
export interface NpcSource { kind: 'activity' | 'news'; id: string; name: string }
export interface NpcReply { reply: string; expression: number; source: NpcSource | null; memories?: import('./academyDiscovery.ts').AcademyMemory[] }
export function parseNpcInput(input: Record<string, unknown>) {
  if (!['luon', 'librarian', 'professor', 'postmaster'].includes(String(input.npc))) throw new Error('대화할 인물을 선택해 주세요.');
  if (input.newsId != null && (!Number.isSafeInteger(input.newsId) || Number(input.newsId) < 1 || input.npc !== 'postmaster')) throw new Error('함께 읽을 편지를 선택해 주세요.');
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 1200) throw new Error('대화는 1~1,200자로 입력해 주세요.');
  const history = input.history ?? [];
  if (!Array.isArray(history) || history.length > 8 || history.some(t => !t || typeof t !== 'object' || !['user', 'assistant'].includes(t.role) || typeof t.content !== 'string' || t.content.length > 1800)) throw new Error('대화 기록의 형식이나 길이를 확인해 주세요.');
  return { npc: input.npc as NpcIdentity, message: input.message.trim(), history: history as NpcTurn[], newsId: input.newsId == null ? null : Number(input.newsId) };
}
export function parseNpcOutput(output: unknown): Pick<NpcReply, 'reply' | 'expression'> {
  if (!output || typeof output !== 'object') throw new Error('Invalid NPC reply');
  const value = output as Record<string, unknown>;
  if (typeof value.reply !== 'string' || !value.reply.trim() || value.reply.length > 1800) throw new Error('Invalid NPC reply');
  return { reply: value.reply.trim(), expression: [0, 1, 2, 3].includes(Number(value.expression)) ? Number(value.expression) : 0 };
}
