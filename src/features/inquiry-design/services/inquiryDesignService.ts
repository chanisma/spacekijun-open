import { supabase } from '@/integrations/supabase/client';
import { fetchLatestKgVersion, fetchKgVersionById, isNewPipelineEngine, listKgVersions } from '@/services/studentKgService';
import { throwEdgeFunctionError } from '@/utils/edgeFunctionError';
import { buildConversationPrimer } from '../utils/conversationPrimer';
import { normalizeImprovementDirections } from '../utils/improvementDirection';
import type { AchievementLinkRecord } from '../utils/achievementStandards';
import { aiLogTag } from '@/services/aiLogTag';
import type {
  InquiryActivityRecord,
  InquiryAiProvider,
  InquiryAnalysisResponse,
  InquiryAnalysisResult,
  InquiryQuota,
  InquirySelectedSource,
  InquiryStudent,
  InquiryTarget,
  InquiryWorkspace,
  KgEntityRow,
  KgRelationRow,
  SavedInquiryDesign,
} from '../types';

// Mirrors the edge function's default `dailyLimit` (openai-proxy
// inquiryDesignAnalysis). The client never sends a custom limit, so the two
// values must stay in sync for the upfront quota display to be honest.
// 2026-09-12 사용자 지시로 10 → 20.
export const INQUIRY_DAILY_LIMIT = 20;

/**
 * AI 종합 분석의 하루 상한 (2026-09-12 사용자 지시).
 * 세는 단위는 **결과물을 만든 횟수**(`generated_at`)이고 준비 단계는 세지 않는다 —
 * 방향을 다시 고르려고 준비로 되돌아오는 것이 정상 사용이다.
 * 서버 쪽 짝은 `count_comprehensive_analysis_calls()` + `inquiry-comprehensive` 의 generate 가드.
 */
export const COMPREHENSIVE_DAILY_LIMIT = 5;

/**
 * `추가 컨텍스트 / 방향성` 필드의 글자 예산. 수기 입력과 코치 대화 요약이 **같은
 * 필드를 공유**하므로 한 값을 두 화면(페이지의 대화 병합·사이드패널의 입력창)이
 * 함께 봐야 한다 — 예전엔 `2000`이 세 곳에 흩어져 있어 하나만 고치면 조용히
 * 어긋났다.
 *
 * 6,000자인 근거(2026-08-11): 이 값은 분석 프롬프트에 그대로 실리는데, 같은
 * 프롬프트의 엔티티 블록이 실측 평균 35,098자·최대 57,877자(KG 736개)다. 즉
 * 6,000자는 프롬프트의 한 자릿수 %이고, Solar Pro 4 컨텍스트(524,288토큰)
 * 기준으로는 0.4% 남짓이라 모델 한도와는 무관하다. 진짜 상한은 사람이 읽고
 * 다듬을 수 있는 분량이다.
 */
export const INQUIRY_CONTEXT_BUDGET = 6000;


// Upfront quota read so users see "오늘 N/10" before spending a call. Counts
// today's rows in inquiry_design_llm_cache via the same RPC the edge function
// uses; access control lives inside the SECURITY DEFINER function.
export async function fetchComprehensiveQuota(studentId: string): Promise<InquiryQuota> {
  const { data, error } = await db.rpc('count_comprehensive_analysis_calls', {
    p_student_id: studentId,
  });
  if (error) throw error;
  const used = typeof data === 'number' ? data : 0;
  return {
    used,
    limit: COMPREHENSIVE_DAILY_LIMIT,
    remaining: Math.max(COMPREHENSIVE_DAILY_LIMIT - used, 0),
  };
}

/**
 * ⚠️ **설계 화면은 더 이상 이것을 쓰지 않는다 (2026-09-18)**. 설계가 서버 작업 큐로
 * 옮겨가면서 `inquiry_design_llm_cache` 에 행이 생기지 않게 됐고, 이 함수는 그 표의
 * 오늘 행 수를 센다 — 그대로 두면 배지가 조용히 0 에 멈춘다. 화면의 짝은
 * `inquiryGenerationService.fetchInquiryRequestQuota`(오늘 접수한 의뢰 수)다.
 * 동기 경로(`requestInquiryAnalysis`)를 되살릴 때를 위해 남겨 둔다.
 */
export async function fetchInquiryQuota(studentId: string): Promise<InquiryQuota> {
  const { data, error } = await db.rpc('count_inquiry_analysis_calls', {
    p_student_id: studentId,
  });
  if (error) throw error;
  const used = typeof data === 'number' ? data : 0;
  return { used, limit: INQUIRY_DAILY_LIMIT, remaining: Math.max(INQUIRY_DAILY_LIMIT - used, 0) };
}

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  functions: {
    invoke: (fn: string, args: { body: Record<string, unknown> }) => Promise<{ data: any; error: any }>;
  };
};

