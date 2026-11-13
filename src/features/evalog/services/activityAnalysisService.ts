/**
 * AI Activity Analysis Service
 * Solar Pro 4 기반 학생 세부능력및특기사항 분석
 */
import { supabase } from '@/integrations/supabase/client';
import { throwEdgeFunctionError } from '@/utils/edgeFunctionError';
import { reasoningEffortFor } from '@/services/aiChat';
import { aiLogTag } from '@/services/aiLogTag';
import type {
  AnalysisResult,
  AnalysisFilter,
  AnalysisStats,
  ActivityWithAnalysis,
  AnalysisProgress,
} from '../types/analysis';

const ANALYSIS_VERSION = 1;
// 분석 결과 JSONB의 `model`에 그대로 기록된다 — 기존 행은 예전 모델명을 유지한다.
// (2026-09-21 사용자 지시로 `solar-pro3` → `solar-pro4`. 이미 저장된 행은 손대지 않았으므로
//  분석 이력에는 두 모델명이 공존한다 — 모델별로 결과를 비교할 때 이 경계를 볼 것.)
const MODEL_NAME = 'solar-pro4';

// ─── Stability Configuration ─────────────────
const RATE_LIMIT_DELAY_MS = 600;        // 기본 딜레이 (100 RPM 기준)
const MAX_RETRIES = 3;                   // 레코드당 최대 재시도
const INITIAL_BACKOFF_MS = 1000;         // 첫 재시도 대기 (1초)
const MAX_BACKOFF_MS = 15000;            // 최대 백오프 (15초)
const CONSECUTIVE_FAIL_LIMIT = 5;        // 연속 실패 시 자동 중단
const CHUNK_SIZE = 20;                   // 청크 크기 (매 N건마다 휴식)
const CHUNK_PAUSE_MS = 3000;             // 청크 간 휴식 시간 (3초)
/**
 * 개별 요청 타임아웃. **2026-09-23 에 180초 → 60초** (추론을 끄면서 함께 내렸다).
 *
 * 값의 역사가 이 자리의 함정을 그대로 보여 준다 —
 *   · 2026-05-19: 30초. 그때의 Solar 는 추론 모델이 아니었다.
 *   · 2026-09-21: 180초. pro4 + `reasoningEffort: 'medium'` 이 45~93초가 나와 30초를 넘겼다.
 *     **그런데 180초는 엣지 게이트웨이(약 150초)보다 크다** — 이 타임아웃이 걸리기 전에
 *     프록시가 먼저 504를 낸다. 즉 상한을 올린 것이 문제를 옮겨 놓기만 했다.
 *   · 2026-09-23: 추론을 끄고(아래) 60초. 실측 **4.4초**라 15배 여유이고,
 *     **게이트웨이보다 낮아** 시간을 넘기면 우리 메시지가 먼저 나간다.
 *
 * ⚠️ 이 값을 다시 올려야 할 것 같으면, 올리기 전에 **추론 강도부터 의심할 것.**
 *    게이트웨이 150초 위로 올리는 것은 언제나 무의미하다.
 */
const REQUEST_TIMEOUT_MS = 60000;        // 개별 요청 타임아웃 (60초)
const PAGE_SIZE = 1000;                  // Supabase 페이지네이션 단위

// ─── Paginated Fetch Helper ─────────────────

/** Supabase 1000건 제한을 우회하여 모든 행을 페이지네이션으로 가져오기 */
async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => any
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;

    const rows = (data || []) as T[];
    allRows.push(...rows);

    // 가져온 행이 PAGE_SIZE보다 적으면 마지막 페이지
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

// ─── Stats ────────────────────────────────────

