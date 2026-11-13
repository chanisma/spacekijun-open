import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import {
  NOTICE_DRAFT_MAX_INPUT,
  NOTICE_DRAFT_SYSTEM_PROMPT,
  parseNoticeDraft,
} from '../utils/noticeDraft';

/**
 * 게이트웨이(약 150초)보다 **낮게** 잡아 504 대신 우리 메시지가 나가게 한다.
 * 2026-09-23 실측(추론 켜짐): 이 부류는 1.3~114.5초.
 */
const NOTICE_DRAFT_TIMEOUT_MS = 120000;

export async function generateNoticeDraft(text: string, signal?: AbortSignal) {
  const source = text.trim();
  if (!source || source.length > NOTICE_DRAFT_MAX_INPUT)
    throw new Error('공지 소재를 1~30,000자로 입력해 주세요.');
  const raw = await aiChat({
    systemPrompt: NOTICE_DRAFT_SYSTEM_PROMPT,
    userPrompt: JSON.stringify({ source }),
    temperature: 0.2,
    maxCompletionTokens: 6000,
    // 생성 과제다. 추론 강도는 `aiChat` 의 «측정된 조합만 담는 표» 가 정한다 —
    // 지금 generation 칸은 비어 있어 **엣지 기본값 'low' 가 그대로 적용**된다(현행 동작 유지).
    // 표 한 곳만 채우면 이 호출부를 건드리지 않고 전부 함께 바뀐다.
    reasoningEffort: reasoningEffortFor('generation'),
    timeoutMs: NOTICE_DRAFT_TIMEOUT_MS,
    signal,
    errorPrefix: '공지 초안 생성 실패',
  });
  return parseNoticeDraft(raw);
}
