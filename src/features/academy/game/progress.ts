export type QuestStep = 'accepted' | 'read' | 'ready' | 'completed';
export interface GameProgress {
  user_id: string;
  quest_step: QuestStep;
  activity_id: string | null;
  question: string;
  updated_at: string;
}
export const questSteps = ['accepted', 'read', 'ready', 'completed'] as const;
export function questObjective(step?: QuestStep) {
  switch (step) {
    case 'accepted': return '도서관 책장에서 관심 가는 활동을 찾아 읽기';
    case 'read': return '읽은 활동에서 나만의 질문을 발견해 기록하기';
    case 'ready': return '사서 엘리안에게 돌아가 발견한 질문 들려주기';
    case 'completed': return '첫 발견의 인장 획득 · 다음 탐구를 자유롭게 이어가세요';
    default: return '안내자 루온과 대화해 첫 의뢰 받기';
  }
}
export function canAdvance(current: QuestStep | undefined, next: QuestStep, activityId: string | null, question: string) {
  if (!current) return next === 'accepted';
  if (questSteps.indexOf(next) !== questSteps.indexOf(current) + 1) return false;
  if (next === 'read' && !activityId) return false;
  if ((next === 'ready' || next === 'completed') && (question.trim().length < 20 || question.length > 2000)) return false;
  return true;
}
