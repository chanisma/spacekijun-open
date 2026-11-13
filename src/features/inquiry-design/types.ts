import type { KgJson, KgVersionSummary, StudentKgVersion } from '@/services/studentKgService';
import type { AchievementLinkRecord } from './utils/achievementStandards';

export type { AchievementLink, AchievementLinkRecord } from './utils/achievementStandards';

export type InquiryTargetKind = 'subject' | 'club' | 'autonomous' | 'career';
// draft(분석 자동 스냅샷) → proposed(교사 제안, 학생 수락 대기) → saved(학생
// 확정) → observed(실행 활동 연결) → archived. 'analyzed'는 예약값(미사용).
export type InquiryDesignStatus = 'draft' | 'proposed' | 'analyzed' | 'saved' | 'observed' | 'archived';
export type InquirySourceKind = 'kg_entity' | 'kg_relation' | 'activity_record' | 'manual';
// 'solar-pro4' resolves to the Upstage model id 'solar-pro4' server-side.
// **왕복 이력**: 2026-08-14 에 pro4 → pro3 로 내렸다가 2026-09-12 사용자 지시로 다시 pro4.
// 되돌아온 근거는 그사이 pro4 의 실패 모드가 고쳐졌다는 것이다 — 추론 토큰과 최종 JSON 이
// **같은 예산**을 나눠 써 content 가 빈 채 500 이 나던 문제(실측 55~59초 뒤 500)를
// `openai-proxy` 의 Solar 분기가 `max_tokens ≥ 12000` 하한으로 막아 두었다.
// 엣지 함수는 구 값 'solar-pro3'·'solar-open2'도 별칭으로 계속 받으므로 프런트와
// 엣지 함수의 배포 순서가 어긋나도 조용히 OpenAI 로 새지 않는다.
// 주의: 이 값은 "Solar로 돌려줘"라는 **선택자**이고 모델 ID와 우연히 같을 뿐이다.
// 'gpt-5-mini' is the wire identifier; resolves to the same OpenAI model id as
// 'openai' ('gpt-6-luna') server-side — the name is a leftover from when that
// model was gpt-5.4-mini. Admin-only (UI hides it + edge function re-verifies
// role).
/**
 * 분석에 쓸 AI **선택자**(wire 값). 모델 ID 와 우연히 같을 뿐 같은 것이 아니다 —
 * 실제 모델은 엣지 함수의 `SOLAR_MODEL`/`OPENAI_MODEL` 이 정한다.
 *
 * `'solar-pro3'` 는 **읽기 전용 구 값**이다(2026-09-12 pro4 전환). 이미 저장된 이력 행이
 * 그 값을 갖고 있어 타입에서 지우면 그 행을 읽을 수 없다. **새로 내보내지는 않는다.**
 */
export type InquiryAiProvider = 'openai' | 'solar-pro4' | 'solar-pro3' | 'gpt-5-mini';
export type InquiryEntityType =
  | 'Student'
  | 'Competency'
  | 'Activity'
  | 'Attitude'
  | 'Interest'
  | 'Concept'
  | 'Book'
  | 'Achievement'
  | 'Person'
  | 'Role'
  | 'Thread';

export interface InquiryStudent {
  id: string;
  name: string | null;
  grade: number | null;
  class_num: number | null;
  number: number | null;
}

export interface InquiryTarget {
  id: string;
  kind: InquiryTargetKind;
  name: string;
  academic_year: number;
  grade: number;
  semester: number | null;
  source: string;
  ref: Record<string, unknown>;
}

export interface InquiryActivityRecord {
  id: string;
  category: string | null;
  subject_name: string | null;
  content: string | null;
  grade: number | null;
  semester: number | null;
  analysis?: unknown;
}

export interface KgEntityRow {
  id: string;
  kg_version_id: string;
  student_id: string;
  entity_id: string;
  label: string;
  type: string | null;
  properties: Record<string, unknown> | null;
}

export interface KgRelationRow {
  id: string;
  kg_version_id: string;
  student_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  properties: Record<string, unknown> | null;
}

