// 학교 맥락 목록(school_context) 데이터 계층 (2026-11-06)
//
// 맥락 라이브러리(docgen_context)가 «내 문서에 붙일 배경 글»이라면, 학교 맥락은 «학교 지식이 어디에 어떤 구조로 있나»의 목록이다.
//   · source — 다른 곳에 있는 자료의 위치(정기시험 계획·성취기준·업무분장·업무 지식 …). 관리자가 등록·고친다.
//   · note   — 목록에 없던 학교 지식을 여기에 적은 것. 교직원 누구나 쓰고, 쓴 사람·관리자가 고치고 보관한다.
// 개별 자료를 보여 주는 곳이 아니다 — 자료는 locations 가 가리키는 자리에서 읽는다. 에이전트는 MCP list_contexts·get_context 로 같은 것을 본다.
// 권한·개인정보 꼴 거절은 서버가 정본(RLS + 트리거 — 20261106120000_mcp_school_context.sql).
import { supabase } from '@/integrations/supabase/client';

export const SCHOOL_CONTEXT_AREAS = ['학교·학사', '교육과정', '평가', '업무', '조직', '학생', '시설·자원', '규정·지침', '기타'] as const;
export type SchoolContextArea = (typeof SCHOOL_CONTEXT_AREAS)[number];

export const LOCATION_TYPE_LABEL: Record<string, string> = {
  dataset: '데이터(read_data)', mcp_tool: '에이전트 도구', table: 'DB 표', web: '웹 화면', docgen_context: '맥락 라이브러리',
  document_folder: '서류함', work_knowledge: '업무 지식', neis: '나이스', file: '파일', person: '사람', external: '외부',
};

export interface SchoolContextLocation { type: string; ref?: string; how?: string }
export interface SchoolContext {
  id: string;
  key: string;
  title: string;
  area: SchoolContextArea;
  kind: 'source' | 'note';
  summary: string;
  structure: { name: string; description?: string }[];
  contents: string | null;
  locations: SchoolContextLocation[];
  maintenance: string | null;
  body: string | null;
  tags: string[];
  sensitivity: 'none' | 'staff' | 'student';
  status: 'active' | 'archived';
  archived_reason: string | null;
  created_by: string | null;
  updated_at: string;
}

export const SCHOOL_CONTEXT_SUMMARY_MAX = 600;
export const SCHOOL_CONTEXT_BODY_MAX = 8000;

const table = () => supabase.from('school_context' as never);

/** 트리거·RLS 오류를 사람이 읽을 문구로 — 서버 문구가 이미 한국어라 그대로 쓰고, RLS 0행만 바꾼다 */
function friendly(error: { message?: string } | null): Error {
  const msg = error?.message ?? '처리하지 못했습니다.';
  if (/row-level security/i.test(msg)) return new Error('고칠 수 있는 것은 내가 쓴 맥락뿐입니다(자료 위치는 관리자).');
  return new Error(msg);
}

export async function listSchoolContexts(includeArchived: boolean): Promise<SchoolContext[]> {
  let q = table().select('*').order('area').order('kind', { ascending: false }).order('title');
  if (!includeArchived) q = q.eq('status' as never, 'active' as never);
  const { data, error } = await q;
  if (error) throw friendly(error);
  return (data ?? []) as unknown as SchoolContext[];
}

/** 지금 규모(건수·학기·마지막 갱신) — 보는 사람 권한대로 센다. 셀 자료가 없으면 null */
export async function schoolContextLive(key: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc('school_context_live' as never, { p_key: key } as never);
  if (error) throw friendly(error);
  return (data ?? null) as Record<string, unknown> | null;
}

export interface SchoolNoteInput {
  title: string;
  area: SchoolContextArea;
  summary: string;
  body: string;
  contents?: string | null;
  tags?: string[];
}

/** 새 맥락(note) — key 는 서버 규칙(영문 소문자 시작 2~60자)에 맞춰 만든다 */
export async function createSchoolNote(input: SchoolNoteInput): Promise<void> {
  const key = `note_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await table().insert({
    key, kind: 'note', title: input.title.trim(), area: input.area, summary: input.summary.trim(), body: input.body.trim(),
    contents: input.contents?.trim() || null, tags: input.tags ?? [],
  } as never);
  if (error) throw friendly(error);
}

export async function updateSchoolNote(id: string, input: SchoolNoteInput): Promise<void> {
  const { error, count } = await table().update({
    title: input.title.trim(), area: input.area, summary: input.summary.trim(), body: input.body.trim(),
    contents: input.contents?.trim() || null, tags: input.tags ?? [],
  } as never, { count: 'exact' }).eq('id' as never, id as never);
  if (error) throw friendly(error);
  if (count === 0) throw new Error('고칠 수 있는 것은 내가 쓴 맥락뿐입니다.');
}

export async function archiveSchoolContext(id: string, reason: string): Promise<void> {
  const { error, count } = await table().update({ status: 'archived', archived_reason: reason.trim().slice(0, 500) } as never, { count: 'exact' })
    .eq('id' as never, id as never);
  if (error) throw friendly(error);
  if (count === 0) throw new Error('보관할 수 있는 것은 내가 쓴 맥락뿐입니다.');
}
