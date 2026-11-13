// AI 호출 기록 — 엣지 함수 쪽 (2026-10-15). 관리자 «AI 기록» 탭이 기능별로 읽는다.
//
// 쓰는 법 두 가지:
//   ① 공급자 호출: `fetch` 대신 `aiLogFetch(ctx)` 가 돌려주는 함수를 쓴다. 호출 하나 = 기록 한 줄(level 'call').
//      응답은 손대지 않고 그대로 돌려주며, 복제본을 읽어 판정만 한다.
//   ② 요청 실패: 핸들러의 바깥 catch 에서 `logAiRequestFailure(ctx, error)` (level 'request').
//      공급자에 닿기 전에 죽은 실패(권한 · DB 조회 · 응답 해석)는 ①로는 남지 않는다 — 2026-09-12 종합 분석
//      장애가 바로 이 부류(uuid 캐스트 오류로 500)였다.
//
// **기록은 절대 던지지 않는다.** 기록하려다 원래 요청이 실패하면 진단을 도우려던 코드가 장애를 만든다.
// 쓰기는 서비스 롤로 표에 바로 넣는다(RLS 우회 — 표에는 쓰기 정책이 없다). 응답을 늦추지 않도록
// `EdgeRuntime.waitUntil` 로 응답 뒤에 마친다.
import {
  type AiCallFacts, type AiLogTag, clip, judgeAiResponse, judgeAiThrow, readAiLogTag, requestedModelOf, resolveAiFeature,
} from './aiCallLogCore.ts';

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void } | undefined;

export interface AiLogContext {
  /** 엣지 함수 이름 */
  fn: string;
  /** 기능 키 — 관리자 화면이 이것으로 묶는다 */
  feature: string;
  /** 그 기능 안의 동작(`chatCompletion` · `inquiryDesignAnalysis` · `stage:design` …) */
  action?: string | null;
  /** 사람이 읽을 동작 이름(클라이언트 `errorPrefix` 등) */
  label?: string | null;
  appPath?: string | null;
  userId?: string | null;
  /** 대상 학생의 학적 코드(이름이 아니다) */
  studentId?: string | null;
}

/** 브라우저 꼬리표(`params.aiLog`)와 함수의 기본값으로 문맥을 만든다 */
export function aiLogContext(fn: string, fallbackFeature: string, rawTag: unknown, extra: Partial<AiLogContext> = {}): AiLogContext {
  const tag: AiLogTag = readAiLogTag(rawTag);
  return { fn, feature: resolveAiFeature(tag, fallbackFeature), label: tag.label, appPath: tag.appPath, ...extra };
}

function track(task: Promise<unknown>) {
  try {
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) { EdgeRuntime.waitUntil(task); return; }
  } catch { /* 런타임이 waitUntil 을 모르면 그냥 흘려보낸다 */ }
  void task;
}

async function insertRow(row: Record<string, unknown>): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/rest/v1/ai_call_log`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn('ai_call_log insert failed', res.status, (await res.text()).slice(0, 200));
  } catch (error) {
    console.warn('ai_call_log insert failed', error instanceof Error ? error.message : String(error));
  }
}

function rowOf(ctx: AiLogContext, level: 'call' | 'request', facts: Partial<AiCallFacts>, durationMs: number | null, detail: Record<string, unknown> = {}) {
  return {
    fn: ctx.fn,
    feature: ctx.feature,
    action: clip(ctx.action, 80),
    label: clip(ctx.label, 80),
    app_path: ctx.appPath ?? null,
    level,
    outcome: facts.outcome ?? 'error',
    provider: facts.provider ?? null,
    model: facts.model ?? null,
    http_status: facts.httpStatus ?? null,
    duration_ms: durationMs === null ? null : Math.max(0, Math.round(durationMs)),
    finish_reason: facts.finishReason ?? null,
    prompt_tokens: facts.promptTokens ?? null,
    completion_tokens: facts.completionTokens ?? null,
    reasoning_tokens: facts.reasoningTokens ?? null,
    message: facts.message ?? null,
    user_id: ctx.userId ?? null,
    student_id: clip(ctx.studentId, 40),
    detail,
  };
}

/**
 * 기록하는 `fetch`. 공급자(OpenAI · Upstage)로 가는 요청만 기록하고, 나머지는 그냥 통과시킨다.
 * 시간은 응답 본문을 다 받을 때까지 잰다(헤더만 온 시점이면 긴 생성이 짧게 보인다).
 */
export function aiLogFetch(ctx: AiLogContext): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isProvider = url.includes('api.openai.com') || url.includes('api.upstage.ai');
    if (!isProvider) return fetch(input, init);
    const model = requestedModelOf(init?.body);
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      track(insertRow(rowOf(ctx, 'call', judgeAiThrow(url, model, error), Date.now() - started)));
      throw error;
    }
    const copy = response.clone();
    track((async () => {
      let json: unknown = null;
      try { json = JSON.parse(await copy.text()); } catch { /* 본문이 JSON 이 아니면 판정만 상태 코드로 */ }
      await insertRow(rowOf(ctx, 'call', judgeAiResponse(url, response.status, response.ok, json, model), Date.now() - started));
    })());
    return response;
  };
}

/** 요청 단위 실패. `startedAt` 을 주면 요청 전체 시간을 함께 남긴다 */
export function logAiRequestFailure(ctx: AiLogContext, error: unknown, opts: { startedAt?: number; httpStatus?: number; detail?: Record<string, unknown> } = {}) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
  track(insertRow(rowOf(
    ctx, 'request',
    { outcome: 'error', message: clip(message), httpStatus: opts.httpStatus ?? null },
    opts.startedAt ? Date.now() - opts.startedAt : null,
    opts.detail ?? {},
  )));
}

/**
 * 핸들러가 **던지지 않고** 5xx 응답으로 실패를 돌려준 경우를 기록하고 응답을 그대로 돌려준다.
 * (예: 종합 분석의 «direction analysis failed» 500 · 면담의 502). 4xx 는 남기지 않는다 —
 * 로그인 만료·형식 오류·일일 한도는 AI 장애가 아니고 기록만 덮는다.
 */
export async function withAiFailureLog(ctx: AiLogContext, response: Response, startedAt?: number): Promise<Response> {
  if (response.status < 500) return response;
  let message: unknown = `HTTP ${response.status}`;
  try {
    const body = await response.clone().json();
    if (body && typeof body === 'object' && 'error' in body) message = (body as { error: unknown }).error;
  } catch { /* 본문이 JSON 이 아니면 상태 코드만 */ }
  logAiRequestFailure(ctx, message, { startedAt, httpStatus: response.status });
  return response;
}

export { jwtSubject } from './aiCallLogCore.ts';
