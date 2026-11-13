import { experienceClient, requireExperience, experienceStudent } from '../_shared/academyExperience.ts';
// Edge function: inquiry-comprehensive
// Two-phase recommendation analysis for a student's KG.
//
//   POST { mode: 'prepare',  studentId }   → embeddings + hygiene + metrics + weaknesses
//   POST { mode: 'generate', ... }          → LLM recommendations (milestone 2)
//
// Phase 1 (prepare) pipeline:
//   1. fetch KG
//   2. ensure embeddings (lazy; persisted)
//   3. detect hygiene findings (duplicates + missing edges)
//   4. apply hygiene in-memory → enriched graph
//   5. compute metrics + detect weaknesses on enriched graph
//   6. persist via upsert_inquiry_recommendation_prepare RPC

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  computeMetrics,
  KgEntityRow,
  KgRelationRow,
} from './compute-metrics.ts';
import { analyzeImprovementDirections, FORMULA_VERSION } from './analyze-directions.ts';
import { ensureEmbeddings } from './embedding-service.ts';
import { applyHygiene, detectHygiene, HygieneFindings } from './graph-hygiene.ts';
import { verifyHygiene, VerificationReport } from './hygiene-verifier.ts';
import { InquiryProvider, isSolarProvider, normalizeProvider } from './providers.ts';
import { generateRecommendations } from './recommend.ts';
import { aiLogContext, aiLogFetch, jwtSubject, logAiRequestFailure, withAiFailureLog } from '../_shared/aiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PrepareBody {
  mode: 'prepare';
  studentId: string;
  kgVersionId?: string;
  currentGrade?: number;
  // If true, skip embedding/hygiene step. Useful for debugging or when OpenAI is down.
  skipHygiene?: boolean;
  // LLM provider for the direction analysis + hygiene verifier (prepare phase).
  // Defaults to openai. 구 wire 값 'solar-open2'·'solar-pro3'도 별칭으로 받는다.
  aiProvider?: InquiryProvider | 'solar-open2' | 'solar-pro4';
  // Optional teacher input — career target, desired pivot, focus area.
  // Forwarded into the direction-analysis prompt; not persisted.
  userGuidance?: string;
}

interface GenerateBody {
  mode: 'generate';
  recommendationId: string;
  // Wire name kept for backwards compatibility; semantically these are now
  // improvement direction IDs selected by the teacher.
  selectedWeaknessIds: string[];
  selectedAnchorSubjects: string[];
  userNotes?: string;
  aiProvider: InquiryProvider | 'solar-open2' | 'solar-pro4';
}

type RequestBody = PrepareBody | GenerateBody;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function loadStudent(
  supabase: SupabaseClient,
  studentId: string
): Promise<{ id: string; grade: number | null; name: string | null }> {
  const { data, error } = await supabase
    .from('student_basic_info')
    .select('id, grade, name')
    .eq('id', studentId)
    .single();
  if (error || !data) throw new Error(`student ${studentId} not found: ${error?.message ?? 'no row'}`);
  return data;
}

/**
 * 수강 과목 조회 — **학생 코드(resource id) 우선, 이름은 폴백**(2026-07-27).
 * 이름은 LLM에 가지 않지만 조회 키로 쓰면 동명이인에 취약하고 이름 의존이 남는다.
 * `student_enrollment.student_resource_id`가 6,255/6,285행(99.5%)에 채워져 있어
 * 대부분 ID로 해결되고, 미보유 행(구 import)만 이름으로 되짚는다.
 */
