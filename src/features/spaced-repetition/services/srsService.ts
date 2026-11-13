/**
 * SRS Service Layer
 * All Supabase CRUD operations for the Spaced Repetition System.
 */

import { supabase } from '@/integrations/supabase/client';
import { calculateSM2 } from '../utils/sm2Algorithm';
import type {
  SrsSubject,
  SrsCard,
  SrsReviewSession,
  SrsCardReview,
  SrsUserStats,
  SrsDailyActivity,
  CreateSubjectParams,
  UpdateSubjectParams,
  CreateCardParams,
  UpdateCardParams,
  RecordReviewParams,
  SubjectWithStats,
  ConceptBreakdown,
} from '../types/srs.types';

// =============================================
// Subjects
// =============================================

export async function fetchSubjects(userId: string): Promise<SrsSubject[]> {
  const { data, error } = await supabase
    .from('srs_subjects')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as unknown as SrsSubject[]) || [];
}

export async function fetchSubjectsWithStats(userId: string): Promise<SubjectWithStats[]> {
  const subjects = await fetchSubjects(userId);

  const result: SubjectWithStats[] = [];
  for (const subject of subjects) {
    const { data: cards } = await supabase
      .from('srs_cards')
      .select('id, status, interval_days, ease_factor, next_review_at')
      .eq('subject_id', subject.id)
      .neq('status', 'suspended');

    const allCards = (cards || []) as unknown as SrsCard[];
    const now = new Date();
    const dueCards = allCards.filter((c) => {
      if (c.status === 'new') return true;
      if (!c.next_review_at) return true;
      return new Date(c.next_review_at) <= now;
    }).length;
    const masteredCards = allCards.filter((c) => c.interval_days >= 21).length;

    // Get average retention from recent reviews
    const { data: reviews } = await supabase
      .from('srs_card_reviews')
      .select('quality')
      .eq('user_id', userId)
      .in('card_id', allCards.map((c) => c.id))
      .order('reviewed_at', { ascending: false })
      .limit(50);

    const recentReviews = (reviews || []) as unknown as SrsCardReview[];
    const avgRetention = recentReviews.length > 0
      ? Math.round((recentReviews.filter((r) => r.quality >= 3).length / recentReviews.length) * 100)
      : null;

    result.push({
      ...subject,
      total_cards: allCards.length,
      due_cards: dueCards,
      mastered_cards: masteredCards,
      avg_retention: avgRetention,
    });
  }

  return result;
}

export async function createSubject(
  userId: string,
  params: CreateSubjectParams
): Promise<SrsSubject> {
  const { data, error } = await supabase
    .from('srs_subjects')
    .insert({
      user_id: userId,
      name: params.name,
      topic: params.topic || null,
      review_interval_days: params.review_interval_days ?? 4,
      status: params.status ?? 'active',
      color: params.color || null,
    } as Record<string, unknown>)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SrsSubject;
}

export async function updateSubject(params: UpdateSubjectParams): Promise<SrsSubject> {
  const updateData: Record<string, unknown> = {};
  if (params.name !== undefined) updateData.name = params.name;
  if (params.topic !== undefined) updateData.topic = params.topic;
  if (params.review_interval_days !== undefined) updateData.review_interval_days = params.review_interval_days;
  if (params.status !== undefined) updateData.status = params.status;
  if (params.color !== undefined) updateData.color = params.color;

  const { data, error } = await supabase
    .from('srs_subjects')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SrsSubject;
}

export async function deleteSubject(subjectId: string): Promise<void> {
  const { error } = await supabase
    .from('srs_subjects')
    .delete()
    .eq('id', subjectId);

  if (error) throw error;
}

// =============================================
// Cards
// =============================================

export async function fetchCards(subjectId: string): Promise<SrsCard[]> {
  const { data, error } = await supabase
    .from('srs_cards')
    .select('*')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as unknown as SrsCard[]) || [];
}

export async function fetchDueCards(userId: string, subjectId?: string): Promise<SrsCard[]> {
  let query = supabase
    .from('srs_cards')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'suspended');

  if (subjectId) {
    query = query.eq('subject_id', subjectId);
  }

  // Cards that are new or due for review
  query = query.or(`status.eq.new,next_review_at.is.null,next_review_at.lte.${new Date().toISOString()}`);

  const { data, error } = await query.order('next_review_at', { ascending: true, nullsFirst: true });

  if (error) throw error;
  return (data as unknown as SrsCard[]) || [];
}

export async function createCard(
  userId: string,
  params: CreateCardParams
): Promise<SrsCard> {
  const { data, error } = await supabase
    .from('srs_cards')
    .insert({
      user_id: userId,
      subject_id: params.subject_id,
      front: params.front,
      back: params.back,
      concept: params.concept || null,
      source: params.source ?? 'manual',
    } as Record<string, unknown>)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SrsCard;
}

