// AI 호출 기록의 순수 판정부 (2026-10-15). Deno 전용 API 를 쓰지 않으므로 Node(tsx) 회귀가 그대로 import 한다.
//
// 기록하는 것: 언제 · 어느 기능 · 어느 모델이 · 얼마나 걸려 · 어떻게 끝났는가(성공/실패/빈 답/잘림) · 토큰 수.
// **기록하지 않는 것: 프롬프트와 응답 본문.** 학생 기록이 통째로 들어가 개인정보가 로그로 샌다
// (`ai_error_log` 와 같은 원칙). 공급자 오류 메시지도 잘라서만 담는다.

export type AiOutcome = 'success' | 'error' | 'empty' | 'truncated';
export type AiProviderName = 'openai' | 'solar' | 'other';
export type AiEndpoint = 'chat' | 'responses' | 'embeddings' | 'other';

export interface AiCallFacts {
  provider: AiProviderName;
  endpoint: AiEndpoint;
  model: string | null;
  httpStatus: number | null;
  outcome: AiOutcome;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  message: string | null;
}

/** 한 줄 메시지 상한 — 스택이나 원문을 통째로 담는 자리가 아니다 */
export const AI_LOG_MESSAGE_MAX = 500;

export function clip(value: unknown, max = AI_LOG_MESSAGE_MAX): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function providerOfUrl(url: string): AiProviderName {
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('api.upstage.ai')) return 'solar';
  return 'other';
}

export function endpointOfUrl(url: string): AiEndpoint {
  if (url.includes('/embeddings')) return 'embeddings';
  if (url.includes('/responses')) return 'responses';
  if (url.includes('/chat/completions')) return 'chat';
  return 'other';
}

/** 요청 본문에서 모델 이름만 읽는다(본문의 나머지는 보지 않는다) */
export function requestedModelOf(body: unknown): string | null {
  if (typeof body !== 'string') return null;
  const match = body.match(/"model"\s*:\s*"([^"]{1,80})"/);
  return match ? match[1] : null;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function chatContentEmpty(data: Record<string, any>): boolean {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim() === '';
  if (Array.isArray(content)) return !content.some((part) => typeof part?.text === 'string' && part.text.trim());
  return true;
}

function responsesContentEmpty(data: Record<string, any>): boolean {
  if (typeof data?.output_text === 'string') return data.output_text.trim() === '';
  const parts = Array.isArray(data?.output) ? data.output.flatMap((o: any) => (Array.isArray(o?.content) ? o.content : [])) : [];
  return !parts.some((p: any) => typeof p?.text === 'string' && p.text.trim());
}

/**
 * 공급자 응답 하나를 판정한다.
 *
 * - HTTP 실패 → `error`(공급자 메시지를 잘라 담는다)
 * - 본문이 비었다 → `empty` (추론이 예산을 다 쓴 경우가 대부분 — `finish_reason` 이 함께 남는다)
 * - `finish_reason=length` · Responses API `incomplete` → `truncated` (본문은 있지만 중간에 끊겼다)
 *
 * `empty` 를 `truncated` 보다 먼저 본다 — 둘 다면 «아무것도 못 받았다» 쪽이 처방을 정한다.
 */
