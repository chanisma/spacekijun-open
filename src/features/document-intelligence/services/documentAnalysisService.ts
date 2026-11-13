import {
  aiChat,
  isAiChatRetryableError,
  isAiChatTimeoutError,
  reasoningEffortFor,
  resolveAiChatModel,
  type AiChatProvider,
  type AiReasoningEffort,
} from '@/services/aiChat';
import type {
  DocumentAnalysisProgress,
  DocumentAnalysisResult,
  DocumentChunk,
  ParsedSchoolDocument,
} from '../types';
import { chunkDocument } from '../analysis/chunkDocument';
import { mergeDocumentAnalyses } from '../analysis/mergeDocumentAnalyses';
import {
  buildDocumentChunkAnalysisUserPrompt,
  buildDocumentAnalysisSystemPrompt,
  buildDocumentAnalysisUserPrompt,
} from '../analysis/prompts';
import { parseJsonResponse, validateDocumentAnalysis } from '../analysis/validateAnalysis';

/** 현재 기본 공급자(aiChat)의 모델. 분석 이력에 "무엇으로 돌렸는지" 남길 때 쓴다. */
export const DEFAULT_DOCUMENT_ANALYSIS_MODEL = resolveAiChatModel();

/** 공급자와 모델은 항상 짝으로 넘긴다(어긋나면 제공자가 요청을 거부한다). */
type ChatTarget = { provider?: AiChatProvider; model: string };
const SINGLE_PASS_MAX_CHARS = 45_000;
const MAX_DOCUMENT_CHARS = 480_000;
const MAX_CHUNKS = 40;
const DEFAULT_CHUNK_CHARS = 12_000;
const MAX_CHUNK_CHARS = 18_000;

/**
 * 한 번의 LLM 호출을 기다릴 상한.
 *
 * 엣지 게이트웨이가 약 150초에 504를 낸다. 그보다 **짧게** 잡아야 우리가 먼저 판단권을
 * 갖는다 — 150초를 그대로 버리면 대안을 시작할 때 이미 사용자는 2분 반을 기다린 뒤다.
 * 추론을 끈 pro4의 단일 호출 실측 중앙값이 한 자릿수 초대이므로 아래 값은 넉넉한 천장이다.
 */
const SINGLE_PASS_TIMEOUT_MS = 100_000;
const CHUNK_TIMEOUT_MS = 70_000;

/**
 * 연달아 이만큼 시간 초과로 실패하면 남은 청크를 포기하고 **모은 것만으로 병합**한다.
 *
 * 없으면 AI가 전반적으로 느려진 날 40개 청크가 각각 (70초 + 재시도 70초)씩 실패하며
 * 동시성 2로 **40분 넘게** 돌다가 결국 전부 실패한다. 한두 개가 연속으로 시간을 넘기면
 * 그건 이 문서의 특정 청크 문제가 아니라 **지금 AI가 느린 것**이므로, 계속 두드리는 대신
 * 부분 결과를 주고 사용자가 다시 시도할지 정하게 한다.
 */
const CONSECUTIVE_TIMEOUT_LIMIT = 2;

export interface AnalyzeDocumentOptions {
  /** 생략 시 앱 기본 공급자(Solar). OpenAI로 돌리려면 'openai'. */
  provider?: AiChatProvider;
  /** 공급자에 맞는 모델 ID. 생략 시 공급자별 기본값. */
  model?: string;
  maxChunkChars?: number;
  maxConcurrency?: number;
  onProgress?: (progress: DocumentAnalysisProgress) => void;
  signal?: AbortSignal;
}

function emitProgress(
  callback: AnalyzeDocumentOptions['onProgress'],
  progress: DocumentAnalysisProgress
): void {
  callback?.(progress);
}

/**
 * 문서 분석은 **추출 과제**다: 원문에 이미 있는 일정·업무·제출물을 찾아 근거 인용과 함께
 * JSON 으로 옮겨 적는다. 값을 여기 적지 않고 `reasoningEffortFor('extraction', …)` 에
 * 묻는 이유는, 값을 적어 두면 **모델 교체 때 근거 없이 이월**되기 때문이다(측정된
 * 조합만 담는 표가 `aiChat.ts` 에 하나 있다).
 *
 * 이 기능이 그 표 없이 엣지 기본값 'low' 로 나가면서 **504 Gateway Timeout** 을 냈다
 * (2026-09-23 사용자 보고). 같은 문서 A/B: 'low' >180초 실패 / 'none' 33초·추론 0토큰.
 */
function effortOf(chat: ChatTarget): AiReasoningEffort | undefined {
  return reasoningEffortFor('extraction', chat.provider, chat.model);
}