function currentAcademicContext() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return {
    academicYear: now.getFullYear(),
    semester: month >= 3 && month <= 8 ? 1 : 2,
  };
}

function uniqueTargets(targets: InquiryTarget[]): InquiryTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.kind}:${target.name}:${target.academic_year}:${target.grade}:${target.semester ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackEntitiesFromKgJson(workspace: InquiryWorkspace): KgEntityRow[] {
  if (!workspace.kgVersion || !workspace.kgJson) return [];

  return workspace.kgJson.entities.map((entity) => ({
    id: entity.id,
    kg_version_id: workspace.kgVersion!.id,
    student_id: workspace.kgVersion!.student_id,
    entity_id: entity.id,
    label: entity.name,
    type: entity.type,
    properties: {
      confidence: entity.confidence,
      sources: entity.sources,
      evidence: entity.evidence,
    },
  }));
}

function fallbackRelationsFromKgJson(workspace: InquiryWorkspace): KgRelationRow[] {
  if (!workspace.kgVersion || !workspace.kgJson) return [];

  return workspace.kgJson.triples.map((triple, index) => ({
    id: `${workspace.kgVersion!.id}:${index}`,
    kg_version_id: workspace.kgVersion!.id,
    student_id: workspace.kgVersion!.student_id,
    source_entity_id: triple.subject === 'Student' ? 'student' : triple.subject,
    target_entity_id: triple.object,
    relation_type: triple.predicate,
    properties: {
      confidence: triple.confidence,
      evidence: triple.evidence,
      source: triple.source,
    },
  }));
}

async function fetchStudent(studentId: string): Promise<InquiryStudent | null> {
  const { data, error } = await db
    .from('student_basic_info')
    .select('id, name, grade, class_num, number')
    .eq('id', studentId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function fetchKgRows(studentId: string, kgVersionId?: string | null) {
  if (!kgVersionId) return { kgEntities: [], kgRelations: [] };

  const [{ data: entityRows, error: entityError }, { data: relationRows, error: relationError }] =
    await Promise.all([
      db
        .from('student_kg_entities')
        .select('id, kg_version_id, student_id, entity_id, label, type, properties')
        .eq('student_id', studentId)
        .eq('kg_version_id', kgVersionId),
      db
        .from('student_kg_relations')
        .select('id, kg_version_id, student_id, source_entity_id, target_entity_id, relation_type, properties')
        .eq('student_id', studentId)
        .eq('kg_version_id', kgVersionId),
    ]);

  if (entityError) throw entityError;
  if (relationError) throw relationError;

  return {
    kgEntities: (entityRows ?? []) as KgEntityRow[],
    kgRelations: (relationRows ?? []) as KgRelationRow[],
  };
}

async function fetchActivityRecords(studentId: string): Promise<InquiryActivityRecord[]> {
  const { data, error } = await db
    .from('student_detailed_activities')
    .select('id, category, subject_name, content, grade, semester, analysis')
    .eq('student_id', studentId)
    .order('grade', { ascending: true })
    .order('semester', { ascending: true });

  if (error) throw error;
  return (data ?? []) as InquiryActivityRecord[];
}

async function fetchSubjectTargets(studentId: string, student: InquiryStudent | null): Promise<InquiryTarget[]> {
  const { academicYear, semester } = currentAcademicContext();
  const grade = student?.grade ?? 3;
  const targets: InquiryTarget[] = [];

  const { data: submissions } = await db
    .from('course_selection_submission')
    .select('id, student_code, submitted_at, updated_at')
    .eq('student_code', studentId)
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(5);

  const submissionIds = (submissions ?? []).map((row: { id: string }) => row.id);
  if (submissionIds.length > 0) {
    const { data: items } = await db
      .from('course_selection_item')
      .select('id, submission_id, subject_name, semester, priority, selectable_subject_id, meta')
      .in('submission_id', submissionIds)
      .eq('semester', semester)
      .order('priority', { ascending: true, nullsFirst: false });

    for (const item of items ?? []) {
      targets.push({
        id: `course-selection:${item.id}`,
        kind: 'subject',
        name: item.subject_name,
        academic_year: academicYear,
        grade,
        semester: item.semester,
        source: 'course_selection_item',
        ref: {
          course_selection_item_id: item.id,
          submission_id: item.submission_id,
          selectable_subject_id: item.selectable_subject_id,
          source: 'course_selection_item',
        },
      });
    }
  }

  const { data: offerings } = await db
    .from('course_offering')
    .select('id, subject_name, academic_year, semester, grade, curriculum_id')
    .eq('academic_year', academicYear)
    .eq('semester', semester)
    .eq('grade', grade)
    .limit(80);

  for (const offering of offerings ?? []) {
    targets.push({
      id: `course-offering:${offering.id}`,
      kind: 'subject',
      name: offering.subject_name,
      academic_year: offering.academic_year,
      grade: offering.grade ?? grade,
      semester: offering.semester,
      source: 'course_offering',
      ref: {
        course_offering_id: offering.id,
        school_curriculum_id: offering.curriculum_id,
        source: 'course_offering',
      },
    });
  }

  const { data: curriculumRows } = await db
    .from('school_curriculum')
    .select('id, subject, academic_year, grade, semester, category, area')
    .eq('academic_year', academicYear)
    .eq('semester', semester)
    .eq('grade', grade)
    .limit(80);

  for (const row of curriculumRows ?? []) {
    targets.push({
      id: `curriculum:${row.id}`,
      kind: 'subject',
      name: row.subject,
      academic_year: row.academic_year,
      grade: row.grade,
      semester: row.semester,
      source: 'school_curriculum',
      ref: {
        school_curriculum_id: row.id,
        category: row.category,
        area: row.area,
        source: 'school_curriculum',
      },
    });
  }

  return uniqueTargets(targets);
}

function plannedActivityTargets(student: InquiryStudent | null): InquiryTarget[] {
  const { academicYear, semester } = currentAcademicContext();
  const grade = student?.grade ?? 3;

  return [
    {
      id: `slot:${academicYear}:${grade}:club`,
      kind: 'club',
      name: `${academicYear}학년도 동아리 활동`,
      academic_year: academicYear,
      grade,
      semester,
      source: 'planned_activity_slot',
      ref: { source: 'planned_activity_slot', category: '동아리활동' },
    },
    {
      id: `slot:${academicYear}:${grade}:autonomous`,
      kind: 'autonomous',
      name: `${academicYear}학년도 자율 활동`,
      academic_year: academicYear,
      grade,
      semester,
      source: 'planned_activity_slot',
      ref: { source: 'planned_activity_slot', category: '자율활동' },
    },
    {
      id: `slot:${academicYear}:${grade}:career`,
      kind: 'career',
      name: `${academicYear}학년도 진로 활동`,
      academic_year: academicYear,
      grade,
      semester,
      source: 'planned_activity_slot',
      ref: { source: 'planned_activity_slot', category: '진로활동' },
    },
  ];
}

async function fetchTargets(studentId: string, student: InquiryStudent | null): Promise<InquiryTarget[]> {
  const subjectTargets = await fetchSubjectTargets(studentId, student);
  return [...subjectTargets, ...plannedActivityTargets(student)];
}

/**
 * 이력 항목이 기반으로 삼은 **다른 버전들**의 엔티티 라벨을 읽는다.
 *
 * 현재 보고 있는 버전은 `kgEntities` 가 이미 갖고 있으므로 제외한다 — 같은 것을 두 번 받지 않는다.
 * 참조된 버전이 없으면 **요청 자체를 보내지 않는다**(대부분의 학생이 여기에 해당한다).
 *
 * `label` 만 읽는 이유: 이력 화면이 쓰는 것이 라벨뿐이고, `properties`·`embedding` 까지
 * 끌어오면 버전 하나에 수백 행 × 임베딩이라 페이로드가 통째로 무거워진다.
 */
async function fetchHistoryEntityLabels(
  studentId: string,
  versionIds: string[],
): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  if (versionIds.length === 0) return out;

  const { data, error } = await db
    .from('student_kg_entities')
    .select('kg_version_id, entity_id, label')
    .eq('student_id', studentId)
    .in('kg_version_id', versionIds);
  // 라벨은 **설명을 돕는 값**이지 기능의 전제가 아니다. 실패하면 원시 id 가 보일 뿐이므로
  // 이력 화면 전체를 못 열게 만들지 않는다.
  if (error) return out;

  for (const row of data ?? []) {
    const versionId = String((row as { kg_version_id?: string }).kg_version_id ?? '');
    const entityId = String((row as { entity_id?: string }).entity_id ?? '');
    const label = String((row as { label?: string }).label ?? '');
    if (!versionId || !entityId) continue;
    const map = out.get(versionId) ?? new Map<string, string>();
    map.set(entityId, label);
    out.set(versionId, map);
  }
  return out;
}

async function fetchSavedDesigns(studentId: string): Promise<SavedInquiryDesign[]> {
  const { data: designs, error } = await db
    .from('student_inquiry_designs')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    if (String(error.message ?? '').includes('student_inquiry_designs')) return [];
    throw error;
  }

  const designRows = designs ?? [];
  const designIds = designRows.map((row: { id: string }) => row.id);
  if (designIds.length === 0) return [];

  const [sourcesResult, entitiesResult, relationsResult] = await Promise.all([
    db.from('student_inquiry_design_sources').select('*').in('design_id', designIds),
    db.from('student_inquiry_design_entities').select('*').in('design_id', designIds),
    db.from('student_inquiry_design_relations').select('*').in('design_id', designIds),
  ]);

  if (sourcesResult.error) throw sourcesResult.error;
  if (entitiesResult.error) throw entitiesResult.error;
  if (relationsResult.error) throw relationsResult.error;

  return designRows.map((design: any) => ({
    ...design,
    target_ref: design.target_ref ?? {},
    selected_source_snapshot: design.selected_source_snapshot ?? [],
    llm_result: design.llm_result ?? null,
    llm_token_usage: design.llm_token_usage ?? {},
    sources: (sourcesResult.data ?? []).filter((row: any) => row.design_id === design.id),
    entities: (entitiesResult.data ?? [])
      .filter((row: any) => row.design_id === design.id)
      .map((row: any) => ({
        entity_id: row.entity_id,
        label: row.label,
        type: row.type,
        reuse_existing_id: null,
        properties: row.properties ?? {},
        evidence: String(row.properties?.evidence ?? ''),
      })),
    relations: (relationsResult.data ?? [])
      .filter((row: any) => row.design_id === design.id)
      .map((row: any) => ({
        source_entity_id: row.source_entity_id,
        target_entity_id: row.target_entity_id,
        source_scope: row.source_scope,
        target_scope: row.target_scope,
        relation_type: row.relation_type,
        confidence: row.confidence ?? 0.8,
        evidence: row.evidence ?? '',
        properties: row.properties ?? {},
      })),
  })) as SavedInquiryDesign[];
}

async function fetchComprehensiveRecommendations(studentId: string) {
  // Pulls every recommendation row for the student (across kg_versions), newest
  // first. If the table is missing or RLS blocks the read, swallow and return []
  // — comprehensive analysis history is a non-critical addition and shouldn't
  // break the whole workspace fetch.
  const { data, error } = await db
    .from('student_inquiry_recommendations')
    .select('*')
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false });

  if (error) {
    if (String(error.message ?? '').includes('student_inquiry_recommendations')) return [];
    throw error;
  }

  // 보완 방향은 두 세대의 형식이 섞여 있다(`formula_version`). 읽는 경계에서 한 번
  // 맞춰 두면 화면·프롬프트가 각자 분기하지 않는다 — 분기가 흩어지면 한 곳을 빠뜨린다.
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    weaknesses: normalizeImprovementDirections(row.weaknesses),
  })) as InquiryWorkspace['comprehensiveRecommendations'];
}