async function loadEnrolledSubjects(
  supabase: SupabaseClient,
  studentId: string,
  studentName: string | null,
  grade: number
): Promise<Array<{ subject_name: string; semester: number; academic_year: number }>> {
  // ⚠️ `student_enrollment.student_resource_id` 는 **uuid** 이고 `studentId` 는 학적 코드(`00-00239`)다.
  //    종전엔 코드를 그대로 넣어 Postgres 가 `22P02 invalid input syntax for type uuid` 를 던졌고,
  //    바로 아래 `if (byId.error) throw` 가 **이름 폴백에 닿기 전에** 요청 전체를 죽였다
  //    (라이브 증상: AI 종합 분석이 두 공급자 모두에서 500. 탐구 설계는 이 경로를 안 써서 멀쩡했다).
  //    학적 코드 → resource uuid 는 `resource.meta->>'id'` 로 푼다(이 저장소의 학생 키 규약).
  const resourceRow = await supabase
    .from('resource')
    .select('id')
    .eq('type', 'student')
    .eq('meta->>id', studentId)
    .maybeSingle();
  const resourceId = (resourceRow.data as { id?: string } | null)?.id ?? null;

  let data: Array<{ subject_name: string; semester: number; academic_year: number }> | null = null;
  let error: { message: string } | null = null;

  if (resourceId) {
    const byId = await supabase
      .from('student_enrollment')
      .select('subject_name, semester, academic_year')
      .eq('student_resource_id', resourceId)
      .eq('student_grade', grade)
      .order('semester', { ascending: true })
      .order('subject_name', { ascending: true });
    if (byId.error) throw new Error(`enrollment fetch failed: ${byId.error.message}`);
    data = byId.data;
  }

  if (!data?.length) {
    // 이름 폴백은 `student_resource_id` 가 비어 있는 구 import 행을 위한 것이다.
    // 이름이 없으면 여기서 끝내되 **던지지 않는다** — 편성은 앵커 후보를 넓히는 보조 정보이고,
    // 없다고 해서 종합 분석 전체가 실패할 이유가 없다(종전엔 여기서 throw 했다).
    if (!studentName) return [];
    const byName = await supabase
      .from('student_enrollment')
      .select('subject_name, semester, academic_year')
      .eq('student_name', studentName)
      .eq('student_grade', grade)
      .order('semester', { ascending: true })
      .order('subject_name', { ascending: true });
    data = byName.data;
    error = byName.error;
  }
  if (error) throw new Error(`enrollment fetch failed: ${error.message}`);

  const seen = new Set<string>();
  const out: Array<{ subject_name: string; semester: number; academic_year: number }> = [];
  for (const row of data ?? []) {
    const key = `${row.subject_name}|${row.semester}|${row.academic_year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function loadKgVersion(
  supabase: SupabaseClient,
  studentId: string,
  pinnedVersionId?: string
): Promise<{ id: string }> {
  if (pinnedVersionId) {
    const { data, error } = await supabase
      .from('student_kg_versions')
      .select('id')
      .eq('id', pinnedVersionId)
      .eq('student_id', studentId)
      .single();
    if (error || !data) throw new Error(`KG version ${pinnedVersionId} not found for ${studentId}`);
    return data;
  }
  const { data, error } = await supabase
    .from('student_kg_versions')
    .select('id')
    .eq('student_id', studentId)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no KG version for student ${studentId}`);
  return data;
}

async function loadKgGraph(
  supabase: SupabaseClient,
  kgVersionId: string
): Promise<{ entities: KgEntityRow[]; relations: KgRelationRow[] }> {
  const [{ data: entities, error: entErr }, { data: relations, error: relErr }] = await Promise.all([
    supabase
      .from('student_kg_entities')
      .select('entity_id, label, type, properties')
      .eq('kg_version_id', kgVersionId),
    supabase
      .from('student_kg_relations')
      .select('source_entity_id, target_entity_id, relation_type, properties')
      .eq('kg_version_id', kgVersionId),
  ]);
  if (entErr) throw new Error(`entities fetch failed: ${entErr.message}`);
  if (relErr) throw new Error(`relations fetch failed: ${relErr.message}`);
  return {
    entities: (entities ?? []) as KgEntityRow[],
    relations: (relations ?? []) as KgRelationRow[],
  };
}