export interface InquirySelectedSource {
  source_kind: InquirySourceKind;
  kg_version_id?: string | null;
  source_entity_id?: string | null;
  source_relation_id?: string | null;
  activity_id?: string | null;
  // User-supplied verb hint for how this existing entity connects to the new
  // Activity being designed. Omitted/null = let the LLM decide. Only meaningful
  // for `kg_entity` sources; ignored for relations/activities.
  relation_hint?: string | null;
  snapshot: Record<string, unknown>;
}

export interface InquiryAnalysisEntity {
  entity_id: string;
  label: string;
  type: InquiryEntityType;
  reuse_existing_id: string | null;
  properties: Record<string, unknown>;
  evidence: string;
}

export interface InquiryAnalysisRelation {
  source_entity_id: string;
  target_entity_id: string;
  source_scope: 'existing' | 'planned';
  target_scope: 'existing' | 'planned';
  relation_type: string;
  confidence: number;
  evidence: string;
  properties: Record<string, unknown>;
}

export interface InquiryPlanStep {
  title: string;
  method: string;
  output: string;
  expected_evidence: string;
}

export interface InquiryAnalysisResult {
  title: string;
  summary: string;
  inquiry_questions: string[];
  plan_steps: InquiryPlanStep[];
  entities: InquiryAnalysisEntity[];
  relations: InquiryAnalysisRelation[];
  student_prompt_questions: string[];
  risk_flags: string[];
  /**
   * 이 설계가 닿는 성취기준 (2026-09-18). **설계 단계의 산출물이 아니다** —
   * 화면에서 «성취기준 연결 보기» 를 눌렀을 때 따로 짚어 여기에 덧붙인다.
   * 그래서 **항상 선택 필드**다: 옛 설계·아직 안 짚은 설계에는 없다.
   *
   * 여기에 둔 이유는 `llm_result` 가 JSONB 이고
   * `academy_generation_checkpoint` 가 `design || graph` 로 **통째로 병합**하기
   * 때문이다 — 새 컬럼도 마이그레이션도 필요 없고, 이력 패널이 읽는 자리와 같다.
   */
  achievement_links?: AchievementLinkRecord | null;
}

export interface InquiryTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
  provider?: InquiryAiProvider;
  cached: boolean;
}

export interface InquiryQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface InquiryAnalysisResponse {
  result: InquiryAnalysisResult;
  cached: boolean;
  cacheKey: string;
  tokenUsage: InquiryTokenUsage;
  quota: InquiryQuota;
}

/**
 * 서버 작업 큐에 넣는 설계 의뢰의 입력 (2026-09-18).
 * 워커가 `existingEntities` 를 **자기가 다시 읽으므로** 여기 싣지 않는다 —
 * 접수 RPC 도 `p_input - 'existingEntities'` 로 떼어 낸다(브라우저가 준 id 를 믿지 않는다).
 */
export interface InquiryGenerationInput {
  studentId: string;
  kgVersionId: string | null;
  target: InquiryTarget;
  selectedSources: InquirySelectedSource[];
  userRequirements: string;
  achievementContext?: { title: string; body: string };
}

/**
 * 작업 큐 한 행(`academy_generation_jobs`).
 *
 * **아카데미 연구대와 탐구 설계가 같은 표·같은 워커를 쓴다** — 가르는 것은
 * `surface` 하나뿐이다. 그래서 타입도 한 벌이어야 한다(academy 쪽
 * `game/generationService.ts` 가 여기서 가져다 쓴다). 두 벌로 두면 컬럼이 늘 때
 * 한쪽만 고쳐지고, 그 어긋남은 런타임에야 드러난다.
 */
export interface InquiryGenerationJob {
  id: string;
  owner_id: string;
  surface: 'academy' | 'inquiry-design';
  student_id: string;
  experience: boolean;
  stage: 'design' | 'graph' | 'save';
  status: 'queued' | 'running' | 'retry' | 'failed' | 'completed';
  input: InquiryGenerationInput;
  provider: InquiryAiProvider;
  created_at: string;
  updated_at: string;
  design: Omit<InquiryAnalysisResult, 'entities' | 'relations'> | null;
  graph: Pick<InquiryAnalysisResult, 'entities' | 'relations'> | null;
  usage: Record<string, unknown>;
  draft_id: string | null;
  attempts: number;
  error: string | null;
}

