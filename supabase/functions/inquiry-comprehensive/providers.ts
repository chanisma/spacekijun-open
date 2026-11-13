// LLM provider plumbing shared by the inquiry-comprehensive pipeline.
//
// 모델 ID가 analyze-directions / recommend / hygiene-verifier 세 곳에 각각
// 하드코딩돼 있어 교체 때마다 한 곳을 빠뜨리기 쉬웠다. 호출부와 모델 상수를
// 여기로 모아 단일 출처로 만든다.

export type InquiryProvider = 'openai' | 'solar-pro4' | 'gpt-5-mini';

// 2026-09-12 사용자 지시로 pro3 → pro4.
export const SOLAR_MODEL = 'solar-pro4';
// Default OpenAI model for the analysis steps. 'gpt-5-mini'(관리자 전용 wire
// 값)도 같은 모델로 해석된다 — 이름은 구 모델(gpt-5.4-mini) 시절 것이 남은 것이다.
export const OPENAI_MODEL = 'gpt-6-luna';

/**
 * Solar 경로인지 판정. `solar-open2`·`solar-pro3`는 구 wire 값 — 예전 클라이언트가
 * 남아 있어도 조용히 OpenAI로 새지 않도록 별칭으로 계속 받아준다.
 */
export function isSolarProvider(value: unknown): boolean {
  return value === 'solar-pro3' || value === 'solar-pro4' || value === 'solar-open2';
}

export function normalizeProvider(value: unknown): InquiryProvider {
  if (isSolarProvider(value)) return 'solar-pro4';
  if (value === 'gpt-5-mini') return 'gpt-5-mini';
  return 'openai';
}

export interface ChatReply {
  content: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  /**
   * 응답이 밝힌 **실제 서빙 모델**. 요청한 이름을 그대로 되풀이해 기록하면
   * 제공자가 별칭을 다른 스냅샷으로 풀거나 티어를 바꿔도 알아챌 수 없다.
   */
  model: string;
}

/**
 * Upstage Solar chat completion.
 * 엔드포인트는 현행 `/v1/chat/completions` — 구 `/v1/solar/chat/completions`는
 * 레거시 경로다(openai-proxy·solar-proxy도 현행 경로를 쓴다).
 */
/**
 * 추론 토큰과 최종 출력이 **같은 예산**을 나눠 쓰므로 하한을 둔다.
 * `openai-proxy` 의 Solar 분기가 같은 이유로 이미 두고 있는 값과 맞춘다 —
 * 두 경로가 다른 하한을 쓰면 한쪽만 조용히 비어서 돌아온다.
 */
/**
 * 실측(2026-09-12): pro4 는 medium 추론에서 **12,000 을 통째로 추론에 쓰고**
 * `finish_reason=length · completion_tokens=12000` 로 본문 없이 끝났다.
 * 하한을 올리고, 그래도 모자라면 아래 사다리가 추론을 낮춰 한 번 더 시도한다.
 */
const SOLAR_MIN_MAX_TOKENS = 32000;

