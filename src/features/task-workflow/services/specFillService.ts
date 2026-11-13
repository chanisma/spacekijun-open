// Action Spec 파이프라인의 앱 어댑터 계층.
// 엔진(document/spec)은 플랫폼 비의존 — 여기서 supabase(LLM edge fn·DB)를 주입한다.
// 향후 `document.spec_fill@1` 러너 UI가 runSpecFillPipeline을 호출한다.

import { supabase } from '@/integrations/supabase/client';
import { throwEdgeFunctionError } from '@/utils/edgeFunctionError';
import { DEFAULT_RHWP_AI_MODEL } from '@/lib/rhwp/aiDocumentWriter';
import { SOLAR_CHAT_MODEL, SOLAR_MODELS } from '@/services/aiChat';
import { aiLogTag } from '@/services/aiLogTag';
import {
  type ChatFn, type CheckResult, collectRegionExamples, collectRowProseColumns, type DbFetch,
  derivePlanSchema, generateRowProseColumn,
  isEmptyPlanValue, mergePlanWithUserValues,
  fillDocument, type FillOutput, generatePlan, generatePlanChunked, makeLlmProseGenerator, normalizeSpecPlanKeys,
  type Plan, type PlanFieldSchema,
  resolveKnowledge, retryableTargets, verifyDocument, type WorkSpec,
  DEFAULT_SPEC_FILL_MODE, logSpecFillIssue, resolvePrompt, resolveSpecFillOptions,
  type SpecFillMode, type SpecFillOptions,
} from '../document/spec';

// 호환 re-export: 러너 등 기존 import 경로 유지
export {
  isEmptyPlanValue, mergePlanWithUserValues, DEFAULT_SPEC_FILL_MODE,
  type SpecFillMode, type SpecFillOptions,
};

/**
 * openai-proxy edge fn 경유 채팅 팩토리(클라이언트 API 키 없음) — aiDocumentWriter와 동일 경로.
 *
 * **모델을 인자로 받는다.** 엣지 함수는 `model`을 그대로 OpenAI로 넘기고 allowlist가 없어
 * 모델 교체에 재배포가 필요 없다.
 *
 * **온도도 인자다**(기본 0.2) — 경로마다 값이 다르고, 한 곳을 튜닝하려고 상수를 고치면
 * 이 팩토리를 쓰는 다른 경로까지 조용히 함께 바뀐다. 다만 reasoning 계열 모델은 custom
 * temperature를 거부하므로, 엣지 함수가 400을 받으면 **temperature만 떼고 자동 재시도**한다
 * — 그런 모델에서는 여기 값이 무엇이든 결과에 반영되지 않는다.
 */
function makeOpenAiProxyChat(
  model: string,
  fallbackMaxTokens: number,
  temperature = 0.2,
  /**
   * 추론 강도. **생략하면 보내지 않는다 = 모델 기본값**(2026-09-23 이전과 같은 동작).
   *
   * ⚠️ **모델마다 필요한 추론 수준이 다르므로 여기 기본값을 박지 않는다**(사용자 지적,
   * 2026-09-23). 팩토리를 쓰는 경로마다 자기 모델에서 «재 보고» 정한 값을 넘긴다.
   */
  reasoningEffort?: string,
): ChatFn {
  return async ({ systemPrompt, userPrompt, maxTokens }) => {
    const { data, error } = await supabase.functions.invoke('openai-proxy', {
      body: {
        action: 'chatCompletion',
        aiLog: aiLogTag('문서 스펙 채우기'),
        // 방언을 **이 시점에** 해석한다 — 프롬프트를 미리 문자열로 굳히면 fallback이
        // 앞 모델용 지시문을 그대로 물려받는다(promptMode.ts 참조)
        systemPrompt: resolvePrompt(systemPrompt, 'luna'),
        userPrompt: resolvePrompt(userPrompt, 'luna'),
        model,
        temperature,
        maxCompletionTokens: maxTokens ?? fallbackMaxTokens,
        ...(reasoningEffort ? { reasoningEffort } : {}),
      },
    });
    if (error) await throwEdgeFunctionError(error, '문서 AI 요청 실패');
    if ((data as { error?: string })?.error) throw new Error(`문서 AI 요청 실패: ${(data as { error: string }).error}`);
    const raw = (data as { result?: string; content?: string })?.result ?? (data as { content?: string })?.content;
    /**
     * 추론 비중·잘림 여부를 콘솔에 남긴다 (2026-09-23).
     *
     * 엣지 함수가 `usage`·`finishReason` 을 돌려주기 시작했는데 여기서 버리면, 추론 강도를
     * 바꿔 보고도 **무엇이 달라졌는지 잴 방법이 없다**(벽시간만으로는 추론 때문인지 모른다).
     * `finish_reason === 'length'` 는 "답이 잘렸다"의 **유일한 확정 증거**이기도 하다 —
     * 잘림은 다시 눌러도 같으므로 입력을 줄여야 하는데, 그걸 모르면 계속 다시 누르게 된다.
     */
    const meta = data as { finishReason?: string | null; model?: string; usage?: {
      completion_tokens?: number; prompt_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    } | null } | null;
    const completion = meta?.usage?.completion_tokens;
    const reasoning = meta?.usage?.completion_tokens_details?.reasoning_tokens;
    if (completion != null) {
      const share = reasoning != null && completion ? ` (${Math.round((reasoning / completion) * 100)}%)` : '';
      console.info(
        `[docgen] ${meta?.model ?? model} · effort=${reasoningEffort ?? '(미전송)'}`
        + ` · 출력 ${completion}토큰 · 추론 ${reasoning ?? '?'}${share}`
        + ` · prompt ${meta?.usage?.prompt_tokens ?? '?'} · finish=${meta?.finishReason ?? '?'}`
      );
    }
    if (typeof raw !== 'string' || !raw.trim()) {
      // 잘린 것과 형식을 어긴 것은 다음 행동이 다르다 — 구분해 말한다.
      throw new Error(meta?.finishReason === 'length'
        ? 'AI 응답이 출력 예산 안에서 끝나지 않았습니다(추론 토큰이 예산을 다 썼을 수 있습니다). 입력을 줄이거나 추론 강도를 낮춰주세요.'
        : 'AI에서 유효한 응답을 받지 못했습니다.');
    }
    return raw;
  };
}