export interface SavedInquiryDesign {
  id: string;
  student_id: string;
  /**
   * 이 설계가 **어느 KG 버전 위에서** 만들어졌는가 (2026-09-12).
   * KG 는 append-only 라 버전마다 엔티티 id·라벨이 달라진다 — 이 값이 없으면
   * 이력 설명을 "지금 보고 있는 그래프"에서 되찾게 되고, 그건 다른 그래프다.
   * `null` = 기록 이전에 만들어진 설계(생성 시각으로 추정하지 않는다).
   */
  kg_version_id: string | null;
  title: string;
  target_kind: InquiryTargetKind;
  target_name: string;
  target_ref: Record<string, unknown>;
  academic_year: number;
  grade: number;
  semester: number | null;
  status: InquiryDesignStatus;
  selected_source_snapshot: unknown[];
  llm_result: InquiryAnalysisResult | null;
  student_rationale: string;
  reflection: string | null;
  llm_token_usage: Record<string, unknown>;
  observed_activity_id: string | null;
  observed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sources: InquirySelectedSource[];
  entities: InquiryAnalysisEntity[];
  relations: InquiryAnalysisRelation[];
}

export interface InquiryWorkspace {
  student: InquiryStudent | null;
  kgVersion: StudentKgVersion | null;
  /** 이 학생의 KG 버전 목록(최신순). 화면 버전 선택기가 쓴다 — 구 KG도 계속 열람 가능해야 한다(§15). */
  kgVersions: KgVersionSummary[];
  kgJson: KgJson | null;
  kgEntities: KgEntityRow[];
  kgRelations: KgRelationRow[];
  targets: InquiryTarget[];
  activityRecords: InquiryActivityRecord[];
  savedDesigns: SavedInquiryDesign[];
  comprehensiveRecommendations: ComprehensiveRecommendationRow[];
  /**
   * **이력 항목이 기반으로 삼은 버전**의 엔티티 라벨 사전 — `버전 id → (엔티티 id → 라벨)`.
   *
   * 이력의 설명은 그 설계·분석이 **밟고 선 그래프**로 읽어야 한다. 지금 보고 있는 그래프에서
   * 같은 id 를 찾는 것은 다른 질문에 답하는 것이다(버전이 다르면 그 id 가 없거나 다른 것을 가리킨다).
   * 현재 버전은 `kgEntities` 가 이미 갖고 있으므로 여기에는 **그 외 버전만** 담는다.
   */
  historyEntityLabels: Map<string, Map<string, string>>;
}

// A row from `student_inquiry_recommendations`. Two lifecycle states sharing
// one row: prepare-only (recommendations=null, generated_at=null) and generated
// (recommendations populated, generated_at set). The history view distinguishes
// them with a status badge.
export interface ComprehensiveRecommendationRow {
  id: string;
  student_id: string;
  kg_version_id: string;
  metrics: Record<string, unknown>;
  // DB column name retained for backwards compatibility; holds improvement
  // directions in the v2 LLM-analysis flow.
  weaknesses: ImprovementDirection[];
  enrolled_subjects: EnrolledSubject[];
  current_grade: number;
  formula_version: string;
  prepared_at: string;
  prepared_by: string | null;
  selected_weakness_ids: string[] | null;
  selected_anchor_subjects: string[] | null;
  user_notes: string | null;
  recommendations: ComprehensiveRecommendation[] | null;
  ai_provider: string | null;
  ai_model: string | null;
  token_usage: Record<string, unknown>;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
  hygiene_findings: HygieneFindings;
}

export interface GraphSelection {
  nodeIds: string[];
  edgeIds: string[];
}

// ─── Comprehensive Analysis (KG-gap driven activity recommendations) ───
//
// v2: heuristic count-based weakness detection was replaced by LLM-driven
// improvement direction analysis. The DB column is still called `weaknesses`
// for backwards compatibility but stores ImprovementDirection[] now.

/**
 * 보완 방향. **두 세대의 산출물이 한 열에 섞여 있다** — `formula_version` 이 가른다
 * (`v1` 규칙 기반 5행 / `v2-llm-directions` 현행 22행). 읽는 경계에서
 * `normalizeImprovementDirection()` 이 한 모양으로 맞추므로 화면은 이 타입만 본다.
 */
