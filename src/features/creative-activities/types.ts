// ========================================
// 창의적 체험활동 — 타입 정의
//
// 중심은 '활동(Activity)'이다. 동아리는 활동이 아니라 활동이 열리는
// 맥락(ActivityHost)이다. 중요한 것은 "융합과학 동아리"가 아니라
// 그 동아리가 진행한 "혈액형 판별 실험"이다.
//
// 스키마 = supabase/migrations/20260827090000_creative_activities_core.sql
// ========================================

/** 창체 법정 영역. 봉사는 2022 개정에서 자율·자치 하위지만 발급 체계가 분리돼 별도 값. */
export type ActivityArea = 'autonomy' | 'club' | 'career' | 'service';

/** 활동을 여는 맥락의 종류 */
export type ActivityHostKind = 'club' | 'grade' | 'school' | 'department' | 'external' | 'teacher';

/** 운영 주체 — 교내 / 외부 업체 / 공동 */
export type ActivityOperatorType = 'internal' | 'external' | 'joint';

/** 운영 규모 */
export type ActivityScale = 'school' | 'grade' | 'class' | 'group' | 'individual';

/** 예산 출처 — 학교 일반예산 / 교육청 / 공모사업 / 외부기관 / 자부담 / 없음 */
export type ActivityBudgetSource = 'school' | 'office' | 'grant' | 'external' | 'self' | 'none';

/** 활동 진행 상태 */
export type ActivityStatus = 'planned' | 'running' | 'done' | 'cancelled';

/** 활동 공개 범위 — 전교 열람 / 참여자 한정 */
export type ActivityVisibility = 'school' | 'participants';

/** 이 활동 행이 어디서 만들어졌는가 (기록을 부산물로 만드는 경로 추적) */
export type ActivitySource = 'manual' | 'timetable' | 'meeting' | 'issue' | 'import';

/** 활동 참여 역할 */
export type ParticipationRole = 'member' | 'leader' | 'presenter' | 'staff';

/** 활동 참여 상태 */
export type ParticipationStatus = 'applied' | 'active' | 'completed' | 'withdrawn';

/** 담당교사 역할 */
export type ActivityTeacherRole = 'lead' | 'co' | 'support';

/** 소속(부원) 역할 */
export type HostMemberRole = 'member' | 'leader' | 'staff';

// ----------------------------------------

/** 활동을 여는 맥락 — 동아리·학년·학교·부서·외부기관. 연도 무관 정체성. */
export interface ActivityHost {
  id: string;
  kind: ActivityHostKind;
  name: string;
  category: string | null;
  description: string | null;
  /** 이 맥락에서 여는 활동의 기본 영역. 활동이 개별로 덮어쓸 수 있다. */
  default_area: ActivityArea | null;
  owner_resource_id: string | null;
  department: string | null;
  status: 'active' | 'archived';
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 연도별 소속 명단. 참여자 선택의 기본값 씨앗이며 참여 기록이 아니다. */
export interface ActivityHostMember {
  id: string;
  host_id: string;
  academic_year: number;
  student_code: string;
  student_resource_id: string | null;
  grade: number | null;
  class_num: number | null;
  number: number | null;
  role: HostMemberRole;
  created_at: string;
}

/**
 * 활동 1건. 이 시스템의 중심.
 *
 * `name`은 필수다 — 이름 없는 활동은 검색도 집계도 계보 추적도 불가능하고,
 * 그것이 정확히 지금 생기부 창체 기록이 겪는 문제다.
 */
export interface Activity {
  id: string;

  // 무엇을 했는가
  name: string;
  area: ActivityArea;
  purpose: string | null;
  content: string | null;
  outcome: string | null;

  // 언제·어디서
  academic_year: number;
  semester: number | null;
  starts_on: string;          // YYYY-MM-DD
  ends_on: string | null;     // null = 하루짜리
  hours: number | null;
  place: string | null;

  // 주최(맥락)는 다대다다 — `activity_host_link` 조인 표. Activity 행에는 없다.

  // 계보 — host가 아니라 활동에 붙는다
  lineage_parent_id: string | null;
  lineage_note: string | null;

  // 운영·예산 (활동 단위. 같은 동아리도 활동마다 다르다)
  operator_type: ActivityOperatorType;
  operator_name: string | null;
  scale: ActivityScale;
  budget_source: ActivityBudgetSource | null;
  budget_program: string | null;
  budget_planned: number | null;
  budget_spent: number | null;

  // 분류축
  keywords: string[];
  related_subjects: string[];
  career_fields: string[];
  target_grades: number[];