/** openai-proxy 경유 채팅 — 기존 동작 유지(모델 = `resolveAiChatModel()` 앱 기본값) */
export const openAiProxyChat: ChatFn = makeOpenAiProxyChat(DEFAULT_RHWP_AI_MODEL, 4000);

/**
 * 계획 생성의 추론 강도 — **모델에서 유도한다**.
 *
 * `'none'`의 근거는 **`solar-pro4` 실측 하나뿐**이다(2026-08-09): `'low'`에서도 출력 토큰의
 * 79~85%가 추론이었고(4774중 4096 · 3237중 2568 · 4520중 3781) 그 벽시간이 엣지 함수
 * 게이트웨이(≈150초)를 넘겨 504를 냈다. 같은 입력 비교 low 278초 / none 198초이고
 * 품질도 none이 나았다(채워진 필드 52/65·오류 0).
 *
 * **그 근거가 다른 모델로 이월되지 않는다.** `solar-pro3`은 `reasoning_effort`를 받는지도
 * 검증된 바 없고(CLAUDE.md의 "low/medium/none/high 모두 수용"은 open2·pro4 실측이다),
 * 애초에 추론 비중이 다르면 `'none'`이 이득이 아닐 수 있다. 그래서 **측정된 모델에만**
 * 적용하고 나머지는 값을 보내지 않아 모델·서버 기본값이 그대로 쓰이게 둔다.
 *
 * pro3에서 실측한 뒤 값이 정해지면 이 표에 추가할 것.
 */
const PLAN_REASONING_EFFORT_BY_MODEL: Record<string, string> = {
  [SOLAR_MODELS.pro4]: 'none',
};

/**
 * Solar(Upstage) 경유 채팅 — solar-proxy edge fn(응답 `{result}`).
 *
 * **모델을 명시해 보낸다.** 예전엔 생략해서 엣지 함수 기본값에 기댔는데, 그 탓에
 * `solar-open2` 폐기 때 이 경로만 홀로 죽었다(프런트를 배포해도 서버 기본값이 낡아 있으면
 * 스펙 채움만 계속 실패). 명시하면 앱이 쓰는 모델이 한 곳(`SOLAR_CHAT_MODEL`)으로 확정된다.
 */
function makeSolarProxyChat(temperature: number): ChatFn {
  return async ({ systemPrompt, userPrompt }) => {
    const effort = PLAN_REASONING_EFFORT_BY_MODEL[SOLAR_CHAT_MODEL];
    const { data, error } = await supabase.functions.invoke('solar-proxy', {
      body: {
        action: 'chatCompletion',
        aiLog: aiLogTag('문서 스펙 채우기'),
        systemPrompt: resolvePrompt(systemPrompt, 'solar'),
        userPrompt: resolvePrompt(userPrompt, 'solar'),
        model: SOLAR_CHAT_MODEL, temperature,
        // 미측정 모델에는 값을 지정하지 않는다 → **엣지 함수 기본값 `'low'`가 적용된다**
        // (아예 안 보내는 것이 아니다). 추론 파라미터 자체를 빼려면 `null`을 보내야 한다.
        ...(effort ? { reasoningEffort: effort } : {}),
      },
    });
    if (error) await throwEdgeFunctionError(error, '문서 AI 요청 실패(Solar)');
    if ((data as { error?: string })?.error) throw new Error(`문서 AI 요청 실패(Solar): ${(data as { error: string }).error}`);
    const raw = (data as { result?: string })?.result;
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Solar에서 유효한 응답을 받지 못했습니다.');
    return raw;
  };
}

