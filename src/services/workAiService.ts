// ========================================
// 업무 진행 화면의 AI 버튼 — 호출·캐시·수락 기록 (2026-09-27)
//
// 프롬프트·검증은 src/lib/workAi.ts(단일 출처). 여기는 ①같은 입력이면 다시 부르지 않고(캐시)
// ②부르면 토큰·시간·finish 를 남기고 ③사람의 [적용]/[무시]를 기록한다(= AI 칸별 수락률).
// 근거 = docs/plans/2026-09-27-task-automation-research.md §8
//
// ⚠️ 적대적 검증(2026-09-27)이 잡은 것:
//   · 응답을 못 읽으면 **던지고 캐시하지 않는다** — 종전엔 «지적 없음»으로 보이고 7일 동안 그대로 캐시됐다
//   · 캐시 키에 **모델**이 들어간다 — 모델을 바꾸면 옛 결과를 돌려주지 않는다
//   · 결정은 RPC 로 **원자적으로** 병합한다 — 빠른 두 번의 클릭이 서로를 지우지 않게
// ========================================

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { aiChatDetailed, isAiChatTimeoutError, reasoningEffortFor, resolveAiChatModel } from '@/services/aiChat';
import {
  TABLE_TIDY_PROMPT_VERSION,
  TABLE_TIDY_SYSTEM_PROMPT,
  TABLE_TO_TEXT_PROMPT_VERSION,
  TABLE_TO_TEXT_SYSTEM_PROMPT,
  WORK_CHECK_PROMPT_VERSION,
  WORK_CHECK_SYSTEM_PROMPT,
  buildTableTidyInput,
  buildTableToTextInput,
  distinctColumnValues,
  hashInput,
  parseTableTidy,
  parseTableToText,
  parseWorkCheck,
  sanitizeForModel,
  unverifiedNumbers,
  wrapData,
  type SuggestionDecision,
  type TidyGroup,
  type WorkAiKind,
  type WorkCheckAiFinding,
  type WorkCheckParse,
} from '@/lib/workAi';
import type { OutputTable } from '@/lib/workPipeline';

/** 같은 입력의 결과를 다시 쓰는 기간 — 업무 설정은 하루 안에 자주 바뀌지 않는다 */
const CACHE_DAYS = 7;
/** 게이트웨이(약 150초)보다 먼저 포기한다 — 504 대신 우리 문장이 나가게(CLAUDE.md LLM 절) */
const AI_TIMEOUT_MS = 100_000;

export interface AiSuggestionRecord<T> {
  id: string;
  kind: WorkAiKind;
  result: T;
  decisions: Record<string, SuggestionDecision>;
  cached: boolean;
  /** 기록에 실패했으면 그 까닭 — 결과는 쓸 수 있지만 [적용]/[무시]가 남지 않는다 */
  recordError?: string;
  usage: { seconds?: number; promptTokens?: number; completionTokens?: number; finishReason?: string | null };
  createdAt: string;
}

/** 캐시 키 — 입력 + 프롬프트 버전 + **모델** */
const cacheKey = (kind: WorkAiKind, input: unknown, version: string) =>
  hashInput(kind, { input, model: resolveAiChatModel() }, version);

async function findCached<T>(kind: WorkAiKind, inputHash: string, restoreDecisions: boolean): Promise<AiSuggestionRecord<T> | null> {
  const since = new Date(Date.now() - CACHE_DAYS * 86400_000).toISOString();
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('task_ai_suggestion')
    .select('id, kind, result, decisions, usage, created_at')
    .eq('created_by', uid)
    .eq('kind', kind)
    .eq('input_hash', inputHash)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  const row = data[0];
  return {
    id: row.id,
    kind,
    result: row.result as T,
    decisions: restoreDecisions ? ((row.decisions ?? {}) as Record<string, SuggestionDecision>) : {},
    usage: (row.usage ?? {}) as AiSuggestionRecord<T>['usage'],
    cached: true,
    createdAt: row.created_at,
  };
}

