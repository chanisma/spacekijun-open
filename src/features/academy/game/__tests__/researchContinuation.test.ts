import assert from 'node:assert/strict';
import { test } from 'node:test';
import { researchContinuation } from '../researchContinuation';
import type { SavedInquiryDesign, InquiryTarget } from '@/features/inquiry-design/types';

test('continuation carries full design/reflection without reusing an old KG id or recursively copying ancestors', () => {
  const reflection = '관측 조건을 더 비교하고 싶어요. '.repeat(600);
  const design = { id: 'previous', title: '하천 관측', target_kind: 'subject', target_name: '과학', academic_year: 2026, grade: 1, semester: 1, status: 'saved', reflection, student_rationale: '수질 변화가 궁금해서', kg_version_id: 'old-kg', selected_source_snapshot: [{ kind: 'academy_research_context', analysis: 'ancestor' }, { kind: 'academy_news_context', summary: '기사 요약' }], llm_result: { inquiry_questions: ['비가 온 뒤에는?'], plan_steps: [{ title: '관측' }] } } as unknown as SavedInquiryDesign;
  const targets = [{ id: 'other', kind: 'subject', name: '과학', academic_year: 2027 }, { id: 'same', kind: 'subject', name: '과학', academic_year: 2026, grade: 1, semester: 1 }] as InquiryTarget[];
  const next = researchContinuation(design, targets);
  assert.equal(next.target?.id, 'same');
  assert.equal(next.source.snapshot.reflection, reflection);
  assert.deepEqual(next.source.snapshot.analysis, design.llm_result);
  assert.equal(next.source.source_kind, 'manual');
  assert.equal(next.source.source_entity_id, undefined);
  assert.equal((next.source.snapshot.references as unknown[]).length, 1);
  assert.ok(next.requirements.length <= 6000);
  assert.match(next.requirements, /비가 온 뒤에는/);
  assert.equal(researchContinuation(design, []).target, undefined);
  assert.equal(design.selected_source_snapshot.length, 2);
});
