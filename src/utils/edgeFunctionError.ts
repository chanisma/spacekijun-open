/**
 * supabase-js는 edge function의 비-2xx 응답을 `FunctionsHttpError`로 감싸고
 * 메시지를 "Edge Function returned a non-2xx status code"로 뭉갠다. 서버가 보낸
 * `{ error, message, quota }` 본문은 `error.context`(원본 Response)에만 남아
 * 있어서, 그냥 던지면 쿼터 초과·API 키 누락·모델 파라미터 거부가 화면에서
 * 전부 똑같은 "500"으로 보인다.
 *
 * 호출부는 `if (error) await throwEdgeFunctionError(error, '문서 AI 요청 실패')`
 * 형태로 쓴다. 본문을 읽을 수 없으면(JSON이 아니거나 이미 소비됐으면) 원래
 * 오류를 그대로 던져 정보를 잃지 않는다.
 *
 * **상태 코드는 메시지가 아니라 `EdgeFunctionError.status`로 전달한다 (2026-09-23).**
 * 종전엔 본문이 JSON이 아닌 응답(= 게이트웨이가 만든 504·502)에서 원래 오류를
 * 그대로 던졌는데, 그 메시지에는 숫자가 하나도 없어서 **호출부가 "재시도할 만한
 * 실패"인지 판별할 방법이 없었다** — 문서 분석의 `isRetryableError`가 `5\d\d`로
 * 걸러 보려 했지만 "non-2xx status code"에는 자릿수가 없어 단 한 번도 맞지 않았다.
 * 타입을 주면 문자열 매칭이 아니라 값으로 분기할 수 있다.
 */

/** 게이트웨이·서버가 벽시간을 넘겨 끊은 상태 코드. 재시도 대신 **요청을 줄이는** 신호다. */
const TIMEOUT_STATUSES = new Set([408, 504, 524]);

export class EdgeFunctionError extends Error {
  /** 원본 HTTP 상태. 네트워크 실패처럼 응답 자체가 없으면 null. */
  readonly status: number | null;
  /** 게이트웨이/서버 벽시간 초과(408·504·524). */
  readonly timedOut: boolean;

  constructor(message: string, status: number | null, options?: { cause?: unknown }) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.status = status;
    this.timedOut = status !== null && TIMEOUT_STATUSES.has(status);
    // `super(message, { cause })` 는 ES2022 lib 선언이 필요한데 이 프로젝트의 `lib` 은
    // 그보다 낮다(런타임은 지원한다). 원인 체인을 잃지 않도록 속성으로 단다 —
    // 이 값이 있어야 콘솔에서 원본 Response·상태를 끝까지 따라갈 수 있다.
    if (options && 'cause' in options) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** 이 오류가 "벽시간 초과"인가. 문자열이 아니라 값으로 판정한다. */
export function isEdgeTimeoutError(error: unknown): boolean {
  return error instanceof EdgeFunctionError && error.timedOut;
}

/** 이 오류가 "잠시 뒤 같은 요청이 성공할 수도 있는" 실패인가(5xx·429·네트워크). */
export function isEdgeRetryableError(error: unknown): boolean {
  if (!(error instanceof EdgeFunctionError)) return false;
  if (error.status === null) return true; // 네트워크 단절 — 재시도 가치가 있다
  return error.status === 429 || error.status >= 500;
}

function statusHint(status: number | null): string {
  if (status !== null && TIMEOUT_STATUSES.has(status)) {
    return '서버 제한 시간(약 150초) 안에 AI 응답이 오지 않았습니다. 자료를 나누거나 잠시 뒤 다시 시도해주세요.';
  }
  if (status === 429) return 'AI 사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도해주세요.';
  if (status === 401 || status === 403) return 'AI 요청 권한이 없습니다. 다시 로그인해주세요.';
  if (status !== null && status >= 500) return 'AI 서버가 일시적으로 응답하지 못했습니다. 잠시 뒤 다시 시도해주세요.';
  return '요청을 처리하지 못했습니다.';
}

export async function throwEdgeFunctionError(error: unknown, prefix?: string): Promise<never> {
  const context = (error as { context?: unknown })?.context;
  let body:
    | { error?: unknown; message?: unknown; quota?: { used?: number; limit?: number } }
    | null = null;
  let status: number | null = null;

  if (context instanceof Response) {
    status = context.status;
    // clone(): 응답 스트림은 한 번만 읽히므로 호출부의 읽기와 충돌하지 않게 한다.
    body = await context.clone().json().catch(() => null);
  }

  const message = body?.error ?? body?.message;
  const quota =
    typeof body?.quota?.used === 'number' ? ` (${body.quota.used}/${body.quota.limit})` : '';
  const head = prefix ? `${prefix}: ` : '';

  // 서버가 이유를 담아 보낸 경우 — 그 문장이 가장 정확하다.
  if (message) {
    throw new EdgeFunctionError(`${head}${String(message)}${quota}`, status, { cause: error });
  }
  // 본문이 없다 = 게이트웨이가 만든 응답(504 등). 상태 코드가 유일한 단서다.
  if (status !== null) {
    throw new EdgeFunctionError(`${head}${statusHint(status)} (HTTP ${status})`, status, { cause: error });
  }
  // 응답 자체가 없다(네트워크 단절). 원래 오류의 정보를 잃지 않도록 메시지를 물려준다.
  throw new EdgeFunctionError(
    `${head}${error instanceof Error ? error.message : '네트워크 요청이 실패했습니다.'}`,
    null,
    { cause: error }
  );
}
