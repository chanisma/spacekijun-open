import assert from 'node:assert/strict';
import { test } from 'node:test';
import { equipment } from '../dormitoryModel';
import { workshopPrompt, workshopReference } from '../workshopModel';
import { collectIllustrations } from '../illustrationCollection';
import type { DormState } from '../dormitoryService';
import type { ChapterState } from '../chapterService';
import type { PrologueProgress } from '../prologueStory';

test('every NPC keeps a separate wardrobe slot and identity in the production instructions', () => {
  for (const slot of ['professor', 'librarian', 'postmaster', 'serin'] as const) {
    const state = { items: [{ item_id: 1, is_equipped: true }], catalog: [{ id: 1, academy_slot: slot, academy_asset: 'workshop:77777777-1111-2222-3333-444444444444', asset_url: 'https://example.com/art.png' }] } as DormState;
    assert.equal(equipment(state)[slot], 'https://example.com/art.png');
    assert.equal(equipment(state).ria, workshopReference.ria);
    assert.match(workshopPrompt(slot, '새로운 옷'), /얼굴·눈·체형·포즈/);
    assert.match(workshopPrompt(slot, '새로운 옷'), /실제 알파 투명/);
    delete state.catalog[0].asset_url;
    assert.equal(equipment(state)[slot], workshopReference[slot]);
  }
});
test('collection hides unseen scenes, repairs legacy completed/skip bookmarks and deduplicates repeated chapter art', () => {
  assert.deepEqual(collectIllustrations(null, null), []);
  const skipped = { scene_index: 0, skipped: true, completed_at: '2026-09-14' } as PrologueProgress;
  assert.equal(collectIllustrations(null, skipped).length, 6);
  assert.deepEqual(collectIllustrations(null, { ...skipped, completed_at: null }).map(i => i.asset), ['prologue-school']);
  const early = { chapter: { step: 3 }, designs: [] } as ChapterState;
  assert.deepEqual(collectIllustrations(early, null).map(i => i.asset), ['chapter-observatory-arrival']);
  const complete = { chapter: { step: 16 }, library: { step: 24 }, dorm: { step: 50 }, post: { step: 30 }, designs: [] } as ChapterState;
  const collection = collectIllustrations(complete, { ...skipped, scene_index: 100 });
  assert.equal(new Set(collection.map(i => i.asset)).size, collection.length);
  assert.equal(collection.filter(i => i.asset === 'chapter-post-complete').length, 1);
  assert.ok(collection.some(i => i.asset === 'chapter-dorm-night'));
});
