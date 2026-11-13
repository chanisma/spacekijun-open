import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActivityProposalRow } from '../../types';
import { proposalBoardUrl, summarizeHomeProposals } from '../proposalHome';

function proposal(id: string, overrides: Partial<ActivityProposalRow> = {}): ActivityProposalRow {
  return {
    id, title: id, body: '', area: null, career_fields: [], target_year: null,
    parent_activity_id: null, proposer_profile_id: 'admin-profile', proposer_student_code: 'student-a',
    status: 'submitted', review_note: null, reviewed_by: null, reviewed_at: null,
    resulting_activity_id: null, meta: {}, created_at: '2026-09-01', updated_at: '2026-09-01',
    proposer_name: null, is_student: true, interest_count: 0, my_interest: false,
    parent_activity_name: null, ...overrides,
  };
}

test('student identity scopes my proposals, including reviewed results, without using the preview admin profile', () => {
  const rows = [proposal('mine', { status: 'accepted' }), proposal('other', { proposer_student_code: 'student-b' })];
  assert.deepEqual(summarizeHomeProposals(rows, 'student-a').mine.map(p => p.id), ['mine']);
  assert.deepEqual(summarizeHomeProposals(rows, 'student-b').mine.map(p => p.id), ['other']);
  assert.deepEqual(summarizeHomeProposals(rows, null).mine, []);
});

test('teacher queue excludes resolved proposals and prioritizes submitted then oldest', () => {
  const rows = [proposal('review', { status: 'reviewing' }), proposal('new', { created_at: '2026-09-09' }),
    proposal('old'), proposal('accepted', { status: 'accepted' }), proposal('held', { status: 'declined' })];
  assert.deepEqual(summarizeHomeProposals(rows, null).pending.map(p => p.id), ['old', 'new', 'review']);
  assert.equal(rows[0].id, 'review');
});

test('discovery excludes my and resolved proposals and prioritizes existing interest', () => {
  const rows = [proposal('mine'), proposal('new', { proposer_student_code: 'b', created_at: '2026-09-09' }),
    proposal('interested', { proposer_student_code: 'b', my_interest: true }),
    proposal('done', { proposer_student_code: 'b', status: 'accepted', my_interest: true })];
  assert.deepEqual(summarizeHomeProposals(rows, 'student-a').discover.map(p => p.id), ['interested', 'new']);
});

test('my proposals use most recently changed order and empty data is safe', () => {
  assert.deepEqual(summarizeHomeProposals([proposal('old'), proposal('updated', { updated_at: '2026-09-10' })], 'student-a').mine.map(p => p.id), ['updated', 'old']);
  assert.deepEqual(summarizeHomeProposals([], null), { pending: [], mine: [], discover: [] });
  assert.equal(proposalBoardUrl(), '/activities?scope=proposals');
  assert.equal(proposalBoardUrl('a&b'), '/activities?scope=proposals&proposal=a%26b');
});