export const solarProxyChat: ChatFn = makeSolarProxyChat(0.2);

// ── 스펙 채움 모델 구성 (2026-09-03) ─────────────────────────────────────────
//
// **`gpt-6-luna`(OpenAI) 단독** — 문서 생성 페이지든 워크플로 캔버스든 **같은 모델**을
// 쓴다. 종전에는 `config.origin === 'docgen'`만 luna로 갈랐는데, 실사용의 대부분이
// 워크플로·할 일 실행(`origin` 없음)라 거기서 계속 Solar 가 쓰였고 504 로 죽었다
// (`defaultSpecChat` 주석 참조).
//
// **모델 상수를 `aiChat.ts`에 두지 않은 것은 의도적이다** — 거기 값은 앱 전역 기본이라
// 스펙 채움 전용 모델이 섞이면 다른 기능(세특 작성·입시 뉴스 등)까지 끌려간다.

/** 문서 생성 경로 메인 모델. 공급자와 짝이 맞아야 한다(OpenAI 모델 → openai-proxy). */
export const DOCGEN_SPEC_CHAT_MODEL = 'gpt-6-luna';

/**
 * 문서 생성 경로 온도(사용자 지정, 2026-09-02).
 *
 * **모델이 custom temperature를 거부하면 이 값은 무시된다** — `openai-proxy`가 400을 받으면
 * temperature를 뗀 채 재시도하므로, 그때는 공급자 기본값(1.0)으로 나가고 **오류도 나지
 * 않는다**. 값을 바꿨는데 출력 성향이 그대로면 프롬프트를 의심하기 전에 이 경로부터
 * 확인할 것(현재 이 재시도는 로그를 남기지 않는다).
 */
export const DOCGEN_SPEC_TEMPERATURE = 0.7;

/**
 * ── 두 경로의 LLM 파라미터 대조(2026-09-02) ─────────────────────────────────
 *
 * |            | luna — **스펙 채움 전 경로**     | solar-pro3 — 지금은 미사용       |
 * |------------|--------------------------------|---------------------------------|
 * | temperature| 0.7 (`DOCGEN_SPEC_TEMPERATURE`) | 0.2 (`solarProxyChat`)          |
 * | 토큰 예산   | `max_completion_tokens` 하한 12,000, 계획 생성은 호출부가 더 크게 지정 | **미전달** = Upstage 기본 |
 * | reasoning  | 미전송                          | 엣지 기본 `'low'`               |
 *
 * **스펙 채움은 이제 luna 하나만 쓴다** — 화면에 따라 모델이 갈리지 않으므로 "어느 모델이
 * 답했는지"를 추적할 필요가 없다. `solarProxyChat` 은 되살릴 때를 위해 남겨 둔 것이고
 * 현재 호출부는 없다.
 *
 * **토큰 예산이 두 경로에서 다른 것은 의도적이다.** 12,000은 *올리는* 하한이다 —
 * openai-proxy 기본이 10,000이고 호출부가 4,000을 넘기기도 하는데, 추론 토큰과 최종 출력이
 * 같은 예산을 나눠 쓰므로 예산이 빠듯하면 `content`가 빈 채 `finish_reason='length'`로
 * 끝난다. 반면 `solar-proxy`의 `chatCompletion`은 **`max_tokens`를 아예 보내지 않아**
 * 상한이 공급자 기본이다 — 낮은 천장이 없으므로 같은 실패 모드가 없고, 하한을 흉내 낼
 * 대상도 없다. (부작용: `ChatFn`의 `maxTokens` 인자는 Solar 경로에서 **조용히 무시된다** —
 * 서술 열 6,000·라벨 제안 2,000 지정이 여기서는 효력이 없다. 지금은 상한이 없는 쪽이
 * 안전한 방향이라 그대로 두지만, 나중에 Solar에 상한을 도입한다면 이 인자부터 살릴 것.)
 *
 * **`reasoning_effort`는 pro3 미측정이라 지정하지 않는다.** CLAUDE.md의 `'none'` 근거는
 * pro4 실측 하나뿐이고 이월되지 않는다. 엣지 기본 `'low'`가 적용된다(미전송 ≠ 미적용).
 * pro3의 추론 벽시간이 길어(126~151초 실측) 문서 생성에서 504를 냈고, 그것이 fallback을
 * 제거한 이유다 — 되살리려면 이 값부터 실측해 `PLAN_REASONING_EFFORT_BY_MODEL`에 넣을 것.
 */

