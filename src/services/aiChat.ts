/**
 * 앱 공통 LLM 채팅 어댑터.
 *
 * 여러 기능이 각자 `supabase.functions.invoke('openai-proxy', {action:'chatCompletion'})`을
 * 복붙해 쓰고 있었다. 그래서 공급자를 바꾸려면 기능마다 손대야 했고, 모델 ID와
 * 오류 처리도 제각각으로 어긋났다. 진입점을 하나로 모아 **기본 공급자만 바꾸면
 * 전부 따라오게** 한다.
 *
 * 기본값 = Solar (2026-07-31). OpenAI 경로는 제거하지 않았고
 * `aiChat({ provider: 'openai' })`로 언제든 쓸 수 있다.
 *
 * 주의: `model`은 **공급자와 짝이 맞아야 한다**. OpenAI 모델 ID를 Solar 경로로
 * 보내면 Upstage가 거부한다. 그래서 호출부는 모델을 생략하고 공급자별 기본값을
 * 쓰는 것을 권장한다.
 */
import { supabase } from '@/integrations/supabase/client';
import { EdgeFunctionError, throwEdgeFunctionError } from '@/utils/edgeFunctionError';
import { aiLogTag } from '@/services/aiLogTag';

export type AiChatProvider = 'solar' | 'openai';

/**
 * Solar(Upstage) 추론 강도. **벽시간 예산이기도 하다** — 같은 설정이 모델에 따라
 * 비용이 100배 달라진다(CLAUDE.md의 pro3/pro4 실측). 추출·재작성 과제는 `'none'`,
 * 생성·분석 과제만 `'medium'` 이상을 쓴다.
 */
export type AiReasoningEffort = 'none' | 'low' | 'medium' | 'high';

/**
 * 호출부가 정한 제한 시간 안에 응답이 오지 않았다.
 *
 * ⚠️ **요청이 취소된 것은 아니다.** supabase-js v2의 `FunctionInvokeOptions`에는
 * `signal`이 없어서(실측: headers·method·region·body뿐) 진행 중인 엣지 함수 호출을
 * 중단시킬 수단이 없다. 이 오류는 "우리가 기다리기를 그만뒀다"는 뜻이고, 서버 쪽
 * 작업과 Upstage 과금은 그대로 계속된다. 그래서 **같은 요청을 곧바로 되쏘지 말 것** —
 * 더 작은 요청으로 바꿔서 다시 거는 것이 이 오류의 올바른 대처다.
 */
export class AiChatTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'AiChatTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * "잠시 뒤 다시 걸면 될 수도 있는" 실패인가. 문자열 매칭이 아니라 타입·상태로 본다.
 *
 * 종전에 기능마다 `/timeout|5\d\d|…/` 정규식을 복붙했는데, supabase-js가 504를
 * **숫자 없는 문장**("Edge Function returned a non-2xx status code")으로 뭉개서
 * 그 정규식이 단 한 번도 맞지 않았다. 판정은 여기 한 곳에서만 한다.
 */
export function isAiChatRetryableError(error: unknown): boolean {
  if (error instanceof AiChatTimeoutError) return true;
  if (error instanceof EdgeFunctionError) {
    if (error.status === null) return true;          // 네트워크 단절
    return error.status === 429 || error.status >= 500;
  }
  return /network|fetch failed|timeout|timed out|연결/i.test(
    error instanceof Error ? error.message : String(error)
  );
}

/** 벽시간을 넘겨 끊긴 실패인가. 재시도가 아니라 **요청 축소**가 정답인 부류. */
export function isAiChatTimeoutError(error: unknown): boolean {
  if (error instanceof AiChatTimeoutError) return true;
  return error instanceof EdgeFunctionError && error.timedOut;
}

/** 앱 전체 기본 공급자. 이 한 줄이 아래 기능 전부의 공급자를 정한다. */
export const DEFAULT_AI_CHAT_PROVIDER: AiChatProvider = 'solar';

/** openai 경로 기본 모델. */
export const OPENAI_CHAT_MODEL = 'gpt-6-luna';
/**
 * solar 경로에서 쓸 수 있는 모델(2026-08-14 `GET /v1/models` 실측 생존 확인).
 * 교체 시 **여기만 바꾸는 것으로 끝나지 않는다** — 아래 SOLAR_CHAT_MODEL 주석의
 * 7곳 목록을 전부 손봐야 한다.
 */
