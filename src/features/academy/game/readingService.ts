import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { BookRecommendation, ReadingCard, ReadingCardDraft } from './readingModel';

/** 제6장 책갈피 — `academy_chapters.chapter = 'library_reading'`. */
export interface ReadingChapterRecord { step: number; revision: number; reading_field: string | null; reading_book_id: string | null; reading_book_title: string | null; reading_card_id: string | null; started_at: string; completed_at: string | null }
export type ReadingChapterAction = 'start' | 'next' | 'field' | 'card';
const db = supabase as unknown as SupabaseClient;

export async function fetchBookRecommendations(): Promise<BookRecommendation[]> {
  const { data, error } = await db.from('academy_book_recommendations').select('id,shelf,field,department,title,author,note,source,sort').order('sort');
  if (error) throw Error('추천 서가를 불러오지 못했어요. 다시 펼쳐 주세요.');
  return (data ?? []) as BookRecommendation[];
}
export async function writeReadingChapter(action: ReadingChapterAction, revision: number, payload: { book_id?: string; card_id?: string } = {}): Promise<ReadingChapterRecord> {
  const { data, error } = await db.rpc('academy_reading_chapter_write', { p_action: action, p_revision: revision, p_payload: payload });
  if (error) throw Error(error.message || '도서관 이야기의 책갈피를 보관하지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function saveReadingCard(draft: ReadingCardDraft, id?: string | null): Promise<ReadingCard> {
  const { data, error } = await db.rpc('academy_reading_card_write', { p_action: 'save', p_id: id ?? null, p_payload: { ...draft, book_id: draft.book_id ?? null } });
  if (error) throw Error(error.message || '설명 카드를 저장하지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function deleteReadingCard(id: string): Promise<void> {
  const { error } = await db.rpc('academy_reading_card_write', { p_action: 'delete', p_id: id, p_payload: {} });
  if (error) throw Error(error.message || '설명 카드를 지우지 못했어요.');
}