/**
 * @param kgVersionId 특정 KG 버전을 볼 때 지정. 없으면 최신.
 *   신 파이프라인 KG는 새 버전 행으로 들어오므로(§15) 기본값이 곧 신 KG이지만,
 *   **구 버전도 계속 열람 가능해야 하므로** 화면이 이 인자로 되돌릴 수 있어야 한다.
 */
export async function fetchInquiryWorkspace(
  studentId: string,
  kgVersionId?: string | null,
  includeHistory = true,
): Promise<InquiryWorkspace> {
  const [student, kgVersion, kgVersions] = await Promise.all([
    fetchStudent(studentId),
    kgVersionId ? fetchKgVersionById(kgVersionId) : fetchLatestKgVersion(studentId),
    listKgVersions(studentId),
  ]);

  const [
    { kgEntities, kgRelations },
    targets,
    activityRecords,
    savedDesigns,
    comprehensiveRecommendations,
  ] = await Promise.all([
    fetchKgRows(studentId, kgVersion?.id),
    fetchTargets(studentId, student),
    fetchActivityRecords(studentId),
    includeHistory ? fetchSavedDesigns(studentId) : Promise.resolve([]),
    includeHistory ? fetchComprehensiveRecommendations(studentId) : Promise.resolve([]),
  ]);

  // 이력 행이 참조하는 **다른 버전**만 추린다. 두 번째 왕복이지만, 참조가 없으면
  // 요청이 나가지 않고 있어도 라벨 열 하나만 읽는다.
  const referenced = new Set<string>();
  for (const design of savedDesigns) {
    if (design.kg_version_id && design.kg_version_id !== kgVersion?.id) referenced.add(design.kg_version_id);
  }
  for (const rec of comprehensiveRecommendations) {
    if (rec.kg_version_id && rec.kg_version_id !== kgVersion?.id) referenced.add(rec.kg_version_id);
  }
  const historyEntityLabels = await fetchHistoryEntityLabels(studentId, [...referenced]);

  const workspace: InquiryWorkspace = {
    student,
    kgVersion,
    kgVersions,
    kgJson: kgVersion?.kg_json ?? null,
    kgEntities,
    kgRelations,
    targets,
    activityRecords,
    savedDesigns,
    comprehensiveRecommendations,
    historyEntityLabels,
  };

  if (workspace.kgEntities.length === 0) {
    workspace.kgEntities = fallbackEntitiesFromKgJson(workspace);
  }
  if (workspace.kgRelations.length === 0) {
    workspace.kgRelations = fallbackRelationsFromKgJson(workspace);
  }

  return workspace;
}