/**
 * 스펙 채움 채팅 — **luna 단독. Solar 미사용**(2026-09-02~03 사용자 결정).
 *
 * 토큰 하한을 12,000으로 잡는다(팩토리 기본 4,000이 아니라). 추론 모델은 추론 토큰과 최종
 * 출력이 같은 예산을 나눠 쓰므로, 예산이 빠듯하면 `content`가 빈 채 `finish_reason='length'`로
 * 끝나고 우리 코드에는 "유효한 응답 없음"으로만 보인다. 계획 생성은 되돌려 쓸 양에 맞춰
 * 호출부(`generatePlan`)가 더 큰 값을 명시한다.
 *
 * 한때 luna 실패 시 `solar-pro3`로 넘어갔지만 **되레 해로웠다**: Solar 는 추론 모델이라
 * 응답이 126~151초에 이르고(CLAUDE.md 실측) 엣지 함수 게이트웨이 한계에 걸려
 * **504 Gateway Timeout**이 났다. 즉 fallback 이 "느리게 실패하는 경로"를 하나 더
 * 붙였을 뿐이고, 사용자는 이미 실패한 요청을 2분 더 기다려야 했다.
 *
 * **대신 견고함은 다른 층에서 얻는다**(같은 날 보강):
 *   · 파싱 실패를 재시도한다(종전에는 한 번 잘리면 전체 생성이 죽었다)
 *   · 출력 예산을 되돌려 쓸 양에 맞춰 늘린다(잘림 자체를 줄인다)
 *   · 씨앗을 행 단위로 쪼개 프롬프트가 부풀지 않게 한다
 * 공급자를 갈아타는 것보다 **요청을 애초에 성공 가능한 크기로 만드는 쪽**이 효과가 컸다.
 *
 * 되살릴 일이 생기면 `makeSolarProxyChat`이 그대로 있으니 감싸기만 하면 된다 — 다만
 * 벽시간 문제를 먼저 해결할 것(짧은 프롬프트로만 쓰거나 `reasoning_effort`를 낮추는 등).
 */
/**
 * 문서 생성의 추론 강도 — **시험값이다. 아직 측정되지 않았다** (2026-09-23 사용자 지시).
 *
 * 종전에는 클라이언트도 엣지 함수도 `reasoning_effort` 를 **아예 보내지 않아** OpenAI
 * 모델 기본값이 적용됐고, 그 값이 얼마인지 코드로는 알 수 없었다. 먼저 `'low'` 로 놓고
 * 재 본다.
 *
 * ⚠️ **Solar 의 `reasoningEffortFor` 표에 넣지 않았다.** 그 표의 계약은 «측정된 (과제×모델)
 * 조합만 담는다» 인데 luna 는 아직 재 본 적이 없다 — 미측정값을 그 표에 넣으면 표가
 * 무엇을 보증하는지가 무너진다. 측정이 끝나면 그때 표로 옮길 것.
 *
 * ⚠️ **`PLAN_REASONING_EFFORT_BY_MODEL` 의 `'none'` 은 여기 적용되지 않는다** — 그 값은
 * `solar-pro4` 실측이고 `makeSolarProxyChat` 안에서만 읽히는데, 그 경로는 현재 **호출부가
 * 0곳**이다(도달 불가). 모델이 다르면 필요한 추론 수준도 다르므로 이월해서도 안 된다.
 *
 * 측정 = `npx tsx --tsconfig tsconfig.app.json scripts/ai-chat-live-test/docgen-effort.mts`
 * (`.env.local` 에 `OPENAI_API_KEY` 필요 — 배포 없이 로컬에서 A/B 한다)
 */
export const DOCGEN_REASONING_EFFORT = 'low';

export const docGenSpecChat: ChatFn = makeOpenAiProxyChat(
  DOCGEN_SPEC_CHAT_MODEL, 12000, DOCGEN_SPEC_TEMPERATURE, DOCGEN_REASONING_EFFORT,
);

/**
 * 스펙 채움 파이프라인의 기본 채팅 — **luna**(2026-09-03 변경).
 *
 * 종전에는 Solar 였고 문서 생성 페이지(`config.origin='docgen'`)만 luna로 갈랐다. 그런데
 * **실사용의 대부분이 워크플로/할 일 실행**(`origin` 없음)라 여전히 Solar 로 갔고,
 * 29행짜리 서술 열에서 `Request idle timeout limit (150s) reached` 로 계속 죽었다.
 * Solar 는 추론 모델이라 응답이 126~151초에 이르러 엣지 게이트웨이 한계에 걸린다.
 *
 * 즉 분기가 **실제 사용 경로와 어긋나 있었다** — 사용자는 "이 기능은 luna"라고 했는데
 * 화면에 따라 조용히 Solar 가 쓰였다. 이제 경로를 가르지 않는다.
 *
 * `solarProxyChat` 은 지웠지 않았다 — 다시 쓸 일이 생기면 여기만 바꾸면 된다.
 */
export const defaultSpecChat: ChatFn = docGenSpecChat;