export function judgeAiResponse(url: string, status: number, ok: boolean, json: unknown, requestedModel: string | null): AiCallFacts {
  const provider = providerOfUrl(url);
  const endpoint = endpointOfUrl(url);
  const data = (json && typeof json === 'object' ? json : {}) as Record<string, any>;
  const usage = (data.usage ?? {}) as Record<string, any>;
  const model = typeof data.model === 'string' && data.model ? data.model : requestedModel;

  const base: AiCallFacts = {
    provider, endpoint, model, httpStatus: status, outcome: 'success', finishReason: null,
    promptTokens: num(usage.prompt_tokens) ?? num(usage.input_tokens),
    completionTokens: num(usage.completion_tokens) ?? num(usage.output_tokens),
    reasoningTokens: num(usage.completion_tokens_details?.reasoning_tokens) ?? num(usage.output_tokens_details?.reasoning_tokens),
    message: null,
  };

  if (!ok) {
    const providerMessage = data.error?.message ?? data.error ?? data.message ?? null;
    return { ...base, outcome: 'error', message: clip(typeof providerMessage === 'string' ? providerMessage : `HTTP ${status}`) };
  }

  if (endpoint === 'chat') {
    const finishReason = typeof data.choices?.[0]?.finish_reason === 'string' ? data.choices[0].finish_reason : null;
    const empty = chatContentEmpty(data);
    return {
      ...base,
      finishReason,
      outcome: empty ? 'empty' : finishReason === 'length' ? 'truncated' : 'success',
      message: empty ? '응답 본문이 비어 있습니다' : finishReason === 'length' ? '응답이 출력 예산에서 잘렸습니다' : null,
    };
  }
  if (endpoint === 'responses') {
    const incomplete = data.status === 'incomplete';
    const finishReason = incomplete ? String(data.incomplete_details?.reason ?? 'incomplete') : typeof data.status === 'string' ? data.status : null;
    const empty = responsesContentEmpty(data);
    return {
      ...base,
      finishReason,
      outcome: empty ? 'empty' : incomplete ? 'truncated' : 'success',
      message: empty ? '응답 본문이 비어 있습니다' : incomplete ? '응답이 출력 예산에서 잘렸습니다' : null,
    };
  }
  return base;
}

/** 공급자에 닿기 전에 던져진 예외(시간 초과·연결 실패) */
export function judgeAiThrow(url: string, requestedModel: string | null, error: unknown): AiCallFacts {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return {
    provider: providerOfUrl(url), endpoint: endpointOfUrl(url), model: requestedModel, httpStatus: null,
    outcome: 'error', finishReason: null, promptTokens: null, completionTokens: null, reasoningTokens: null,
    message: clip(name === 'TimeoutError' ? `시간 초과(${message})` : name && name !== 'Error' ? `${name}: ${message}` : message),
  };
}

// ── 기능 이름 ──────────────────────────────────────────────

/** 기능 키 = 영소문자·숫자·하이픈. 클라이언트가 보낸 값이므로 모양을 거른다 */
const FEATURE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface AiLogTag { feature: string | null; label: string | null; appPath: string | null }

/** 브라우저가 실어 보낸 `aiLog` 꼬리표를 거른다 — 모양이 아니면 버린다(기록을 오염시키지 않게) */
export function readAiLogTag(raw: unknown): AiLogTag {
  const tag = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const feature = typeof tag.feature === 'string' && FEATURE_RE.test(tag.feature) ? tag.feature : null;
  const label = typeof tag.label === 'string' ? clip(tag.label, 80) : null;
  const appPath = typeof tag.appPath === 'string' && tag.appPath.startsWith('/') ? clip(tag.appPath.split('?')[0], 120) : null;
  return { feature, label, appPath };
}

/** 화면 주소의 첫 마디가 곧 기능이다(`/inquiry-design/…` → `inquiry-design`, `/` → `home`) */
export function featureOfPath(appPath: string | null): string | null {
  if (!appPath) return null;
  const first = appPath.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
  if (!first) return 'home';
  return FEATURE_RE.test(first) ? first : null;
}

/** 우선순위: 꼬리표의 기능 → 화면 주소 → 함수가 아는 기본값 */
export function resolveAiFeature(tag: AiLogTag, fallback: string): string {
  return tag.feature ?? featureOfPath(tag.appPath) ?? fallback;
}

/**
 * 토큰의 `sub`(사용자 id)만 읽는다 — **검증하지 않는다**. 기록에 «누가»를 적는 데만 쓴다.
 * 권한 판정에 쓰지 말 것(위조 토큰도 여기서는 읽힌다 — 실제 권한은 RLS 가 검증한다).
 */
export function jwtSubject(authHeader: string | null | undefined): string | null {
  try {
    const token = (authHeader ?? '').replace(/^Bearer\s+/i, '');
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
    return typeof payload?.sub === 'string' && /^[0-9a-f-]{36}$/i.test(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}
