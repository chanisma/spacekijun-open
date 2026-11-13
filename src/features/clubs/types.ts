// 동아리 관리 (2026-11-11) — 정본 = club · club_year · club_advisor · club_member
// 설계 = docs/plans/2026-11-11-club-management.md
export type ClubKind = 'regular' | 'autonomous';
export type ClubStatus = 'active' | 'inactive' | 'proposed' | 'rejected';
/** 내 역할 — 지도교사 > 학생(기장·부원) > 담당자 순으로 하나 */
export type ClubRole = 'advisor' | 'leader' | 'member' | 'manager' | null;
export type MemberStatus = 'pending' | 'confirmed' | 'removed';

export interface ClubAdvisor {
  resource_id: string;
  name: string;
  is_primary: boolean;
}

export interface ClubPerson {
  code: string;
  grade: number | null;
  class: number | null;
  number: number | null;
  name: string | null;
}

export interface ClubSummary {
  id: string;
  club_id: string;
  academic_year: number;
  name: string;
  kind: ClubKind;
  category: string | null;
  place: string | null;
  capacity: number | null;
  description: string | null;
  status: ClubStatus;
  activity_host_id: string | null;
  advisors: ClubAdvisor[];
  member_count: number;
  /** 관리할 수 있는 사람에게만 숫자 */
  pending_count: number | null;
  grades: Record<string, number> | null;
  leader: ClubPerson | null;
  /** 옛 자료의 기장이 명단에 없을 때 — 지도교사가 정한다 */
  leader_unresolved: (ClubPerson & { source?: string }) | null;
  years_running: number;
  /** 이름이 바뀐 해의 옛 이름 행(그 이름으로 활동한 3학년) — 기장이 없는 게 정상 */
  former_name?: boolean;
  my_role?: ClubRole;
}

export interface ClubActivity {
  id: string;
  name: string;
  area: string;
  academic_year: number | null;
  starts_on: string | null;
  ends_on: string | null;
  place: string | null;
  hours: number | null;
  status: string | null;
  content: string | null;
  host_name: string;
  this_year: boolean;
  participants: number;
  mine: boolean;
}

export interface CollectFieldDef { key: string; label: string; type: string; options?: string[] }

export interface ClubNoteStudent {
  code: string;
  name: string | null;
  grade: number | null;
  class: number | null;
  number: number | null;
  role: 'member' | 'leader';
  notes: { id: string; period: string | null; body: string; source: 'manual' | 'agent'; author: string | null; created_at: string; updated_at: string }[];
  answers: { action_id: string; dimension_key: string; values: Record<string, unknown>; updated_at: string }[];
}

export interface ClubNotes {
  club_year_id: string;
  students: ClubNoteStudent[];
  requests: Record<string, { title: string; fields: CollectFieldDef[]; dimensions: { key: string; label: string }[] }>;
}

export interface ClubRequest {
  action_id: string;
  task_id: string;
  status: 'open' | 'closed';
  axis: 'club' | 'club_member';
  started_at: string;
  title: string;
  due: string | null;
  clubs: { club_year_id: string; name: string; units: number; answered: number }[];
}

export interface RequestPreview {
  check_only: true;
  clubs: string[];
  advisors: number;
  rows: number;
}

export interface ClubMember {
  id: string;
  code: string;
  resource_id?: string | null;
  name: string | null;
  grade: number | null;
  class: number | null;
  number: number | null;
  role: 'member' | 'leader';
  status: MemberStatus;
  source?: string | null;
  note?: string | null;
  /** 재학 중인가(전출·자퇴면 false) — 교직원 화면만 */
  enrolled?: boolean;
  mine?: boolean;
  decided_at?: string | null;
  created_at?: string;
}

export interface ClubLineageItem {
  id: string;
  academic_year: number;
  name: string;
  status: ClubStatus;
  member_count: number;
}