async function requestAnalysis(params: {
  systemPrompt: string;
  userPrompt: string;
  provider?: AiChatProvider;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  maxCompletionTokens: number;
  timeoutMs: number;
  retryOnce?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const attempts = params.retryOnce ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (params.signal?.aborted) throw new Error('문서 분석이 취소되었습니다.');
    try {
      return await aiChat({
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        provider: params.provider,
        model: params.model,
        reasoningEffort: params.reasoningEffort,
        temperature: 0.2,
        maxCompletionTokens: params.maxCompletionTokens,
        timeoutMs: params.timeoutMs,
        signal: params.signal,
        errorPrefix: '문서 AI 분석 실패',
      });
    } catch (error) {
      lastError = error;
      // 판정은 `aiChat`이 소유한다 — 종전엔 여기서 정규식으로 봤는데 supabase-js가
      // 504를 **숫자 없는 문장**으로 뭉개 한 번도 맞지 않았다(그래서 재시도가 죽어 있었다).
      if (attempt + 1 >= attempts || !isAiChatRetryableError(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('문서 AI 분석에 실패했습니다.');
}

function documentViewForChunk(
  document: ParsedSchoolDocument,
  chunk: DocumentChunk
): ParsedSchoolDocument {
  const blockIds = new Set(chunk.blockIds);
  return {
    ...document,
    blocks: document.blocks.filter((block) => blockIds.has(block.id)),
    characterCount: chunk.characterCount,
    plainText: chunk.text,
  };
}

async function analyzeSinglePass(
  document: ParsedSchoolDocument,
  chunks: DocumentChunk[],
  chat: ChatTarget,
  signal?: AbortSignal
): Promise<DocumentAnalysisResult> {
  const raw = await requestAnalysis({
    systemPrompt: buildDocumentAnalysisSystemPrompt(),
    userPrompt: buildDocumentAnalysisUserPrompt(document, chunks),
    ...chat,
    reasoningEffort: effortOf(chat),
    maxCompletionTokens: 12_000,
    timeoutMs: SINGLE_PASS_TIMEOUT_MS,
    // **재시도하지 않는다.** 방금 제한 시간을 넘긴 것과 똑같은 요청을 되쏘면
    // "느리게 실패하는 경로"를 하나 더 붙일 뿐이다(문서 생성에서 Solar fallback을
    // 걷어낸 것과 같은 이유). 대신 호출부가 **더 작은 요청**(분할 분석)으로 넘어간다.
    signal,
  });
  return validateDocumentAnalysis(parseJsonResponse(raw), document);
}

async function analyzeChunk(
  document: ParsedSchoolDocument,
  chunk: DocumentChunk,
  chunkIndex: number,
  totalChunks: number,
  chat: ChatTarget,
  signal?: AbortSignal
): Promise<DocumentAnalysisResult> {
  const raw = await requestAnalysis({
    systemPrompt: buildDocumentAnalysisSystemPrompt(),
    userPrompt: buildDocumentChunkAnalysisUserPrompt(document, chunk, chunkIndex, totalChunks),
    ...chat,
    reasoningEffort: effortOf(chat),
    maxCompletionTokens: 8_000,
    timeoutMs: CHUNK_TIMEOUT_MS,
    retryOnce: true,
    signal,
  });
  const validated = validateDocumentAnalysis(parseJsonResponse(raw), documentViewForChunk(document, chunk));
  return {
    ...validated,
    candidates: validated.candidates.map((candidate, candidateIndex) => ({
      ...candidate,
      localId: `${chunk.id}:${candidateIndex + 1}:${candidate.localId}`,
    })),
  };
}

/**
 * 청크를 나눠 분석하고 병합한다. 일부 청크가 실패해도 **나머지로 결과를 낸다** —
 * 그래서 단일 호출이 시간 초과로 죽었을 때의 대안이 될 수 있다.
 */
async function analyzeByChunks(
  document: ParsedSchoolDocument,
  chunks: DocumentChunk[],
  chat: ChatTarget,
  options: AnalyzeDocumentOptions,
  note?: string
): Promise<DocumentAnalysisResult> {
  emitProgress(options.onProgress, {
    stage: 'preparing',
    completedChunks: 0,
    totalChunks: chunks.length,
    failedChunks: 0,
    note,
  });

  const results: Array<DocumentAnalysisResult | null> = Array.from({ length: chunks.length }, () => null);
  const failedChunkIds: string[] = [];
  const maxConcurrency = Math.max(1, Math.min(3, Math.floor(options.maxConcurrency ?? 2)));
  let cursor = 0;
  let completedChunks = 0;
  let consecutiveTimeouts = 0;
  let abandonedForTimeouts = false;

  const worker = async () => {
    while (cursor < chunks.length && !options.signal?.aborted && !abandonedForTimeouts) {
      const chunkIndex = cursor;
      cursor += 1;
      const chunk = chunks[chunkIndex];
      try {
        results[chunkIndex] = await analyzeChunk(
          document,
          chunk,
          chunkIndex,
          chunks.length,
          chat,
          options.signal
        );
        consecutiveTimeouts = 0;
      } catch (error) {
        if (options.signal?.aborted) return;
        console.warn(`문서 청크 분석 실패 (${chunk.id}):`, error);
        failedChunkIds.push(chunk.id);
        if (isAiChatTimeoutError(error)) {
          consecutiveTimeouts += 1;
          // 연속 시간 초과 = 이 청크가 아니라 **지금 AI가 느린 것**이다. 남은 청크를
          // 계속 두드리면 실패가 확정된 채 몇십 분을 더 쓴다.
          if (consecutiveTimeouts >= CONSECUTIVE_TIMEOUT_LIMIT) abandonedForTimeouts = true;
        } else {
          consecutiveTimeouts = 0;
        }
      } finally {
        completedChunks += 1;
        emitProgress(options.onProgress, {
          stage: 'analyzing_chunks',
          completedChunks,
          totalChunks: chunks.length,
          failedChunks: failedChunkIds.length,
          note,
        });
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(maxConcurrency, chunks.length) },
    () => worker()
  ));
  if (options.signal?.aborted) throw new Error('문서 분석이 취소되었습니다.');

  const successfulResults = results.filter((result): result is DocumentAnalysisResult => result !== null);
  if (successfulResults.length === 0) {
    throw new Error(
      abandonedForTimeouts
        ? 'AI 응답이 계속 제한 시간을 넘겨 분석을 중단했습니다. 잠시 뒤 다시 시도하거나 문서를 나눠서 분석해주세요.'
        : '모든 문서 청크 분석에 실패했습니다. 잠시 후 다시 시도해주세요.'
    );
  }

  emitProgress(options.onProgress, {
    stage: 'merging',
    completedChunks,
    totalChunks: chunks.length,
    failedChunks: failedChunkIds.length,
    note,
  });
  const merged = mergeDocumentAnalyses(document, successfulResults, failedChunkIds);
  // 포기한 청크는 "실패"와 뜻이 다르다 — 시도조차 안 했으므로 결과가 부분임을 밝힌다.
  const skipped = chunks.length - completedChunks;
  if (!abandonedForTimeouts) return merged;
  const detail = skipped > 0 ? `${skipped}개 단위를 분석하지 못했습니다` : '일부 단위를 건너뛰었습니다';
  return {
    ...merged,
    warnings: Array.from(new Set([
      ...merged.warnings,
      `AI 응답 지연으로 ${detail}. 결과가 문서 전체를 담지 못할 수 있습니다.`,
    ])),
  };
}

export async function analyzeParsedDocument(
  document: ParsedSchoolDocument,
  options: AnalyzeDocumentOptions = {}
): Promise<DocumentAnalysisResult> {
  if (!document.plainText.trim()) throw new Error('분석할 문서 텍스트가 없습니다.');
  if (document.characterCount > MAX_DOCUMENT_CHARS) {
    throw new Error(`현재 장문 분석 한도는 ${MAX_DOCUMENT_CHARS.toLocaleString()}자입니다. 문서를 업무 단위로 나눠주세요.`);
  }

  const maxChunkChars = Math.min(options.maxChunkChars ?? DEFAULT_CHUNK_CHARS, MAX_CHUNK_CHARS);
  const chunks = chunkDocument(document, maxChunkChars);
  // 공급자와 모델은 반드시 짝으로 다닌다 — 어긋나면 제공자가 거부한다.
  const chat: ChatTarget = {
    provider: options.provider,
    model: resolveAiChatModel(options.provider, options.model),
  };

  if (document.characterCount <= SINGLE_PASS_MAX_CHARS) {
    emitProgress(options.onProgress, {
      stage: 'analyzing_chunks',
      completedChunks: 0,
      totalChunks: 1,
      failedChunks: 0,
    });
    try {
      const result = await analyzeSinglePass(document, chunks, chat, options.signal);
      emitProgress(options.onProgress, {
        stage: 'analyzing_chunks',
        completedChunks: 1,
        totalChunks: 1,
        failedChunks: 0,
      });
      return result;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // **시간 초과일 때만** 분할로 내려간다. 파싱 오류·권한 오류는 요청을 잘게 쪼개도
      // 똑같이 실패하므로, 그때까지 분할을 시도하면 실패를 몇 배 느리게 만들 뿐이다.
      const canSplit = isAiChatTimeoutError(error)
        && chunks.length > 1
        && chunks.length <= MAX_CHUNKS;
      if (!canSplit) throw error;
      console.warn('단일 호출이 제한 시간을 넘겨 분할 분석으로 전환합니다:', error);
      return analyzeByChunks(
        document, chunks, chat, options,
        '한 번에 분석하기에 시간이 오래 걸려 문서를 나눠서 다시 분석하고 있습니다.'
      );
    }
  }

  if (chunks.length > MAX_CHUNKS) {
    throw new Error(`문서가 ${chunks.length}개 분석 단위로 나뉘어 현재 한도 ${MAX_CHUNKS}개를 초과했습니다.`);
  }

  return analyzeByChunks(document, chunks, chat, options);
}