export interface ImprovementDirection {
  id: string;
  summary: string;
  detail: string;
  related_entity_ids: string[];
  suggested_anchor_subjects: string[];
  /** v2 우선순위 — **작을수록 먼저**. v1 규칙 산출물에는 없다. */
  priority: number | null;
  /** v1 규칙 점수 — **클수록 시급**. `priority` 와 방향이 반대라 서로 대체할 수 없다. */
  legacy_score?: number | null;
  /** v1 규칙 종류(`interest-no-activity` 등). 왜 뽑혔는지를 말해 주는 유일한 단서다. */
  legacy_kind?: string | null;
}

export interface KgComprehensiveMetrics {
  totalEntities: number;
  byType: Record<string, number>;
  gradeDistribution: Record<string, { activities: number; books: number }>;
  threadCoverage: Array<{
    id: string;
    label: string;
    activityCount: number;
    sourceSubjects: string[];
  }>;
  interestCoverage: Array<{
    id: string;
    label: string;
    activityCount: number;
    bookCount: number;
    sourceSubjects: string[];
  }>;
  competencyCoverage: Array<{
    id: string;
    label: string;
    subjectCount: number;
    subjects: string[];
  }>;
  conceptCoverage: Array<{
    id: string;
    label: string;
    activityCount: number;
  }>;
}

export interface EnrolledSubject {
  subject_name: string;
  semester: number;
  academic_year: number;
}

export interface ComprehensiveRecommendation {
  rank: number;
  anchor_subject: string;
  title: string;
  description: string;
  rationale: string;
  connected_thread_labels: string[];
  connected_interest_labels: string[];
  strengthens_competencies: string[];
  referenced_entity_ids: string[];
}

export interface DuplicateCluster {
  type: string;
  canonical_entity_id: string;
  canonical_label: string;
  member_entity_ids: string[];
  member_labels: string[];
  max_similarity: number;
}

export interface InferredEdge {
  source_entity_id: string;
  source_label: string;
  source_type: string;
  target_entity_id: string;
  target_label: string;
  target_type: string;
  similarity: number;
  suggested_relation_type: string;
}

export interface HygieneFindings {
  duplicate_clusters: DuplicateCluster[];
  missing_edges: InferredEdge[];
}

export interface HygieneVerificationReport {
  considered: number;
  acceptedDuplicates: number;
  acceptedMissingEdges: number;
  rejected: number;
  reasonsRejected: Array<{ kind: string; pair: string; reason: string }>;
  tokenUsage: { promptTokens: number; completionTokens: number };
}

export interface ComprehensivePrepareResponse {
  recommendationId: string;
  studentId: string;
  kgVersionId: string;
  currentGrade: number;
  metrics: KgComprehensiveMetrics;
  directions: ImprovementDirection[];
  directionTokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  directionModel: string | null;
  hygieneFindings: HygieneFindings;
  hygieneCandidates: HygieneFindings;
  verifierReport: HygieneVerificationReport | null;
  enrolledSubjects: EnrolledSubject[];
  formulaVersion: string;
  embeddingsGenerated: number;
  hygieneError: string | null;
  // Daily usage counter (5/day for comprehensive analysis). Optional for
  // backwards-compat with older edge-function deploys.
  quota?: InquiryQuota;
  preparedAt: string;
}

export interface ComprehensiveGenerateRequest {
  academyExperience?: boolean;
  recommendationId: string;
  // Wire name preserved for backwards-compat with the edge function; these are
  // ImprovementDirection IDs in the v2 flow.
  selectedWeaknessIds: string[];
  selectedAnchorSubjects: string[];
  userNotes?: string;
  aiProvider: InquiryAiProvider;
}

export interface ComprehensiveGenerateResponse {
  recommendationId: string;
  recommendations: ComprehensiveRecommendation[];
  aiProvider: InquiryAiProvider;
  aiModel: string;
  tokenUsage: InquiryTokenUsage;
  generatedAt: string;
  invalidEntityRefs?: string[];
  invalidAnchors?: string[];
}
