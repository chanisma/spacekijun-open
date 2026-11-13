import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActivityHost, InquiryActivity } from '../../types';
import { matchInquiryClubHost } from '../inquiryClubHost';
import { activityToSeed } from '../inquiryToActivity';

function host(id: string, overrides: Partial<ActivityHost> = {}): ActivityHost {
  return {
    id, name: '과학탐구부', kind: 'club', status: 'active', category: null, description: null,
    default_area: 'club', owner_resource_id: null, department: null, meta: {},
    created_by: null, created_at: '', updated_at: '', ...overrides,
  };
}

test('only a unique active club with the exact name is matched', () => {
  const club = host('club');
  assert.equal(matchInquiryClubHost(' 과학탐구부 ', [club])?.id, 'club');
  assert.equal(matchInquiryClubHost('과학탐구부', [host('archived', { status: 'archived' }), club])?.id, 'club');
  assert.equal(matchInquiryClubHost('과학탐구부', [host('dept', { kind: 'department' })]), null);
  assert.equal(matchInquiryClubHost('과학탐구부', [club, host('duplicate')]), null);
});

test('similar, historical, missing and unavailable club names require manual selection', () => {
  for (const name of ['과학 탐구부', '과학탐구부(2025)', '', ' ', undefined, null]) {
    assert.equal(matchInquiryClubHost(name, [host('club')]), null);
  }
  assert.equal(matchInquiryClubHost('과학탐구부', []), null);
  assert.equal(matchInquiryClubHost('과학탐구부', [host('old', { status: 'archived' })]), null);
});

test('inquiry club becomes a host candidate, not an external operator, and can resolve to a host id', () => {
  const inquiry = {
    title: '효소 실험', area: 'club', club_name: '과학탐구부', career_fields: [],
    concepts: ['효소'], method_types: [], output_types: [],
    // `did`(생기부 서술)는 씨앗에 담지 않는다 — 뷰도 그 값을 주지 않는다(2026-09-11).
  } as unknown as InquiryActivity;
  const seed = activityToSeed(inquiry);
  assert.equal(seed.hostClubName, '과학탐구부');
  assert.equal(seed.operatorName, undefined);
  assert.equal(seed.hostId, undefined);
  assert.equal(matchInquiryClubHost(seed.hostClubName, [host('existing')])?.id, 'existing');
  assert.deepEqual(seed.keywords, ['효소']);
  assert.equal(activityToSeed({ ...inquiry, club_name: null }).hostClubName, undefined);
  assert.equal(activityToSeed({ ...inquiry, area: 'career' }).hostClubName, undefined);
});
