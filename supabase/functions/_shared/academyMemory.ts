import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SelfDiscovery, AcademyMemory } from './academyDiscovery.ts';
import type { NpcIdentity } from './academyNpc.ts';
export async function loadAcademyMemories(db: SupabaseClient, userId: string, npc: NpcIdentity, beforeDay?: string): Promise<AcademyMemory[]> {
  const self = await db.from('academy_self_discoveries').select('source,statement,previous_statement,updated_at').eq('user_id', userId).eq('memory_enabled', true);
  if (self.error) throw self.error;
  const memories: AcademyMemory[] = [];
  for (const row of (self.data ?? []) as SelfDiscovery[]) {
    const valid = row.source === 'first'
      ? await db.from('academy_game_progress').select('user_id').eq('user_id', userId).in('quest_step', ['ready', 'completed']).maybeSingle()
      : await db.from('academy_journeys').select('user_id').eq('user_id', userId).eq('stage', 'completed').maybeSingle();
    if (valid.error) throw valid.error;
    if (valid.data) memories.push({ label: row.source === 'first' ? '첫 질문에서 리아가 확인한 자기 설명' : '연속 의뢰 회고에서 리아가 확인한 자기 설명', excerpt: row.statement.slice(0, 1000), previous: row.previous_statement?.slice(0, 1000), at: row.updated_at, kind: 'self' });
  }
  let history = db.from('academy_daily_conversations').select('day,question,turns').eq('user_id', userId).eq('npc', npc).eq('status', 'ready');
  if (beforeDay) history = history.lt('day', beforeDay);
  const daily = await history.order('day', { ascending: false }).limit(2);
  if (daily.error) throw daily.error;
  for (const row of daily.data ?? []) {
    const answers = (Array.isArray(row.turns) ? row.turns : []).filter((t: { role: string; content: string }) => t.role === 'user').slice(-3).map((t: { content: string }) => t.content.slice(0, 700));
    if (answers.length) memories.push({ label: `${row.day} · 이 NPC에게 리아가 한 말`, excerpt: `당시 NPC 질문: ${String(row.question).slice(0, 700)}\n리아의 답변: ${answers.join('\n')}`, at: row.day, kind: 'daily' });
  }
  return memories;
}