/**
 * 실행 하나가 쓸 채팅 — **경로를 가르지 않는다**(2026-09-03).
 *
 * 종전에는 `config.origin === 'docgen'`이면 luna, 아니면 Solar 였다. 그 분기가 실사용과
 * 어긋나(워크플로·할 일 실행이 대부분인데 그쪽이 Solar) 504 가 반복됐다 —
 * `defaultSpecChat` 주석 참조. 지금은 어느 화면에서 열든 같은 모델을 쓴다.
 *
 * 함수를 남겨 둔 이유: 호출부가 이미 이걸 쓰고 있고, 나중에 다시 갈라야 할 때
 * **여기 한 곳만** 고치면 되기 때문이다.
 */
export function specChatForWorkConfig(_config: Record<string, unknown> | null | undefined): ChatFn {
  return defaultSpecChat;
}

/** knowledge db 소스 해석 — RLS는 호출 사용자 권한 그대로 적용된다 */
export const supabaseDbFetch: DbFetch = async ({ table, select, params }) => {
  let q = supabase.from(table as never).select(select ?? '*');
  for (const [k, v] of Object.entries(params ?? {})) q = q.eq(k as never, v as never);
  const { data, error } = await q.limit(500);
  if (error) throw new Error(`knowledge 조회 실패(${table}): ${error.message}`);
  return data;
};

export interface SpecFillPipelineInput {
  spec: WorkSpec;
  /** 원본 HWPX의 섹션 XML들(문서 순서) */
  sections: string[];
  /** 사용자가 plan 생성에 보태는 자유 컨텍스트 */
  userContext?: string;
  /** user-input knowledge 키에 대한 값 */
  userInputs?: Record<string, unknown>;
  /** 사람이 검토·수정한 plan(있으면 LLM plan 생성 생략 — 검토 후 재실행 경로) */
  plan?: Plan;
  /** 저장된 확정 값(prose 포함) 재주입 — 키 있는 prose는 LLM 생략, 값-기반 완성본 재구성 경로 */
  presetValues?: Record<string, unknown>;
  chat?: ChatFn;
  db?: DbFetch;
  /**
   * 작성 모드 — `'strict'`(기본): 자료에 없는 사실을 만들지 않는다.
   * `'generate'`: 사용자가 "빈 칸을 채워 달라"고 고른 경우. `promptMode.ts` 참조.
   */
  mode?: SpecFillMode;
  /**
   * 파이프라인 동작 옵션(모드·원본 예시 사용 여부). `mode`보다 우선한다.
   * **화면·진입점과 무관하게 같은 기본값**을 쓰는 것이 원칙이라, 지정하지 않으면
   * `DEFAULT_SPEC_FILL_OPTIONS`가 그대로 적용된다(`document/spec/specFillOptions.ts`).
   */
  options?: Partial<SpecFillOptions>;
}

export interface SpecFillPipelineResult {
  planSchema: PlanFieldSchema[];
  plan: Plan;
  planErrors: string[];
  knowledge: Record<string, unknown>;
  knowledgeMissing: string[];
  filled: FillOutput;
  checks: CheckResult[];
  /** fill 단계 실패로 재시도 대상인 타깃 id(제약 실패는 plan 수정 사안) */
  retryable: string[];
}

export interface SpecFillPlanResult {
  planSchema: PlanFieldSchema[];
  plan: Plan;
  planErrors: string[];
  knowledge: Record<string, unknown>;
  knowledgeMissing: string[];
}

/**
 * ② plan 단계만: 검토 UI가 fill 전에 호출 — 사람이 수정한 plan을 파이프라인에 재주입한다.
 * existingPlan(사용자가 이미 채운 값)이 있으면 LLM에 "변경 금지·맥락 참고"로 전달하고,
 * 반환 plan도 사용자 값 우선으로 병합해 빈 칸만 새로 채워진 결과를 보장한다.
 */
