/**
 * 스티커 메모 — 데스크(NEIS_helper `app/core/sticky.py`)와 같은 곳·같은 규칙.
 * 사람마다 `meta.kind = 'desk_sticky'` 인 개인 보드 하나(`collab_boards`)에 `collab_notes` 로 쌓는다.
 * 남에게 안 보이는 것은 DB 가 지킨다(마이그레이션 20261008130000_desk_sticky_notes.sql). 여기서는 본인 세션으로만.
 * ⚠️ 색·제목 규칙을 바꾸면 데스크(sticky.py `COLORS`·`_title`)도 같이 — 두 곳이 같은 메모를 고친다.
 */
import { supabase } from '@/integrations/supabase/client';

export const STICKY_KIND = 'desk_sticky';
export const STICKY_COLORS = ['#fff176', '#f48fb1', '#90caf9', '#a5d6a7', '#ce93d8', '#ffcc80', '#ffffff'] as const;
export const MEMO_LIMIT = 20000;
const FIELDS = 'id,title,content,color,updated_at,created_at';

export interface Memo {
  id: string;
  title: string;
  content: string;
  color: string;
  updated_at: string;
  created_at: string;
}

let cached: { resourceId: string; boardId: string } | null = null;

async function findBoard(resourceId: string): Promise<string | null> {
  const { data, error } = await supabase.from('collab_boards').select('id')
    .eq('created_by', resourceId).eq('meta->>kind', STICKY_KIND).limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

/** 내 메모 보드 id. 처음이면 만든다(다른 기기가 먼저 만들었으면 그것을 쓴다). */
export async function memoBoard(resourceId: string): Promise<string> {
  if (cached?.resourceId === resourceId) return cached.boardId;
  let boardId = await findBoard(resourceId);
  if (!boardId) {
    const { data, error } = await supabase.from('collab_boards').insert({
      title: '내 스티커 메모', description: '스페이스기전 데스크의 개인 메모입니다. 나만 볼 수 있습니다.',
      color: 'yellow', created_by: resourceId, visibility: 'private', meta: { kind: STICKY_KIND },
    } as never).select('id');
    if (error && error.code !== '23505') throw error;
    boardId = data?.[0]?.id ?? await findBoard(resourceId);
  }
  if (!boardId) throw new Error('개인 메모 보드를 준비하지 못했습니다.');
  cached = { resourceId, boardId };
  return boardId;
}

/** 첫 줄을 제목으로 — 서식 표시(`# 제목`, `- 목록`)는 떼어 낸다 (sticky.py `_title`) */
export function memoTitle(content: string): string {
  const first = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  return first.replace(/^(?:#{1,3}|[-*•])\s+/, '').trim().slice(0, 60) || '메모';
}

export async function listMemos(resourceId: string): Promise<Memo[]> {
  const boardId = await memoBoard(resourceId);
  const { data, error } = await supabase.from('collab_notes').select(FIELDS)
    .eq('board_id', boardId).eq('is_archived', false).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Memo[];
}

function checked(content: string, color: string) {
  if (content.length > MEMO_LIMIT) throw new Error(`메모는 ${MEMO_LIMIT.toLocaleString()}자까지 쓸 수 있습니다.`);
  if (!(STICKY_COLORS as readonly string[]).includes(color)) throw new Error('지원하지 않는 색입니다.');
}

export async function createMemo(resourceId: string, content: string, color: string = STICKY_COLORS[0]): Promise<Memo> {
  checked(content, color);
  const boardId = await memoBoard(resourceId);
  const { data, error } = await supabase.from('collab_notes').insert({
    content, color, title: memoTitle(content), board_id: boardId, author_id: resourceId, meta: { source: 'mobile' },
  } as never).select(FIELDS);
  if (error) throw error;
  return (data as Memo[])[0];
}

export async function updateMemo(resourceId: string, id: string, content: string, color: string): Promise<Memo> {
  checked(content, color);
  const boardId = await memoBoard(resourceId);
  // board_id 조건을 같이 건다 — 스티커 보드 밖의 협업노트는 여기서 고치지 않는다
  const { data, error } = await supabase.from('collab_notes')
    .update({ content, color, title: memoTitle(content), updated_at: new Date().toISOString() } as never)
    .eq('id', id).eq('board_id', boardId).select(FIELDS);
  if (error) throw error;
  if (!data?.length) throw new Error('메모가 삭제되었습니다.');
  return (data as Memo[])[0];
}

export async function deleteMemo(resourceId: string, id: string): Promise<void> {
  const boardId = await memoBoard(resourceId);
  const { error } = await supabase.from('collab_notes').delete().eq('id', id).eq('board_id', boardId);
  if (error) throw error;
}