export async function getAnalysisStats(filter: AnalysisFilter): Promise<AnalysisStats> {
  // count만 가져올 때는 head:true + count:'exact' 사용
  let countQuery = supabase
    .from('student_detailed_activities' as any)
    .select('id', { count: 'exact', head: true })
    .neq('content', '');
  countQuery = applyFilter(countQuery, filter);

  const { count: totalCount, error: countError } = await countQuery;
  if (countError) throw countError;

  // 분석 완료 건수
  let analyzedQuery = supabase
    .from('student_detailed_activities' as any)
    .select('id', { count: 'exact', head: true })
    .neq('content', '')
    .not('analysis', 'is', null);
  analyzedQuery = applyFilter(analyzedQuery, filter);

  const { count: analyzedCount, error: analyzedError } = await analyzedQuery;
  if (analyzedError) throw analyzedError;

  const total = totalCount ?? 0;
  const analyzed = analyzedCount ?? 0;

  return {
    total,
    analyzed,
    unanalyzed: total - analyzed,
  };
}

// ─── Fetch Activities ─────────────────────────

export async function fetchActivitiesForAnalysis(
  filter: AnalysisFilter
): Promise<ActivityWithAnalysis[]> {
  const rows = await fetchAllRows((from, to) => {
    let query = supabase
      .from('student_detailed_activities' as any)
      .select('id, student_id, grade, semester, category, subject_name, content, analysis')
      .neq('content', '')
      .order('student_id')
      .order('grade')
      .order('category')
      .range(from, to);

    query = applyFilter(query, filter);

    if (filter.onlyUnanalyzed) {
      query = query.is('analysis', null);
    }

    return query;
  });

  return rows.map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    grade: row.grade,
    semester: row.semester,
    category: row.category,
    subject_name: row.subject_name,
    content: row.content,
    analysis: row.analysis,
  }));
}

// ─── Fetch Student Analyses ───────────────────

export async function fetchStudentAnalyses(
  studentId: string
): Promise<ActivityWithAnalysis[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from('student_detailed_activities' as any)
      .select('id, student_id, grade, semester, category, subject_name, content, analysis')
      .eq('student_id', studentId)
      .neq('content', '')
      .order('grade')
      .order('category')
      .range(from, to)
  );

  return rows.map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    grade: row.grade,
    semester: row.semester,
    category: row.category,
    subject_name: row.subject_name,
    content: row.content,
    analysis: row.analysis,
  }));
}

// ─── Single Content Analysis (with timeout) ──

export async function analyzeContent(
  content: string,
  category: string,
  subjectName: string
): Promise<AnalysisResult> {
  const systemPrompt = buildSystemPrompt(category);
  const userPrompt = buildUserPrompt(content, category, subjectName);

  const result = await withTimeout(
    supabase.functions.invoke('solar-proxy', {
      body: {
        action: 'chatCompletion',
        aiLog: aiLogTag('활동 분석'),
        systemPrompt,
        userPrompt,
        model: MODEL_NAME,
        temperature: 0.3,
        /**
         * **추출 과제다** — 세특 원문에서 what/keywords/summary 를 뽑아 JSON 으로 옮겨 적는다.
         *
         * `'medium'` 은 2026-05-19 에 정해진 뒤 pro3·pro4 어느 쪽으로도 재지 않은 채 남아
         * 있었다. 2026-09-23 실측(라이브 p90 길이 616자): `'medium'` **157.7초**(추론 83%)
         * ↔ `'none'` **4.4초**(추론 0) 이고 출력 필드는 동등했다.
         *
         * ★ **157.7초는 엣지 게이트웨이(약 150초)를 이미 넘는다** — 하네스는 Upstage 를
         *   직접 때려 "통과"로 보였지만 앱은 `solar-proxy` 를 거치므로 **504** 다. 게다가
         *   `batchAnalyze` 가 무조건 3회 재시도하므로 한 건에 약 10분을 쓰고, 연속 5건
         *   실패면 자동 중단한다. 즉 일괄 분석이 사실상 시작하자마자 멈추는 상태였다.
         *
         * 값은 `aiChat.reasoningEffortFor` 가 소유한다(측정된 조합만 담는 표). 여기에
         * 숫자를 적어 두면 모델이 바뀔 때 또 근거 없이 이월된다.
         */
        reasoningEffort: reasoningEffortFor('extraction', 'solar', MODEL_NAME),
      },
    }),
    REQUEST_TIMEOUT_MS,
    `Solar API 요청 타임아웃 (${REQUEST_TIMEOUT_MS / 1000}초)`
  );

  const { data, error } = result;
  if (error) await throwEdgeFunctionError(error, 'Solar 분석 실패');
  if (data?.error) throw new Error(data.error);

  const resultText = data.result || '';
  return parseAnalysisResponse(resultText);
}