export async function generateSpecFillPlan(input: {
  spec: WorkSpec;
  userContext?: string;
  userInputs?: Record<string, unknown>;
  existingPlan?: Plan;
  /** 원본 섹션 XML — 전달 시 각 타깃 구역의 기존 내용을 "양식 예시"로 LLM에 제공(표기 형식 참고) */
  sections?: string[];
  chat?: ChatFn;
  db?: DbFetch;
  /** 분할 생성 진행 알림(청크 i/n) — 큰 양식은 여러 호출로 나뉘어 수 분이 걸린다 */
  onProgress?: (done: number, total: number) => void;
  /**
   * 작성 모드 — `'strict'`(기본): 자료에 없는 사실을 만들지 않는다.
   * `'generate'`: 사용자가 "빈 칸을 채워 달라"고 고른 경우. `promptMode.ts` 참조.
   */
  mode?: SpecFillMode;
  /**
   * 파이프라인 동작 옵션(모드·원본 예시 사용 여부). `mode`보다 우선한다.
   * **화면·진입점과 무관하게 같은 기본값**을 쓰는 것이 원칙이라, 지정하지 않으면
   * `DEFAULT_SPEC_FILL_OPTIONS`가 그대로 적용된다(`document/spec/specFillOptions.ts`).
   */
  options?: Partial<SpecFillOptions>;
}): Promise<SpecFillPlanResult> {
  const chat = input.chat ?? defaultSpecChat;
  const db = input.db ?? supabaseDbFetch;
  // 옵션은 **한 덩어리로 해석**한다 — 호출부마다 기본값을 다시 적으면 화면에 따라 동작이 갈린다
  const { mode, useRegionExamples } = resolveSpecFillOptions({ mode: input.mode, ...input.options });
  const spec = normalizeSpecPlanKeys(input.spec);
  const { values: knowledge, missing: knowledgeMissing } = await resolveKnowledge(spec, {
    db,
    userInputs: input.userInputs,
  });
  const planSchema = derivePlanSchema(spec, input.sections);
  const filledExisting: Plan = {};
  for (const [key, value] of Object.entries(input.existingPlan ?? {})) {
    // `_fabricated`는 **메타데이터**(AI가 지어낸 키 목록)이지 사용자가 확정한 입력이 아니다.
    // 그대로 넘기면 ①프롬프트가 부풀고(실측 84개) ②재생성 계약 검증이 그 84개를 그대로
    // 되돌려 달라고 요구해 매번 실패한다. 결과의 표식은 이번 생성이 새로 만든다.
    if (key === '_fabricated') continue;
    if (Array.isArray(value)) {
      // 배열(반복 행)은 행이 있으면 빈 칸 포함 통째 전달 — LLM이 빈 칸·빈 행을 채우고,
      // 병합은 행·칸 단위로 사용자 칸만 이긴다(빈 행 수 = 원하는 행 수 신호로도 동작)
      if (value.length > 0) filledExisting[key] = value;
    } else if (!isEmptyPlanValue(value)) {
      filledExisting[key] = value;
    }
  }
  const hasExisting = Object.keys(filledExisting).length > 0;
  const regionExamples = input.sections?.length
    ? collectRegionExamples(spec, input.sections)
    : undefined;
  // 분할 생성(2026-08-09). 큰 양식은 한 호출이 엣지 함수 벽시간을 넘겨 504가 났다 —
  // 예산 안이면 종전대로 한 번에 간다(generatePlanChunked 주석 참조).
  const gen = await generatePlanChunked(
    chat, spec, planSchema, knowledge, input.userContext ?? '', 1,
    hasExisting ? filledExisting : undefined,
    { onProgress: input.onProgress, mode, regionExamples: useRegionExamples ? regionExamples : undefined },
  );
  // 병합 보증: LLM이 지시를 어겨도 사용자 값이 항상 이긴다(배열은 행·칸 단위)
  const plan: Plan = hasExisting ? mergePlanWithUserValues(gen.plan, filledExisting) : gen.plan;

  // 반복 행의 서술 열은 **열별 배치 생성**으로 다시 채운다(2026-07-27) — 한 번의 plan
  // 호출로 전 열을 만들면 셀마다 주의가 분산돼 키워드 나열이 된다. 사용자가 이미 채운
  // 셀은 유지하고, 실패한 열은 기존 값을 그대로 둔다.
  if (input.sections?.length) {
    await fillRowProseColumns({
      chat, spec, plan, sections: input.sections,
      userFilled: filledExisting, userContext: input.userContext, mode, useRegionExamples,
    });
    // 최상위 서술 타깃도 여기서 확정한다(2026-07-27 사용자 요청). 예전에는 채움 단계가
    // 매번 LLM을 불러 ⓐ계획 검토에서 본 적 없는 문장이 문서에 들어가고 ⓑ재실행마다
    // 결과가 달라졌다. 이제 계획에 본문이 실리고 채움은 그 값을 그대로 쓴다.
    await fillProseTargets({
      chat, spec, plan, knowledge, userFilled: filledExisting,
      examples: regionExamples ?? {}, mode, useRegionExamples,
    });
  }
  return { planSchema, plan, planErrors: gen.errors, knowledge, knowledgeMissing };
}

/** 계획의 서술 본문을 채움 단계 preset으로 변환 — 값이 있는 prose 타깃만 */
export function proseValuesFromPlan(spec: WorkSpec, plan: Plan | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!plan) return out;
  for (const t of spec.targets) {
    if (t.kind !== 'prose') continue;
    const v = plan[t.id];
    if (typeof v === 'string' && v.trim()) out[t.id] = v;
  }
  return out;
}

