import { supabase } from '@/integrations/supabase/client';
import { throwEdgeFunctionError } from '@/utils/edgeFunctionError';
import { aiLogTag } from '@/services/aiLogTag';

export async function rewriteSentence(sentence: string): Promise<string> {
    try {
        const { data, error } = await supabase.functions.invoke('solar-proxy', {
            body: {
                action: 'chatCompletion',
                aiLog: aiLogTag('세특 문장 재작성'),
                systemPrompt: `목표: 다음 주어진 문장의 의미를 유지하면서 표현을 다르게 바꾸어(Paraphrase) 1개의 문장으로 작성
                        입력: {sentence}
                        - 입력된 내용은 학생의 활동과 관련된 평가문의 일부
                        조건:
                        - 문장의 의미는 원문과 동일하게 유지
                        - 문장의 끝은 ~임, ~함, ~음, ~남, ~음과 같이 종결형 어미로 작성
                        - 문장의 길이는 원문과 비슷하게 유지
                        - 문장의 의미가 명확하게 전달되도록 작성
                        출력 결과: 1개의 문장만 출력`,
                userPrompt: sentence,
                model: 'solar-pro4',
                /**
                 * **역설(패러프레이즈)에는 추론이 필요 없다** — 2026-09-21 실측으로 확정.
                 *
                 * `medium` 일 때 `solar-pro4` 는 출력 토큰의 **87~100%** 를 추론에 쓰고
                 * 한 문장을 바꾸는 데 **52~80초**가 걸렸다(엣지 함수 벽시간 한계 ~151초에
                 * 근접). `none` 은 같은 입력에 **0.5~0.7초** 이고 3/3 에서 의미 보존·
                 * 종결어미(~임/함/음)·한 문장 규칙을 모두 지켰다.
                 *
                 * ⚠️ `medium` 은 2026-05-19 에 정해진 값으로 **pro3·pro4 어느 쪽으로도
                 * 튜닝된 적이 없다**. pro3 는 추론을 거의 하지 않아 이 값이 무해했지만
                 * pro4 에서는 그대로 벽시간이 된다 — 모델을 바꾸면 이 값을 다시 재야 한다.
                 * 회귀 = `npx tsx --tsconfig tsconfig.app.json scripts/ai-chat-live-test/run.mts`
                 */
                reasoningEffort: 'none',
                temperature: 0.7,
            },
        });

        if (error) await throwEdgeFunctionError(error, 'Solar 요청 실패');
        if (data?.error) throw new Error(data.error);

        return data.result || sentence;
    } catch (error) {
        console.error('Rewrite failed:', error);
        throw error;
    }
}
