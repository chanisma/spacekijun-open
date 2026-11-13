import type { ComicPanel, InquiryDraft, NewsArticle } from '../types';

export const EMPTY_INQUIRY: InquiryDraft = { question: '', prediction: '', plan: '', reflection: '' };
export const FIELD_LIMITS: Record<keyof InquiryDraft, number> = { question: 1000, prediction: 3000, plan: 3000, reflection: 3000 };

export function safeNewsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function newsDate(value: string | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) return '날짜 미상';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(value));
}

export function sourceName(value: string): string {
  return ({ aitimes: 'AI타임스', aitimes_kr: '인공지능신문', irobotnews: '로봇신문', quanta: 'Quanta Magazine' } as Record<string, string>)[value] || value;
}

/**
 * 수집 단계에서 기사 내용으로 만든 질문이 있으면 그것을 쓴다.
 * 없으면(소급 생성하지 않은 과거 기사) 종전의 로컬 규칙 씨앗으로 돌아간다.
 * 로컬 규칙은 기사 사실을 생성하지 않는 일반 안내문이다.
 */
export function inquiryPrompts(article: NewsArticle): string[] {
  const stored = (article.inquiry_questions ?? []).map(q => q?.trim()).filter(Boolean);
  if (stored.length) return stored;
  return localInquirySeeds(article);
}

/**
 * 기사 핵심어. 교과(`subjects`)와 달리 기사마다 다른 열린 어휘이고,
 * 소급 생성하지 않은 과거 행은 빈 배열이다(2026-09-18 실측 86건 중 70건).
 * 열을 빠뜨린 조회에서는 값 자체가 없으므로 표시 전 항상 이 함수를 거친다 —
 * 화면마다 `article.keywords.map(...)` 을 쓰면 그 조회에서만 조용히 죽는다.
 */
export function articleKeywords(article: Pick<NewsArticle, 'keywords'>): string[] {
  return (article.keywords ?? []).map(keyword => keyword?.trim()).filter(Boolean);
}

/** 질문이 기사에서 만들어진 것인지(수집 단계) 일반 안내인지 화면이 구분해 말한다. */
export function hasArticleInquiry(article: NewsArticle): boolean {
  return (article.inquiry_questions ?? []).some(q => q?.trim());
}

function localInquirySeeds(article: NewsArticle): string[] {
  const text = `${article.title} ${article.classroom_hook ?? ''}`;
  if (/로봇|robot|자율주행/i.test(text)) return [
    '사람의 움직임이 불규칙해지면 로봇의 판단은 어떻게 달라질까?',
    '속도와 안전 중 하나를 높일 때 다른 하나는 어떻게 변할까?',
    '같은 기술을 우리 학교에서 쓴다면 무엇부터 검증해야 할까?',
  ];
  if (/수학|정리|증명|math|theorem/i.test(text)) return [
    '정답을 찾는 것과 왜 맞는지 증명하는 것은 어떻게 다를까?',
    '컴퓨터가 찾은 결과를 사람이 확인하려면 어떤 과정이 필요할까?',
    '이 문제를 작은 사례로 바꾸어 직접 확인할 수 있을까?',
  ];
  if (/유전|게놈|단백질|genom|protein|생물/i.test(text)) return [
    'AI의 예측이 실제 생명 현상과 맞는지 어떻게 검증할까?',
    '학습 데이터가 달라지면 예측 결과는 얼마나 달라질까?',
    '이 발견을 활용하기 전에 어떤 한계와 윤리를 살펴야 할까?',
  ];
  if (article.category === '정책' || article.subjects.includes('사회')) return [
    '이 변화로 도움을 받는 사람과 어려움을 겪는 사람은 누구일까?',
    '기사의 전망이 실현되려면 어떤 조건이 필요할까?',
    '서로 다른 관점의 자료를 비교하면 어떤 차이가 보일까?',
  ];
  return [
    '이전 방식과 비교했을 때 정확히 무엇이 달라졌을까?',
    '이 주장을 확인하려면 어떤 데이터나 실험이 필요할까?',
    '이 변화를 내 관심 분야에 적용하면 어떤 질문이 생길까?',
  ];
}

export function buildStory(article: NewsArticle) {
  return [
    { step: '01', title: '새로운 소식이 도착했어', speaker: '리아 · 발견하는 사람', text: article.classroom_hook || article.title, kind: '수집된 기사의 핵심' },
    { step: '02', title: '그래서, 무엇이 달라졌을까?', speaker: '루온 · 근거를 찾는 사람', text: article.why_it_matters || '원문에서 이전 방식과 달라진 점, 이를 뒷받침하는 근거를 찾아보자.', kind: article.why_it_matters ? '수집된 해설' : '탐구 길잡이의 제안' },
    { step: '03', title: '기사에서는 이렇게 전했어', speaker: '루온 · 근거를 찾는 사람', text: article.summary || '수집된 발췌가 없어. 아래 원문에서 자세한 내용을 확인해 보자.', kind: article.summary ? '수집된 기사 발췌' : '원문 안내' },
    { step: '04', title: '이제, 우리의 질문', speaker: '리아 · 질문을 여는 사람', text: inquiryPrompts(article)[0], kind: '탐구를 위한 질문' },
  ];
}

export function inquiryProgress(draft: InquiryDraft) {
  return Object.values(draft).filter(value => value.trim()).length;
}

export function inquiryToText(article: NewsArticle, draft: InquiryDraft): string {
  return [
    '[요즘 세상 · 관측 일지]', article.title,
    `출처: ${sourceName(article.source)} · ${newsDate(article.published_at)}`,
    `원문: ${safeNewsUrl(article.url) ?? '유효한 링크 없음'}`,
    '', `나의 질문: ${draft.question}`, `예상과 이유: ${draft.prediction}`,
    `확인할 방법: ${draft.plan}`, `발견과 새 질문: ${draft.reflection}`,
  ].join('\n');
}

/** 만화 공개 URL. 버킷 경로만 받아 조립하므로 다른 기사의 그림이 붙을 여지가 없다. */
export function comicImageUrl(article: NewsArticle, publicUrlFor: (path: string) => string): string | null {
  const p = article.comic_path?.trim();
  if (!p) return null;
  // 경로 조작 방어: 버킷 안의 상대 경로만 허용한다.
  if (p.startsWith('/') || p.includes('..') || /^[a-z]+:/i.test(p)) return null;
  return publicUrlFor(p);
}

export function comicPanels(article: NewsArticle): ComicPanel[] {
  const panels = article.comic_panels;
  if (!Array.isArray(panels) || panels.length !== 4) return [];
  return panels.filter(p => p && Array.isArray(p.dialogue));
}

/**
 * 목록 카드의 "4컷 만화" 표시 판정 (2026-09-14 사용자 지시). 다이얼로그가 만화를 실제로 그리는
 * 조건(경로가 유효하고 컷이 정확히 4개)과 **같은 규칙**이어야 한다 — 다르면 표시는 있는데
 * 열면 만화가 없거나 그 반대가 되고, 그 어긋남은 오류를 내지 않는다.
 */
export function hasArticleComic(article: Pick<NewsArticle, 'comic_path' | 'comic_panels'>): boolean {
  return comicImageUrl(article as NewsArticle, p => p) !== null && comicPanels(article as NewsArticle).length === 4;
}