// ─── Batch Analysis (with retry, circuit breaker, chunk pause) ──

export async function batchAnalyze(
  filter: AnalysisFilter,
  onProgress: (progress: AnalysisProgress) => void,
  abortSignal?: AbortSignal
): Promise<AnalysisProgress> {
  const activities = await fetchActivitiesForAnalysis(filter);

  // 학생 이름 조회
  const studentIds = [...new Set(activities.map(a => a.student_id))];
  const nameMap = await fetchStudentNames(studentIds);

  const progress: AnalysisProgress = {
    current: 0,
    total: activities.length,
    status: 'analyzing',
    successCount: 0,
    failCount: 0,
    skipCount: 0,
    retryAttempt: 0,
    consecutiveFailures: 0,
  };

  onProgress(progress);

  let consecutiveFailures = 0;
  let processedInChunk = 0;

  for (let i = 0; i < activities.length; i++) {
    // ── Abort check ──
    if (abortSignal?.aborted) {
      progress.status = 'cancelled';
      onProgress(progress);
      return progress;
    }

    // ── Circuit breaker: 연속 실패 한도 초과 ──
    if (consecutiveFailures >= CONSECUTIVE_FAIL_LIMIT) {
      console.error(`[AIAnalysis] ${CONSECUTIVE_FAIL_LIMIT}회 연속 실패 — 자동 중단`);
      progress.status = 'error';
      progress.consecutiveFailures = consecutiveFailures;
      onProgress(progress);
      return progress;
    }

    // ── Chunk pause: 매 N건마다 쉬어가기 ──
    if (processedInChunk >= CHUNK_SIZE && i < activities.length) {
      progress.status = 'paused';
      progress.chunkPauseRemaining = CHUNK_PAUSE_MS;
      onProgress(progress);

      await delay(CHUNK_PAUSE_MS);
      processedInChunk = 0;

      progress.chunkPauseRemaining = 0;
    }

    const activity = activities[i];
    progress.current = i + 1;
    progress.currentStudentName = nameMap.get(activity.student_id) || activity.student_id;
    progress.currentSubject = activity.subject_name || activity.category;
    progress.retryAttempt = 0;
    progress.status = 'analyzing';
    onProgress(progress);

    // 이미 분석된 레코드 스킵 (재분석 모드가 아닌 경우)
    if (activity.analysis && filter.onlyUnanalyzed !== false) {
      progress.skipCount++;
      onProgress(progress);
      continue;
    }

    // ── Retry loop with exponential backoff ──
    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (abortSignal?.aborted) {
        progress.status = 'cancelled';
        onProgress(progress);
        return progress;
      }

      try {
        if (attempt > 0) {
          const backoffMs = Math.min(
            INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1),
            MAX_BACKOFF_MS
          );
          console.log(`[AIAnalysis] Retry ${attempt}/${MAX_RETRIES} after ${backoffMs}ms`);
          progress.status = 'retrying';
          progress.retryAttempt = attempt;
          onProgress(progress);
          await delay(backoffMs);
        }

        const result = await analyzeContent(
          activity.content,
          activity.category,
          activity.subject_name
        );

        // 즉시 DB 저장 (중단 시에도 진행분 보존)
        progress.status = 'saving';
        onProgress(progress);

        await saveAnalysis(activity.id, result);
        progress.successCount++;
        consecutiveFailures = 0; // 성공 시 연속 실패 카운트 리셋
        success = true;
        break;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[AIAnalysis] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${activity.id}: ${errMsg}`);

        if (attempt === MAX_RETRIES) {
          // 모든 재시도 소진
          console.error(`[AIAnalysis] All retries exhausted for ${activity.id}`);
          progress.failCount++;
          consecutiveFailures++;
          progress.consecutiveFailures = consecutiveFailures;
        }
      }
    }

    progress.retryAttempt = 0;
    onProgress(progress);
    processedInChunk++;

    // Rate limit 준수 (마지막 아이템은 딜레이 불필요)
    if (i < activities.length - 1 && success) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  progress.status = 'done';
  progress.consecutiveFailures = 0;
  onProgress(progress);
  return progress;
}

// ─── Save Analysis ────────────────────────────

async function saveAnalysis(activityId: string, result: AnalysisResult): Promise<void> {
  const { error } = await supabase
    .from('student_detailed_activities' as any)
    .update({ analysis: result })
    .eq('id', activityId);

  if (error) throw error;
}

// ─── Student Name Lookup ──────────────────────

async function fetchStudentNames(studentIds: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (studentIds.length === 0) return nameMap;

  // studentIds가 많을 수 있으므로 청크 단위로 조회
  const CHUNK = 500;
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const chunk = studentIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('student_basic_info' as any)
      .select('id, name')
      .in('id', chunk);

    (data || []).forEach((row: any) => {
      nameMap.set(row.id, row.name);
    });
  }

  return nameMap;
}

// ─── Prompt Builder ───────────────────────────

function buildSystemPrompt(category: string): string {
  const baseRole = `당신은 한국 고등학교 학생부 기록 분석 전문가입니다. 학생의 세부능력및특기사항 텍스트를 분석하여 구조화된 JSON으로 응답합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트를 포함하지 마세요.
{
  "what": ["활동/학습 내용 (무엇을 했는지)"],
  "why": ["활동 목적/의미 (왜 했는지, 텍스트에서 추론)"],
  "how": ["방법/과정 (어떻게 했는지)"],
  "keywords": ["핵심 키워드 3-7개"],
  "competencies": ["역량 태그 2-5개"],
  "summary": "한줄 요약 (30자 이내)"
}`;

  const categoryGuide: Record<string, string> = {
    regular: `
분석 관점 (교과 세부능력및특기사항):
- what: 학습한 주요 개념, 수행한 과제/발표/실험 등
- why: 학습 동기, 탐구 목적, 교과 연계 의미
- how: 학습 방법, 탐구 과정, 협업 방식
- competencies: 교과역량 (예: 비판적사고력, 문제해결력, 의사소통능력, 자기주도학습, 탐구력, 창의성, 정보활용능력)`,
    자율활동: `
분석 관점 (자율활동):
- what: 참여한 자율활동, 학교 행사, 자치 활동 등
- why: 참여 동기, 학교생활 기여, 자기발전 목적
- how: 활동 방식, 역할, 기여도
- competencies: 자율역량 (예: 리더십, 자기관리, 공동체의식, 협업능력, 책임감)`,
    동아리활동: `
분석 관점 (동아리활동):
- what: 동아리 활동 내용, 프로젝트, 발표 등
- why: 관심 분야 탐구, 진로 연계, 자기성장
- how: 활동 방식, 역할 분담, 성과 도출 과정
- competencies: 동아리역량 (예: 전문성, 협업능력, 창의성, 탐구력, 리더십)`,
    진로활동: `
분석 관점 (진로활동):
- what: 진로 탐색 활동, 진로 관련 경험
- why: 진로 목표, 직업 탐색 동기
- how: 탐색 방법, 체험 과정, 성찰 방식
- competencies: 진로역량 (예: 진로탐색능력, 자기이해, 직업이해, 목표설정, 계획수립)`,
    '행동특성및종합의견': `
분석 관점 (행동특성및종합의견):
- what: 관찰된 행동 특성, 성격적 강점
- why: 행동의 배경, 성장 맥락
- how: 학교생활 방식, 대인관계 패턴, 성장 과정
- competencies: 인성역량 (예: 성실성, 배려심, 리더십, 자기조절, 긍정성, 책임감)`,
  };

  const guide = categoryGuide[category] || categoryGuide['regular'];
  return baseRole + guide;
}

function buildUserPrompt(content: string, category: string, subjectName: string): string {
  const label = subjectName ? `[${category}] ${subjectName}` : `[${category}]`;
  return `다음 ${label} 기록을 분석해주세요:\n\n${content}`;
}

// ─── Response Parser ──────────────────────────

function parseAnalysisResponse(text: string): AnalysisResult {
  // JSON 블록 추출 (```json ... ``` 또는 { ... } 직접)
  let jsonStr = text;

  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // { } 블록만 추출
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonStr = braceMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      version: ANALYSIS_VERSION,
      analyzed_at: new Date().toISOString(),
      model: MODEL_NAME,
      what: ensureStringArray(parsed.what),
      why: ensureStringArray(parsed.why),
      how: ensureStringArray(parsed.how),
      keywords: ensureStringArray(parsed.keywords),
      competencies: ensureStringArray(parsed.competencies),
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    };
  } catch {
    // Fallback: 파싱 실패 시 전체 텍스트를 summary로
    console.warn('[AIAnalysis] JSON parse failed, using fallback');
    return {
      version: ANALYSIS_VERSION,
      analyzed_at: new Date().toISOString(),
      model: MODEL_NAME,
      what: [],
      why: [],
      how: [],
      keywords: [],
      competencies: [],
      summary: text.slice(0, 100),
    };
  }
}

// ─── Delete Operations ──────────────────────────

/** 분석 결과만 초기화 (analysis JSONB → null) */
export async function clearAnalysisResult(activityId: string): Promise<void> {
  const { error } = await supabase
    .from('student_detailed_activities' as any)
    .update({ analysis: null })
    .eq('id', activityId);

  if (error) throw error;
}

/** 활동 레코드 자체를 삭제 */
export async function deleteActivityRecord(activityId: string): Promise<void> {
  const { error } = await supabase
    .from('student_detailed_activities' as any)
    .delete()
    .eq('id', activityId);

  if (error) throw error;
}

// ─── Helpers ──────────────────────────────────

function ensureStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  return [];
}

/**
 * 현재 학년(1,2,3)을 입학연도 2자리로 변환
 * 학생 ID 형식: yy-gccnn (yy=입학연도)
 * 현재 학년 = 현재연도 - 입학연도 + 1
 * → 입학연도 = 현재연도 - 현재학년 + 1
 */
function getEnrollmentYearPrefix(currentGrade: number): string {
  const currentYear = new Date().getFullYear();
  const enrollmentYear = (currentYear - currentGrade + 1) % 100;
  return `${String(enrollmentYear).padStart(2, '0')}-`;
}

function applyFilter(query: any, filter: AnalysisFilter): any {
  if (filter.grade !== undefined && filter.grade !== null) {
    if (filter.grade >= 1 && filter.grade <= 3) {
      // 현재 학년 기준: student_id 입학연도 prefix로 필터
      const prefix = getEnrollmentYearPrefix(filter.grade);
      query = query.like('student_id', `${prefix}%`);
    } else if (filter.grade === 0) {
      // 졸업생: 현재 1~3학년이 아닌 학생
      const g1 = getEnrollmentYearPrefix(1);
      const g2 = getEnrollmentYearPrefix(2);
      const g3 = getEnrollmentYearPrefix(3);
      query = query
        .not('student_id', 'like', `${g1}%`)
        .not('student_id', 'like', `${g2}%`)
        .not('student_id', 'like', `${g3}%`);
    }
  }
  if (filter.semester) {
    query = query.eq('semester', filter.semester);
  }
  if (filter.category) {
    query = query.eq('category', filter.category);
  }
  if (filter.studentId) {
    query = query.eq('student_id', filter.studentId);
  }
  return query;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Promise에 타임아웃을 적용하는 래퍼 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(val => { clearTimeout(timer); resolve(val); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}
