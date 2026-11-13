// ========================================
// 활동 글(성찰·기록·회고) · 댓글 서비스
//
// **이름은 두 경로로 나뉜다.**
//   학생 → `resource`(student_code)로 조인. 졸업 시 `YYYY입학NNN` 별칭이
//          자동으로 따라오고, profiles 행이 지워져도 이름이 살아 있다.
//   교사 → `profiles`. 교사는 익명화 대상이 아니다.
// author_profile_id로 학생 이름을 찾으면 **졸업생은 이름이 사라진다**
// (라이브 실측: 졸업 237명 중 프로필 잔존 7명).
// ========================================

import { supabase } from '@/integrations/supabase/client';
import type {
  ActivityComment,
  ActivityCommentRow,
  ActivityPost,
  ActivityPostInput,
  ActivityPostRow,
  ActivityPostVisibility,
} from '../types';

/** 학생코드 → 이름 (resource 경유 — 익명화 승계) */
async function resolveStudentNames(codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('resource')
    .select('name, meta')
    .eq('type', 'student')
    .in('meta->>id', unique);

  if (error) {
    console.error('학생 이름 조회 실패:', error);
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const code = (row.meta as Record<string, unknown> | null)?.id;
    if (typeof code === 'string' && row.name) map.set(code, row.name);
  }
  return map;
}

/** profiles.id → 이름 (교사용) */
async function resolveProfileNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.from('profiles').select('id, name').in('id', unique);
  if (error) {
    console.error('작성자 이름 조회 실패:', error);
    return new Map();
  }
  return new Map((data ?? []).map((p) => [p.id, p.name ?? '']));
}

/** 한 활동의 글 + 댓글. RLS가 이미 볼 수 있는 것만 준다. */
export async function fetchActivityPosts(activityId: string): Promise<ActivityPostRow[]> {
  const { data: posts, error } = await supabase
    .from('activity_post')
    .select('*')
    .eq('activity_id', activityId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (posts ?? []) as unknown as ActivityPost[];
  if (rows.length === 0) return [];

  const { data: comments, error: cErr } = await supabase
    .from('activity_comment')
    .select('*')
    .in('post_id', rows.map((p) => p.id))
    .order('created_at', { ascending: true });
  if (cErr) throw cErr;

  const commentRows = (comments ?? []) as unknown as ActivityComment[];

  // 이름 해석 — 학생은 resource, 교사는 profiles
  const studentCodes = [
    ...rows.map((p) => p.student_code),
    ...commentRows.map((c) => c.student_code),
  ].filter((v): v is string => !!v);
  const profileIds = [
    ...rows.filter((p) => !p.student_code).map((p) => p.author_profile_id),
    ...commentRows.filter((c) => !c.student_code).map((c) => c.author_profile_id),
  ];

  const [studentNames, profileNames] = await Promise.all([
    resolveStudentNames(studentCodes),
    resolveProfileNames(profileIds),
  ]);

  const nameOf = (studentCode: string | null, profileId: string | null): string | null => {
    if (studentCode) return studentNames.get(studentCode) ?? null;
    if (profileId) return profileNames.get(profileId) ?? null;
    return null;
  };

  const byPost = new Map<string, ActivityCommentRow[]>();
  for (const c of commentRows) {
    const row: ActivityCommentRow = {
      ...c,
      author_name: nameOf(c.student_code, c.author_profile_id),
      is_student: !!c.student_code,
    };
    const bucket = byPost.get(c.post_id);
    if (bucket) bucket.push(row);
    else byPost.set(c.post_id, [row]);
  }

  return rows.map((p) => ({
    ...p,
    author_name: nameOf(p.student_code, p.author_profile_id),
    is_student: !!p.student_code,
    comments: byPost.get(p.id) ?? [],
  }));
}

export async function createActivityPost(input: ActivityPostInput): Promise<ActivityPost> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('activity_post')
    .insert({
      activity_id: input.activity_id,
      kind: input.kind,
      title: input.title?.trim() || null,
      content: input.content.trim(),
      visibility: input.visibility ?? 'participants',
      // CHECK(activity_post_author_shape): 성찰만 학생코드를 갖는다
      student_code: input.kind === 'reflection' ? (input.student_code ?? null) : null,
      author_profile_id: userId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as ActivityPost;
}

export async function updateActivityPost(
  id: string,
  patch: { content?: string; title?: string | null; visibility?: ActivityPostVisibility }
): Promise<void> {
  const { data, error } = await supabase
    .from('activity_post')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  // RLS 차단은 오류가 아니라 0행이다.
  if (!data || data.length === 0) throw new Error('이 글을 수정할 권한이 없습니다.');
}

export async function deleteActivityPost(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('activity_post')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('이 글을 삭제할 권한이 없습니다.');
}

export async function createActivityComment(payload: {
  postId: string;
  content: string;
  /** 학생이 다는 댓글이면 학생코드 */
  studentCode?: string | null;
}): Promise<ActivityComment> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('activity_comment')
    .insert({
      post_id: payload.postId,
      content: payload.content.trim(),
      student_code: payload.studentCode ?? null,
      author_profile_id: userId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as ActivityComment;
}

export async function deleteActivityComment(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('activity_comment')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('이 댓글을 삭제할 권한이 없습니다.');
}