/**
 * 위생 단계에 주는 **시간 예산**. 엣지 함수 벽시간이 150초인데 준비는 LLM 을 두 번
 * (위생 검증 → 방향 분석) 연달아 부른다. 위생이 길어지면 정작 본체인 방향 분석이
 * 시작도 못 하고 전체가 504 로 끊긴다(실측: 두 번 다 ~150초).
 *
 * **위생은 보조 단계다** — 실패하면 원시 후보로 떨어지는 경로가 이미 있고 그 경우에도
 * 분석은 정상 동작한다. 그러니 여기서 시간을 양보하는 것이 맞다.
 */
const HYGIENE_BUDGET_MS = 45_000;

/**
 * **Solar 에서는 LLM 위생 검증을 건너뛴다** (2026-09-12, 실측 근거).
 *
 * 준비 단계는 LLM 을 두 번(위생 검증 → 방향 분석) 연달아 부르는데 엣지 함수 벽시간이
 * 150초다. pro4 는 같은 요청이 22~107초로 흔들려 두 번을 넣을 자리가 없다 —
 * 실측: 위생이 45초 예산을 다 쓰고 폴백해 전체 103초로 겨우 성공한 회차와,
 * 방향 분석이 85초를 넘겨 실패한 회차가 같은 학생에게서 함께 나왔다.
 *
 * 후보 **탐지**(임베딩 기반)는 그대로 한다 — 로컬 계산이라 빠르고, 화면이
 * `hygieneCandidates` 로 보여 준다. 건너뛰는 것은 **LLM 이 오탐을 걸러 주는 단계**뿐이다.
 *
 * ⚠️ **검증되지 않은 후보를 그래프에 적용하지 않는다.** 기존 폴백 경로는
 * 검증 실패 시 원시 후보를 그대로 적용했는데, 그건 드문 사고를 위한 임시 조치였다.
 * 한 공급자의 **상시 경로**로 삼으면 오탐으로 서로 다른 엔티티가 합쳐진 그래프를
 * 매번 분석하게 된다 — 그건 느린 것보다 나쁘다. Solar 는 원본 그래프로 분석한다.
 */
const SKIP_LLM_HYGIENE_FOR_SOLAR = true;

/**
 * 방향 분석의 시간 예산. 벽시간 150초에서 위생(45) + 데이터 로드·저장(~10)을 빼고 남긴 값.
 * 넘기면 게이트웨이가 **504 로 끊어 버려 본문 없는 오류**가 되는데, 그러면 화면이
 * 원인을 말할 수 없고 하루 한도만 소모된다. 우리가 먼저 끊고 읽을 수 있는 메시지를 준다.
 */
const DIRECTION_BUDGET_MS = 120_000;

