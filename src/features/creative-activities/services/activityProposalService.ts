// ========================================
// 활동 제안 · 관심 표시 서비스 (Phase 3)
//
// 소통 루프 C: 제안 → 관심(수요 신호) → 개설.
// **수락으로 만든 활동의 `lineage_parent_id` = 제안의 `parent_activity_id`** —
// 여기가 학생 제안이 계보의 마디가 되는 지점이다.
//
// 관심은 **개수만** 공개한다(명단은 RLS로 교사에게만). 개수는
// `get_activity_interest_counts` DEFINER RPC가 낸다 — 학생 명단이 API로 새면 안 된다.
// ========================================

import { supabase } from '@/integrations/supabase/client';
import type {
  ActivityProposal,
  ActivityProposalInput,
  ActivityProposalRow,
  InterestSubjectType,
  ProposalStatus,
} from '../types';

/** 학생코드 → 이름 (resource 경유 — 졸업 익명화 승계) */
async function resolveStudentNames(codes: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes.filter((v): v is string => !!v))];
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

async function resolveProfileNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles').select('id, name').in('id', unique);
  if (error) {
    console.error('제안자 이름 조회 실패:', error);
    return new Map();
  }
  return new Map((data ?? []).map((p) => [p.id, p.name ?? '']));
}

/** 관심 개수 — 명단을 읽지 않고 DEFINER RPC로만 얻는다 */
export async function fetchInterestCounts(
  subjectType: InterestSubjectType,
  subjectIds: string[]
): Promise<Map<string, number>> {
  if (subjectIds.length === 0) return new Map();
  const { data, error } = await supabase.rpc('get_activity_interest_counts', {
    p_subject_type: subjectType,
    p_subject_ids: subjectIds,
  });
  if (error) {
    console.error('관심 개수 조회 실패:', error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((r: { subject_id: string; interest_count: number }) => [
      r.subject_id,
      Number(r.interest_count) || 0,
    ])
  );
}

/** 내가 관심 표시한 대상 id 집합 (학생만 의미 있다) */
async function fetchMyInterests(
  subjectType: InterestSubjectType,
  studentCode: string | null
): Promise<Set<string>> {
  if (!studentCode) return new Set();
  const { data, error } = await supabase
    .from('activity_interest')
    .select('subject_id')
    .eq('subject_type', subjectType)
    .eq('student_code', studentCode);
  if (error) {
    console.error('내 관심 조회 실패:', error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.subject_id));
}

export async function fetchProposals(myStudentCode: string | null): Promise<ActivityProposalRow[]> {
  const { data, error } = await supabase
    .from('activity_proposal')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ActivityProposal[];
  if (rows.length === 0) return [];

  const parentIds = [...new Set(rows.map((p) => p.parent_activity_id).filter((v): v is string => !!v))];

  const [studentNames, profileNames, counts, mine, parents] = await Promise.all([
    resolveStudentNames(rows.map((p) => p.proposer_student_code)),
    resolveProfileNames(rows.filter((p) => !p.proposer_student_code).map((p) => p.proposer_profile_id)),
    fetchInterestCounts('proposal', rows.map((p) => p.id)),
    fetchMyInterests('proposal', myStudentCode),
    parentIds.length
      ? supabase.from('activity').select('id, name').in('id', parentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const parentNames = new Map(
    ((parents as { data: { id: string; name: string }[] | null }).data ?? []).map((a) => [a.id, a.name])
  );

  return rows.map((p) => ({
    ...p,
    proposer_name: p.proposer_student_code
      ? studentNames.get(p.proposer_student_code) ?? null
      : p.proposer_profile_id
        ? profileNames.get(p.proposer_profile_id) ?? null
        : null,
    is_student: !!p.proposer_student_code,
    interest_count: counts.get(p.id) ?? 0,
    my_interest: mine.has(p.id),
    parent_activity_name: p.parent_activity_id ? parentNames.get(p.parent_activity_id) ?? null : null,
  }));
}

export async function createProposal(input: ActivityProposalInput): Promise<ActivityProposal> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('activity_proposal')
    .insert({
      title: input.title.trim(),
      body: input.body.trim(),
      area: input.area ?? null,
      career_fields: input.career_fields ?? [],
      target_year: input.target_year ?? null,
      parent_activity_id: input.parent_activity_id ?? null,
      proposer_profile_id: userId,
      proposer_student_code: input.proposer_student_code ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as ActivityProposal;
}

/** 검토 — 교사 전체가 할 수 있다(창체담당자로 좁히면 아무도 안 본다) */
export async function reviewProposal(payload: {
  id: string;
  status: ProposalStatus;
  reviewNote?: string | null;
  resultingActivityId?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');

  const patch: Record<string, unknown> = {
    status: payload.status,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  };
  if (payload.reviewNote !== undefined) patch.review_note = payload.reviewNote;
  if (payload.resultingActivityId !== undefined) {
    patch.resulting_activity_id = payload.resultingActivityId;
  }

  const { data, error } = await supabase
    .from('activity_proposal')
    .update(patch)
    .eq('id', payload.id)
    .select('id');
  if (error) throw error;
  // RLS 차단은 오류가 아니라 0행이다.
  if (!data || data.length === 0) throw new Error('이 제안을 검토할 권한이 없습니다.');
}

export async function deleteProposal(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('activity_proposal')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('이 제안을 삭제할 권한이 없습니다.');
}

/** 관심 표시 토글. 학생만 호출된다(서버 RLS가 학생코드를 강제). */
export async function toggleInterest(payload: {
  subjectType: InterestSubjectType;
  subjectId: string;
  studentCode: string;
  on: boolean;
}): Promise<void> {
  if (payload.on) {
    const { error } = await supabase.from('activity_interest').insert({
      subject_type: payload.subjectType,
      subject_id: payload.subjectId,
      student_code: payload.studentCode,
    });
    // 이미 눌렀으면 UNIQUE 23505 — 토글이므로 조용히 넘긴다.
    if (error && !/duplicate key|23505/.test(error.message)) throw error;
  } else {
    const { error } = await supabase
      .from('activity_interest')
      .delete()
      .eq('subject_type', payload.subjectType)
      .eq('subject_id', payload.subjectId)
      .eq('student_code', payload.studentCode);
    if (error) throw error;
  }
}
