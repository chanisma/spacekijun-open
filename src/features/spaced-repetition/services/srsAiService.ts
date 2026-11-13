/**
 * SRS AI Card Generation Service
 *
 * ⚠️ **이름과 달리 OpenAI 가 아니다.** `aiChat()` 의 기본 공급자(= Solar)로 나간다
 * — `provider` 를 지정하지 않기 때문이다(2026-09-23 확인). 종전 주석이
 * "openai-proxy" 라고 적어 두어 다음 사람을 오도했다.
 * API 키는 서버(Supabase secrets)에만 있고 클라이언트에 노출되지 않는다.
 */

import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import type { CreateCardParams } from '../types/srs.types';

interface GeneratedCard {
  front: string;
  back: string;
  concept: string;
}

/**
 * Generate flashcards using OpenAI GPT via Supabase Edge Function.
 *
 * @param subjectName - The subject name (e.g., "인지심리학")
 * @param topic - The specific topic (e.g., "기억 인출")
 * @param count - Number of cards to generate (default: 10)
 * @returns Array of generated card data ready for bulk insert
 */
/**
 * 게이트웨이(약 150초)보다 **낮게** 잡아 504 대신 우리 메시지가 나가게 한다.
 * 2026-09-23 실측(추론 켜짐): 이 부류는 1.3~114.5초.
 */
const CARD_GEN_TIMEOUT_MS = 130000;

export async function generateCards(
  subjectName: string,
  topic: string,
  count: number = 10
): Promise<GeneratedCard[]> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(subjectName, topic, count);

  const rawResult = await aiChat({
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    maxCompletionTokens: 4096,
    // 생성 과제다. 추론 강도는 `aiChat` 의 «측정된 조합만 담는 표» 가 정한다 —
    // 지금 generation 칸은 비어 있어 **엣지 기본값 'low' 가 그대로 적용**된다(현행 동작 유지).
    // 표 한 곳만 채우면 이 호출부를 건드리지 않고 전부 함께 바뀐다.
    reasoningEffort: reasoningEffortFor('generation'),
    timeoutMs: CARD_GEN_TIMEOUT_MS,
    errorPrefix: 'AI 카드 생성 실패',
  });

  // Parse the JSON response - may be wrapped in markdown code block
  let jsonStr = typeof rawResult === 'string' ? rawResult.trim() : JSON.stringify(rawResult);
  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: { cards?: GeneratedCard[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('AI 응답 파싱 실패. 다시 시도해주세요.');
  }

  const cards: GeneratedCard[] = parsed.cards || (Array.isArray(parsed) ? parsed : []);

  return cards.map((card) => ({
    front: card.front || '',
    back: card.back || '',
    concept: card.concept || topic,
  }));
}

/**
 * Convert generated cards to CreateCardParams for bulk insert.
 */
export function toCreateCardParams(
  subjectId: string,
  generatedCards: GeneratedCard[]
): CreateCardParams[] {
  return generatedCards.map((card) => ({
    subject_id: subjectId,
    front: card.front,
    back: card.back,
    concept: card.concept,
    source: 'ai_generated' as const,
  }));
}

function buildSystemPrompt(): string {
  return `당신은 인지과학과 학습과학에 기반한 교육 전문가이자 플래시카드 설계자입니다.

이 시스템은 에빙하우스(Ebbinghaus)의 망각곡선 이론과 간격반복(Spaced Repetition) 알고리즘(SM-2)을 기반으로 합니다.
핵심 원리:
- 망각곡선: 학습 후 시간이 지남에 따라 기억이 지수적으로 감소합니다. 적절한 시점에 복습하면 망각을 방지하고 장기기억으로 전환됩니다.
- 간격반복: 기억 강도가 약해지기 직전에 복습하면 최소 노력으로 최대 기억 유지율을 달성합니다.
- 메타인지: 학습자가 자신의 기억 상태를 인식하고 (알고 있는 것 vs 모르는 것) 학습 전략을 조절하는 능력이 핵심입니다.
- 인출 연습(Retrieval Practice): 단순 재독보다 능동적 인출이 기억 고착에 효과적입니다.
- 교차 배치(Interleaving): 유사 개념을 섞어서 학습하면 변별력과 전이 능력이 향상됩니다.

카드 설계 원칙:
1. 질문(front)은 능동적 인출을 유도하는 명확한 질문이어야 합니다. "~는 무엇인가?" 뿐 아니라 "~와 ~의 차이점은?", "~의 원인/메커니즘은?", "~를 적용하면?" 등 다양한 인지 수준의 질문을 포함합니다.
1-1. **한 장에는 한 가지만 묻습니다.** "~은 무엇이며, ~는 무엇인가?"처럼 두 가지를 한 문장에 묶지 마세요 — 인출 연습은 한 번에 하나를 떠올릴 때 효과적이고, 두 가지를 묶으면 학습자가 무엇을 못 떠올렸는지 스스로 판별할 수 없습니다(메타인지 저해). 나눌 내용이 많으면 카드를 나누세요.
2. 답변(back)은 간결하지만 정확해야 합니다 (1-3문장). 핵심 키워드가 포함되어야 합니다.
3. concept는 해당 카드가 속하는 하위 개념 분류로, 교차 배치 학습에 활용됩니다.
4. 난이도는 블룸의 인지 분류(기억→이해→적용→분석→평가→창조)에 따라 점진적으로 증가합니다.
5. 한국어로 작성하되, 전문 용어는 영문 병기 가능합니다.
6. 반드시 JSON 형식으로만 응답하세요.`;
}

function buildUserPrompt(subjectName: string, topic: string, count: number): string {
  return `다음 주제에 대한 학습용 플래시카드 ${count}개를 생성해주세요.

과목: ${subjectName}
주제: ${topic}

다음 JSON 형식으로 응답하세요:
{
  "cards": [
    {
      "front": "질문 텍스트",
      "back": "답변 텍스트",
      "concept": "하위 개념명"
    }
  ]
}`;
}
