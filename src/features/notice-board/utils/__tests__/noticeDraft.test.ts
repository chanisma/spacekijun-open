import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoticeDraft } from '../noticeDraft';

test('notice draft preserves text and accepts fenced JSON', () => {
  const draft = parseNoticeDraft('```json\n' + JSON.stringify({ title: ' 교직원 연수 ', content: '수요일 3시\n• 노트북 지참', checks: [' 장소 확인 ', null] }) + '\n```');
  assert.deepEqual(draft, { title: '교직원 연수', content: '수요일 3시\n• 노트북 지참', checks: ['장소 확인'] });
});

test('malformed or incomplete output cannot become a notice', () => {
  for (const value of ['not json', 'null', '[]', '{"title":"제목"}', '{"title":" ","content":"내용"}', JSON.stringify({ title: '가'.repeat(201), content: '내용' })]) {
    assert.throws(() => parseNoticeDraft(value));
  }
});

test('AI cannot inject unvalidated form metadata through a draft', () => {
  const draft = parseNoticeDraft(JSON.stringify({ title: '제목', content: '본문', author_id: 'other', department: '임의 부서', start_date: '2030-01-01', checks: Array.from({ length: 12 }, () => '확인') }));
  assert.deepEqual(Object.keys(draft), ['title', 'content', 'checks']);
  assert.equal(draft.checks.length, 8);
});
