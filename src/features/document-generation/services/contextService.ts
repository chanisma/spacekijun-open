// 문서 생성 "맥락 정보" 라이브러리 데이터 계층 (2026-09-02)
//
// 맥락 = AI 초안 작성에 넘길 배경 설명을 재사용 가능한 항목으로 모아 둔 것.
//
// **소유·공개 규칙(사용자 결정, 서버가 정본)**
//   ① 소유자만 수정·삭제 ② 읽기는 기본 공개(교직원) ③ `hidden`만 비공개
//   ④ **스펙에 연결된 맥락은 숨길 수 없다** — DB 트리거가 양방향으로 막는다.
//
// 새 테이블은 `types.ts`에 없어 `as never` 캐스팅을 쓴다(저장소 관례 —
// `schoolExamService`·`supervisionService`와 동일).
import { supabase } from '@/integrations/supabase/client';

export interface DocGenContext {
  id: string;
  user_id: string;
  title: string;
  body: string;
  /** 숨김 = 나만 보기. 스펙에 연결돼 있으면 켤 수 없다(서버 트리거) */
  hidden: boolean;
  /**
   * 분류(선택) — 자유 텍스트다. enum·별도 표가 아닌 이유는 사용자가 그때그때 만드는
   * 라벨이라 새 분류에 마이그레이션이 필요하면 안 되기 때문(예: `성취기준`).
   * 오타로 분류가 갈리는 것은 UI가 기존 값을 제안해 막는다.
   */
  category: string | null;
  created_at: string;
  updated_at: string;
}

/** 본문 상한 — DB CHECK와 같은 값. 넘으면 저장이 거부되므로 폼이 먼저 막는다 */
export const CONTEXT_BODY_MAX = 20000;
export const CONTEXT_TITLE_MAX = 120;
export const CONTEXT_CATEGORY_MAX = 40;

const contextTable = () => supabase.from('docgen_context' as never);
const linkTable = () => supabase.from('docgen_context_spec_link' as never);

/**
 * 트리거가 던지는 불변식 위반을 사람이 읽을 문구로.
 *
 * 트리거 메시지를 그대로 노출해도 한국어라 읽히지만, 그 외 DB 오류(제약·권한)는
 * 원문이 영어라 사용자에게 의미가 없다. 아는 것만 번역하고 나머지는 원문을 남긴다.
 */
function contextError(message: string, fallback: string): Error {
  if (message.includes('숨긴 맥락') || message.includes('연결되어 있어')) return new Error(message);
  if (message.includes('docgen_context_body_len')) return new Error(`내용이 너무 깁니다(최대 ${CONTEXT_BODY_MAX.toLocaleString()}자).`);
  if (message.includes('docgen_context_title_len')) return new Error(`제목은 1~${CONTEXT_TITLE_MAX}자여야 합니다.`);
  if (message.includes('docgen_context_category_len')) return new Error(`분류는 1~${CONTEXT_CATEGORY_MAX}자여야 합니다.`);
  return new Error(`${fallback}: ${message}`);
}

/**
 * 읽을 수 있는 맥락 전부 — 내 것(숨김 포함) + 남의 공개분. RLS가 범위를 정한다.
 * 정렬은 최근 수정순(라이브러리는 최근에 손댄 것을 다시 쓰는 경우가 많다).
 */
export async function listDocGenContexts(): Promise<DocGenContext[]> {
  const { data, error } = await contextTable()
    .select('id, user_id, title, body, category, hidden, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw contextError(error.message, '맥락 목록 조회 실패');
  return (data ?? []) as unknown as DocGenContext[];
}

export async function createDocGenContext(input: {
  title: string; body: string; hidden?: boolean; category?: string | null;
}): Promise<DocGenContext> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');
  const { data, error } = await contextTable()
    .insert({
      user_id: userId,
      title: input.title.trim(),
      body: input.body,
      hidden: input.hidden ?? false,
      // 빈 문자열이 아니라 null로 저장한다 — ''와 null이 섞이면 "분류 없음" 필터가 갈린다
      category: input.category?.trim() || null,
    } as never)
    .select('id, user_id, title, body, category, hidden, created_at, updated_at')
    .single();
  if (error) throw contextError(error.message, '맥락 저장 실패');
  return data as unknown as DocGenContext;
}