/** 최상위 서술 타깃 본문 생성 — plan을 제자리 수정한다(빈 것만 채움) */
async function fillProseTargets(input: {
  chat: ChatFn;
  spec: WorkSpec;
  plan: Plan;
  knowledge: Record<string, unknown>;
  userFilled: Plan;
  /** 타깃 id → 구역 원문(형식·분량 기준). 호출자가 이미 수집한 것을 재사용 */
  examples: Record<string, string>;
  mode?: SpecFillMode;
  useRegionExamples?: boolean;
}): Promise<void> {
  const targets = input.spec.targets.filter((t) => t.kind === 'prose');
  if (!targets.length) return;
  const { examples } = input;
  const gen = makeLlmProseGenerator(
    input.chat, input.mode ?? DEFAULT_SPEC_FILL_MODE, input.useRegionExamples === true,
  );
  // 형제 값 = 계획의 스칼라 값(반복 행·서술 본문 제외) — 모순 방지용 맥락
  const siblingValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.plan)) {
    if (Array.isArray(v) || typeof v === 'object') continue;
    if (targets.some((t) => t.id === k)) continue;
    if (!isEmptyPlanValue(v)) siblingValues[k] = v;
  }

  for (const t of targets) {
    // 사용자가 적어 둔 본문은 그대로 확정(빈 칸만 생성 — 반복 행 서술과 같은 규칙)
    if (!isEmptyPlanValue(input.userFilled[t.id]) || !isEmptyPlanValue(input.plan[t.id])) continue;
    const p = t as { sources?: string[]; instruction?: string; scaffold?: string[] };
    const planExcerpt: Record<string, unknown> = {};
    for (const key of p.sources ?? []) {
      const ref = key.replace(/^plan\./, '');
      const v = input.plan[ref] ?? input.knowledge[ref];
      if (v !== undefined) planExcerpt[key] = v;
    }
    try {
      const res = await gen.generate({
        documentType: input.spec.documentType,
        instruction: [input.spec.instruction, p.instruction].filter(Boolean).join('\n'),
        scaffold: p.scaffold,
        planExcerpt,
        siblingValues,
        currentText: examples[t.id] ?? '',
      });
      const text = res.paragraphs.map((s) => s.trim()).filter(Boolean).join('\n');
      if (text) input.plan[t.id] = text;
    } catch (e) {
      // 실패한 타깃은 비워 둔다 — 채움 단계가 종전대로 LLM으로 생성한다(안전한 후퇴).
      // 다만 **조용히 후퇴하면 안 된다**: 계획 검토에 서술이 비어 보이는 이유를 알 수 없다.
      logSpecFillIssue('서술 구역 생성 실패(채움 단계로 후퇴)', {
        타깃: t.id, error: e instanceof Error ? e.message : e,
      });
    }
  }
}

/** 반복 행 서술 열 배치 생성 — plan을 제자리 수정한다(빈 셀만 채움) */
async function fillRowProseColumns(input: {
  chat: ChatFn;
  spec: WorkSpec;
  plan: Plan;
  sections: string[];
  userFilled: Plan;
  userContext?: string;
  mode?: SpecFillMode;
  useRegionExamples?: boolean;
}): Promise<void> {
  const columns = collectRowProseColumns(input.spec, input.sections);
  if (!columns.length) return;
  const isBlank = (v: unknown) => v == null || v === '' || (typeof v === 'number' && v === 0);

  for (const col of columns) {
    const rows = input.plan[col.planKey];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const rowObjs = rows as Array<Record<string, unknown>>;
    const userRows = input.userFilled[col.planKey];
    const keepIndexes: number[] = [];
    rowObjs.forEach((_, i) => {
      const uv = Array.isArray(userRows)
        ? (userRows[i] as Record<string, unknown> | undefined)?.[col.cellKey]
        : undefined;
      if (!isBlank(uv)) keepIndexes.push(i);
    });
    // 전 행이 사용자 확정이면 호출 불필요
    if (keepIndexes.length === rowObjs.length) continue;

    // 행 맥락 = 이 열을 제외한 나머지 셀 값(생성 근거)
    const rowContexts = rowObjs.map((r) => {
      const ctx: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === col.cellKey || k.startsWith('__')) continue;
        if (!isBlank(v)) ctx[k] = v;
      }
      if (keepIndexes.length) ctx[col.cellKey] = r[col.cellKey]; // 유지 행은 기존 값 노출
      return ctx;
    });

    /*
     * **행을 나눠 부른다**(2026-09-03). 한 번에 29행을 요청하다 응답이 150초를 넘겨
     * 게이트웨이 타임아웃으로 죽었다(실사용 로그: `Request idle timeout limit (150s)`).
     * 서술 열은 행마다 2~3문장을 새로 쓰는 과제라 행 수에 비례해 시간이 늘고, 열 하나가
     * 통째로 실패하면 그 열은 **전부 빈 채로 남는다**.
     *
     * 나눠 부르면 ①한 호출이 짧아 타임아웃을 안 넘고 ②일부가 실패해도 나머지 묶음은
     * 살아남는다. 묶음 크기는 실측 실패(29행)보다 충분히 작게 잡는다.
     */
    const values: string[] = [];
    let batchFailed = false;
    for (let from = 0; from < rowContexts.length; from += ROW_PROSE_BATCH) {
      const to = Math.min(from + ROW_PROSE_BATCH, rowContexts.length);
      const slice = rowContexts.slice(from, to);
      const got = await generateRowProseColumn(input.chat, {
        documentType: input.spec.documentType,
        columnInstruction: col.instruction ?? '',
        rowContexts: slice,
        examples: col.examples,
        useExamples: input.useRegionExamples === true,
        // 유지 인덱스는 **묶음 기준으로 다시 매긴다** — 절대 인덱스를 그대로 넘기면
        // 모델이 범위 밖 번호를 받고 "유지" 지시가 엉뚱한 행에 걸린다.
        keepIndexes: keepIndexes.filter((i) => i >= from && i < to).map((i) => i - from),
        userContext: input.userContext,
        mode: input.mode,
      });
      if (got.length !== slice.length) { batchFailed = true; break; }
      values.push(...got);
    }
    // 한 묶음이라도 형식이 어긋나면 이 열은 건드리지 않는다(부분 반영은 행이 밀린다)
    if (batchFailed || values.length !== rowObjs.length) continue;
    rowObjs.forEach((r, i) => {
      if (keepIndexes.includes(i)) return; // 사용자 확정 셀 보존
      const v = values[i];
      if (typeof v === 'string' && v.trim()) r[col.cellKey] = v.trim();
    });
  }
}