export interface ClubDetail extends ClubSummary {
  club: { id: string; canonical_name: string; former_names: { name: string; until_year: number }[] };
  lineage: ClubLineageItem[];
  /** 이은 창체 옛 주최 이름(아카이브 연결) */
  linked_hosts?: string[];
  members: ClubMember[] | null;
  my_role: ClubRole;
  can_manage: boolean;
  is_manager: boolean;
}

export interface ClubListResult {
  year: number;
  years: number[];
  is_manager: boolean;
  clubs: ClubSummary[];
}

export interface MemberPreview {
  check_only?: boolean;
  ok: boolean;
  errors?: string[];
  add?: (ClubPerson & { resource_id: string; role: string })[];
  remove?: ClubPerson[];
  unchanged?: number;
  added?: number;
  removed?: number;
}

export const KIND_LABEL: Record<ClubKind, string> = { regular: '정규', autonomous: '자율' };
export const STATUS_LABEL: Record<ClubStatus, string> = {
  active: '활동 중', inactive: '지금 없음', proposed: '개설 신청', rejected: '반려',
};
export const ROLE_LABEL: Record<Exclude<ClubRole, null>, string> = {
  advisor: '지도교사', leader: '기장', member: '부원', manager: '담당자',
};

export function personLabel(p: Pick<ClubPerson, 'grade' | 'class' | 'number' | 'name'>): string {
  const gcn = [p.grade, p.class, p.number].every((v) => v != null) ? `${p.grade}-${p.class}-${p.number}` : '';
  return [gcn, p.name ?? ''].filter(Boolean).join(' ');
}

export interface ClubFinance {
  allocated: number | null;
  note: string | null;
  budget_line: { id: string; name: string; project: string; budget_amount: number; allocated_to_clubs: number } | null;
  page: { id: string; title: string; archived: boolean } | null;
  amounts: { requested: number; approved: number; ordered: number; pending_items: number; items: number };
  can_allocate: boolean;
  can_open_page: boolean;
}
export type ClubFinanceOverview = Record<string, { allocated: number | null; amounts: ClubFinance['amounts'] | null }>;

// ── P4: 편성 ──
export interface ClubRecruit {
  id: string;
  academic_year: number;
  title: string;
  kind: 'regular' | 'autonomous' | 'all';
  target_grades: number[];
  max_choices: number;
  opens_at: string;
  closes_at: string;
  guide: string | null;
  status: 'open' | 'closed' | 'finalized';
  is_open: boolean;
  applications?: number;
}
export interface ClubRecruitDetail extends ClubRecruit {
  clubs: { club_year_id: string; name: string; kind: string; capacity: number | null; description: string | null; place: string | null;
    advisors: string[] | null; members: number; applied: number; accepted: number; enrolled: number }[];
  unassigned: number | null;
  my_applications: { id: string; club_year_id: string; name: string; choice_rank: number; motivation: string | null; status: ApplicationStatus }[];
}
export type ApplicationStatus = 'applied' | 'accepted' | 'rejected' | 'withdrawn' | 'enrolled';
export interface ClubApplication {
  id: string; recruit_id: string; recruit: string; code: string; name: string | null;
  grade: number | null; class: number | null; number: number | null; choice_rank: number; motivation: string | null;
  status: ApplicationStatus; interview_note: string | null; judged_at: string | null; enrolled_elsewhere: string | null;
}
export interface ClubProposal {
  id: string; name: string; category: string | null; description: string | null; status: 'proposed' | 'rejected';
  wish_advisor: string | null; rejected_reason: string | null; created_at: string; proposer: string | null;
}
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: '면접 전', accepted: '합격', rejected: '불합격', withdrawn: '취소', enrolled: '명단 확정',
};

// ── P5: 옛 기록 연결 ──
export interface ClubHostCandidate {
  host_id: string; name: string; status: string; activities: number; years: number[] | null;
  linked_club: { club_id: string; name: string } | null;
  suggestion: { club_id: string; name: string } | null;
}