/**
 * 수정 — RLS가 소유자만 허용한다. **차단은 오류가 아니라 0행**이므로 반환 행으로
 * 실제 반영을 확인한다(이 저장소의 공통 함정 — CLAUDE.md 참조).
 */
export async function updateDocGenContext(
  id: string, patch: Partial<Pick<DocGenContext, 'title' | 'body' | 'hidden' | 'category'>>,
): Promise<DocGenContext> {
  const { data, error } = await contextTable()
    .update({
      ...(patch.title != null ? { title: patch.title.trim() } : {}),
      ...(patch.body != null ? { body: patch.body } : {}),
      ...(patch.hidden != null ? { hidden: patch.hidden } : {}),
      ...(patch.category !== undefined ? { category: patch.category?.trim() || null } : {}),
    } as never)
    .eq('id' as never, id as never)
    .select('id, user_id, title, body, category, hidden, created_at, updated_at')
    .maybeSingle();
  if (error) throw contextError(error.message, '맥락 수정 실패');
  if (!data) throw new Error('내가 만든 맥락만 수정할 수 있습니다.');
  return data as unknown as DocGenContext;
}

export async function deleteDocGenContext(id: string): Promise<void> {
  const { data, error } = await contextTable()
    .delete()
    .eq('id' as never, id as never)
    .select('id');
  if (error) throw contextError(error.message, '맥락 삭제 실패');
  if (!data?.length) throw new Error('내가 만든 맥락만 삭제할 수 있습니다.');
}

/** 어떤 양식(스펙)에 연결된 맥락 id들 */
export async function listSpecContextIds(templateId: string): Promise<string[]> {
  const { data, error } = await linkTable()
    .select('context_id')
    .eq('template_id' as never, templateId as never);
  if (error) throw contextError(error.message, '양식 연결 맥락 조회 실패');
  return ((data ?? []) as unknown as { context_id: string }[]).map((r) => r.context_id);
}

/**
 * 양식에 맥락 연결. **내 맥락을 내가 고칠 수 있는 양식에만** 붙일 수 있다(RLS).
 * 숨긴 맥락은 트리거가 거부한다 — 연결이 곧 "영구 공개"를 뜻하기 때문이다.
 */
export async function linkContextToSpec(contextId: string, templateId: string): Promise<void> {
  const { error } = await linkTable().insert({
    context_id: contextId, template_id: templateId,
  } as never);
  // 같은 쌍을 다시 붙이는 것은 사용자 입장에서 오류가 아니다(이미 연결됨)
  if (error && !error.message.includes('duplicate key')) {
    throw contextError(error.message, '양식 연결 실패');
  }
}

export async function unlinkContextFromSpec(contextId: string, templateId: string): Promise<void> {
  const { error } = await linkTable()
    .delete()
    .eq('context_id' as never, contextId as never)
    .eq('template_id' as never, templateId as never);
  if (error) throw contextError(error.message, '양식 연결 해제 실패');
}

/**
 * 선택된 맥락들을 프롬프트에 실을 한 덩어리로 합친다.
 *
 * **제목을 함께 넣는다** — 여러 맥락이 이어지면 어디서 어디까지가 한 묶음인지 모델이
 * 알아야 한다. 제목 없이 본문만 이으면 서로 다른 배경 설명이 한 문단처럼 읽힌다.
 *
 * 상한(`limit`)은 계획 프롬프트의 다른 블록(knowledge 20000자)과 같은 자릿수로 둔다.
 * 넘치면 **뒤를 자르되 어디서 잘렸는지 남긴다** — 조용히 사라지면 왜 반영이 안 됐는지
 * 알 수 없다.
 */
export function composeContextText(
  contexts: { title: string; body: string }[], limit = 20000,
): string {
  // **본문 기준으로 거른다.** 합성한 블록(`## 제목\n본문`)을 검사하면 본문이 비어도
  // 제목 때문에 항상 참이라, 내용 없는 맥락이 **제목만** 프롬프트에 실린다(회귀로 잡음).
  const blocks = contexts
    .filter((c) => c.body.trim())
    .map((c) => `## ${c.title.trim()}\n${c.body.trim()}`);
  if (!blocks.length) return '';
  const joined = blocks.join('\n\n');
  if (joined.length <= limit) return joined;
  return `${joined.slice(0, limit)}\n\n(이하 ${joined.length - limit}자는 길이 제한으로 제외됨)`;
}
