export const journeyStages = ['seeking', 'planned', 'observed', 'completed'] as const;
export type JourneyStage = typeof journeyStages[number];
export interface AcademyJourney {
  user_id: string; stage: JourneyStage; revision: number;
  source_question: string; source_activity_id: string | null;
  design_id: string | null; activity_id: string | null;
  reflection: string | null; created_at: string; updated_at: string; completed_at: string | null;
}
export type JourneyAction = 'start' | 'bind' | 'observe' | 'complete';
export const journeyObjectives: Record<JourneyStage, string> = {
  seeking: '도서관에서 찾은 질문을 실제로 해 본 활동과 잇기',
  planned: '도서관에서 찾은 질문을 실제로 해 본 활동과 잇기',
  observed: '발견과 생각의 변화를 회고로 남기기',
  completed: '회고의 별 획득 · NPC들과 함께 발견을 돌아보세요',
};
export function parseJourneyInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('의뢰 요청을 확인해 주세요.');
  const v = value as Record<string, unknown>;
  if (!['start', 'bind', 'observe', 'complete'].includes(String(v.action))) throw new Error('의뢰의 다음 행동을 확인해 주세요.');
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0) throw new Error('의뢰 기록을 다시 불러와 주세요.');
  if (v.action === 'bind' && (typeof v.designId !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(v.designId))) throw new Error('연결할 내 탐구를 골라 주세요.');
  if (v.action === 'complete' && (typeof v.reflection !== 'string' || v.reflection.trim().length < 40 || v.reflection.length > 4000)) throw new Error('발견과 생각의 변화를 40~4,000자로 적어 주세요.');
  return { action: v.action as JourneyAction, revision: Number(v.revision), designId: v.action === 'bind' ? v.designId as string : null, reflection: v.action === 'complete' ? (v.reflection as string).trim() : null };
}