/** 시간 안에 안 끝나면 던진다. 호출부의 기존 폴백이 그 예외를 받는다. */
function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    task,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 시간 초과(${ms / 1000}초)`)), ms)
    ),
  ]);
}

async function handlePrepare(supabase: SupabaseClient, body: PrepareBody, aiFetch: typeof fetch = fetch) {
  // 정리 검증기와 방향 분석 모두 같은 공급자로 돌린다 — 화면에서 Solar를 골랐는데
  // 파이프라인 절반이 조용히 OpenAI를 쓰면 선택이 반쪽짜리가 된다.
  const provider = normalizeProvider(body.aiProvider);
  const student = await loadStudent(supabase, body.studentId);
  const currentGrade = body.currentGrade ?? student.grade ?? 0;
  if (!currentGrade) {
    return json(400, { error: 'student current grade is unknown; pass currentGrade explicitly' });
  }
  // 이름은 더 이상 필수가 아니다 — 수강 조회의 1순위 키가 학생 코드로 바뀌었다
  const version = await loadKgVersion(supabase, body.studentId, body.kgVersionId);
  const graph = await loadKgGraph(supabase, version.id);
  const enrolled = await loadEnrolledSubjects(supabase, body.studentId, student.name, currentGrade);

  // ── Hygiene pass: embedding candidates → LLM verifier → apply ──
  let hygiene: HygieneFindings = { duplicate_clusters: [], missing_edges: [] };
  let candidatesBeforeVerify: HygieneFindings = { duplicate_clusters: [], missing_edges: [] };
  let verifierReport: VerificationReport | null = null;
  let embeddingsGenerated = 0;
  let hygieneError: string | null = null;
  let workingEntities = graph.entities;
  let workingRelations = graph.relations;

  if (!body.skipHygiene) {
    try {
      const { embeddings, generated } = await withTimeout(
        ensureEmbeddings(supabase, version.id, graph.entities, aiFetch),
        HYGIENE_BUDGET_MS,
        '임베딩 생성'
      );
      embeddingsGenerated = generated;
      candidatesBeforeVerify = detectHygiene(graph.entities, graph.relations, embeddings);

      if (SKIP_LLM_HYGIENE_FOR_SOLAR && isSolarProvider(body.aiProvider)) {
        // 후보는 화면에 보여 주되 **적용하지 않는다**. 검증을 안 거친 후보를 적용하면
        // 오탐으로 서로 다른 엔티티가 합쳐진 그래프를 분석하게 된다.
        hygieneError = 'Solar: 정리 검증 건너뜀(벽시간 예산) — 후보만 표시하고 그래프는 원본을 씁니다.';
      } else {
        // LLM verifier prunes false positives. Best-effort: if it fails, fall back
        // to raw candidate set so the rest of the pipeline still works.
        try {
          const verified = await withTimeout(
            verifyHygiene(candidatesBeforeVerify, provider, aiFetch),
            HYGIENE_BUDGET_MS,
            '정리 검증'
          );
          hygiene = verified.hygiene;
          verifierReport = verified.report;
        } catch (verErr) {
          const msg = verErr instanceof Error ? verErr.message : String(verErr);
          console.error('verifier failed; using raw candidates:', msg);
          hygiene = candidatesBeforeVerify;
          hygieneError = `verifier: ${msg}`;
        }

        const applied = applyHygiene(graph.entities, graph.relations, hygiene);
        workingEntities = applied.entities;
        workingRelations = applied.relations;
      }
    } catch (err) {
      hygieneError = err instanceof Error ? err.message : String(err);
      console.error('hygiene step failed; falling back to raw graph:', hygieneError);
    }
  }

  const metrics = computeMetrics(workingEntities, workingRelations);
  const enrolledNames = enrolled.map((e) => e.subject_name);

  // LLM-driven improvement direction analysis. Replaces the previous heuristic
  // weakness detector — activity counts alone are not treated as a weakness
  // because the extraction pipeline reliably surfaces activity entities.
  let directions: Awaited<ReturnType<typeof analyzeImprovementDirections>>['directions'] = [];
  let directionTokenUsage:
    | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    | null = null;
  let directionModel: string | null = null;
  let directionError: string | null = null;
  try {
    const analysis = await withTimeout(
      analyzeImprovementDirections(
        {
          currentGrade,
          enrolledSubjectNames: enrolledNames,
          entities: workingEntities,
          relations: workingRelations,
          userGuidance: body.userGuidance,
        },
        provider,
        aiFetch
      ),
      DIRECTION_BUDGET_MS,
      '방향 분석'
    );
    directions = analysis.directions;
    directionTokenUsage = analysis.tokenUsage;
    directionModel = analysis.model;
  } catch (e) {
    directionError = e instanceof Error ? e.message : String(e);
    console.error('direction analysis failed:', directionError);
    return json(500, { error: `direction analysis failed: ${directionError}` });
  }

  const { data: upserted, error: upsertErr } = await supabase.rpc(
    'upsert_inquiry_recommendation_prepare',
    {
      p_student_id: body.studentId,
      p_kg_version_id: version.id,
      p_metrics: metrics,
      // The JSONB column is still called `weaknesses` in DB; we store the new
      // ImprovementDirection[] shape into it.
      p_weaknesses: directions,
      p_enrolled_subjects: enrolled,
      p_current_grade: currentGrade,
      p_formula_version: FORMULA_VERSION,
      p_hygiene_findings: hygiene,
    }
  );
  if (upsertErr) {
    return json(500, { error: `upsert failed: ${upsertErr.message}` });
  }

  return json(200, {
    recommendationId: upserted,
    studentId: body.studentId,
    kgVersionId: version.id,
    currentGrade,
    metrics,
    directions,
    directionTokenUsage,
    directionModel,
    hygieneFindings: hygiene,
    hygieneCandidates: candidatesBeforeVerify,
    verifierReport,
    enrolledSubjects: enrolled,
    formulaVersion: FORMULA_VERSION,
    embeddingsGenerated,
    hygieneError,
    preparedAt: new Date().toISOString(),
  });
}

/**
 * AI 종합 분석 하루 상한 (2026-09-12 사용자 지시). 클라이언트 짝 = `COMPREHENSIVE_DAILY_LIMIT`.
 * **서버가 정본이다** — 화면 버튼만 막으면 막은 것이 아니다.
 */
const COMPREHENSIVE_DAILY_LIMIT = 5;

async function handleGenerate(supabase: SupabaseClient, body: GenerateBody, aiFetch: typeof fetch = fetch) {
  const provider = normalizeProvider(body.aiProvider);

  // 1. Load the prepared recommendation row (carries metrics + weaknesses + KG version).
  const { data: rec, error: recErr } = await supabase
    .from('student_inquiry_recommendations')
    .select('*')
    .eq('id', body.recommendationId)
    .single();
  if (recErr || !rec) return json(404, { error: `recommendation ${body.recommendationId} not found` });

  // 1-1. 하루 상한. `GenerateBody` 에는 학생 id 가 없으므로 **행을 읽은 뒤**에 센다.
  //      세는 단위는 결과물을 만든 횟수(`generated_at`)라 준비 단계는 세지 않는다.
  //      RPC 안에서 학생 접근 권한도 함께 검사한다.
  const { data: usedRaw, error: quotaErr } = await supabase.rpc(
    'count_comprehensive_analysis_calls',
    { p_student_id: rec.student_id },
  );
  if (quotaErr) return json(500, { error: `quota check failed: ${quotaErr.message}` });
  const used = typeof usedRaw === 'number' ? usedRaw : 0;
  if (used >= COMPREHENSIVE_DAILY_LIMIT) {
    // 429 + `quota` — 클라이언트가 이미 이 모양을 읽어 메시지 끝에 사용량을 붙인다.
    return json(429, {
      error: 'DAILY_LIMIT_EXCEEDED',
      message: `오늘 AI 종합 분석 사용 한도(${COMPREHENSIVE_DAILY_LIMIT}회)를 모두 썼습니다.`,
      quota: { used, limit: COMPREHENSIVE_DAILY_LIMIT, remaining: 0 },
    });
  }

  // 2. Filter improvement directions to teacher-selected subset. The DB column
  // is still named `weaknesses` for backwards compatibility, but holds the
  // ImprovementDirection[] shape now.
  const allDirections = (rec.weaknesses ?? []) as Array<{
    id: string;
    summary: string;
    detail: string;
    related_entity_ids: string[];
    suggested_anchor_subjects: string[];
    priority: number;
  }>;
  const selectedDirections = allDirections.filter((d) =>
    body.selectedWeaknessIds.includes(d.id)
  );
  if (selectedDirections.length === 0) {
    return json(400, { error: 'no matching directions for selectedWeaknessIds' });
  }

  // 3. KG 엔티티 로드(생성 근거). 예전에는 학생 이름도 함께 읽어 존재 여부만 검사했는데
  //    생성 프롬프트는 이름을 쓰지 않으므로(2026-07-27 확인) 그 조회를 없앴다 —
  //    쓰지 않을 식별정보는 애초에 읽지 않는다.
  const { data: entities } = await supabase
    .from('student_kg_entities')
    .select('entity_id, label, type, properties')
    .eq('kg_version_id', rec.kg_version_id);

  const metrics = rec.metrics ?? {};
  const enrolledNames = Array.isArray(rec.enrolled_subjects)
    ? (rec.enrolled_subjects as Array<{ subject_name: string }>).map((e) => e.subject_name)
    : [];

  // 4. Generate via LLM.
  let result;
  try {
    result = await generateRecommendations(
      {
        currentGrade: rec.current_grade,
        enrolledSubjectNames: enrolledNames,
        selectedDirections,
        selectedAnchorSubjects: body.selectedAnchorSubjects,
        userNotes: body.userNotes ?? '',
        kgEntities: (entities ?? []) as KgEntityRow[],
        threads: (metrics.threadCoverage ?? []) as Array<{ label: string; activityCount: number; sourceSubjects: string[] }>,
        interests: (metrics.interestCoverage ?? []) as Array<{ label: string; activityCount: number; bookCount: number }>,
        competencies: (metrics.competencyCoverage ?? []) as Array<{ label: string; subjectCount: number; subjects: string[] }>,
      },
      provider,
      aiFetch
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('generate failed:', msg);
    return json(500, { error: `LLM generate failed: ${msg}` });
  }

  // 5. Persist via RPC.
  const { error: setErr } = await supabase.rpc('set_inquiry_recommendation_generated', {
    p_id: body.recommendationId,
    p_selected_weakness_ids: body.selectedWeaknessIds,
    p_selected_anchor_subjects: body.selectedAnchorSubjects,
    p_user_notes: body.userNotes ?? '',
    p_recommendations: result.recommendations,
    p_ai_provider: provider,
    p_ai_model: result.model,
    p_token_usage: result.tokenUsage,
  });
  if (setErr) {
    return json(500, { error: `persist failed: ${setErr.message}` });
  }

  return json(200, {
    recommendationId: body.recommendationId,
    recommendations: result.recommendations,
    aiProvider: result.provider,
    aiModel: result.model,
    tokenUsage: result.tokenUsage,
    invalidEntityRefs: result.invalidEntityRefs,
    invalidAnchors: result.invalidAnchors,
    generatedAt: new Date().toISOString(),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method not allowed' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'missing Authorization' });

  let supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

  // AI 기록 — 사용자 id 는 토큰에서 읽기만 한다(검증은 아래 RLS 호출이 한다)
  const startedAt = Date.now();
  const tagged = body as RequestBody & { aiLog?: unknown; studentId?: unknown };
  const logCtx = aiLogContext('inquiry-comprehensive', 'inquiry-design', tagged.aiLog, {
    action: `comprehensive.${String((body as { mode?: unknown }).mode ?? 'unknown')}`,
    userId: jwtSubject(authHeader),
    studentId: typeof tagged.studentId === 'string' ? tagged.studentId : null,
  });
  const aiFetch = aiLogFetch(logCtx);
  try {
    if ((body as RequestBody & { academyExperience?: boolean }).academyExperience === true) {
      const {data:{user},error}=await supabase.auth.getUser();
      if(error || !user) return json(401,{error:'Login required'});
      await requireExperience(supabase,user.id);
      if(body.mode==='prepare') { if(body.studentId!==experienceStudent) return json(403,{error:'Invalid experience template'}); body.skipHygiene=true; }
      supabase=experienceClient(supabase);
    }
    if (body.mode === 'prepare') return await withAiFailureLog(logCtx, await handlePrepare(supabase, body, aiFetch), startedAt);
    if (body.mode === 'generate') return await withAiFailureLog(logCtx, await handleGenerate(supabase, body, aiFetch), startedAt);
    return json(400, { error: 'unknown mode' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('inquiry-comprehensive error:', msg);
    logAiRequestFailure(logCtx, msg, { startedAt, httpStatus: 500 });
    return json(500, { error: msg });
  }
});
