import { generateStage } from '../_shared/inquiryStages.ts';
import { injectPlannedEntitySources, stripPlannedThreadEntities, normalizeInquiryTemporalRelations } from '../_shared/inquiryGraph.ts';
import { experienceClient, requireExperience, experienceStudent } from '../_shared/academyExperience.ts';
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleAcademyInterview } from './academyInterview.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure, type AiLogContext } from '../_shared/aiCallLog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type JsonRecord = Record<string, unknown>;
type InquiryAiProvider = 'openai' | 'solar-pro4';
// 탐구 설계의 Solar 모델 (2026-09-12 사용자 지시로 pro3 → pro4).
// `defaultInquiryModel()` 한 곳에서만 읽고 그 함수는 탐구 설계 액션 2개만 부르므로
// 이 파일의 다른 기능(세특·문서·암기카드 등)에는 번지지 않는다.
const SOLAR_MODEL = 'solar-pro4';
const OPENAI_MODEL = 'gpt-6-luna';

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function extractChatCompletionText(data: any): string | null {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const text = content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n');
    return text || null;
  }
  return null;
}

function servedModel(data: any, requested: string): string {
  return typeof data?.model === 'string' && data.model ? data.model : requested;
}

// 'solar-open2'·'solar-pro3'는 구 wire 값 — 예전 클라이언트와 **이미 저장된 이력 행**이
// 남아 있어도 조용히 OpenAI로 새지 않도록 별칭으로 계속 받아준다.
// 정규화 결과만 'solar-pro4'로 옮겼다(받는 입은 넓히고 내보내는 값만 바꾼다).
function normalizeInquiryProvider(value: unknown): InquiryAiProvider {
  return value === 'solar-pro3' || value === 'solar-pro4' || value === 'solar-open2'
    ? 'solar-pro4'
    : 'openai';
}

function defaultInquiryModel(provider: InquiryAiProvider): string {
  return provider === 'solar-pro4' ? SOLAR_MODEL : OPENAI_MODEL;
}



/**
 * AI 기록(관리자 «AI 기록» 탭)의 기능 이름 기본값. 브라우저가 `aiLog` 꼬리표(기능·화면 주소)를 실어 보내면
 * 그것이 먼저다 — 범용 `chatCompletion` 은 여러 기능이 같이 쓰므로 꼬리표가 없으면 «미분류»로 남는다.
 */
