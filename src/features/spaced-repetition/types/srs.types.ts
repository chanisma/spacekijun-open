// =============================================
// Spaced Repetition System - Type Definitions
// =============================================

// --- Enums & Literals ---

export type StudyQuality = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy

export type CardStatus = 'new' | 'learning' | 'review' | 'suspended';

export type SubjectStatus = 'drafting' | 'active' | 'archived';

export type CardSource = 'manual' | 'ai_generated' | 'imported';

export type SrsView = 'dashboard' | 'study' | 'subject' | 'review' | 'stats';

// --- Quality Label Mapping ---

export const QUALITY_LABELS: Record<StudyQuality, { label: string; labelKo: string; color: string }> = {
  1: { label: 'AGAIN', labelKo: '다시', color: '#ff6b35' },   // SRS accent orange
  2: { label: 'HARD', labelKo: '어려움', color: '#6b7d5e' },  // SRS sage dark
  3: { label: 'GOOD', labelKo: '좋음', color: '#6b9b8a' },    // SRS teal
  4: { label: 'EASY', labelKo: '쉬움', color: '#1a1a1a' },    // SRS black
};

// --- Database Row Types ---

export interface SrsSubject {
  id: string;
  user_id: string;
  name: string;
  topic: string | null;
  review_interval_days: number;
  status: SubjectStatus;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrsCard {
  id: string;
  subject_id: string;
  user_id: string;
  front: string;
  back: string;
  concept: string | null;
  source: CardSource;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string | null;
  status: CardStatus;
  created_at: string;
  updated_at: string;
}

export interface SrsReviewSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  cards_reviewed: number;
  cards_correct: number;
  retention_gain: number | null;
  avg_recall_time_ms: number | null;
  meta: Record<string, unknown> | null;
}

export interface SrsCardReview {
  id: string;
  session_id: string;
  card_id: string;
  user_id: string;
  quality: StudyQuality;
  recall_time_ms: number | null;
  ease_before: number;
  ease_after: number;
  interval_before: number;
  interval_after: number;
  reviewed_at: string;
}

export interface SrsUserStats {
  id: string;
  user_id: string;
  current_streak: number;
  best_streak: number;
  last_active_at: string | null;
  total_reviews: number;
  total_time_seconds: number;
  retention_rate: number | null;
  level: number;
  daily_goal: number;
  created_at: string;
  updated_at: string;
}

export interface SrsDailyActivity {
  id: string;
  user_id: string;
  activity_date: string;
  cards_reviewed: number;
  time_seconds: number;
  retention_rate: number | null;
}

// --- Input/Mutation Types ---

export interface CreateSubjectParams {
  name: string;
  topic?: string;
  review_interval_days?: number;
  status?: SubjectStatus;
  color?: string;
}

export interface UpdateSubjectParams {
  id: string;
  name?: string;
  topic?: string;
  review_interval_days?: number;
  status?: SubjectStatus;
  color?: string;
}

export interface CreateCardParams {
  subject_id: string;
  front: string;
  back: string;
  concept?: string;
  source?: CardSource;
}

export interface UpdateCardParams {
  id: string;
  front?: string;
  back?: string;
  concept?: string;
  status?: CardStatus;
}

export interface RecordReviewParams {
  session_id: string;
  card_id: string;
  quality: StudyQuality;
  recall_time_ms?: number;
}

// --- SM-2 Algorithm Types ---

export interface SM2Input {
  quality: StudyQuality;
  repetitions: number;
  interval: number;
  easeFactor: number;
}

export interface SM2Result {
  interval: number;       // days (0 = review again this session)
  repetitions: number;
  easeFactor: number;
  nextReviewAt: Date;
}

// --- Computed/View Types ---

export interface SubjectWithStats extends SrsSubject {
  total_cards: number;
  due_cards: number;
  mastered_cards: number;
  avg_retention: number | null;
}

export interface ConceptBreakdown {
  concept: string;
  card_count: number;
  avg_recall: number;
  retention_history: number[];   // last N recall rates for sparkline
  next_due: string | null;       // earliest due date in this concept
}

export interface SessionSummary {
  session: SrsReviewSession;
  accuracy_by_subject: Array<{
    subject_name: string;
    accuracy: number;
  }>;
  next_session_at: Date | null;
}

// --- Study Session State ---

export interface StudySessionState {
  sessionId: string | null;
  cards: SrsCard[];
  currentIndex: number;
  isFlipped: boolean;
  startedAt: Date | null;
  cardStartedAt: Date | null;
  results: Array<{
    card_id: string;
    quality: StudyQuality;
    recall_time_ms: number;
  }>;
}

// --- Context Types ---

export interface SrsContextValue {
  // View navigation
  currentView: SrsView;
  setCurrentView: (view: SrsView) => void;

  // Subject selection
  selectedSubjectId: string | null;
  setSelectedSubjectId: (id: string | null) => void;

  // Study session
  studySession: StudySessionState | null;
  startStudySession: (subjectId?: string) => void;
  endStudySession: () => void;
}
