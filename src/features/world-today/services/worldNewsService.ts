import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { InquiryDraft, NewsArticle, NewsFilters, WorldDatabase } from '../types';
import { FIELD_LIMITS } from '../utils/story';

const db = supabase as unknown as SupabaseClient<WorldDatabase>;
export const NEWS_PAGE_SIZE = 12;
// ⚠️ fields 는 마이그레이션 20261011130000 이 만든다 — 그보다 먼저 배포하면 목록 쿼리가 통째로 거부된다.
const NEWS_COLUMNS = 'id,title,url,source,published_at,summary,category,classroom_hook,why_it_matters,subjects,keywords,fields,difficulty,inquiry_questions,comic_path,comic_panels,collected_at' as const;
const escapedSearch = (value: string) => value.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');

/** Same ordering as the main feed; the home card needs only one small summary. */
export async function fetchLatestWorldNews(signal?: AbortSignal) {
  let query = db.from('ai_news')
    .select('id,title,source,published_at,category,classroom_hook,why_it_matters')
    .eq('keep', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).limit(1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchWorldNews(filters: NewsFilters, userId: string, signal?: AbortSignal) {
  const from = Math.max(0, filters.page) * NEWS_PAGE_SIZE;
  const search = escapedSearch(filters.search);
  if (filters.notebook) {
    let query = db.from('world_news_inquiries')
      .select(`news:ai_news!inner(${NEWS_COLUMNS})`, { count: 'exact' })
      .eq('user_id', userId).order('updated_at', { ascending: false }).order('news_id', { ascending: false });
    if (search) query = query.ilike('news.title', `%${search}%`);
    if (filters.category) query = query.eq('news.category', filters.category);
    if (filters.subject) query = query.contains('news.subjects', [filters.subject]);
    if (filters.field) query = query.contains('news.fields', [filters.field]);
    if (signal) query = query.abortSignal(signal);
    // news_id는 ai_news의 단일 행을 참조하는 FK다. 기능 한정 스키마의 임베드 결과를 명시한다.
    const { data, error, count } = await query.range(from, from + NEWS_PAGE_SIZE - 1).returns<{ news: NewsArticle }[]>();
    if (error) throw error;
    return { articles: (data ?? []).map(row => row.news), total: count ?? 0 };
  }
  let query = db.from('ai_news').select(NEWS_COLUMNS, { count: 'exact' }).eq('keep', true)
    .order('published_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false });
  if (search) query = query.ilike('title', `%${search}%`);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.subject) query = query.contains('subjects', [filters.subject]);
  if (filters.field) query = query.contains('fields', [filters.field]);
  if (signal) query = query.abortSignal(signal);
  const { data, error, count } = await query.range(from, from + NEWS_PAGE_SIZE - 1);
  if (error) throw error;
  return { articles: data ?? [], total: count ?? 0 };
}

/**
 * 관심 분야에 걸린 최신 소식. 「새 기사」가 요구라 정렬은 발행일 하나다(분야 일치 정도로 다시 섞지 않는다 —
 * 섞으면 오래된 기사가 위로 와 «맞춤 새 소식»이 아니게 된다). 왜 걸렸는지는 화면이 matchedFields() 로 말한다.
 */
export async function fetchWorldNewsForMe(fields: readonly string[], limit: number, signal?: AbortSignal) {
  if (fields.length === 0) return [];
  let query = db.from('ai_news').select(NEWS_COLUMNS).eq('keep', true)
    .overlaps('fields', [...fields])
    .order('published_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
    .limit(limit);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchMyInterests(userId: string) {
  const { data, error } = await db.from('world_news_interests').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveMyInterests(userId: string, fields: string[], notify: boolean) {
  const { data, error } = await db.from('world_news_interests')
    .upsert({ user_id: userId, fields, notify }, { onConflict: 'user_id' }).select('*').single();
  if (error) throw error;
  return data;
}

/** 처음 고를 때의 근거(희망 학과 · 지식그래프 관심 라벨) — 학생이 아니면 둘 다 빈 배열이다. */
export async function fetchInterestSuggestionSources() {
  const { data, error } = await db.rpc('world_news_interest_suggestions');
  if (error) throw error;
  const raw = (data ?? {}) as { departments?: unknown; interests?: unknown };
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
  return { departments: strings(raw.departments), interests: strings(raw.interests) };
}

export async function fetchWorldArticle(id: number, signal?: AbortSignal) {
  let query = db.from('ai_news').select(NEWS_COLUMNS).eq('id', id).eq('keep', true);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

// The reader traverses all visible news in publication order, including across feed pages.
export async function fetchWorldNewsNeighbors(news: NewsArticle, signal?: AbortSignal) {
  const timestamp = news.published_at ? new Date(news.published_at).toISOString() : null;
  const find = async (newer: boolean) => {
    const operator = newer ? 'gt' : 'lt';
    let query = db.from('ai_news').select('id').eq('keep', true);
    if (timestamp) {
      query = query.or(`published_at.${operator}.${timestamp},and(published_at.eq.${timestamp},id.${operator}.${news.id})${newer ? '' : ',published_at.is.null'}`);
    } else if (newer) {
      query = query.or(`published_at.not.is.null,and(published_at.is.null,id.gt.${news.id})`);
    } else {
      query = query.is('published_at', null).lt('id', news.id);
    }
    query = query.order('published_at', { ascending: newer, nullsFirst: newer })
      .order('id', { ascending: newer }).limit(1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    return data?.[0]?.id ?? null;
  };
  const [previous, next] = await Promise.all([find(true), find(false)]);
  return { previous, next };
}

export async function fetchNewsInquiry(userId: string, newsId: number) {
  const { data, error } = await db.from('world_news_inquiries').select('*').eq('user_id', userId).eq('news_id', newsId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveNewsInquiry(userId: string, newsId: number, draft: InquiryDraft) {
  for (const key of Object.keys(FIELD_LIMITS) as (keyof InquiryDraft)[]) {
    if (draft[key].length > FIELD_LIMITS[key]) throw new Error('입력 가능한 글자 수를 초과했습니다.');
  }
  const { data, error } = await db.from('world_news_inquiries')
    .upsert({ user_id: userId, news_id: newsId, ...draft }, { onConflict: 'user_id,news_id' }).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteNewsInquiry(userId: string, newsId: number) {
  const { error } = await db.from('world_news_inquiries').delete()
    .eq('user_id', userId).eq('news_id', newsId);
  if (error) throw error;
}