export function buildSourceFromEntity(
  entity: KgEntityRow,
  relationHint?: string | null
): InquirySelectedSource {
  return {
    source_kind: 'kg_entity',
    kg_version_id: entity.kg_version_id,
    source_entity_id: entity.entity_id,
    relation_hint: relationHint ?? null,
    snapshot: {
      entity_id: entity.entity_id,
      label: entity.label,
      type: entity.type,
      properties: entity.properties ?? {},
      relation_hint: relationHint ?? null,
    },
  };
}

export function buildSourceFromRelation(relation: KgRelationRow): InquirySelectedSource {
  return {
    source_kind: 'kg_relation',
    kg_version_id: relation.kg_version_id,
    source_relation_id: relation.id,
    snapshot: {
      source_entity_id: relation.source_entity_id,
      target_entity_id: relation.target_entity_id,
      relation_type: relation.relation_type,
      properties: relation.properties ?? {},
    },
  };
}

export function buildSourceFromActivity(activity: InquiryActivityRecord): InquirySelectedSource {
  return {
    source_kind: 'activity_record',
    activity_id: activity.id,
    snapshot: {
      category: activity.category,
      subject_name: activity.subject_name,
      grade: activity.grade,
      semester: activity.semester,
      content: activity.content?.slice(0, 1200) ?? '',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sourceSummariesFromProperties(properties: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!properties) return [];

  const sources = properties.sources;
  if (Array.isArray(sources)) {
    return sources.filter(isRecord).map((source) => ({
      grade: source.grade ?? null,
      semester: source.semester ?? null,
      subject: source.subject ?? source.subject_name ?? null,
      category: source.category ?? null,
    }));
  }

  const source = properties.source ?? properties.activity_source ?? properties.book_source;
  if (isRecord(source)) {
    return [{
      grade: source.grade ?? null,
      semester: source.semester ?? null,
      subject: source.subject ?? source.subject_name ?? null,
      category: source.category ?? null,
    }];
  }

  return [];
}

function evidenceTextFromProperties(properties: Record<string, unknown> | null): string {
  const evidence = properties?.evidence;
  if (Array.isArray(evidence)) return evidence.filter((item) => typeof item === 'string').join(' | ').slice(0, 600);
  return typeof evidence === 'string' ? evidence.slice(0, 600) : '';
}

export interface InquiryConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface InquiryConversationResponse {
  reply: string;
  suggestEnd: boolean;
  turn: number;
  tokenUsage: Record<string, unknown>;
}

// Short coach-style conversational turn for the inquiry design flow. Stateless
// on the server — caller passes the full message history each time. Turn count
// is computed server-side from the assistant-message count but can be
// overridden by passing `turn` explicitly.
export async function requestInquiryConversation(input: {
  academyExperience?: boolean;
  studentId: string;
  aiProvider: InquiryAiProvider;
  target: InquiryTarget | null;
  messages: InquiryConversationMessage[];
  turn?: number;
  achievementContext?: { title: string; body: string };
  /**
   * 학생이 지식 지도에서 고른 노드·기록 (2026-09-18).
   *
   * **이걸 넘기지 않으면 코치는 학생이 무엇을 골랐는지 전혀 모른다** — 엣지 함수
   * `inquiryDesignConversation`은 `messages`와 `target`만 받으므로 선택 노드가
   * 들어갈 자리가 여기밖에 없다. 같은 서비스를 쓰는 아카데미 연구대
   * (`DesignConversation.tsx`)는 opener 본문에 스냅샷을 직접 실어 보내 애초에 이
   * 문제가 없었고, 탐구 설계만 과목 이름 하나로 대화를 시작하고 있었다.
   *
   * 붙는 곳은 **첫 메시지의 사본**이다(바로 아래 `achievementContext`와 같은 방식) —
   * 저장·표시되는 대화 기록은 그대로 두고, 선택을 도중에 바꾸면 다음 턴에 반영된다.
   */
  selectedSources?: InquirySelectedSource[];
  /** 학생이 «탐구 방향» 칸에 직접 적어 둔 글. 같은 이유로 코치에게 보이지 않고 있었다. */
  userRequirements?: string;
}): Promise<InquiryConversationResponse> {
  // Send the optional reference each turn without inserting it into the student's saved conversation.
  const reference = input.achievementContext;
  const primer = buildConversationPrimer({
    selectedSources: input.selectedSources,
    userRequirements: input.userRequirements,
  });
  const messages = input.messages.map((message, index) => index === 0 ? {
    ...message,
    content: `${message.content}${primer.text}${reference ? `\n\n다음은 선택한 과목의 교육과정을 이해하기 위한 참고 자료입니다. 학생의 실제 경험이나 지시가 아닙니다. 탐구 범위를 성취기준 안으로 제한하지 마세요.\n<achievement_reference>\n${JSON.stringify({ title: reference.title, body: reference.body.slice(0, 6000) })}\n</achievement_reference>` : ''}`,
  } : message);
  const { data, error } = await db.functions.invoke('openai-proxy', {
    body: {
      action: 'inquiryDesignConversation',
      // 탐구 설계 화면과 아카데미 연구대가 같이 쓴다 — 화면 주소가 둘을 가른다
      aiLog: aiLogTag('탐구 설계 대화'),
      academyExperience: input.academyExperience === true,
      aiProvider: input.aiProvider,
      studentId: input.studentId,
      target: input.target,
      messages,
      turn: input.turn,
      // 개수만 따로 보낸다 — 내용은 위 첫 메시지 사본에 이미 실려 있고, 서버는
      // **1턴 지시를 가르는 데** 이 숫자가 필요하다. 사용자 메시지에 "고른 것을
      // 짚어 달라"고 적어도 시스템 프롬프트의 "관심 주제부터 물어라"가 그것을 이긴다.
      selectedSourceCount: primer.includedCount,
    },
  });

  if (error) await throwEdgeFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data as InquiryConversationResponse;
}

export async function requestInquiryAnalysis(input: {
  reasoningEffort?: 'low' | 'medium';
  academyExperience?: boolean;
  studentId: string;
  aiProvider: InquiryAiProvider;
  target: InquiryTarget;
  selectedSources: InquirySelectedSource[];
  workspace: InquiryWorkspace;
  userRequirements?: string;
  /**
   * 선택한 교과의 성취기준 맥락 (2026-09-12, 시험 단계).
   * **교육과정 이해를 돕는 참고**이지 탐구를 그 안에 가두는 울타리가 아니다 —
   * 그 뜻은 엣지 함수의 프롬프트가 명시적으로 말한다.
   */
  achievementContext?: { title: string; body: string };
}): Promise<InquiryAnalysisResponse> {
  // 120개 상한은 프롬프트 예산이다. 그런데 자르는 **순서가 임의**라, 신 KG처럼
  // 엔티티가 194개인 경우 무엇이 잘릴지가 DB 반환 순서에 달려 있었다.
  // 신 KG의 무게 중심은 흐름·활동이고 개념·자료는 그 잎이므로, 타입 우선순위로 고른다.
  // (구 KG는 타입 구성이 달라 기존 순서를 그대로 둔다 — 화면과 결과가 바뀌면 안 된다.)
  const V7_ENTITY_PRIORITY: Record<string, number> = {
    Thread: 0, Activity: 1, Concept: 2, Book: 3, Person: 4, Role: 5,
  };
  const isV7Kg = isNewPipelineEngine(
    (input.workspace.kgJson?.source_stats as { extraction_engine?: string } | undefined)?.extraction_engine,
  );
  const orderedEntities = isV7Kg
    ? [...input.workspace.kgEntities].sort(
        (a, b) => (V7_ENTITY_PRIORITY[a.type ?? ''] ?? 9) - (V7_ENTITY_PRIORITY[b.type ?? ''] ?? 9),
      )
    : input.workspace.kgEntities;

  const existingEntities = orderedEntities.slice(0, 120).map((entity) => ({
    id: entity.entity_id,
    label: entity.label,
    type: entity.type,
    sources: sourceSummariesFromProperties(entity.properties),
    evidence: evidenceTextFromProperties(entity.properties),
    // 신 KG의 활동은 학년·과목·핵심 개념을 갖고 있다(§15 업로드에서 properties에 실었다).
    // 이 셋이 없으면 모델은 활동 제목만 보고 시기·맥락을 추측하게 된다.
    ...(isV7Kg
      ? {
          grade: (entity.properties as { grade?: number } | null)?.grade ?? null,
          subject: (entity.properties as { subject?: string } | null)?.subject ?? null,
          concepts: ((entity.properties as { concepts?: string[] } | null)?.concepts ?? []).slice(0, 8),
        }
      : {}),
  }));

  // 학생 식별정보(이름·학년·반·번호)는 넣지 않는다(2026-07-27). 이 객체는 프롬프트에
  // `기존 KG 요약`으로 통째 직렬화되는데, 분석 지시·출력 스키마 어디에도 학생을
  // 지목하는 항목이 없어 모델이 쓸 일이 없었다 — 실명이 그냥 LLM에 흘러가고 있었다.
  const kgContext = {
    version: input.workspace.kgVersion?.version ?? null,
    entityCount: input.workspace.kgEntities.length,
    relationCount: input.workspace.kgRelations.length,
  };

  const { data, error } = await db.functions.invoke('openai-proxy', {
    body: {
      action: 'inquiryDesignAnalysis',
      aiLog: aiLogTag('탐구 설계 생성'),
      reasoningEffort: input.reasoningEffort,
      academyExperience: input.academyExperience === true,
      aiProvider: input.aiProvider,
      studentId: input.studentId,
      target: input.target,
      selectedSources: input.selectedSources,
      userRequirements: input.userRequirements ?? null,
      achievementContext: input.achievementContext ?? null,
      kgContext,
      existingEntities,
    },
  });

  if (error) await throwEdgeFunctionError(error);
  if (data?.error) {
    const quotaText = data.quota ? ` (${data.quota.used}/${data.quota.limit})` : '';
    throw new Error(`${data.error}${quotaText}`);
  }

  return data as InquiryAnalysisResponse;
}

// Auto-draft snapshot after every analyze. Parent row only — no ontology child
// rows. Promoted to a real save via `saveInquiryDesign({ draftDesignId })`,
// which deletes this draft once the saved row is materialized.
export async function createDraftInquiryDesign(input: {
  studentId: string;
  target: InquiryTarget;
  selectedSources: InquirySelectedSource[];
  analysis: InquiryAnalysisResult;
  tokenUsage?: Record<string, unknown>;
  /** 이 설계가 밟고 선 KG 버전. 화면이 보고 있던 버전을 그대로 넘긴다. */
  kgVersionId?: string | null;
}): Promise<string> {
  const { data, error } = await db
    .from('student_inquiry_designs')
    .insert({
      kg_version_id: input.kgVersionId ?? null,
      student_id: input.studentId,
      title: input.analysis.title || input.target.name,
      target_kind: input.target.kind,
      target_name: input.target.name,
      target_ref: input.target.ref,
      academic_year: input.target.academic_year,
      grade: input.target.grade,
      semester: input.target.semester,
      status: 'draft',
      selected_source_snapshot: input.selectedSources.map((source) => source.snapshot),
      llm_result: input.analysis,
      student_rationale: '',
      llm_token_usage: input.tokenUsage ?? {},
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function saveInquiryDesign(input: {
  studentId: string;
  target: InquiryTarget;
  selectedSources: InquirySelectedSource[];
  analysis: InquiryAnalysisResult;
  rationale: string;
  tokenUsage?: Record<string, unknown>;
  draftDesignId?: string | null;
  /** 이 설계가 밟고 선 KG 버전. RPC 가 컬럼을 명시 나열하므로 서버 쪽도 함께 받아야 한다. */
  kgVersionId?: string | null;
  // 'saved' = 학생 본인 확정. 'proposed' = 교사가 학생 대신 저장한 제안 —
  // 학생이 자기 근거를 쓰고 수락(acceptInquiryProposal)하면 saved로 전환된다.
  status?: 'saved' | 'proposed';
}): Promise<string> {
  const design = {
    student_id: input.studentId,
    kg_version_id: input.kgVersionId ?? null,
    title: input.analysis.title || input.target.name,
    target_kind: input.target.kind,
    target_name: input.target.name,
    target_ref: input.target.ref,
    academic_year: input.target.academic_year,
    grade: input.target.grade,
    semester: input.target.semester,
    status: input.status ?? 'saved',
    selected_source_snapshot: input.selectedSources.map((source) => source.snapshot),
    llm_result: input.analysis,
    student_rationale: input.rationale,
    llm_token_usage: input.tokenUsage ?? {},
  };

  const { data, error } = await db.rpc('save_inquiry_design_with_ontology', {
    p_design: design,
    p_sources: input.selectedSources,
    p_entities: input.analysis.entities.map((entity) => ({
      ...entity,
      properties: {
        ...entity.properties,
        evidence: entity.evidence,
      },
    })),
    p_relations: input.analysis.relations,
  });

  if (error) throw error;

  // Best-effort cleanup of the auto-draft. If the user clicked 분석하기 first
  // we have a draft row representing the same analysis; with the saved row now
  // materialized, the draft is redundant. Failure here is non-fatal — an
  // orphaned draft can be deleted from the history panel.
  if (input.draftDesignId) {
    try {
      await db.rpc('delete_inquiry_design', { p_design_id: input.draftDesignId });
    } catch (cleanupError) {
      // eslint-disable-next-line no-console
      console.warn('Draft cleanup after save failed (non-fatal):', cleanupError);
    }
  }

  return data as string;
}

export async function deleteInquiryDesign(designId: string): Promise<boolean> {
  const { data, error } = await db.rpc('delete_inquiry_design', {
    p_design_id: designId,
  });

  if (error) throw error;
  return Boolean(data);
}

// ─── 생명주기 업데이트 (Phase C) ─────────────────────────────────────────
// 세 함수 모두 직접 UPDATE를 사용한다 — student_inquiry_designs의 4개 RLS
// 정책이 전부 inquiry_design_can_access_student(교사/admin=전체, 학생=본인)
// 기준이라 별도 RPC 없이도 접근 범위가 보장된다.

// 학생이 교사 제안(proposed)을 자기 설계로 수락. status 가드(.eq)로 이미
// 수락된 행에 대한 중복 수락을 무해하게 만든다.
export async function acceptInquiryProposal(designId: string, rationale: string): Promise<void> {
  const { error } = await db
    .from('student_inquiry_designs')
    .update({
      status: 'saved',
      student_rationale: rationale,
      updated_at: new Date().toISOString(),
    })
    .eq('id', designId)
    .eq('status', 'proposed');
  if (error) throw error;
}

/**
 * 짚어 낸 성취기준 연결을 그 설계 행에 남긴다 (2026-09-18).
 *
 * `llm_result` JSONB 를 **통째로 다시 쓴다** — 새 컬럼도, 새 RPC 도 두지 않았다.
 * 안전한 이유는 이 열이 **행이 만들어질 때 한 번 쓰이고 그 뒤로는 아무도 고치지
 * 않기 때문**이다(저장 경로는 새 행을 만들고, 생명주기 갱신 3종은 다른 열만
 * 건드린다). 그래서 read-modify-write 가 남의 변경을 덮을 자리가 없다.
 * **이 열을 고치는 다른 경로가 생기면 이 가정이 깨진다.**
 *
 * 실패해도 화면은 연결을 이미 보여 주고 있다 — 다음에 열 때 다시 짚어야 할 뿐이라
 * 호출부가 치명적으로 다루지 않는다.
 */
export async function saveAchievementLinks(
  designId: string,
  llmResult: InquiryAnalysisResult,
  record: AchievementLinkRecord,
): Promise<void> {
  const { error } = await db
    .from('student_inquiry_designs')
    .update({
      llm_result: { ...llmResult, achievement_links: record } as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('id', designId);
  if (error) throw error;
}

export async function updateInquiryReflection(designId: string, reflection: string): Promise<void> {
  const { error } = await db
    .from('student_inquiry_designs')
    .update({
      reflection: reflection.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', designId);
  if (error) throw error;
}

// 설계 ↔ 실제 활동 기록(student_detailed_activities) 연결.
// activityId=null 이면 연결 해제하고 saved 상태로 되돌린다.
export async function setInquiryObservation(designId: string, activityId: string | null): Promise<void> {
  const patch = activityId
    ? {
        observed_activity_id: activityId,
        observed_at: new Date().toISOString(),
        status: 'observed',
        updated_at: new Date().toISOString(),
      }
    : {
        observed_activity_id: null,
        observed_at: null,
        status: 'saved',
        updated_at: new Date().toISOString(),
      };
  const { error } = await db.from('student_inquiry_designs').update(patch).eq('id', designId);
  if (error) throw error;
}
