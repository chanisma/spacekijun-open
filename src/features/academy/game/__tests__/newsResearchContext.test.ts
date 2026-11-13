import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NewsArticle } from '@/features/world-today/types';
import { newsResearchContext, newsContextSource } from '../newsResearchContext';
import { designConversationInput } from '../designConversationModel';
import { inquiryToText } from '@/features/world-today/utils/story';

test('a long article summary travels as evidence, separately from the editable student question, in both design paths', () => {
  const summary = '기사에서 실제로 보고한 발견과 한계. '.repeat(900);
  const article = { id: 3, title: '도시의 그늘', source: 'nature', url: 'https://example.com/article', published_at: null, summary } as NewsArticle;
  const draft = { question: '우리 동네에서도 확인할 수 있을까?', prediction: '그늘은 시원할 것이다.', plan: '', reflection: '' };
  const context = newsResearchContext(article, draft), source = newsContextSource(context);
  const visible = inquiryToText(article, draft);
  assert.ok(!visible.includes(summary));
  assert.equal(source.snapshot.summary, summary);
  for (const messages of [[], [{ role: 'user' as const, content: '같은 날 같은 시간에 비교할래요.' }]]) {
    const input = designConversationInput([source], visible, messages);
    assert.equal(input.sources[0].snapshot.summary, summary);
    assert.match(String(input.sources[0].snapshot.note), /이미 실행한 경험이 아니/);
  }
  draft.question = '나중에 고친 질문';
  assert.equal(context.draft.question, '우리 동네에서도 확인할 수 있을까?');
});