export const SOLAR_MODELS = {
  pro4: 'solar-pro4',
  /**
   * 보관: 2026-08-14에 pro4→pro3로 갔다가 2026-09-21 사용자 지시로 pro4로 되돌렸다.
   * 생존 확인됨. **지우지 말 것** — 이미 저장된 이력 행(`activity_analysis.model` 등)이
   * 이 값을 갖고 있고, 그 행을 해석하는 화면이 있다.
   */
  pro3: 'solar-pro3',
} as const;

/**
 * solar 경로 기본 모델. `solar-proxy` edge fn의 기본값과 **동기 유지 필요**.
 *
 * **모델 ID가 박힌 곳 (2026-09-21 기준)** — 여기 · `solar-proxy` 기본값 ·
 * `openai-proxy.SOLAR_MODEL` · `inquiry-comprehensive/providers.SOLAR_MODEL` ·
 * `evalog/activityAnalysisService.MODEL_NAME` · `evalog/utils/solarApi` 인라인.
 * 엣지 함수 3곳은 **재배포까지 해야** 서버가 바뀐다.
 *
 * 단 **`solar-proxy`의 기본값은 지금 앱에서 도달하지 않는다** — solar-proxy를 부르는
 * 세 곳(`aiChat` 자신 · `activityAnalysisService` · `solarApi`)과 `specFillService.solarProxyChat`이
 * 전부 `model`을 실어 보낸다. 서버 기본값은 안전망이지 실사용 경로가 아니므로,
 * 모델 교체는 **프런트 배포만으로 효력이 난다**(엣지 재배포는 안전망 정렬용).
 * 새 호출부에서 `model`을 생략하면 그 순간부터 서버 기본값이 실사용 경로가 된다.
 *
 * `research/_harness.MODEL`은 **더 이상 이 목록에 없다** — 2026-09-21에 기본값을 없애고
 * `RESEARCH_MODEL` 필수로 바꿨다(분절 모델은 `inquiry_activity.seg_model`로 저장돼
 * 코호트 비교 기준이 되므로 "앱 기본값을 따라가면" 안 된다).
 *
 * pro4 실측 튜닝값(추론 비중·처리율·벽시간)은 기억 노트 `solar-pro4-tuning-knowledge`에
 * 있고, 모델을 바꾸면 그 값들을 전부 재측정해야 한다.
 *
 * **2026-09-21 사용자 지시로 pro3 → pro4 복귀.** 이 한 줄이 바뀌면
 * `specFillService.PLAN_REASONING_EFFORT_BY_MODEL`의 pro4 항목(`reasoning_effort: 'none'`)이
 * **다시 살아난다** — 그 표는 "측정된 모델만" 담는 설계라 pro3에서는 조회가 빗나가
 * 파라미터를 아예 보내지 않고 있었다. 의도된 동작이지만, 계획 생성이 느려지거나
 * 빨라지면 여기부터 의심할 것.
 */
export const SOLAR_CHAT_MODEL: string = SOLAR_MODELS.pro4;

/**
 * 이 호출이 어떤 종류의 일인가. **추론 강도를 값이 아니라 «과제 성격»으로 선언**하게 한다.
 *
 * 호출부가 `'none'` 같은 값을 직접 적으면, 모델이 바뀔 때 그 값이 어느 모델에서 측정된
 * 것인지 아무도 모른 채 이월된다(이 저장소가 반복해서 데인 실패다 — `reasoningEffort:
 * 'medium'`이 2026-05-19에 정해진 뒤 pro3·pro4 어느 쪽으로도 재지 않은 채 남아 있었다).
 * 성격을 선언하면 «무엇이 측정됐는가»는 아래 표 한 곳만 보면 된다.
 *
 *   · `extraction` — 원문에 이미 있는 것을 옮겨 적거나 형식을 바꾸는 일.
 *     역설(패러프레이즈)·검색조건 추출·분석 JSON·문서에서 일정/업무 뽑기.
 *   · `generation` — 없던 글을 만드는 일. 공문·공지·암기카드·활동 기록 초안.
 */
export type AiTaskKind = 'extraction' | 'generation';

