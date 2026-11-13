import assert from 'node:assert/strict';
import { test } from 'node:test';
import { articleKeywords, buildStory, comicImageUrl, comicPanels, hasArticleComic, EMPTY_INQUIRY, hasArticleInquiry, inquiryProgress, inquiryPrompts, inquiryToText, safeNewsUrl } from '../story';
import type { NewsArticle } from '../../types';

const article: NewsArticle = { id: 1, title: '새로운 연구', url: 'https://example.com/news', source: 'quanta', published_at: '2026-09-11T00:00:00Z', summary: null, category: '연구성과', classroom_hook: null, why_it_matters: null, subjects: [], keywords: [], fields: null, difficulty: null, inquiry_questions: [], comic_path: null, comic_panels: [], collected_at: null };

test('external links reject executable, relative and credential-bearing URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'https://user:password@example.com', 'bad']) assert.equal(safeNewsUrl(url), null);
  assert.equal(safeNewsUrl('https://example.com/news?a=1'), 'https://example.com/news?a=1');
});

test('story preserves source text and marks missing explanations as prompts rather than fabricated facts', () => {
  const panels = buildStory(article);
  assert.equal(panels.length, 4);
  assert.equal(panels[0].text, article.title);
  assert.equal(panels[1].kind, '탐구 길잡이의 제안');
  assert.equal(panels[2].kind, '원문 안내');
  assert.equal(panels[3].kind, '탐구를 위한 질문');
  assert.equal(buildStory({ ...article, summary: '원문 발췌' })[2].text, '원문 발췌');
  assert.equal(buildStory({ ...article, why_it_matters: '원래 해설' })[1].text, '원래 해설');
});

test('inquiry export keeps source and student text without executable URLs', () => {
  const draft = { ...EMPTY_INQUIRY, question: '무엇이 달라졌을까?', plan: '두 자료를 비교한다.' };
  const text = inquiryToText(article, draft);
  assert.match(text, /https:\/\/example.com\/news/);
  assert.ok(text.includes(draft.question));
  assert.ok(text.includes(draft.plan));
  assert.ok(!inquiryToText({ ...article, url: 'javascript:alert(1)' }, draft).includes('javascript:'));
  assert.equal(inquiryProgress({ ...draft, reflection: '  ' }), 2);
});

test('stored article questions win over local keyword seeds', () => {
  const stored = ['위성이 놓치는 배출원은 어떤 곳일까?', '측정 간격을 늘리면 무엇이 달라질까?', '오탐지는 누구에게 부담이 될까?'];
  const withQuestions: NewsArticle = { ...article, title: '로봇 자율주행 연구', inquiry_questions: stored };
  assert.deepEqual(inquiryPrompts(withQuestions), stored);
  assert.equal(hasArticleInquiry(withQuestions), true);
  // 제목에 '로봇'이 있어 로컬 규칙이라면 로봇 씨앗이 나왔을 자리다.
  assert.ok(!inquiryPrompts(withQuestions).some(q => q.includes('사람의 움직임이 불규칙')));
});

test('articles without stored questions fall back to local seeds', () => {
  const legacy: NewsArticle = { ...article, title: '수학 난제 증명', inquiry_questions: [] };
  const prompts = inquiryPrompts(legacy);
  assert.equal(prompts.length, 3);
  assert.equal(hasArticleInquiry(legacy), false);
  assert.ok(prompts.some(q => q.includes('증명')));
});

test('blank and missing question arrays are treated as absent', () => {
  assert.equal(hasArticleInquiry({ ...article, inquiry_questions: ['  ', ''] }), false);
  assert.equal(inquiryPrompts({ ...article, inquiry_questions: ['  ', ''] }).length, 3);
  // 과거 스키마로 만들어진 객체(컬럼 자체가 없는 경우)에도 견뎌야 한다.
  const missing = { ...article } as NewsArticle;
  delete (missing as Partial<NewsArticle>).inquiry_questions;
  assert.equal(hasArticleInquiry(missing), false);
  assert.equal(inquiryPrompts(missing).length, 3);
});

test('stored questions are trimmed and blanks dropped', () => {
  const mixed: NewsArticle = { ...article, inquiry_questions: ['  진짜 질문?  ', '', '두 번째?'] };
  assert.deepEqual(inquiryPrompts(mixed), ['진짜 질문?', '두 번째?']);
});

const pub = (path: string) => `https://example.supabase.co/storage/v1/object/public/world-today-comics/${path}`;
const fourPanels = [0, 1, 2, 3].map(i => ({ title: `컷${i}`, dialogue: [`리아: a${i}`, `루온: b${i}`] }));

test('comic url is built from the row path only', () => {
  const withComic: NewsArticle = { ...article, comic_path: '2026/09/aitimes_kr-41858.webp', comic_panels: fourPanels };
  assert.equal(comicImageUrl(withComic, pub), pub('2026/09/aitimes_kr-41858.webp'));
  assert.equal(comicPanels(withComic).length, 4);
});

test('articles without a comic resolve to null', () => {
  assert.equal(comicImageUrl(article, pub), null);
  assert.deepEqual(comicPanels(article), []);
});

test('path traversal and absolute paths are rejected', () => {
  for (const bad of ['/etc/passwd', '../../secret.webp', 'https://evil.example/x.webp', 'javascript:alert(1)']) {
    assert.equal(comicImageUrl({ ...article, comic_path: bad }, pub), null, bad);
  }
});

test('panel arrays that are not exactly four are ignored', () => {
  // 이미지가 안 뜰 때 이 배열이 기사를 읽을 유일한 수단이라 모양이 어긋나면 쓰지 않는다.
  assert.deepEqual(comicPanels({ ...article, comic_panels: fourPanels.slice(0, 3) }), []);
  assert.deepEqual(comicPanels({ ...article, comic_panels: [] }), []);
});

test('list badge rule equals the dialog rule: valid path and exactly four panels', () => {
  assert.equal(hasArticleComic({ ...article, comic_path: '2026/09/a.webp', comic_panels: fourPanels }), true);
  assert.equal(hasArticleComic(article), false);
  assert.equal(hasArticleComic({ ...article, comic_path: '2026/09/a.webp', comic_panels: fourPanels.slice(0, 3) }), false);
  assert.equal(hasArticleComic({ ...article, comic_path: '../x.webp', comic_panels: fourPanels }), false);
});

test('keywords are trimmed, blanks dropped, and order preserved', () => {
  const withKeywords: NewsArticle = { ...article, keywords: ['  기계 관류 ', '', '  ', '생물학적 나이'] };
  assert.deepEqual(articleKeywords(withKeywords), ['기계 관류', '생물학적 나이']);
});

test('legacy rows and column-less objects yield no keywords rather than throwing', () => {
  // 라이브 86건 중 70건이 빈 배열이고(2026-09-18), 열을 빼고 조회한 객체에는 값 자체가 없다.
  // 화면은 이 경우 핵심어 줄을 아예 그리지 않아야 한다 — 빈 라벨만 남으면 안 된다.
  assert.deepEqual(articleKeywords(article), []);
  const missing = { ...article } as NewsArticle;
  delete (missing as Partial<NewsArticle>).keywords;
  assert.deepEqual(articleKeywords(missing), []);
  assert.deepEqual(articleKeywords({ ...article, keywords: ['', '  '] }), []);
});
