export const NEWS_CATEGORIES = ['연구성과', '응용사례', '산업뉴스', '정책'] as const;
export type NewsCategory = typeof NEWS_CATEGORIES[number];

export interface ComicPanel {
  title: string;
  dialogue: string[];
}

export interface NewsArticle {
  id: number;
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  summary: string | null;
  category: NewsCategory;
  classroom_hook: string | null;
  why_it_matters: string | null;
  subjects: string[];
  /**
   * 수집 단계에서 기사 내용으로 뽑은 핵심어(DB CHECK 상한 8개, 수집기는 5개).
   * 교과(`subjects`)가 닫힌 8종의 분류 축이라면 이쪽은 기사마다 다른 열린 어휘다.
   * 소급 생성하지 않은 과거 행은 빈 배열이다.
   */
  keywords: string[];
  /**
   * 관심 분야 맞춤용 분야(닫힌 14종, 최대 3, 첫째 = 주된 분야 — utils/fields.ts).
   * null = 아직 분류 안 됨(엣지 함수 world-news-fields 가 매시 채운다). 화면은 articleFields() 로만 읽는다.
   */
  fields: string[] | null;
  difficulty: string | null;
  /** 수집 단계에서 기사 내용으로 만든 학생용 탐구 질문. 소급 생성하지 않은 과거 행은 빈 배열이다. */
  inquiry_questions: string[];
  /** world-today-comics 버킷 내 경로. null 이면 만화 없음. */
  comic_path: string | null;
  /** 4컷 대사 텍스트 대체본. 이미지가 안 뜰 때 기사를 읽을 유일한 수단이다. */
  comic_panels: ComicPanel[];
  collected_at: string | null;
}

export interface InquiryDraft {
  question: string;
  prediction: string;
  plan: string;
  reflection: string;
}

export interface NewsInquiry extends InquiryDraft {
  user_id: string;
  news_id: number;
  created_at: string;
  updated_at: string;
}

export interface NewsFilters {
  page: number;
  search: string;
  category: string;
  subject: string;
  /** 관심 분야(utils/fields.ts 의 WORLD_FIELDS) — 빈 문자열이면 거르지 않는다. */
  field: string;
  notebook: boolean;
}

/** 요즘 세상 관심 분야 — 본인만 읽고 쓴다(RLS). notify = 관심 분야 새 소식 알림(하루 1건). */
export interface WorldInterests {
  user_id: string;
  fields: string[];
  notify: boolean;
  created_at: string;
  updated_at: string;
}

// 생성된 공용 클라이언트는 유지하고, 실제 DB와 대조한 추가 스키마만 타입을 보강한다.
export type WorldDatabase = {
  public: {
    Tables: {
      ai_news: {
        Row: NewsArticle & { keep: boolean };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      world_news_inquiries: {
        Row: NewsInquiry;
        Insert: InquiryDraft & { user_id: string; news_id: number };
        Update: Partial<InquiryDraft>;
        Relationships: [{ foreignKeyName: 'world_news_inquiries_news_id_fkey'; columns: ['news_id']; isOneToOne: false; referencedRelation: 'ai_news'; referencedColumns: ['id'] }];
      };
      world_news_interests: {
        Row: WorldInterests;
        Insert: { user_id: string; fields: string[]; notify: boolean };
        Update: { fields?: string[]; notify?: boolean };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      world_news_interest_suggestions: { Args: Record<string, never>; Returns: { departments: string[]; interests: string[] } };
    };
  };
};