/**
 * 과제 성격 × 모델 → 추론 강도. **측정된 조합만 담는다.**
 *
 * 없으면 `undefined` 를 돌려주고 호출부는 아무것도 보내지 않는다 → `solar-proxy` 기본값
 * `'low'` 가 적용된다(미전송 ≠ 미적용). 새 모델은 **재고 나서** 여기에 추가할 것.
 *
 * **extraction × solar-pro4 = 'none' 의 근거**(2026-09-21·09-23 실측, 같은 하네스):
 *   · 세특 문장 재작성  `'none'` **0.6초**(추론 0) ↔ `'medium'` 52~80초(추론 87~100%)
 *   · 학교 문서 분석    `'none'` **33초**(추론 0) ↔ `'low'` **>180초 실패**
 * 품질(의미 보존·종결어미·한 문장·JSON 형식)은 3/3 동일했다.
 *
 * **generation × solar-pro4 = 'none' 의 근거**(2026-09-23, 같은 입력 전문 대조 —
 * `scripts/ai-chat-live-test/compare-effort.mts`): 종전 판단("생성 과제는 추론이 기여한다")에는
 * 측정이 붙어 있지 않았고, 재 보니 **추론이 기여한다는 증거가 없었다.**
 *   · 구매 공문  `'low'` 가 «2026 학년도»·«1 부»처럼 **숫자와 단위를 띄어 써** 공문 오식을
 *     만들었다. `'none'` 은 2회 모두 정확(34.8초 → 5.0·3.7초)
 *   · 창체 초안  `'low'` 가 **`keywords` 를 누락**하고 존댓말로 썼다. `'none'` 은 스키마를
 *     지키고 생기부 문체(평서체)를 썼다(32.1초 → 1.9·1.5초)
 *   · 공지 초안  불릿 ↔ 줄글 형태 차이뿐, 확인 사항은 `'none'` 이 더 많았다(26.7초 → 1.1·2.6초)
 *   · 암기카드  `'none'` 이 «~이며, ~는?» 식 **두 질문 결합**을 냈다 → 프롬프트에 "한 장에 한
 *     가지만 묻는다"를 더해 그 형태가 사라졌다(같은 입력 7건 → 1건). **완전히 없어진 것은
 *     아니고 «명칭과 그 특징은?» 같은 2속성 질문은 남지만, `'low'` 도 같은 형태를 낸다** —
 *     즉 `'low'` 수준으로 돌아온 것이지 그 이상은 아니다. 추론을 되켜는 대신 프롬프트로
 *     푸는 것은 `documentAiSearch` 의 학사력과 같은 처방이다.
 *
 * ⚠️ **벽시간은 effort 에 단조롭지 않다** — 암기카드는 `'none'` 이 오히려 느렸다(13.2초 →
 * 35.7초). 본문 토큰을 더 쓰기 때문이다. `'none'` 이 사는 것은 «속도»가 아니라
 * **버려지는 추론 토큰**이고, 그 결과로 벽시간 분산(공문 34.8~130.6초)이 사라진다.
 */
const REASONING_EFFORT_BY_TASK_AND_MODEL: Record<AiTaskKind, Record<string, AiReasoningEffort>> = {
  extraction: { [SOLAR_MODELS.pro4]: 'none' },
  generation: { [SOLAR_MODELS.pro4]: 'none' },
};

/**
 * 이 과제·이 공급자·이 모델에서 **측정된** 추론 강도. 없으면 `undefined`(= 보내지 않음).
 *
 * solar 경로가 아니면 언제나 `undefined` 다 — `openai-proxy` 는 이 키를 모른다.
 */
export function reasoningEffortFor(
  kind: AiTaskKind,
  provider: AiChatProvider = DEFAULT_AI_CHAT_PROVIDER,
  model?: string
): AiReasoningEffort | undefined {
  if (provider !== 'solar') return undefined;
  return REASONING_EFFORT_BY_TASK_AND_MODEL[kind][resolveAiChatModel(provider, model)];
}

/** 실제로 사용될 모델 ID. 이력·로그에 "무엇으로 돌렸는지" 기록할 때 쓴다. */
export function resolveAiChatModel(
  provider: AiChatProvider = DEFAULT_AI_CHAT_PROVIDER,
  model?: string
): string {
  if (model) return model;
  return provider === 'solar' ? SOLAR_CHAT_MODEL : OPENAI_CHAT_MODEL;
}

