// 동아리 읽기·쓰기 (2026-11-11). 모두 RPC — 판정은 서버(DEFINER) 한 곳, MCP 도구도 같은 함수를 부른다.
import { supabase } from '@/integrations/supabase/client';
import type {
  ClubActivity, ClubApplication, ClubDetail, ClubHostCandidate, ClubFinance, ClubFinanceOverview, ClubListResult, ClubNotes, ClubProposal, ClubRecruit,
  ClubRecruitDetail, ClubRequest, MemberPreview, RequestPreview,
} from '../types';
import { getViewAs, setViewAs, VIEW_AS_READS } from '../viewAs';

// 생성 타입(types.ts)에 아직 없는 함수 — budgetService 와 같은 방식
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const viewAs = getViewAs();
  if (viewAs) {
    // 관리자의 «학생으로 보기» — 읽기는 그 학생으로, 쓰기·학생 화면에 없는 읽기는 막는다
    if (!VIEW_AS_READS.has(fn)) throw new Error('학생으로 보는 중에는 바꾸거나 이 정보를 열 수 없습니다');
    const { data, error } = await db.rpc('club_view_as', { p_student: { resource_id: viewAs.resourceId }, p_fn: fn, p_args: args });
    if (error) throw new Error(error.message);
    const res = data as { data: T; student?: { name?: string; grade?: number; class?: number; number?: number } };
    const s = res.student;
    const label = s?.name ? `${s.grade}-${s.class}-${s.number} ${s.name}` : viewAs.label;
    if (label !== viewAs.label && getViewAs()?.resourceId === viewAs.resourceId) setViewAs({ ...viewAs, label });
    return res.data;
  }
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const listClubs = (year: number | null) => call<ClubListResult>('club_list', { p_year: year });
export const getClub = (id: string) => call<ClubDetail>('club_get', { p_club_year_id: id });

export interface ClubPatch {
  name?: string;
  kind?: 'regular' | 'autonomous';
  category?: string | null;
  place?: string | null;
  capacity?: number | null;
  description?: string | null;
  status?: 'active' | 'inactive';
  academic_year?: number;
  club_id?: string;
}
export const saveClub = (id: string | null, patch: ClubPatch) =>
  call<ClubDetail>('club_save', { p_club_year_id: id, p_patch: patch });

export const setAdvisors = (id: string, teacherIds: string[]) =>
  call<ClubDetail>('club_set_advisors', { p_club_year_id: id, p_teacher_ids: teacherIds });

/** 학생 = {resource_id} · {code} · "2-5-17" */
export type StudentRef = { resource_id: string } | { code: string; role?: 'leader' | 'member' } | string;

export const setMembers = (id: string, students: StudentRef[], mode: 'add' | 'replace', checkOnly: boolean) =>
  call<MemberPreview>('club_set_members', { p_club_year_id: id, p_students: students, p_mode: mode, p_check_only: checkOnly });

export const requestMembers = (id: string, students: StudentRef[], note: string | null) =>
  call<{ ok: boolean; requested: number }>('club_request_members', { p_club_year_id: id, p_students: students, p_note: note });

export const decideMembers = (memberIds: string[], decision: 'confirm' | 'reject' | 'remove', note?: string | null) =>
  call<{ ok: boolean; changed: number }>('club_decide_members', { p_member_ids: memberIds, p_decision: decision, p_note: note ?? null });

export const setLeader = (id: string, studentCode: string | null) =>
  call<ClubDetail>('club_set_leader', { p_club_year_id: id, p_student_code: studentCode });

// ── P2: 활동 · 누가기록 · 요청함 ──
export const listClubActivities = (id: string) => call<ClubActivity[]>('club_activities', { p_club_year_id: id });
export const getClubNotes = (id: string) => call<ClubNotes>('club_notes', { p_club_year_id: id });
export const saveClubNote = (a: { clubYearId: string; studentCode: string; body: string; noteId?: string | null; period?: string | null }) =>
  call<{ ok: boolean; id: string }>('club_save_note', {
    p_club_year_id: a.clubYearId, p_student_code: a.studentCode, p_body: a.body,
    p_note_id: a.noteId ?? null, p_period: a.period ?? null, p_source: 'manual',
  });
export const deleteClubNote = (noteId: string) => call<{ ok: boolean }>('club_delete_note', { p_note_id: noteId });
export const listClubRequests = (clubYearId: string | null, year: number | null) =>
  call<ClubRequest[]>('club_requests', { p_club_year_id: clubYearId, p_year: year });

