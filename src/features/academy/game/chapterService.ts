import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { SkyChapterRecord } from './skyService';
import type { ReadingChapterRecord } from './readingService';
import type { ReadingCard } from './readingModel';
export interface ChapterRecord { step: number; revision: number; has_stars: boolean | null; design_id: string | null; design_title: string | null; started_at: string; completed_at: string | null }
export interface LibraryChapterRecord { step: number; revision: number; activity_id: string | null; activity_title: string | null; question: string; curiosity_reason: string; started_at: string; completed_at: string | null }
export interface DormChapterRecord { step: number; revision: number; goal_id: string | null; goal_title: string | null; task_id: string | null; task_title: string | null; started_at: string; completed_at: string | null }
export interface PostChapterRecord { postlude_step?: number; postlude_completed_at?: string | null; step: number; revision: number; news_id: number | null; news_title: string | null; question: string; read_at: string | null; started_at: string; completed_at: string | null }
export interface ChapterState { reading?: ReadingChapterRecord | null; readingCards?: ReadingCard[]; skyEligibility?: { completed_plans: number; required_plans: number }; sky?: SkyChapterRecord | null; skyDormPracticed?: boolean; chapter: ChapterRecord | null; library?: LibraryChapterRecord | null; dorm?: DormChapterRecord | null; post?: PostChapterRecord | null; postLetter?: { id: number; title: string } | null; postNoteReady?: boolean; dormGoals?: { id: string; title: string }[]; dormPlans?: { id: string; title: string }[]; designs: { id: string; title: string }[] }
export type PostChapterAction = 'start' | 'next' | 'arrive' | 'read' | 'note';
export type DormChapterAction = 'start' | 'next' | 'arrive' | 'goal' | 'plan';
export type LibraryChapterAction = 'start' | 'next' | 'arrive' | 'read' | 'note';
export type ChapterAction = 'next' | 'arrive' | 'observe' | 'desk' | 'design';
const db = supabase as unknown as SupabaseClient;
export async function writePostChapter(action: PostChapterAction, revision: number, newsId?: number): Promise<PostChapterRecord> {
  const { data, error } = await db.rpc('academy_post_chapter_write', { p_action: action, p_revision: revision, p_news: newsId ?? null });
  if (error) throw Error(error.message || '우편국 이야기의 책갈피를 보관하지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function fetchChapter(studentCode: string | null): Promise<ChapterState> {
  const { data, error } = await db.rpc('academy_chapter_read', { p_student_code: studentCode });
  if (error) throw Error('챕터의 책갈피를 가져오지 못했어요. 다시 펼쳐 주세요.');
  return data;
}
export async function writeDormChapter(action: DormChapterAction, revision: number, recordId?: string): Promise<DormChapterRecord> {
  const { data, error } = await db.rpc('academy_dorm_chapter_write', { p_action: action, p_revision: revision, p_record: recordId ?? null });
  if (error) throw Error(error.message || ' 기숙사 이야기의 책갈피를 보관하지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function writeChapter(action: ChapterAction, revision: number, designId?: string, hasStars?: boolean): Promise<ChapterRecord> {
  const { data, error } = await db.rpc('academy_chapter_write', { p_action: action, p_revision: revision, p_design: designId?.replace(/^trial:/, '') ?? null, p_has_stars: hasStars ?? null });
  if (error) throw Error(error.message || '책갈피를 저장하지 못했어요. 다시 시도해 주세요.');
  return data;
}
export async function writeLibraryChapter(action: LibraryChapterAction, revision: number, input?: { activityId?: string; question?: string; reason?: string }): Promise<LibraryChapterRecord> {
  const { data, error } = await db.rpc('academy_library_chapter_write', { p_action: action, p_revision: revision, p_activity: input?.activityId ?? null, p_question: input?.question ?? null, p_reason: input?.reason ?? null });
  if (error) throw Error(error.message || '도서관 이야기의 책갈피를 보관하지 못했어요. 다시 시도해 주세요.');
  return data;
}

export async function writePostlude(step: number): Promise<PostChapterRecord> {
  const { data, error } = await db.rpc('academy_postlude_write', { p_step: step });
  if (error) throw Error(error.message);
  return data;
}