export async function bulkCreateCards(
  userId: string,
  cards: CreateCardParams[]
): Promise<SrsCard[]> {
  const insertData = cards.map((c) => ({
    user_id: userId,
    subject_id: c.subject_id,
    front: c.front,
    back: c.back,
    concept: c.concept || null,
    source: c.source ?? 'manual',
  }));

  const { data, error } = await supabase
    .from('srs_cards')
    .insert(insertData as Record<string, unknown>[])
    .select();

  if (error) throw error;
  return (data as unknown as SrsCard[]) || [];
}

export async function updateCard(params: UpdateCardParams): Promise<SrsCard> {
  const updateData: Record<string, unknown> = {};
  if (params.front !== undefined) updateData.front = params.front;
  if (params.back !== undefined) updateData.back = params.back;
  if (params.concept !== undefined) updateData.concept = params.concept;
  if (params.status !== undefined) updateData.status = params.status;

  const { data, error } = await supabase
    .from('srs_cards')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SrsCard;
}

export async function deleteCard(cardId: string): Promise<void> {
  const { error } = await supabase
    .from('srs_cards')
    .delete()
    .eq('id', cardId);

  if (error) throw error;
}

// =============================================
// Study Sessions
// =============================================

export async function startSession(userId: string): Promise<SrsReviewSession> {
  const { data, error } = await supabase
    .from('srs_review_sessions')
    .insert({
      user_id: userId,
      started_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SrsReviewSession;
}

export async function endSession(
  sessionId: string,
  stats: {
    cards_reviewed: number;
    cards_correct: number;
    retention_gain?: number;
    avg_recall_time_ms?: number;
    meta?: Record<string, unknown>;
  }
): Promise<SrsReviewSession> {
  const { data, error } = await supabase
    .from('srs_review_sessions')
    .update({
      ended_at: new Date().toISOString(),
      cards_reviewed: stats.cards_reviewed,
      cards_correct: stats.cards_correct,
      retention_gain: stats.retention_gain ?? null,
      avg_recall_time_ms: stats.avg_recall_time_ms ?? null,
      meta: stats.meta ?? null,
    } as Record<string, unknown>)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SrsReviewSession;
}

// =============================================
// Card Reviews (with SM-2 update)
// =============================================

export async function recordCardReview(
  userId: string,
  params: RecordReviewParams
): Promise<SrsCardReview> {
  // 1. Fetch current card state
  const { data: card, error: cardError } = await supabase
    .from('srs_cards')
    .select('ease_factor, interval_days, repetitions')
    .eq('id', params.card_id)
    .single();

  if (cardError) throw cardError;
  const currentCard = card as unknown as Pick<SrsCard, 'ease_factor' | 'interval_days' | 'repetitions'>;

  // 2. Calculate new SM-2 values
  const sm2Result = calculateSM2({
    quality: params.quality,
    repetitions: currentCard.repetitions,
    interval: currentCard.interval_days,
    easeFactor: currentCard.ease_factor,
  });

  // 3. Record the review
  const { data: review, error: reviewError } = await supabase
    .from('srs_card_reviews')
    .insert({
      session_id: params.session_id,
      card_id: params.card_id,
      user_id: userId,
      quality: params.quality,
      recall_time_ms: params.recall_time_ms ?? null,
      ease_before: currentCard.ease_factor,
      ease_after: sm2Result.easeFactor,
      interval_before: currentCard.interval_days,
      interval_after: sm2Result.interval,
    } as Record<string, unknown>)
    .select()
    .single();

  if (reviewError) throw reviewError;

  // 4. Update card with new SM-2 values
  const newStatus = sm2Result.interval === 0 ? 'learning' : 'review';
  const { error: updateError } = await supabase
    .from('srs_cards')
    .update({
      ease_factor: sm2Result.easeFactor,
      interval_days: sm2Result.interval,
      repetitions: sm2Result.repetitions,
      next_review_at: sm2Result.nextReviewAt.toISOString(),
      status: newStatus,
    } as Record<string, unknown>)
    .eq('id', params.card_id);

  if (updateError) throw updateError;

  return review as unknown as SrsCardReview;
}

// =============================================
// Statistics
// =============================================

export async function fetchUserStats(userId: string): Promise<SrsUserStats | null> {
  const { data, error } = await supabase
    .from('srs_user_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as SrsUserStats | null;
}

export async function fetchDailyActivity(
  userId: string,
  year: number
): Promise<SrsDailyActivity[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data, error } = await supabase
    .from('srs_daily_activity')
    .select('*')
    .eq('user_id', userId)
    .gte('activity_date', startDate)
    .lte('activity_date', endDate)
    .order('activity_date', { ascending: true });

  if (error) throw error;
  return (data as unknown as SrsDailyActivity[]) || [];
}

export async function updateDailyGoal(userId: string, goal: number): Promise<void> {
  const { error } = await supabase
    .from('srs_user_stats')
    .upsert({
      user_id: userId,
      daily_goal: goal,
    } as Record<string, unknown>, { onConflict: 'user_id' });

  if (error) throw error;
}

// =============================================
// Review Log (Recent Activity)
// =============================================

export interface ReviewLogEntry {
  id: string;
  card_front: string;
  card_concept: string | null;
  subject_name: string;
  quality: number;
  recall_time_ms: number | null;
  reviewed_at: string;
}

export async function fetchRecentReviews(
  userId: string,
  limit: number = 20
): Promise<ReviewLogEntry[]> {
  const { data, error } = await supabase
    .from('srs_card_reviews')
    .select('id, quality, recall_time_ms, reviewed_at, card_id')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const typedData = data as unknown as Array<{
    id: string; quality: number; recall_time_ms: number | null;
    reviewed_at: string; card_id: string;
  }>;

  // Fetch card + subject info for each review
  const cardIds = [...new Set(typedData.map((r) => r.card_id))];
  const { data: cards } = await supabase
    .from('srs_cards')
    .select('id, front, concept, subject_id')
    .in('id', cardIds);

  const typedCards = (cards || []) as unknown as Array<{
    id: string; front: string; concept: string | null; subject_id: string;
  }>;
  const cardMap = new Map(typedCards.map((c) => [c.id, c]));

  const subjectIds = [...new Set(typedCards.map((c) => c.subject_id))];
  const { data: subjects } = await supabase
    .from('srs_subjects')
    .select('id, name')
    .in('id', subjectIds);

  const typedSubjects = (subjects || []) as unknown as Array<{ id: string; name: string }>;
  const subjectMap = new Map(typedSubjects.map((s) => [s.id, s.name]));

  return typedData.map((review) => {
    const card = cardMap.get(review.card_id);
    return {
      id: review.id,
      card_front: card?.front ?? '(삭제된 카드)',
      card_concept: card?.concept ?? null,
      subject_name: card ? (subjectMap.get(card.subject_id) ?? '') : '',
      quality: review.quality,
      recall_time_ms: review.recall_time_ms,
      reviewed_at: review.reviewed_at,
    };
  });
}

// =============================================
// Subject Detail Analytics
// =============================================

export async function fetchConceptBreakdown(
  subjectId: string,
  userId: string
): Promise<ConceptBreakdown[]> {
  // Fetch all cards for this subject grouped by concept
  const { data: cards, error } = await supabase
    .from('srs_cards')
    .select('id, concept, ease_factor, interval_days, next_review_at, status')
    .eq('subject_id', subjectId)
    .neq('status', 'suspended')
    .order('concept', { ascending: true });

  if (error) throw error;
  if (!cards || cards.length === 0) return [];

  const typedCards = cards as unknown as SrsCard[];

  // Group by concept
  const conceptMap = new Map<string, SrsCard[]>();
  for (const card of typedCards) {
    const key = card.concept || '기타';
    const group = conceptMap.get(key) || [];
    group.push(card);
    conceptMap.set(key, group);
  }

  const result: ConceptBreakdown[] = [];
  for (const [concept, conceptCards] of conceptMap) {
    // Fetch recent reviews for retention history
    const cardIds = conceptCards.map((c) => c.id);
    const { data: reviews } = await supabase
      .from('srs_card_reviews')
      .select('quality, reviewed_at')
      .eq('user_id', userId)
      .in('card_id', cardIds)
      .order('reviewed_at', { ascending: false })
      .limit(20);

    const typedReviews = (reviews || []) as unknown as SrsCardReview[];
    const avgRecall = typedReviews.length > 0
      ? Math.round((typedReviews.filter((r) => r.quality >= 3).length / typedReviews.length) * 100)
      : 0;

    // Build retention history (last 5 sessions, each averaged)
    const retentionHistory: number[] = [];
    const chunkSize = Math.max(1, Math.floor(typedReviews.length / 5));
    for (let i = 0; i < Math.min(5, typedReviews.length); i++) {
      const chunk = typedReviews.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length > 0) {
        retentionHistory.push(
          Math.round((chunk.filter((r) => r.quality >= 3).length / chunk.length) * 100)
        );
      }
    }

    // Earliest due date
    const dueDates = conceptCards
      .map((c) => c.next_review_at)
      .filter(Boolean)
      .sort();

    result.push({
      concept,
      card_count: conceptCards.length,
      avg_recall: avgRecall,
      retention_history: retentionHistory.reverse(),
      next_due: dueDates[0] || null,
    });
  }

  return result;
}