  department: string | null;
  status: ActivityStatus;
  visibility: ActivityVisibility;

  source: ActivitySource;
  meeting_id: string | null;

  attachments: ActivityAttachment[];
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 첨부파일 — tasks·notice-board의 구조와 호환 */
export interface ActivityAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploaded_at: string;
  uploaded_by: string;
  isGoogleDrive?: boolean;
  googleDriveId?: string;
}

/** 활동 담당교사 */
export interface ActivityTeacher {
  activity_id: string;
  teacher_resource_id: string;
  role: ActivityTeacherRole;
  created_at: string;
}

/** 학생 × 활동. "무슨 동아리였는가"가 아니라 "무엇을 했는가"를 남긴다. */
export interface ActivityParticipation {
  id: string;
  activity_id: string;
  student_code: string;
  student_resource_id: string | null;
  /** 참여 당시 학년·반 스냅샷. 현재 반과 다를 수 있고 그 시점이 정본이다. */
  grade: number | null;
  class_num: number | null;
  role: ParticipationRole;
  status: ParticipationStatus;
  /** 개별 인정 시수. null이면 activity.hours를 상속한다. */
  hours: number | null;
  note: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------
// 화면에서 쓰는 조합 타입
// ----------------------------------------

/** 활동에 걸린 주최 한 건 */
export interface ActivityHostRef {
  id: string;
  name: string;
  kind: ActivityHostKind;
  category: string | null;
  /** primary = 대표 주최(표시·정렬 기준), co = 공동 주최 */
  role: 'primary' | 'co';
}

/** 담당교사·주최·참여 요약이 붙은 활동 (목록 카드용) */
export interface ActivityWithContext extends Activity {
  /** 주최 전부(대표가 먼저). 여러 동아리가 함께 연 활동이면 여러 건이다 */
  hosts: ActivityHostRef[];
  /** 대표 주최 — 카드·행이 한 곳만 보여 줄 때 쓴다 */
  primaryHost: ActivityHostRef | null;
  teachers: { resource_id: string; name: string; role: ActivityTeacherRole }[];
  /** 참여자 수. **학생 시점에는 `null`** — RLS 상 자기 행만 보여 집계가 틀리므로 아예 세지 않는다 */
  participant_count: number | null;
  /** 계보 연차 — 1이면 첫 해, 3이면 "3년째" */
  lineage_generation: number;
}

/**
 * 목록 한 줄용 — **본문 전문(`content`)과 `meta` 를 담지 않는다.**
 *
 * 목록은 본문을 `truncate` 로 한 줄만 그리는데 전문을 받으면 그게 곧 전송량이다
 * (실측 1,000행 brotli: 217 KB → **117 KB**, 46.2% 절감). 기본 연도 필터가 '전체'라
 * 행 수를 줄이는 축이 없으므로 **행당 크기가 유일한 지렛대**다.
 *
 * ⚠️ `content` 를 **타입에서 뺀 것이 안전장치다.** 발췌를 `content` 자리에 담으면
 * 편집 화면이 목록 행을 그대로 폼에 실어 **잘린 본문이 원본을 덮는다**(조용한 손실).
 * 전문이 필요한 자리(상세·편집)는 `useActivity(id)` 로 따로 받아야 하고,
 * 그러지 않으면 여기서 컴파일이 막는다.
 */
export type ActivityListItem = Omit<ActivityWithContext, 'content' | 'meta'> & {
  /** 본문 앞 80자. 한 줄 표시 전용 — 저장 경로에 넣지 말 것 */
  content_excerpt: string | null;
};

/** 참여자 행에 이름을 붙인 것. 이름은 resource 조인으로만 얻는다(익명화 승계). */
export interface ActivityParticipantRow extends ActivityParticipation {
  student_name: string | null;
}

/** 소속 명단 행에 이름을 붙인 것 */
export interface ActivityHostMemberRow extends ActivityHostMember {
  student_name: string | null;
  /** 현재 재학 상태. 전출·자퇴한 옛 부원을 구분한다. */
  student_status: string | null;
}

// ----------------------------------------
// 입력 타입
// ----------------------------------------

export interface ActivityInput {
  name: string;
  area: ActivityArea;
  purpose?: string | null;
  content?: string | null;
  outcome?: string | null;
  academic_year: number;
  semester?: number | null;
  starts_on: string;
  ends_on?: string | null;
  hours?: number | null;
  place?: string | null;
  lineage_parent_id?: string | null;
  lineage_note?: string | null;
  operator_type?: ActivityOperatorType;
  operator_name?: string | null;
  scale?: ActivityScale;
  budget_source?: ActivityBudgetSource | null;
  budget_program?: string | null;
  budget_planned?: number | null;
  budget_spent?: number | null;
  keywords?: string[];
  related_subjects?: string[];
  career_fields?: string[];
  target_grades?: number[];
  department?: string | null;
  status?: ActivityStatus;
  visibility?: ActivityVisibility;
  source?: ActivitySource;
  meeting_id?: string | null;
}

export interface ActivityHostInput {
  kind: ActivityHostKind;
  name: string;
  category?: string | null;
  description?: string | null;
  default_area?: ActivityArea | null;
  owner_resource_id?: string | null;
  department?: string | null;
}

/** 참여자 일괄 등록 입력 — 학생 1명분 */
export interface ParticipantInput {
  student_code: string;
  student_resource_id?: string | null;
  grade?: number | null;
  class_num?: number | null;
  role?: ParticipationRole;
  status?: ParticipationStatus;
  hours?: number | null;
  note?: string | null;
}

// ----------------------------------------
// 필터
// ----------------------------------------

export interface ActivityFilters {
  academicYear?: number | null;
  area?: ActivityArea | null;
  hostId?: string | null;
  category?: string | null;
  operatorType?: ActivityOperatorType | null;
  budgetSource?: ActivityBudgetSource | null;
  search?: string;
  /** 내가 담당한 활동만 */
  mineOnly?: boolean;
}

// ----------------------------------------
// 성찰 · 기록 · 댓글 (Phase 2)
// ----------------------------------------

/**
 * 활동 글의 종류.
 * - `reflection` 학생 성찰 (학생만 작성, `student_code` 필수)
 * - `log` 교사 활동 기록
 * - `retrospective` 운영 회고 → 다음 해 담당자에게 승계 (Phase 3에서 소비)
 * - `idea` 발전 아이디어
 */
export type ActivityPostKind = 'reflection' | 'log' | 'retrospective' | 'idea';

/**
 * 글 공개 범위.
 * - `private` 본인 + 담당교사
 * - `participants` 교사 전체 + 같이 참여한 학생 (기본값)
 * - `school` 전교 열람 — 후배 아카이브의 재료. **학생 본인만 올릴 수 있다**
 */
export type ActivityPostVisibility = 'private' | 'participants' | 'school';

export interface ActivityPost {
  id: string;
  activity_id: string;
  /** 학생 글이면 채워진다. 교사 글은 null (이름은 저장하지 않는다) */
  student_code: string | null;
  kind: ActivityPostKind;
  title: string | null;
  content: string;
  attachments: ActivityAttachment[];
  visibility: ActivityPostVisibility;
  is_pinned: boolean;
  /** 졸업으로 profiles가 삭제되면 null이 된다(ON DELETE SET NULL) — 글은 남는다 */
  author_profile_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ActivityComment {
  id: string;
  post_id: string;
  content: string;
  /** 졸업으로 profiles가 삭제되면 null이 된다 — 댓글은 남는다 */
  author_profile_id: string | null;
  student_code: string | null;
  created_at: string;
  updated_at: string;
}

/** 작성자 이름을 붙인 댓글. 이름은 조인으로만 얻는다(익명화 승계). */
export interface ActivityCommentRow extends ActivityComment {
  author_name: string | null;
  /** 작성자가 학생인가 — 교사 피드백과 시각적으로 구분한다 */
  is_student: boolean;
}

/** 댓글까지 붙인 글 */
export interface ActivityPostRow extends ActivityPost {
  author_name: string | null;
  is_student: boolean;
  comments: ActivityCommentRow[];
}

export interface ActivityPostInput {
  activity_id: string;
  kind: ActivityPostKind;
  title?: string | null;
  content: string;
  visibility?: ActivityPostVisibility;
  /** 학생 성찰이면 필수 */
  student_code?: string | null;
}

// ----------------------------------------
// 제안 · 관심 표시 (Phase 3)
// ----------------------------------------

/** 제안 처리 상태. `accepted`가 되면 `resulting_activity_id`가 채워진다. */
export type ProposalStatus = 'submitted' | 'reviewing' | 'accepted' | 'declined';

export interface ActivityProposal {
  id: string;
  title: string;
  body: string;
  /** 희망 영역 (선택) */
  area: ActivityArea | null;
  career_fields: string[];
  target_year: number | null;
  /**
   * 이어가려는 기존 활동. 수락으로 만든 활동의 `lineage_parent_id`가 이 값이 된다
   * — 학생 제안이 계보의 마디가 되는 지점이다.
   */
  parent_activity_id: string | null;
  /** 졸업으로 profiles가 삭제되면 null이 된다 — 제안은 남는다 */
  proposer_profile_id: string | null;
  proposer_student_code: string | null;
  status: ProposalStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resulting_activity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** 이름·관심 수·부모 활동명을 붙인 제안 (목록용) */
export interface ActivityProposalRow extends ActivityProposal {
  proposer_name: string | null;
  /** 학생 제안인가 — 교사 제안과 시각적으로 구분한다 */
  is_student: boolean;
  interest_count: number;
  /** 내가 관심을 표시했는가 (학생만 의미 있다) */
  my_interest: boolean;
  parent_activity_name: string | null;
}

export interface ActivityProposalInput {
  title: string;
  body: string;
  area?: ActivityArea | null;
  career_fields?: string[];
  target_year?: number | null;
  parent_activity_id?: string | null;
  /** 학생 제안이면 필수 */
  proposer_student_code?: string | null;
}

/** 관심 표시 대상 종류 */
export type InterestSubjectType = 'activity' | 'proposal';

// ── 탐구 탐색 (GraphRAG) ─────────────────────────────────────────────────────
// 설계 = docs/features/creative-activities-graphrag.md §6, 방법론 = 스킬 `/inquiry-graphrag`

/** 탐구 수준 — 코드가 strength/breadth 에서 유도한다(모델이 매기지 않는다). */
export type InquiryLevel = 0 | 1 | 2 | 3 | 4;

/** 리프 주제군 보고서(E6). 인용 단위는 **활동 id** 다. */
export interface LeafReport {
  name: string;
  summary: string;
  what: string;
  how: string;
  exemplars: { activity_id: string; why: string }[];
  paths: string;
  gaps: string[];
  extensions: string[];
  fields: string[];
}

/**
 * 상위 갈래 보고서(E6'). 인용 단위는 **theme_id** 다 — 이 층은 활동을 직접 보지 않는다.
 *
 * `entry` 는 **문자열일 수도 배열일 수도 있다** — 프롬프트는 문자열을 요구했지만 일부 보고서가
 * 배열로 왔다(실측 21개 중 다수). 스키마로 막지 않은 자리라 읽는 쪽이 흡수한다(`asLines`).
 */
export interface TopReport {
  name: string;
  summary: string;
  /** 이 갈래 안에서 리프들이 어떤 축으로 갈리는가 — 이 층에만 있는 값 */
  landscape: string | string[];
  deep: string[];
  shallow: string[];
  /** 처음 시작하는 학생에게 권할 진입 지점 — 이 층에만 있는 값 */
  entry: string | string[];
  fields: string[];
}

interface InquiryThemeBase {
  id: string;
  name: string;
  size: number;
  graded: number;
  levelDist: Record<string, number>;
  /**
   * 구성 활동의 평균 문장 수. **심화 비율과 반드시 함께 읽는다** —
   * 짧으면 어떤 주제든 깊이가 안 나오므로(1문장 26% → 4문장 이상 78%),
   * 이 값이 없으면 "깊이가 없는 주제"와 "판단할 재료가 없는 주제"가 같은 0% 로 보인다(§8-10).
   */
  meanSentences: number | null;
}

export interface InquiryTopTheme extends InquiryThemeBase {
  report: TopReport | null;
}

export interface InquiryLeafTheme extends InquiryThemeBase {
  parentId: string;
  report: LeafReport | null;
}

/** `inquiry_activity_public` 뷰의 한 행 — **student_code 가 없다**(탐색 단위는 탐구이지 사람이 아니다). */
export interface InquiryActivity {
  id: string;
  area: string;
  subject_name: string | null;
  grade: number | null;
  academic_year: number | null;
  title: string;
  concepts: string[];
  n_sentences: number | null;
  /** 동아리명 — 원문 `(동아리명)(N시간)` 서식에서 뽑는다. 동아리활동에만 값이 있다 */
  club_name: string | null;
  /** 그 기록의 이수 시수 */
  hours: number | null;
  level: InquiryLevel | null;
  strength: number | null;
  breadth: number | null;
  research_question: string | null;
  method_types: string[];
  output_types: string[];
  career_fields: string[];
  extension_hint: string | null;
  /** 내 활동인가 — 학생에게만 뜻이 있다 */
  is_mine: boolean;
}
