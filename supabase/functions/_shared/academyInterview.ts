/** Shared, dependency-free interview contract. No profile data or API keys live here. */
export type InterviewKind = 'general' | 'experience';
export interface InterviewEntity {
  entity_id: string;
  label: string;
  type: string | null;
  properties?: Record<string, unknown> | null;
}
export interface InterviewRelation { source_entity_id: string; target_entity_id: string }
export const FOUR_SENTENCES = [
  { id: 'S1', label: '결론 제시', guide: '질문에 대한 핵심 답을 먼저 말합니다.' },
  { id: 'S2', label: '이유 설명', guide: '그렇게 생각한 이유나 배경을 설명합니다.' },
  { id: 'S3', label: '구체적 사례', guide: '본인의 실제 경험과 근거를 제시합니다.' },
  { id: 'S4', label: '전공·진로 연결', guide: '배운 점을 대학의 전공 학습과 앞으로의 진로에 연결합니다.' },
] as const;
export const STAR_F = [
  { id: 'Situation', label: '상황', guide: '경험이 일어난 배경을 간결하게 설명합니다.' },
  { id: 'Task', label: '과제', guide: '해결할 문제와 본인의 역할·목표를 밝힙니다.' },
  { id: 'Action', label: '행동', guide: '본인이 직접 한 구체적인 행동과 노력을 설명합니다.' },
  { id: 'Result', label: '결과', guide: '성과와 배운 점을 제시합니다. 실제 수치가 있을 때만 활용합니다.' },
  { id: 'Feeling', label: '생각과 성찰', guide: '경험에 대한 자신의 생각·느낌과 이후 변화로 마무리합니다.' },
] as const;
export function interviewRubric(kind: InterviewKind) {
  return kind === 'experience' ? [...FOUR_SENTENCES, ...STAR_F] : [...FOUR_SENTENCES];
}

/** Only direct graph evidence counts. Traversing via Student/Concept would pull unrelated work in. */
export function linkedInterviewActivities(sourceId: string, entities: InterviewEntity[], relations: InterviewRelation[]) {
  const source = entities.find(e => e.entity_id === sourceId);
  if (!source || !['Interest', 'Thread', 'Activity'].includes(source.type ?? '')) return [];
  if (source.type === 'Activity') return [source];
  const ids = new Set<string>();
  for (const relation of relations) {
    if (relation.source_entity_id === sourceId) ids.add(relation.target_entity_id);
    if (relation.target_entity_id === sourceId) ids.add(relation.source_entity_id);
  }
  return entities.filter(e => e.type === 'Activity' && ids.has(e.entity_id));
}

export interface InterviewQuestion { question: string; intent: string }
export interface InterviewCriterion { id: string; score: number; evidence: string; feedback: string }
export interface InterviewEvaluation {
  kind?: InterviewKind;
  criteria: InterviewCriterion[];
  strength: string;
  improvement: string;
  followUp: string;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('면담 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.');
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, max = 3000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('면담 응답의 내용이 비어 있거나 너무 깁니다. 다시 시도해 주세요.');
  return value.trim();
}
export function parseInterviewQuestion(value: unknown): InterviewQuestion {
  const item = record(value);
  return { question: requiredText(item.question, 1500), intent: requiredText(item.intent, 1500) };
}
export function parseInterviewEvaluation(value: unknown, legacyKind?: InterviewKind): InterviewEvaluation {
  const item = record(value);
  const kind = item.kind ?? legacyKind;
  if (kind !== 'general' && kind !== 'experience') throw new Error('답변 내용에 맞는 평가 기준을 확인하지 못했습니다. 다시 평가해 주세요.');
  const rubric = interviewRubric(kind);
  if (!Array.isArray(item.criteria) || item.criteria.length !== rubric.length) throw new Error('평가 기준이 누락되었습니다. 다시 평가해 주세요.');
  const rows = item.criteria.map(record);
  const criteria = rubric.map(({ id }) => {
    const matches = rows.filter(row => row.id === id);
    if (matches.length !== 1) throw new Error('평가 기준이 중복되거나 누락되었습니다.');
    const row = matches[0];
    if (typeof row.score !== 'number' || !Number.isInteger(row.score) || row.score < 0 || row.score > 4) throw new Error('평가 점수 형식이 올바르지 않습니다.');
    return { id, score: row.score, evidence: requiredText(row.evidence), feedback: requiredText(row.feedback) };
  });
  return { kind, criteria, strength: requiredText(item.strength), improvement: requiredText(item.improvement), followUp: requiredText(item.followUp, 1500) };
}
