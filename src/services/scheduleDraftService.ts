import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import {
  SCHEDULE_DRAFT_MAX_INPUT,
  SCHEDULE_DRAFT_SYSTEM_PROMPT,
  buildScheduleDraftUserPrompt,
  parseScheduleDraft,
} from '@/lib/scheduleDraft';

/**
 * 게이트웨이(약 150초)보다 **낮게** 잡아 504 대신 우리 메시지가 나가게 한다.
 * 공지 초안과 같은 값 — 같은 모델·같은 규모의 추출 과제다.
 */
const SCHEDULE_DRAFT_TIMEOUT_MS = 120000;

export async function generateScheduleDraft(text: string, signal?: AbortSignal, today = new Date()) {
  const source = text.trim();
  if (!source || source.length > SCHEDULE_DRAFT_MAX_INPUT)
    throw new Error('일정으로 만들 내용을 1~10,000자로 입력해 주세요.');
  const raw = await aiChat({
    systemPrompt: SCHEDULE_DRAFT_SYSTEM_PROMPT,
    userPrompt: buildScheduleDraftUserPrompt(source, today),
    temperature: 0.1,
    maxCompletionTokens: 3000,
    // 원문에서 값을 뽑는 추출 과제다. 추론 강도는 aiChat 의 측정표가 정한다.
    reasoningEffort: reasoningEffortFor('extraction'),
    timeoutMs: SCHEDULE_DRAFT_TIMEOUT_MS,
    signal,
    errorPrefix: '일정 초안 생성 실패',
  });
  return parseScheduleDraft(raw);
}
