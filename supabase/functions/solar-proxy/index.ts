import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiLogContext, aiLogFetch, logAiRequestFailure, type AiLogContext } from '../_shared/aiCallLog.ts';

/**
 * 쓸 수 있는 Solar 모델(2026-08-14 `GET /v1/models` 실측). 기본값 교체는 여기 한 줄이지만,
 * 앱 쪽 6곳도 함께 바꿔야 한다(`src/services/aiChat.ts` 주석의 목록 참조).
 * pro3는 보관 — 2026-08-14에 pro4→pro3로 갔다가 2026-09-21 사용자 지시로 pro4로 되돌렸다
 * (둘 다 생존 확인). **이 파일은 고쳐도 재배포해야 서버가 바뀐다** —
 * `model`을 생략하고 호출하는 경로는 여기 기본값을 그대로 쓴다.
 */
const SOLAR_MODELS = { pro4: 'solar-pro4', pro3: 'solar-pro3' } as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const solarApiKey = Deno.env.get('SOLAR_API_KEY');
    if (!solarApiKey) {
      return new Response(JSON.stringify({ error: 'SOLAR_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // `aiLog` = 기록용 꼬리표(기능·화면 주소). 범용 프록시라 꼬리표가 없으면 «미분류»로 남는다
    const { action, aiLog, ...params } = await req.json();
    logCtx = aiLogContext('solar-proxy', 'unclassified', aiLog, { action, userId: user.id });
    const aiFetch = aiLogFetch(logCtx);

    switch (action) {
      case 'chatCompletion': {
        const {
          systemPrompt,
          userPrompt,
          model = SOLAR_MODELS.pro4,
          temperature = 0.7,
          // Upstage API는 low/medium/none/high를 모두 받는다(solar-open2·solar-pro4 실측).
          // HF 모델 카드의 'none|high'는 로컬 서빙(vLLM) 기준이라 API와 다르다.
          //
          // 기본이 'low'인 이유(**solar-pro4 실측** 2026-08-11 — 2026-09-21 pro4 복귀로 이 실측이
          // 다시 기본 모델의 값이 됐다): 'medium'에서
          // 응답이 126~128초였고 한 번은 **151초에 504**로 잘렸다 — 엣지 함수
          // 벽시간에 걸친다. 이 프록시의 호출부(문서 스펙 채움·활동 분석·문장
          // 재작성)는 추출·재작성 과제라 추론 의존도가 낮다. 호출부가 필요하면
          // reasoningEffort로 올릴 수 있다.
          // `null`을 명시하면 파라미터를 **아예 빼고** 보낸다(모델 기본값 사용).
          // 생략(undefined)은 여기 기본값 'low'가 적용된다 — 둘은 다른 요청이다.
          reasoningEffort = 'low',
        } = params;

        const solarBody: Record<string, unknown> = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
        };
        // null이면 키를 넣지 않는다 — 추론 파라미터를 모르는 모델에 보내지 않기 위한 탈출구.
        if (reasoningEffort !== null) solarBody.reasoning_effort = reasoningEffort;

        const postSolar = (payload: Record<string, unknown>) =>
          aiFetch('https://api.upstage.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${solarApiKey}`,
            },
            body: JSON.stringify(payload),
          });

        let response = await postSolar(solarBody);

        // 모델 계열마다 지원 파라미터가 다르다. 400이면 선택 파라미터를 떼고 재시도해
        // 모델 교체가 기능을 통째로 죽이지 않게 한다.
        //
        // **한 번에 둘 다 떼지 않는다**(2026-08-14): 종전에는 `reasoning_effort`와
        // `temperature`를 함께 지웠는데, 모델이 추론 파라미터만 거부해도 temperature가
        // 같이 날아가 기본값(0.7)으로 돌아갔다 — 계획 생성처럼 0.2를 의도한 호출이
        // 조용히 무작위해진다. 거부당한 쪽만 떼고, 그래도 400이면 나머지도 뗀다.
        const droppedParams: string[] = [];
        if (!response.ok && response.status === 400 && 'reasoning_effort' in solarBody) {
          const retry = { ...solarBody };
          delete retry.reasoning_effort;
          const r2 = await postSolar(retry);
          if (r2.ok) { droppedParams.push('reasoning_effort'); response = r2; }
          else if (r2.status === 400) {
            const retry2 = { ...retry };
            delete retry2.temperature;
            const r3 = await postSolar(retry2);
            if (r3.ok) droppedParams.push('reasoning_effort', 'temperature');
            response = r3;
          } else response = r2;
        } else if (!response.ok && response.status === 400 && 'temperature' in solarBody) {
          const retry = { ...solarBody };
          delete retry.temperature;
          const r2 = await postSolar(retry);
          if (r2.ok) droppedParams.push('temperature');
          response = r2;
        }
        if (droppedParams.length) {
          // 조용한 성공은 다음 사람이 원인을 못 찾는다 — 무엇이 빠졌는지 남긴다
          console.warn(`[solar-proxy] ${model}이(가) 거부해 제외한 파라미터: ${droppedParams.join(', ')}`);
        }

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Solar API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          // 추론이 예산을 다 써서 본문이 빈 경우(finish_reason=length)를 구분할 수 있게 까닭을 싣는다
          throw new Error(`No content in Solar API response (finish_reason=${data.choices?.[0]?.finish_reason ?? 'unknown'})`);
        }

        /**
         * `finishReason`·`usage`·`model` 을 함께 돌려준다 (2026-09-27, openai-proxy 와 같은 모양).
         *
         * 없으면 **«답이 잘렸다»와 «형식을 어겼다»를 화면에서 구분할 수 없다** — 업무 진행 화면의
         * AI 점검이 잘린 응답을 «지적 없음»으로 캐시한 결함(적대적 검증)이 이 빈칸에서 나왔다.
         * 추론이 예산을 얼마나 먹는지(usage.completion_tokens_details)도 이것으로 잰다.
         * 기존 호출부는 `result` 만 읽으므로 하위 호환이다.
         */
        return new Response(JSON.stringify({
          result: content,
          finishReason: data.choices?.[0]?.finish_reason ?? null,
          model: data.model ?? model,
          usage: data.usage ?? null,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'validateApiKey': {
        return new Response(JSON.stringify({ result: JSON.stringify({ valid: true }) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Error in solar-proxy:', error);
    if (logCtx) logAiRequestFailure(logCtx, error, { startedAt, httpStatus: 500 });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