async function record<T>(input: {
  workId: string;
  taskId: string | null;
  kind: WorkAiKind;
  inputHash: string;
  model: string;
  result: T;
  usage: AiSuggestionRecord<T>['usage'] & Record<string, unknown>;
}): Promise<AiSuggestionRecord<T>> {
  const { data, error } = await supabase
    .from('task_ai_suggestion')
    .insert({
      work_id: input.workId,
      task_id: input.taskId,
      kind: input.kind,
      input_hash: input.inputHash,
      model: input.model,
      result: input.result as unknown as Json,
      usage: input.usage as unknown as Json,
    })
    .select('id, created_at')
    .single();
  // 기록 실패는 결과를 버릴 이유가 아니다 — 결정은 남지 않지만 화면은 쓸 수 있게 돌려주고 까닭을 싣는다
  return {
    id: data?.id ?? `local-${Date.now()}`,
    kind: input.kind,
    result: input.result,
    decisions: {},
    usage: input.usage,
    cached: false,
    createdAt: data?.created_at ?? new Date().toISOString(),
    ...(error ? { recordError: error.message } : {}),
  };
}

async function callModel(systemPrompt: string, input: unknown, errorPrefix: string, signal?: AbortSignal) {
  const started = Date.now();
  try {
    const res = await aiChatDetailed({
      systemPrompt,
      // 자료는 구분자 안에 — 다른 교직원이 쓴 글의 지시문을 따르지 않게(프롬프트가 그렇게 말한다)
      userPrompt: wrapData(input),
      temperature: 0.2,
      // 추론 끔 — 추출·대조 과제. 실측(연구 문서 §5): low 는 오탐·의역 인용을 새로 만들었다
      reasoningEffort: reasoningEffortFor('extraction'),
      timeoutMs: AI_TIMEOUT_MS,
      signal,
      errorPrefix,
    });
    // 잘린 응답은 «지적 없음»이 아니다
    if (res.finishReason === 'length') {
      throw new Error(`${errorPrefix}: 응답이 중간에 끊겼습니다. 자료를 줄여 다시 시도하세요.`);
    }
    return {
      text: res.text,
      model: res.model,
      usage: {
        seconds: Math.round((Date.now() - started) / 100) / 10,
        promptTokens: res.usage?.promptTokens,
        completionTokens: res.usage?.completionTokens,
        finishReason: res.finishReason,
      },
    };
  } catch (e) {
    if (isAiChatTimeoutError(e)) {
      throw new Error(`${errorPrefix}: 시간이 너무 오래 걸려 멈췄습니다. 자료를 줄여 다시 시도하세요.`);
    }
    throw e;
  }
}

// ── ① 업무 점검 ─────────────────────────────────────────────────────────────

export interface WorkCheckResult {
  findings: WorkCheckAiFinding[];
  /** 버린 까닭별 개수 — 화면이 «근거 없음»과 «입력 양식 없음»과 «지시문 섞임»을 따로 말한다 */
  dropped: WorkCheckParse['dropped'];
  /** 모델에 보내기 전에 뺀 «점검기를 향한 지시문» — 화면이 알린다(결과가 왜 다른지) */
  removedSentences: string[];
}

