import type { InquiryDraft, NewsArticle } from '@/features/world-today/types';
import type { InquirySelectedSource } from '@/features/inquiry-design/types';
import { safeNewsUrl } from '@/features/world-today/utils/story';
import { keywordLine, recordKeywords } from './libraryRecords';

/** Article evidence travels separately from the student's editable question. */
export interface NewsResearchContext {
  kind: 'academy_news_context'; newsId: number; title: string;
  source: string; url: string | null; summary: string; draft: InquiryDraft;
}
export function newsResearchContext(article: NewsArticle, draft: InquiryDraft): NewsResearchContext {
  return { kind: 'academy_news_context', newsId: article.id, title: article.title,
    source: article.source, url: safeNewsUrl(article.url), summary: article.summary ?? '', draft: { ...draft } };
}
export function newsContextSource(context: NewsResearchContext): InquirySelectedSource {
  return { source_kind: 'manual', snapshot: { ...context, label: context.title,
    note: '우편국에서 읽은 기사와 학생의 관측 일지. 기사 내용은 학생이 이미 실행한 경험이 아니며, 참고 자료로만 사용합니다.' } };
}

/**
 * 왕립 도서관 책장에서 연구대로 가져가는 기록 (2026-10-03 사용자 요청 «책장의 내용을 연구대로 — NPC 를 거치지 않고도»).
 * 우편국의 기사처럼 **학생이 고칠 질문과 따로** 다닌다: 질문 칸에는 출발 문장만, 기록의 키워드는 참고 자료로 교수에게(2026-10-22 부터 주제·본문은 싣지 않는다).
 * 책장의 기록은 우리 학교 선배들의 창체 활동이라 **학생 본인의 경험이 아니다** — note 가 모델에게 그렇게 말한다.
 */
export interface LibraryResearchContext {
  kind: 'academy_library_context'; activityId: string; year: number | null;
  /** 구체적인 주제(활동 이름·본문)는 싣지 않는다 — 키워드만(libraryRecords.ts). */
  keywords: string[];
}
export type ResearchContext = NewsResearchContext | LibraryResearchContext;

export function libraryResearchContext(activity: { id: string; academic_year?: number | null; keywords?: readonly string[] | null }): LibraryResearchContext {
  return { kind: 'academy_library_context', activityId: activity.id, year: activity.academic_year ?? null, keywords: recordKeywords(activity.keywords) };
}
export const libraryContextLabel = (context: LibraryResearchContext) => keywordLine(context.keywords);
/** 질문 칸에 놓을 출발 문장 — 학생이 이어 적는다(빈 칸이면 설계지가 열리지 않는다). */
export function libraryResearchSeed(context: LibraryResearchContext) {
  return `책장에서 읽은 선배 기록의 키워드(${libraryContextLabel(context)})에서 출발해 탐구해 보고 싶어요. 궁금해진 점: `;
}
export function researchContextSource(context: ResearchContext): InquirySelectedSource {
  if (context.kind === 'academy_news_context') return newsContextSource(context);
  return { source_kind: 'manual', snapshot: { ...context, label: libraryContextLabel(context),
    note: '왕립 도서관 책장에서 본 우리 학교 선배들의 창의적 체험활동 기록의 키워드뿐입니다. 선배의 구체적인 주제는 알려 주지 않으며, 학생 본인이 한 경험도 아닙니다. 키워드를 탐구의 출발점으로만 쓰고 선배의 활동을 짐작해 되살리지 마세요.' } };
}
export const researchContextKey = (context: ResearchContext | null) => !context ? '' : context.kind === 'academy_news_context' ? `news:${context.newsId}` : `library:${context.activityId}`;