/**
 * 서술 열을 한 번에 요청할 행 수.
 *
 * 실측 실패 지점이 29행(150초 타임아웃)이라 그보다 충분히 작게 잡는다. 너무 작으면
 * 호출 수가 늘어 전체가 느려지므로, 한 호출이 여유 있게 끝나는 선에서 최대한 크게 둔다.
 * 행마다 2~3문장을 새로 쓰는 과제라 **행 수가 곧 벽시간**이다.
 */
const ROW_PROSE_BATCH = 8;

/** LLM 없이 빈 plan 골격 생성(직접 입력 경로) */
export function emptyPlanFromSchema(schema: PlanFieldSchema[]): Plan {
  const plan: Plan = {};
  for (const f of schema) {
    plan[f.key] = f.type === 'array' ? [] : f.type === 'number' ? 0 : '';
  }
  return plan;
}

/**
 * ②plan → ③fill → ④verify 파이프라인.
 * plan은 반환 후 사람이 검토·수정해 `plan` 입력으로 재호출하는 왕복을 전제로 한다.
 */
export async function runSpecFillPipeline(input: SpecFillPipelineInput): Promise<SpecFillPipelineResult> {
  const chat = input.chat ?? defaultSpecChat;
  const db = input.db ?? supabaseDbFetch;
  // 옵션은 **한 덩어리로 해석**한다 — 호출부마다 기본값을 다시 적으면 화면에 따라 동작이 갈린다
  const { mode, useRegionExamples } = resolveSpecFillOptions({ mode: input.mode, ...input.options });
  const spec = normalizeSpecPlanKeys(input.spec);

  const { values: knowledge, missing: knowledgeMissing } = await resolveKnowledge(spec, {
    db,
    userInputs: input.userInputs,
  });

  const planSchema = derivePlanSchema(spec, input.sections);
  let plan = input.plan;
  let planErrors: string[] = [];
  if (!plan) {
    // 계획 미제공 경로도 분할 생성을 쓴다 — 같은 504에 걸리는 경로다
    const gen = await generatePlanChunked(
      chat, spec, planSchema, knowledge, input.userContext ?? '', 1, undefined,
      { mode, regionExamples: useRegionExamples ? collectRegionExamples(spec, input.sections) : undefined },
    );
    plan = gen.plan;
    planErrors = gen.errors;
  }

  const prose = makeLlmProseGenerator(chat, mode, useRegionExamples);
  // 계획에 실린 서술 본문을 preset으로 승격 — 채움은 계획 검토에서 사람이 본·고친 문장을
  // 그대로 쓰고 LLM을 부르지 않는다(재실행해도 같은 문서). 계획에 없는 타깃만 종전대로 생성.
  const planProse = proseValuesFromPlan(spec, plan);
  const presetValues = Object.keys(planProse).length
    ? { ...planProse, ...input.presetValues }
    : input.presetValues;
  let filled = await fillDocument(input.sections, { spec, plan, knowledge, prose, presetValues });
  let checks = verifyDocument({ spec, filled, plan, knowledge });

  // 국소 재시도: fill 실패(prose 비결정성 등)에 한해 1회. stale·제약 실패는 재시도 무의미.
  if (retryableTargets(checks).length > 0) {
    filled = await fillDocument(input.sections, { spec, plan, knowledge, prose, presetValues });
    checks = verifyDocument({ spec, filled, plan, knowledge });
  }

  return {
    planSchema,
    plan,
    planErrors,
    knowledge,
    knowledgeMissing,
    filled,
    checks,
    retryable: retryableTargets(checks),
  };
}