function defaultAiFeature(action: unknown, params: JsonRecord): string {
  if (action === 'academyInterview' || params.academyExperience === true) return 'academy';
  if (action === 'inquiryDesignAnalysis' || action === 'inquiryDesignConversation') return 'inquiry-design';
  return 'unclassified';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let logCtx: AiLogContext | null = null;
  try {
    // JWT 인증 검사
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    let supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // `aiLog` 는 기록용 꼬리표라 params 에서 뺀다 — 단계 입력(`...params`)에 섞여 프롬프트로 가지 않게
    const { action, aiLog, ...params } = await req.json();
    logCtx = aiLogContext('openai-proxy', defaultAiFeature(action, params), aiLog, {
      action, userId: user.id, studentId: typeof params.studentId === 'string' ? params.studentId : null,
    });
    // 공급자로 가는 요청은 전부 이것으로 — 호출마다 성공·실패·빈 답·잘림·토큰이 남는다
    const aiFetch = aiLogFetch(logCtx);
    if (['inquiryDesignAnalysis', 'inquiryDesignConversation'].includes(action)) {
      const { data: profile, error } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (error || !profile) return jsonResponse({ error: 'Profile required' }, 403);
      params.aiProvider = profile.role === 'admin' ? normalizeInquiryProvider(params.aiProvider ?? params.provider) : 'openai';
      params.model = defaultInquiryModel(params.aiProvider);
    }
    if (params.academyExperience === true) {
      if (!['inquiryDesignAnalysis','inquiryDesignConversation'].includes(action)) return jsonResponse({error:'Unsupported experience action'},400);
      await requireExperience(supabaseClient, user.id);
      if (params.studentId !== experienceStudent) return jsonResponse({error:'Invalid experience template'},403);
      supabaseClient = experienceClient(supabaseClient);
    }

    switch (action) {
      case 'academyInterview':
        return await handleAcademyInterview(supabaseClient, params, SOLAR_MODEL, aiFetch);
      case 'chatCompletion': {
        const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openAIApiKey) {
          return jsonResponse({ error: 'OPENAI_API_KEY is not configured' }, 500);
        }

        const {
          systemPrompt,
          userPrompt,
          model = OPENAI_MODEL,
          temperature = 1.0,
          maxCompletionTokens = 10000,
          /**
           * 추론 강도 (2026-09-23 신설). **기본은 «보내지 않음»** — 종전 동작(모델 기본값)을
           * 그대로 둔다. 세 값이 서로 다른 요청이다:
           *   · `undefined`(생략) → 키를 아예 안 보냄 = 모델 기본값(= 2026-09-23 이전 동작)
           *   · `null`            → 같음. 호출부가 "명시적으로 안 보냄"을 선언할 때 쓴다
           *   · `'low'|'none'|…`  → 그 값을 보냄
           *
           * ⚠️ **모델마다 필요한 추론 수준이 다르다** — 여기에 기본값을 박지 말 것.
           * 호출부가 «자기 모델에서 실측한» 값을 보내는 구조라야 모델 교체 때 근거 없이
           * 이월되지 않는다(Solar 쪽 `reasoningEffortFor` 와 같은 규약).
           */
          reasoningEffort,
        } = params;

        const chatBody: JsonRecord = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_completion_tokens: maxCompletionTokens,
        };
        if (reasoningEffort !== undefined && reasoningEffort !== null) {
          chatBody.reasoning_effort = reasoningEffort;
        }

        const postChat = (payload: JsonRecord) =>
          aiFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAIApiKey}`,
            },
            body: JSON.stringify(payload),
          });

        let response = await postChat(chatBody);

        // reasoning 계열 모델은 custom temperature를 거부한다(기본 1.0만 허용).
        // 호출부들은 0.2·0.7 같은 값을 넘기고 있어 모델을 바꾸면 그 값 하나로
        // 400이 난다. 400이면 거부당한 파라미터만 떼고 다시 보내, 호출부의 의도
        // 선언은 남겨두되 모델 교체가 기능을 깨뜨리지는 않게 한다.
        // **한 번에 둘 다 떼지 않는다**(solar-proxy 와 같은 규약, 2026-09-23).
        // **오류 문구로 «무엇이» 거부됐는지 보고 그것부터 뗀다** (2026-10-20 gpt-6-luna 실측):
        // 종전엔 reasoning_effort 를 먼저 뗐는데, luna 는 temperature 0.7 을 거부한다
        // («'temperature' does not support 0.7 … Only the default (1)»). 그러면 effort 를 뗀
        // 재시도가 또 400 이고 셋째 호출에서야 둘 다 뗀 채 성공해 — 왕복 3번에 호출부가 실측해
        // 고른 추론 강도('low')까지 조용히 사라져 모델 기본값(medium)으로 돌았다.
        // 문구에서 못 가리면 종전 순서(reasoning_effort → temperature).
        const droppedParams: string[] = [];
        let payload: JsonRecord = chatBody;
        for (let attempt = 0; attempt < 2 && !response.ok && response.status === 400; attempt += 1) {
          const message = String((await response.clone().json().catch(() => ({})))?.error?.message ?? '').toLowerCase();
          const candidates = ['reasoning_effort', 'temperature'].filter((key) => key in payload);
          const rejected = candidates.find((key) => message.includes(key === 'reasoning_effort' ? 'reasoning' : key))
            ?? candidates[0];
          if (!rejected) break;
          payload = { ...payload };
          delete payload[rejected];
          droppedParams.push(rejected);
          response = await postChat(payload);
        }
        if (!response.ok) droppedParams.length = 0; // 떼어도 실패했으면 «떼서 성공»이 아니다
        if (droppedParams.length) {
          // 조용한 성공은 다음 사람이 원인을 못 찾는다 — 무엇이 빠졌는지 남긴다
          console.warn(`[openai-proxy] ${model}이(가) 거부해 제외한 파라미터: ${droppedParams.join(', ')}`);
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('No content in OpenAI response');
        }

        /**
         * `finishReason`·`usage` 를 함께 돌려준다 (2026-09-23).
         *
         * 없으면 **«답이 잘렸다»와 «형식을 어겼다»를 화면에서 구분할 수 없고**(잘림은 다시
         * 눌러도 같다 → 입력을 줄여야 한다), 추론이 예산을 얼마나 먹는지도 잴 수 없다.
         * `aiChatDetailed` 는 이 두 필드를 읽을 준비가 되어 있고 지금까지 항상 null 이었다.
         * 기존 호출부는 `result` 만 읽으므로 하위 호환이다.
         */
        return jsonResponse({
          result: content,
          finishReason: data.choices?.[0]?.finish_reason ?? null,
          model: data.model ?? model,
          usage: data.usage ?? null,
        });
      }

      case 'inquiryDesignAnalysis': {
        const analysisStartedAt = Date.now();
        const reasoningEffort = normalizeInquiryProvider(params.aiProvider) === 'solar-pro4' ? 'low' : 'medium';
        let providerRequests = 0;
        const analysisFetch: typeof fetch = (...args) => { providerRequests++; return aiFetch(...args); };

        const {
          studentId,
          target,
          selectedSources = [],
          kgContext = {},
          existingEntities = [],
          maxOutputTokens = 6000,
          dailyLimit = 20,   // 2026-09-12 사용자 지시 (클라 INQUIRY_DAILY_LIMIT 와 짝)
        } = params;
        // Optional free-form user guidance (직접 입력 + 대화 요약). Trim and
        // clip to 2000 chars defensively — frontend enforces the same ceiling
        // but a runaway client could send more.
        const rawUserRequirements = typeof params.userRequirements === 'string' ? params.userRequirements.trim() : '';
        const userRequirements = rawUserRequirements.slice(0, 2000);
        const provider = normalizeInquiryProvider(params.aiProvider ?? params.provider);
        const model = typeof params.model === 'string' ? params.model : defaultInquiryModel(provider);

        if (!studentId || typeof studentId !== 'string') {
          return jsonResponse({ error: 'studentId is required' }, 400);
        }

        // userRequirements is part of the cache key — different requirements text
        // must produce different cache entries so users aren't fed a stale answer.
        // ⚠️ `achievementContext` 를 캐시 키에 **반드시** 넣는다. 빠뜨리면 맥락을 켜고 끄는
        //    토글이 같은 캐시 항목을 되돌려 줘서 **아무것도 바뀌지 않은 것처럼 보인다**
        //    (오류가 아니라 "효과가 없네"로 나타나므로, 이 기능의 시험 자체가 불가능해진다).
        const normalizedInput = {
          studentId, target, selectedSources, userRequirements,
          achievementContext: params.achievementContext ?? null,
          kgContext, existingEntities, provider, model, reasoningEffort, pipeline: 'stages-v1',
        };
        const cacheKey = await sha256Hex(stableStringify(normalizedInput));

        const { data: cachedRows, error: cacheReadError } = await supabaseClient.rpc(
          'get_inquiry_analysis_cache',
          {
            p_cache_key: cacheKey,
            p_student_id: studentId,
          }
        );

        if (cacheReadError) {
          throw cacheReadError;
        }

        const cached = Array.isArray(cachedRows) ? cachedRows[0] : null;
        const { data: callCount, error: countError } = await supabaseClient.rpc(
          'count_inquiry_analysis_calls',
          { p_student_id: studentId }
        );

        if (countError) {
          throw countError;
        }

        const used = typeof callCount === 'number' ? callCount : 0;
        const limit = typeof dailyLimit === 'number' ? Math.max(1, dailyLimit) : 20;

        if (cached) {
          // Re-apply post-processing so cached entries written before these
          // features were added still get the same shape: strip illegal new
          // Thread entities, then inject subject sources on the survivors.
          // Both transforms are deterministic and idempotent.
          let cachedResult = stripPlannedThreadEntities(cached.result);
          cachedResult = injectPlannedEntitySources(cachedResult, target);
          return jsonResponse({
            result: cachedResult,
            cached: true,
            cacheKey,
            tokenUsage: {
              prompt_tokens: cached.prompt_tokens ?? 0,
              completion_tokens: cached.completion_tokens ?? 0,
              total_tokens: (cached.prompt_tokens ?? 0) + (cached.completion_tokens ?? 0),
              model: cached.model,
              provider,
              cached: true,
            },
            quota: {
              used,
              limit,
              remaining: Math.max(limit - used, 0),
            },
          });
        }

        if (used >= limit) {
          return jsonResponse({
            error: 'DAILY_LIMIT_EXCEEDED',
            quota: { used, limit, remaining: 0 },
          }, 429);
        }

        const providerStartedAt = Date.now();
        const stageInput = { ...params, userRequirements, existingEntities };
        const keys = { openai: Deno.env.get('OPENAI_API_KEY'), solar: Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY') };
        const design = await generateStage('design', stageInput, undefined, provider, keys, analysisFetch);
        const graph = await generateStage('graph', stageInput, design.result, provider, keys, analysisFetch);
        let result: unknown = { ...design.result, ...graph.result };
        const sum = (first: string, second: string) => Number(design.usage[first] ?? design.usage[second] ?? 0) + Number(graph.usage[first] ?? graph.usage[second] ?? 0);
        const tokenUsage: JsonRecord = { prompt_tokens: sum('prompt_tokens','input_tokens'), completion_tokens: sum('completion_tokens','output_tokens'), total_tokens: sum('total_tokens','total_tokens'), model, provider, cached: false, stages: { design: design.usage, graph: graph.usage } };
        const providerFinishedAt = Date.now();
        result = stripPlannedThreadEntities(result);
        result = injectPlannedEntitySources(result, target);
        result = normalizeInquiryTemporalRelations(result, existingEntities);

        const { error: cacheWriteError } = await supabaseClient.rpc(
          'upsert_inquiry_analysis_cache',
          {
            p_cache_key: cacheKey,
            p_student_id: studentId,
            p_result: result,
            p_model: tokenUsage.model ?? model,
            p_prompt_tokens: tokenUsage.prompt_tokens,
            p_completion_tokens: tokenUsage.completion_tokens,
          }
        );

        if (cacheWriteError) {
          throw cacheWriteError;
        }

        const timings = { totalMs: Date.now() - analysisStartedAt, preparationMs: providerStartedAt - analysisStartedAt, providerMs: providerFinishedAt - providerStartedAt, finalizeMs: Date.now() - providerFinishedAt, providerRequests };
        console.info('inquiry_analysis_timing', JSON.stringify({ ...timings, provider, model, reasoningEffort, experience: params.academyExperience === true }));
        return jsonResponse({
          timings,
          result,
          cached: false,
          cacheKey,
          tokenUsage,
          quota: {
            used: used + 1,
            limit,
            remaining: Math.max(limit - used - 1, 0),
          },
        });
      }

      case 'inquiryDesignConversation': {
        // Short coach-style chat that helps the student articulate direction
        // and constraints before the heavy `inquiryDesignAnalysis` call.
        // Wire contract:
        //   input.messages: [{ role: 'user' | 'assistant', content: string }, ...]
        //     The newest entry should be the student's latest message (role:'user').
        //   input.target: optional target activity (same shape as inquiryDesignAnalysis)
        //   input.turn: 1-based count of LLM turns so far (the turn we're about to produce)
        // Returns:
        //   { reply: string, suggestEnd: boolean, tokenUsage }
        //   suggestEnd is true after turn>=8 so the UI can prompt closing.
        //   Min 2 turns is enforced client-side (Cancel/End buttons hidden).
        const messages = Array.isArray(params.messages) ? params.messages as Array<JsonRecord> : [];
        const target = params.target ?? null;
        const turn = typeof params.turn === 'number' ? params.turn : messages.filter((m) => m?.role === 'assistant').length + 1;
        const provider = normalizeInquiryProvider(params.aiProvider ?? params.provider);
        const model = typeof params.model === 'string' ? params.model : defaultInquiryModel(provider);

        if (messages.length === 0) {
          return jsonResponse({ error: 'messages is required' }, 400);
        }

        // 클라이언트 하드 상한은 10턴(InquiryConversationBox `MAX_TURNS`).
        // 여기서 8턴부터 마무리를 제안해 2턴의 여유를 남긴다 — 둘은 함께
        // 움직여야 한다. 한쪽만 올리면 코치가 남은 턴 내내 종료만 반복 제안하거나,
        // 반대로 입력창이 잠기는 순간까지 마무리 신호가 전혀 없다.
        const suggestEnd = turn >= 8;

        // 학생이 지식 지도에서 이미 고른 노드·기록의 개수 (2026-09-18).
        // 내용 자체는 첫 사용자 메시지의 사본에 실려 온다(`conversationPrimer.ts`).
        // 개수만 따로 받는 이유는 **시스템 프롬프트의 1턴 지시를 갈라야** 하기 때문이다 —
        // 사용자 메시지에 "고른 것을 짚어 달라"고 적어도 "관심 주제부터 물어라"라는
        // 시스템 지시가 그것을 이긴다. 종전엔 선택 노드가 아예 전달되지 않아
        // 코치가 학생이 고른 별을 **전혀 모르는 채** 원점부터 다시 물었다.
        const selectedSourceCount = typeof params.selectedSourceCount === 'number'
          ? params.selectedSourceCount
          : 0;

        const conversationSystem = [
          '너는 한국 고등학생의 학생부 탐구 설계를 도와주는 따뜻하지만 구체적인 교육 코치다.',
          '답변은 반드시 1~2문장으로 짧게. 길게 설명하지 말고 학생이 답하기 쉬운 질문을 던져라.',
          '학생의 흥미·동기·가용 자원·실현 가능성·진로 연관성을 조금씩 끌어내라.',
          '한 번에 하나의 핵심 질문만. 여러 개 묶지 말고, 막연한 질문보다 구체적 보기를 곁들이면 더 좋다.',
          '학생이 이미 말한 내용을 다시 묻지 말고, 자연스럽게 다음 단계로 이어가라.',
          selectedSourceCount > 0
            ? `학생은 자기 지식 지도에서 기록 ${selectedSourceCount}개를 이미 골라 두었고 그 내용이 첫 메시지에 함께 왔다(<선택한_기록>). 이것은 학생의 실제 경험이다. 질문은 그 기록의 이름을 직접 들어 가며 하고, 이미 고른 것을 처음부터 다시 묻지 마라. 없는 경험을 지어내지 마라.`
            : '',
          suggestEnd
            ? '이번 턴은 마무리 턴이다. 지금까지 모은 방향성을 한 문장으로 요약해 보여주고, "이제 설계를 시작할까요?" 같은 식으로 명확하게 종료 의사를 묻는다.'
            : turn === 1
              ? (selectedSourceCount > 0
                ? '첫 턴이다. 가벼운 인사와 함께, 학생이 고른 기록 중 가장 이어 갈 만한 것 한둘을 이름으로 짚으며 두 가지를 한 번에 묻는다: (1) 그 기록에서 어떤 점을 더 파고들고 싶은지, (2) 현재 그 과목에서 어떤 수행평가나 활동을 진행 중이거나 진행 예정인지. (이 1턴 규칙은 "한 번에 하나의 핵심 질문" 원칙의 유일한 예외다.)'
                : '첫 턴이다. 가벼운 인사와 함께 두 가지를 한 번에 묻는다: (1) 대상 활동/과목에서 어떤 내용·주제·개념에 관심이 있는지, (2) 현재 그 과목에서 어떤 수행평가나 활동을 진행 중이거나 진행 예정인지. 둘을 같은 메시지에 자연스러운 한두 문장으로 묶어서 묻되, 학생이 두 가지를 모두 답하기 쉽도록 분명하게 표현하라. (이 1턴 규칙은 "한 번에 하나의 핵심 질문" 원칙의 유일한 예외다.)')
              : '중간 턴이다. 직전 답변에서 드러난 키워드를 활용해 한 발 더 구체화하는 질문을 던진다.',
        ].filter(Boolean).join('\n');

        const targetHint = target && typeof target === 'object'
          ? `대상 활동 컨텍스트: ${JSON.stringify(target)}`
          : '';

        const chatMessages = [
          { role: 'system', content: conversationSystem + (targetHint ? `\n\n${targetHint}` : '') },
          ...messages.map((m) => ({
            role: m?.role === 'assistant' ? 'assistant' : 'user',
            content: typeof m?.content === 'string' ? m.content : String(m?.content ?? ''),
          })),
        ];

        let replyText = '';
        let tokenUsage: JsonRecord;
        // 응답이 왜 비었는지 가르는 두 값 (2026-10-15). 'length' 면 예산 소진이고,
        // 추론 토큰이 그 예산을 얼마나 먹었는지가 함께 있어야 처방을 고를 수 있다.
        let finishReason: string | null = null;
        let reasoningTokens: number | null = null;

        if (provider === 'solar-pro4') {
          const solarApiKey = Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY');
          if (!solarApiKey) {
            return jsonResponse({ error: 'SOLAR_API_KEY is not configured' }, 500);
          }
          const response = await aiFetch('https://api.upstage.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${solarApiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: chatMessages,
              // 짧은 코치 답변이라 추론이 필요 없다. 추론을 켜 두면 220토큰
              // 예산을 추론이 다 써 답변이 빈 문자열로 나온다(위 분석 분기와
              // 같은 함정 — 거기선 500, 여기선 무응답으로 나타난다).
              reasoning_effort: 'none',
              max_tokens: 220,
            }),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Solar API error: ${response.status}`);
          }
          const data = await response.json();
          replyText = extractChatCompletionText(data) ?? '';
          finishReason = data.choices?.[0]?.finish_reason ?? null;
          reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? null;
          tokenUsage = {
            prompt_tokens: data.usage?.prompt_tokens ?? 0,
            completion_tokens: data.usage?.completion_tokens ?? 0,
            total_tokens: data.usage?.total_tokens ?? 0,
            model: servedModel(data, model),
            provider,
            cached: false,
          };
        } else {
          const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
          if (!openAIApiKey) {
            return jsonResponse({ error: 'OPENAI_API_KEY is not configured' }, 500);
          }
          // Use chat-completions for conversational mode — lighter and the
          // structured-output overhead of /v1/responses isn't needed here.
          const response = await aiFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAIApiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: chatMessages,
              // 220 → 1000 (2026-10-15). luna 는 추론 토큰과 답변이 이 예산을 나눠 쓴다.
              // 220 이면 추론이 다 써 버려 빈 답이 나왔다(학생 대화 22건 중 5건 —
              // `Empty conversation reply from model`). 답 길이는 시스템 프롬프트의
              // «1~2문장»이 묶으므로 예산을 올려도 답이 길어지지 않고 추론할 여유만 생긴다.
              max_completion_tokens: 1000,
            }),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
          }
          const data = await response.json();
          replyText = extractChatCompletionText(data) ?? '';
          finishReason = data.choices?.[0]?.finish_reason ?? null;
          reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? null;
          tokenUsage = {
            prompt_tokens: data.usage?.prompt_tokens ?? 0,
            completion_tokens: data.usage?.completion_tokens ?? 0,
            total_tokens: data.usage?.total_tokens ?? 0,
            model: servedModel(data, model),
            provider,
            cached: false,
          };
        }

        // 매 턴 남긴다 — 실패만 남기면 성공한 턴이 예산의 얼마를 쓰는지(=여유)를 모른다.
        // 대화 내용은 남기지 않는다(학생 글이다).
        console.info('inquiry_conversation', JSON.stringify({
          provider,
          model: tokenUsage.model,
          turn,
          finish_reason: finishReason,
          prompt_tokens: tokenUsage.prompt_tokens,
          completion_tokens: tokenUsage.completion_tokens,
          reasoning_tokens: reasoningTokens,
          reply_chars: replyText.trim().length,
        }));

        if (!replyText.trim()) {
          throw new Error('Empty conversation reply from model');
        }

        return jsonResponse({
          reply: replyText.trim(),
          suggestEnd,
          turn,
          tokenUsage,
        });
      }

      case 'validateApiKey': {
        return jsonResponse({ result: JSON.stringify({ valid: true }) });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error('Error in openai-proxy:', error);
    if (logCtx) logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 500 });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: errorMessage }, 500);
  }
});