export async function runWorkAiCheck(input: {
  workId: string;
  checkInput: unknown;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<AiSuggestionRecord<WorkCheckResult>> {
  // 자료 속 지시문을 **보내기 전에** 뺀다 — 캐시 키·모델 입력·인용 대조가 모두 같은(걸러낸) 입력을 쓴다
  const { value: safeInput, removed } = sanitizeForModel(input.checkInput);
  const inputHash = cacheKey('work_check', safeInput, WORK_CHECK_PROMPT_VERSION);
  if (!input.force) {
    const cached = await findCached<WorkCheckResult>('work_check', inputHash, true);
    if (cached) return cached;
  }
  const res = await callModel(WORK_CHECK_SYSTEM_PROMPT, safeInput, 'AI 점검 실패', input.signal);
  const parsed = parseWorkCheck(res.text, safeInput);
  if (!parsed.ok) {
    // 못 읽은 결과를 «지적 없음»으로 캐시하지 않는다
    throw new Error('AI 점검 실패: 응답을 읽지 못했습니다. 다시 시도하세요.');
  }
  return record({
    workId: input.workId,
    taskId: null,
    kind: 'work_check',
    inputHash,
    model: res.model,
    result: { findings: parsed.kept, dropped: parsed.dropped, removedSentences: removed },
    usage: { ...res.usage, dropped: parsed.dropped },
  });
}

// ── ② 표 정리 ───────────────────────────────────────────────────────────────

export interface TableTidyResult {
  columnLabel: string;
  groups: TidyGroup[];
  dropped: number;
}

/**
 * 표기 묶기. **결정을 캐시에서 되살리지 않는다** — 캐시가 맞았다는 것은 표가 그 뒤 저장되지 않았다는
 * 뜻이라, 옛 «적용함»을 보여 주면 적용되지 않은 표를 적용된 것처럼 말한다(적대적 검증 2026-09-27).
 * 적용할 열은 호출부가 **지금 고른 열**로 정한다(결과에 열 키를 담지 않는다 — 다른 표의 캐시가 맞으면
 * 그쪽 열 키로 적용되어 아무 일도 안 일어났다).
 */
export async function runTableTidy(input: {
  workId: string;
  taskId: string;
  table: OutputTable;
  columnKey: string;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<AiSuggestionRecord<TableTidyResult>> {
  const column = input.table.columns.find((c) => c.key === input.columnKey);
  if (!column) throw new Error('정리할 열을 찾지 못했습니다.');
  const values = distinctColumnValues(input.table, input.columnKey);
  if (values.length < 2) throw new Error('이 열에는 묶을 값이 두 개 이상 없습니다.');
  const aiInput = buildTableTidyInput(column.label, values);
  const inputHash = cacheKey('table_tidy', aiInput, TABLE_TIDY_PROMPT_VERSION);
  if (!input.force) {
    const cached = await findCached<TableTidyResult>('table_tidy', inputHash, false);
    if (cached) return cached;
  }
  const res = await callModel(TABLE_TIDY_SYSTEM_PROMPT, aiInput, 'AI 표 정리 실패', input.signal);
  const parsed = parseTableTidy(res.text, values);
  if (!parsed.ok) throw new Error('AI 표 정리 실패: 응답을 읽지 못했습니다. 다시 시도하세요.');
  return record({
    workId: input.workId,
    taskId: input.taskId,
    kind: 'table_tidy',
    inputHash,
    model: res.model,
    result: { columnLabel: column.label, groups: parsed.kept, dropped: parsed.dropped },
    usage: res.usage,
  });
}

// ── ③ 표를 글로 ─────────────────────────────────────────────────────────────

export interface TableToTextResult {
  text: string;
  /** 글 속 숫자 중 표·합계에 없는 것 — 화면이 경고한다 */
  unverifiedNumbers: string[];
  /** 표 칸에서 뺀 지시문 — 칸 글은 다른 교직원이 쓴 것이고, 이 글은 발송 본문으로 간다 */
  removedSentences: string[];
}

export async function runTableToText(input: {
  workId: string;
  taskId: string;
  title: string;
  table: OutputTable;
  purpose: string;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<AiSuggestionRecord<TableToTextResult>> {
  if (input.table.rows.length === 0) throw new Error('글로 옮길 줄이 없습니다.');
  const { value: aiInput, removed } = sanitizeForModel(buildTableToTextInput(input.title, input.table, input.purpose));
  const inputHash = cacheKey('table_to_text', aiInput, TABLE_TO_TEXT_PROMPT_VERSION);
  if (!input.force) {
    const cached = await findCached<TableToTextResult>('table_to_text', inputHash, false);
    if (cached) return cached;
  }
  const res = await callModel(TABLE_TO_TEXT_SYSTEM_PROMPT, aiInput, 'AI 글 정리 실패', input.signal);
  const text = parseTableToText(res.text);
  if (!text) throw new Error('AI 글 정리 실패: 응답에서 글을 찾지 못했습니다.');
  return record({
    workId: input.workId,
    taskId: input.taskId,
    kind: 'table_to_text',
    inputHash,
    model: res.model,
    result: { text, unverifiedNumbers: unverifiedNumbers(text, aiInput), removedSentences: removed },
    usage: res.usage,
  });
}

// ── 결정 기록 ───────────────────────────────────────────────────────────────

/**
 * [적용]/[무시]/[복사] 한 항목 — 서버가 jsonb 를 병합한다(원자적, 본인 행만).
 * 실패해도 화면 흐름은 막지 않는다 — 대신 null 을 돌려 호출부가 «기록되지 않음»을 알 수 있게.
 */
export async function recordSuggestionDecision(
  suggestionId: string,
  itemId: string,
  decision: SuggestionDecision,
): Promise<Record<string, SuggestionDecision> | null> {
  if (suggestionId.startsWith('local-')) return null;
  const { data, error } = await supabase.rpc('record_ai_suggestion_decision', {
    p_id: suggestionId,
    p_item: itemId,
    p_decision: decision,
  });
  if (error) return null;
  return (data ?? null) as Record<string, SuggestionDecision> | null;
}