export interface AiChatParams {
  systemPrompt: string;
  userPrompt: string;
  provider?: AiChatProvider;
  /** 공급자에 맞는 모델 ID. 생략 시 공급자별 기본값. */
  model?: string;
  temperature?: number;
  /**
   * 출력 토큰 상한. **openai 경로에서만 전달된다** — `solar-proxy`는 `max_tokens`를
   * 받지 않으므로 solar 경로에서는 이 값이 **조용히 무시된다**.
   *
   * ⚠️ **기본 공급자가 solar이므로, 이 값을 적어 둔 것만으로는 예산이 정해지지 않는다.**
   * 입시 정보 AI 분석이 이것 때문에 실패했다(2026-09-11): 서비스가 12000을 적어
   * 두었는데 solar 경로라 전달되지 않았고, 추론 토큰과 최종 출력이 같은 예산을 나눠 쓰는
   * 모델에서 답이 중간에 끊겨 `JSON을 찾을 수 없습니다`가 됐다. **예산이 결과 품질에
   * 중요한 호출은 `provider: 'openai'`로 보내거나(그쪽은 `max_completion_tokens`로
   * 실제 전달된다) solar-proxy에 상한 지원을 추가해야 한다.**
   */
  maxCompletionTokens?: number;
  /**
   * Solar 추론 강도. **solar 경로에서만 전달된다**(openai-proxy는 이 키를 모른다).
   *
   * 세 값이 서로 다른 요청이라는 점에 주의한다 —
   *   · `undefined`(생략) → 아무것도 안 보냄 → **`solar-proxy`의 기본값 `'low'`가 적용**
   *   · `null`            → `reasoning_effort` 키를 **아예 뺀 요청**(모델 기본값)
   *   · `'none'`          → 추론을 끄라고 **명시**
   * "안 보내는 것"과 "끄는 것"이 다르다 — 종전에 이 구분이 없어서 추출 과제들이
   * 전부 `'low'`로 나갔고, pro4는 `'low'`에서도 출력의 79~99%를 추론에 써
   * 엣지 게이트웨이(≈150초)에 걸렸다.
   *
   * **모델마다 재측정할 것.** 같은 값이 모델에 따라 8초가 되기도 2분이 되기도 한다
   * (CLAUDE.md). 호출부는 `PLAN_REASONING_EFFORT_BY_MODEL` 같은 "측정된 모델만 담는 표"로
   * 유도해 넘기는 것이 규약이다.
   */
  reasoningEffort?: AiReasoningEffort | null;
  /**
   * 이 시간을 넘기면 기다리기를 그만두고 `AiChatTimeoutError`를 던진다.
   *
   * ⚠️ **요청을 취소하지는 못한다**(`AiChatTimeoutError` 주석 참조). 그래서 이 값은
   * "포기하고 **다른 전략**으로 넘어갈 시점"을 정하는 용도다 — 같은 요청을 되쏘는
   * 재시도에 쓰면 느리게 실패하는 경로를 하나 더 만들 뿐이다.
   *
   * 엣지 게이트웨이가 약 150초에 504를 내므로, 그보다 **짧게** 잡아야 우리가 먼저
   * 판단권을 갖는다. 그대로 두면 150초를 버린 뒤에야 대안을 시작하게 된다.
   */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 오류 메시지 앞에 붙일 기능 이름. 예: '문서 AI 분석 실패' */
  errorPrefix?: string;
  /**
   * 관리자 «AI 기록»의 기능 이름. **보통은 생략한다** — 서버가 지금 화면 주소의 첫 마디로 기능을 정한다
   * (`aiLogTag`). 한 화면 안의 서로 다른 AI 기능을 갈라 보고 싶을 때만 적는다.
   */
  logFeature?: string;
}

export interface AiChatResponse {
  text: string;
  /**
   * 공급자가 알려준 종료 사유(`stop` · `length` · …). 서버가 주지 않으면 null.
   *
   * **`length`는 "답이 잘렸다"의 확정 증거**다. 이 값이 없으면 잘린 응답과
   * 형식을 어긴 응답을 화면에서 구분할 수 없어 사용자에게 엉뚱한 다음 행동을 안내한다
   * (잘림은 다시 눌러도 같다 → 입력을 줄여야 한다).
   *
   * 두 프록시 모두 이제 이 값을 돌려준다 — openai-proxy 2026-09-23, solar-proxy 2026-09-27(v75).
   * (그 전 기록: 2026-09-11 에는 두 프록시 모두 항상 null 이었다.)
   */
  finishReason: string | null;
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
  /** 실제로 응답한 모델. 이력·표시용. */
  model: string;
  provider: AiChatProvider;
}

/**
 * `functions.invoke`를 제한 시간과 함께 건다.
 *
 * supabase-js v2의 invoke에는 `signal`이 없어 **중단시킬 수 없으므로** 경주(race)로
 * 구현한다. 진 쪽(진짜 요청)은 계속 돌다가 조용히 버려지는데, 그 프라미스에 아무도
 * 붙어 있지 않으면 나중에 unhandled rejection 이 되므로 빈 catch 를 달아 둔다.
 * (현재 구현의 invoke 는 내부에서 전부 try/catch 해 거절하지 않지만, 라이브러리
 * 구현에 기대지 않는다.)
 */
