/**
 * 공문 본문 AI 생성 — LLM 호출부 (브라우저 전용)
 *
 * 프롬프트 문구는 `officialDocumentPrompt.ts`(순수)에 있다. 이 파일은 `aiChat()` →
 * supabase 브라우저 클라이언트를 물고 있어 Node 회귀 테스트가 import 할 수 없다.
 *
 * 규약: LLM 호출은 공용 `aiChat()`만 쓴다 — `functions.invoke`를 직접 부르지 말 것.
 */
import { aiChat, reasoningEffortFor } from '@/services/aiChat';
import {
  OFFICIAL_DOCUMENT_SYSTEM_PROMPT,
  OfficialDocumentAiInput,
  buildOfficialDocumentUserPrompt,
  stripMarkdownFence,
} from './officialDocumentPrompt';

/**
 * 게이트웨이(약 150초)보다 **낮게** 잡아 504 대신 우리 메시지가 나가게 한다.
 * 2026-09-23 실측(추론 켜짐): 이 부류는 1.3~114.5초.
 */
const OFFICIAL_DOC_TIMEOUT_MS = 120000;

export type { OfficialDocumentAiInput };

export async function refineOfficialDocument(
  input: OfficialDocumentAiInput,
  signal?: AbortSignal,
): Promise<string> {
  const raw = await aiChat({
    systemPrompt: OFFICIAL_DOCUMENT_SYSTEM_PROMPT,
    userPrompt: buildOfficialDocumentUserPrompt(input),
    // 예산 문서라 표현이 매번 흔들리면 안 된다 — 낮게 고정
    temperature: 0.2,
    // 생성 과제다. 추론 강도는 `aiChat` 의 «측정된 조합만 담는 표» 가 정한다 —
    // 지금 generation 칸은 비어 있어 **엣지 기본값 'low' 가 그대로 적용**된다(현행 동작 유지).
    // 표 한 곳만 채우면 이 호출부를 건드리지 않고 전부 함께 바뀐다.
    reasoningEffort: reasoningEffortFor('generation'),
    timeoutMs: OFFICIAL_DOC_TIMEOUT_MS,
    signal,
    errorPrefix: '공문 초안 생성 실패',
  });
  return stripMarkdownFence(raw).trim();
}