export async function callSolar(
  system: string,
  user: string,
  opts: { temperature?: number; reasoningEffort?: string; maxTokens?: number; request?: typeof fetch } = {}
): Promise<ChatReply> {
  const apiKey = Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY');
  if (!apiKey) throw new Error('SOLAR_API_KEY not configured');
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const post = (payload: Record<string, unknown>) =>
    (opts.request ?? fetch)('https://api.upstage.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });

  const maxTokens = Math.max(opts.maxTokens ?? 0, SOLAR_MIN_MAX_TOKENS);

  let res = await post({
    model: SOLAR_MODEL,
    response_format: { type: 'json_object' },
    temperature: opts.temperature ?? 0.3,
    reasoning_effort: opts.reasoningEffort ?? 'medium',
    // ⚠️ 종전엔 이 줄이 **없었다**. 상한을 안 보내면 제공자 기본값이 쓰이는데,
    //    pro4 는 medium 추론에서 그 예산을 먼저 다 써 `content` 가 빈 채 끝난다.
    //    아래 `?? '{}'` 와 합쳐져 **오류 없이 빈 결과**가 되어, 화면에서는
    //    "분석이 돌다가 아무것도 없이 끝남"으로 보였다.
    max_tokens: maxTokens,
    messages,
  });
  // reasoning_effort는 모델 계열마다 지원 여부가 다르다. 400이면 그것만 떼고 한 번
  // 재시도한다. `response_format`은 유지 — 호출부가 엄격한 JSON.parse를 하므로
  // 여기서 JSON 보장을 포기하면 파싱이 깨진다.
  if (!res.ok && res.status === 400) {
    res = await post({
      model: SOLAR_MODEL,
      response_format: { type: 'json_object' },
      temperature: opts.temperature ?? 0.3,
      max_tokens: maxTokens,
      messages,
    });
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Solar ${res.status}: ${t.slice(0, 300)}`);
  }
  let body = await res.json();
  let content = body.choices?.[0]?.message?.content;

  // **예산 소진 재시도.** 추론이 예산을 다 써 본문이 없으면 같은 예산으로 추론만 낮춰
  // 한 번 더 부른다 — 추론이 값을 하더라도 **출력이 없으면 0점**이고, 사용자에게는
  // 하루 한도를 한 번 쓰고 아무것도 못 받는 것이 가장 나쁜 결과다.
  // ⚠️ 조건을 `finish_reason === 'length'` 로 좁히면 안 된다.
  //    실측된 실패는 **`finish_reason=stop` 인데 본문이 0자**였다
  //    (completion_tokens=5596 이 전부 추론으로 갔다). 정상 종료를 주장하면서 아무것도
  //    내놓지 않는 것이라, 판정 기준은 종료 이유가 아니라 **본문이 있느냐**여야 한다.
  const emptyBody = typeof content !== 'string' || !content.trim();
  if (emptyBody && (opts.reasoningEffort ?? 'medium') !== 'low') {
    const retry = await post({
      model: SOLAR_MODEL,
      response_format: { type: 'json_object' },
      temperature: opts.temperature ?? 0.3,
      reasoning_effort: 'low',
      max_tokens: maxTokens,
      messages,
    });
    if (retry.ok) {
      const retryBody = await retry.json();
      const retryContent = retryBody.choices?.[0]?.message?.content;
      if (typeof retryContent === 'string' && retryContent.trim()) {
        body = retryBody;
        content = retryContent;
      }
    }
  }
  // **빈 본문을 `{}` 로 삼키지 않는다.** 종전엔 `?? '{}'` 라 호출부가 "결과 0건"으로 읽었고,
  // 화면에서는 성공처럼 끝나 원인을 어디서도 볼 수 없었다. 빈 본문은 거의 항상 예산 소진이므로
  // 그 사실을 메시지에 실어 다음 실패가 스스로를 설명하게 한다.
  if (typeof content !== 'string' || !content.trim()) {
    const finish = body.choices?.[0]?.finish_reason ?? 'unknown';
    const completion = body.usage?.completion_tokens ?? '?';
    throw new Error(
      `Solar 응답에 본문이 없습니다 (finish_reason=${finish}, `
      + `completion_tokens=${completion}, max_tokens=${maxTokens}). `
      + `finish_reason이 length면 추론 토큰이 예산을 모두 써 최종 출력이 남지 않은 것이다.`
    );
  }
  return {
    content,
    usage: body.usage ?? {},
    model: typeof body.model === 'string' && body.model ? body.model : SOLAR_MODEL,
  };
}

/**
 * OpenAI chat completion. reasoning 계열 모델은 custom temperature를 거부하므로,
 * 호출부가 넘긴 `temperature`는 400이 나면 아래에서 자동으로 떨어져 나간다.
 */
export async function callOpenAI(
  system: string,
  user: string,
  opts: { model?: string; maxCompletionTokens?: number; temperature?: number; request?: typeof fetch } = {}
): Promise<ChatReply> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const payload: Record<string, unknown> = {
    model: opts.model ?? OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (opts.maxCompletionTokens !== undefined) payload.max_completion_tokens = opts.maxCompletionTokens;
  if (opts.temperature !== undefined) payload.temperature = opts.temperature;

  const post = (body: Record<string, unknown>) =>
    (opts.request ?? fetch)('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

  let res = await post(payload);
  // reasoning 계열 모델은 custom temperature를 거부한다. 400이면 그것만 떼고
  // 한 번 재시도(하이진 검증기는 결정성을 위해 0을 넘긴다).
  if (!res.ok && res.status === 400 && payload.temperature !== undefined) {
    const fallback = { ...payload };
    delete fallback.temperature;
    res = await post(fallback);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
  }
  const body = await res.json();
  return {
    content: body.choices?.[0]?.message?.content ?? '{}',
    usage: body.usage ?? {},
    model:
      typeof body.model === 'string' && body.model ? body.model : (opts.model ?? OPENAI_MODEL),
  };
}

/** provider에 맞는 호출 + 실제 사용 모델명 반환. */
export async function callChat(
  provider: InquiryProvider,
  system: string,
  user: string,
  opts: { maxCompletionTokens?: number; reasoningEffort?: string; request?: typeof fetch } = {}
): Promise<ChatReply> {
  // 예산을 **두 경로에 똑같이** 넘긴다. 종전엔 Solar 쪽만 빠져 호출부가 넉넉히 잡아 줘도
  // 제공자 기본값으로 돌았고, 그 차이가 "Luna 는 되는데 Solar 만 빈 결과"로 나타났다.
  if (isSolarProvider(provider)) return callSolar(system, user, { maxTokens: opts.maxCompletionTokens, reasoningEffort: opts.reasoningEffort, request: opts.request });
  return callOpenAI(system, user, { maxCompletionTokens: opts.maxCompletionTokens, request: opts.request });
}
