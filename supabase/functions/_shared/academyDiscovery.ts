export interface SelfDiscovery {
  user_id: string; source: 'first' | 'journey'; statement: string; previous_statement: string | null;
  source_excerpt: string; revision: number; memory_enabled: boolean; updated_at: string;
}
export interface TutorialState { user_id: string; telescope_seen: boolean; paused: boolean }
export interface AcademyMemory { label: string; excerpt: string; previous?: string | null; at: string; kind: 'self' | 'daily' }
export function parseDiscoveryInput(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw Error('기록 요청을 확인해 주세요.');
  const v = raw as Record<string, unknown>;
  if (v.action === 'tutorial') {
    if (!['telescope', 'pause', 'resume'].includes(String(v.event))) throw Error('안내 행동을 확인해 주세요.');
    return { action: 'tutorial' as const, event: String(v.event) };
  }
  if (v.action !== 'discover' || !['first', 'journey'].includes(String(v.source)) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0) throw Error('기억의 출처와 버전을 확인해 주세요.');
  if (v.memory !== undefined && typeof v.memory !== 'boolean') throw Error('기억 사용 여부를 확인해 주세요.');
  if (v.memory === undefined && (typeof v.statement !== 'string' || v.statement.trim().length < 10 || v.statement.length > 1000)) throw Error('내가 확인한 문장을 10~1,000자로 적어 주세요.');
  return { action: 'discover' as const, source: String(v.source), revision: Number(v.revision), statement: typeof v.statement === 'string' ? v.statement.trim() : null, memory: typeof v.memory === 'boolean' ? v.memory : null };
}