async function invokeWithTimeout(
  fn: string,
  body: Record<string, unknown>,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
  prefix: string
): Promise<{ data: unknown; error: unknown }> {
  const invocation = supabase.functions.invoke(fn, { body }) as Promise<{
    data: unknown; error: unknown;
  }>;
  const wantsTimeout = typeof timeoutMs === 'number' && timeoutMs > 0;
  if (!wantsTimeout && !signal) return invocation;

  // 진 쪽(실제 요청)은 계속 돌다 버려진다 — 아무도 붙어 있지 않으면 나중에
  // unhandled rejection 이 되므로 빈 catch 를 달아 둔다.
  void invocation.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const racers: Promise<{ data: unknown; error: unknown }>[] = [invocation];

  if (wantsTimeout) {
    racers.push(new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new AiChatTimeoutError(
          `${prefix}: ${Math.round(timeoutMs! / 1000)}초 안에 AI 응답이 오지 않았습니다.`,
          timeoutMs!
        )),
        timeoutMs
      );
    }));
  }
  // 취소를 누른 사용자가 응답이 돌아올 때까지 기다리지 않게 한다. 종전에는 호출
  // **전후로만** `aborted`를 봤기 때문에 [분석 취소]가 화면만 바꾸고 실제로는
  // 계속 기다렸다(그 사이 다시 누르면 요청만 하나 더 쌓였다).
  if (signal) {
    racers.push(new Promise<never>((_, reject) => {
      if (signal.aborted) { reject(new Error(`${prefix}: 취소되었습니다.`)); return; }
      onAbort = () => reject(new Error(`${prefix}: 취소되었습니다.`));
      signal.addEventListener('abort', onAbort, { once: true });
    }));
  }

  try {
    return await Promise.race(racers);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * 응답 본문 + 메타를 함께 받는다.
 *
 * 파싱 실패를 다뤄야 하는 호출부(구조화된 JSON을 기대하는 쪽)는 이걸 쓴다 —
 * `finishReason`이 있어야 "잘렸다"와 "형식을 어겼다"를 갈라 안내할 수 있다.
 */
export async function aiChatDetailed(params: AiChatParams): Promise<AiChatResponse> {
  const provider = params.provider ?? DEFAULT_AI_CHAT_PROVIDER;
  const prefix = params.errorPrefix ?? 'AI 요청 실패';
  if (params.signal?.aborted) throw new Error(`${prefix}: 취소되었습니다.`);

  const model = resolveAiChatModel(provider, params.model);
  const body: Record<string, unknown> = {
    action: 'chatCompletion',
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    model,
    // 기록용 꼬리표(화면 주소 · 동작 이름) — 서버가 떼어 내 프롬프트에는 섞지 않는다
    aiLog: aiLogTag(params.errorPrefix, params.logFeature),
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  // solar 경로에는 싣지 않는다 — `solar-proxy`가 `max_tokens`를 보내지 않으므로 무의미하고,
  // 프록시에 상한을 도입하면 상한이 없던 다른 호출부(문서 생성 등)의 긴 출력을 새로 자른다.
  if (provider === 'openai' && params.maxCompletionTokens !== undefined) {
    body.maxCompletionTokens = params.maxCompletionTokens;
  }
  // openai-proxy 는 이 키를 모른다. 보내면 무시되거나(운이 좋으면) 400이 되므로 갈라 둔다.
  if (provider === 'solar' && params.reasoningEffort !== undefined) {
    body.reasoningEffort = params.reasoningEffort;
  }

  const fn = provider === 'solar' ? 'solar-proxy' : 'openai-proxy';
  const { data, error } = await invokeWithTimeout(fn, body, params.timeoutMs, params.signal, prefix);

  if (params.signal?.aborted) throw new Error(`${prefix}: 취소되었습니다.`);
  if (error) await throwEdgeFunctionError(error, `${prefix}(${provider})`);

  const payload = data as {
    result?: string;
    content?: string;
    error?: string;
    finishReason?: string;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  } | null;
  if (payload?.error) throw new Error(`${prefix}(${provider}): ${payload.error}`);

  const raw = payload?.result ?? payload?.content;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`${prefix}: 유효한 응답을 받지 못했습니다.`);
  }

  return {
    text: raw,
    finishReason: payload?.finishReason ?? null,
    usage: payload?.usage
      ? {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens,
        }
      : null,
    model: payload?.model ?? model,
    provider,
  };
}

export async function aiChat(params: AiChatParams): Promise<string> {
  return (await aiChatDetailed(params)).text;
}
