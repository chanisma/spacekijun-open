import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canRoleSeePath } from '../../../lib/routeAccess';
import { linkedInterviewActivities, parseInterviewEvaluation, parseInterviewQuestion, interviewRubric, type InterviewEntity } from '../../../../supabase/functions/_shared/academyInterview';

const entities: InterviewEntity[] = [
  { entity_id: 'interest', label: '환경', type: 'Interest' },
  { entity_id: 'thread', label: '수질 탐구', type: 'Thread' },
  { entity_id: 'a1', label: '하천 조사', type: 'Activity' },
  { entity_id: 'a2', label: '분광 분석', type: 'Activity' },
  { entity_id: 'unrelated', label: '다른 활동', type: 'Activity' },
  { entity_id: 'student', label: '학생', type: 'Student' },
];
test('academy navigation matches the student/teacher/admin route guard, including nested places', () => {
  for (const path of ['/academy', '/academy/library', '/academy/observatory', '/academy/post']) {
    assert.equal(canRoleSeePath('staff', path), false);
    for (const role of ['student', 'teacher', 'admin'] as const) assert.equal(canRoleSeePath(role, path), true);
  }
});
const relations = [
  { source_entity_id: 'a1', target_entity_id: 'interest' },
  { source_entity_id: 'thread', target_entity_id: 'a1' },
  { source_entity_id: 'a2', target_entity_id: 'thread' },
  { source_entity_id: 'interest', target_entity_id: 'student' },
  { source_entity_id: 'student', target_entity_id: 'unrelated' },
  { source_entity_id: 'a1', target_entity_id: 'interest' },
];
test('Interest and Thread select direct activities in both directions, without crossing Student nodes or duplicating activities', () => {
  assert.deepEqual(linkedInterviewActivities('interest', entities, relations).map(e => e.entity_id), ['a1']);
  assert.deepEqual(linkedInterviewActivities('thread', entities, relations).map(e => e.entity_id), ['a1', 'a2']);
  assert.deepEqual(linkedInterviewActivities('a2', entities, relations).map(e => e.entity_id), ['a2']);
  assert.deepEqual(linkedInterviewActivities('student', entities, relations), []);
  assert.deepEqual(linkedInterviewActivities('missing', entities, relations), []);
});
const feedback = (kind: 'general' | 'experience') => ({ criteria: interviewRubric(kind).map(({ id }) => ({ id, score: 2, evidence: '답변에서 확인되지 않음', feedback: '본인의 행동을 구체화하세요.' })), strength: '핵심 주제를 제시했습니다.', improvement: '이유를 설명하세요.', followUp: '결과를 어떻게 확인했나요?' });
test('general feedback requires S1–S4; experience feedback additionally requires every STAR+F criterion', () => {
  assert.equal(parseInterviewEvaluation(feedback('general'), 'general').criteria.length, 4);
  assert.equal(parseInterviewEvaluation(feedback('experience'), 'experience').criteria.length, 9);
  assert.throws(() => parseInterviewEvaluation(feedback('general'), 'experience'));
  const duplicate = feedback('general');
  duplicate.criteria[1].id = 'S1';
  assert.throws(() => parseInterviewEvaluation(duplicate, 'general'));
  for (const score of [-1, 5, 2.5, NaN]) {
    const bad = feedback('general'); bad.criteria[0].score = score;
    assert.throws(() => parseInterviewEvaluation(bad, 'general'));
  }
  assert.throws(() => parseInterviewQuestion({ question: '', intent: 'test' }));
});