export interface ClubRequestDraft {
  title: string;
  axis: 'club' | 'club_member';
  fields: { label: string; type: 'text' | 'yesno' | 'number' | 'date' | 'select'; options?: string[]; required?: boolean }[];
  due: string | null;
  clubYearIds: string[] | null;
  guide: string;
  visibility: 'private' | 'shared';
  year: number;
}
export const sendClubRequest = (d: ClubRequestDraft, checkOnly: boolean) =>
  call<RequestPreview | { ok: true; action_id: string; work_id: string; task_id: string }>('club_send_request', {
    p_title: d.title, p_axis: d.axis, p_fields: d.fields, p_due: d.due, p_club_year_ids: d.clubYearIds,
    p_guide: d.guide, p_visibility: d.visibility, p_year: d.year, p_check_only: checkOnly,
  });

// ── P3: 예산 · 구매 ──
export const getClubFinance = (id: string) => call<ClubFinance>('club_finance_get', { p_club_year_id: id });
export const getClubFinanceOverview = (year: number | null) => call<ClubFinanceOverview>('club_finance_overview', { p_year: year });
export const setClubFinance = (id: string, allocated: number | null, budgetLineId: string | null, note: string | null) =>
  call<ClubFinance>('club_set_finance', { p_club_year_id: id, p_allocated: allocated, p_budget_line_id: budgetLineId, p_note: note });
export const openClubPurchasePage = (id: string) => call<ClubFinance>('club_open_purchase_page', { p_club_year_id: id });

/** 내가 읽을 수 있는 예산 산출내역 줄(예산 RLS — 담당 사업만) */
export async function listMyBudgetLines(year: number): Promise<{ id: string; name: string; project: string; budget_amount: number }[]> {
  const sb = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await sb.from('budget_line')
    .select('id, name, budget_amount, closed, budget_project!inner(name, fiscal_year)')
    .eq('budget_project.fiscal_year', year).eq('closed', false).order('sort_order');
  if (error) return [];
  return ((data ?? []) as { id: string; name: string; budget_amount: number; budget_project: { name: string } }[])
    .map((l) => ({ id: l.id, name: l.name, project: l.budget_project.name, budget_amount: Number(l.budget_amount) }));
}

// ── P4: 편성 · 개설 신청 · 새 학년도 ──
export const listRecruits = (year: number | null) => call<ClubRecruit[]>('club_recruit_list', { p_year: year });
export const getRecruit = (id: string) => call<ClubRecruitDetail>('club_recruit_get', { p_id: id });
export const saveRecruit = (id: string | null, p: Record<string, unknown>) => call<ClubRecruitDetail>('club_recruit_save', { p_id: id, p });
export const applyRecruit = (recruitId: string, choices: string[], motivations: Record<string, string>) =>
  call<ClubRecruitDetail>('club_apply', { p_recruit_id: recruitId, p_choices: choices, p_motivations: motivations });
export const withdrawApplication = (recruitId: string) => call<{ ok: boolean }>('club_withdraw_application', { p_recruit_id: recruitId });
export const listApplications = (clubYearId: string) => call<ClubApplication[]>('club_applications', { p_club_year_id: clubYearId, p_recruit_id: null });
export const judgeApplications = (ids: string[], result: 'accepted' | 'rejected' | 'applied', note: string | null) =>
  call<{ ok: boolean; changed: number }>('club_judge_applications', { p_ids: ids, p_result: result, p_note: note });
export const finalizeApplications = (clubYearId: string) =>
  call<{ ok: boolean; added: number; skipped: { student: string; reason: string }[] }>('club_finalize_applications', { p_club_year_id: clubYearId, p_recruit_id: null });
export const proposeAutonomous = (name: string, category: string | null, description: string, wishAdvisor: string | null) =>
  call<{ ok: boolean; club_year_id: string }>('club_propose_autonomous', { p_name: name, p_category: category, p_description: description, p_wish_advisor: wishAdvisor });
export const listProposals = (year: number | null) => call<ClubProposal[]>('club_proposals', { p_year: year });
export const decideProposal = (id: string, approve: boolean, teacherIds: string[] | null, reason: string | null) =>
  call<ClubDetail>('club_decide_proposal', { p_club_year_id: id, p_approve: approve, p_teacher_ids: teacherIds, p_reason: reason });
export const rollOver = (from: number, to: number, carry: boolean, checkOnly: boolean) =>
  call<{ check_only: boolean; clubs: number; skipped: string[]; carried_members: number }>('club_roll_over', { p_from: from, p_to: to, p_carry_members: carry, p_check_only: checkOnly });

// ── P5: 옛 기록 연결 ──
export const listHostCandidates = () => call<ClubHostCandidate[]>('club_host_candidates', {});
export const linkHost = (hostId: string, clubId: string | null) => call<{ ok: boolean }>('club_link_host', { p_host_id: hostId, p_club_id: clubId });
