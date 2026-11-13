/**
 * 코치 대화에 붙는 «학생이 이미 고른 것» 맥락 블록.
 *
 * ── 왜 필요한가 (2026-09-18) ──────────────────────────────────────────────
 * `inquiryDesignConversation` 엣지 함수는 `messages`와 `target`만 받는다. 즉
 * **대화 경로에는 선택 노드가 들어갈 자리가 없었다** — 학생이 지식 지도에서 별을
 * 열 개를 골라도 코치는 그 존재를 모른 채 "어떤 주제에 관심이 있니?"부터 다시
 * 묻는다. 오류가 아니라 침묵이라 화면만 봐서는 드러나지 않고, 학생에게는
 * "AI가 내가 고른 걸 안 본다"로 나타난다.
 *
 * 같은 서비스를 쓰는 아카데미 연구대(`DesignConversation.tsx`)는 이 문제가 없다.
 * 거기서는 opener 본문에 `JSON.stringify(records.map(s => s.snapshot))`을 직접
 * 실어 보내기 때문이다. 이 모듈은 그 해법을 탐구 설계에 옮기되 두 가지를 바꾼다:
 *
 *   ① **저장되는 메시지가 아니라 사본에 붙인다.** 탐구 설계의 대화창은 opener를
 *      화면에 그대로 그린다(`InquiryConversationBox`가 `messages`를 전부 렌더 —
 *      아카데미는 `slice(1)`로 감춘다). opener에 JSON을 박으면 학생 첫 말풍선이
 *      원시 JSON 덩어리가 된다. 그래서 `achievementContext`가 이미 쓰는 방식 —
 *      **매 턴 첫 메시지의 사본에만 덧붙이기** — 을 그대로 따른다.
 *   ② **원시 스냅샷이 아니라 사람이 읽는 요약.** 스냅샷의 `properties`는 신 KG에서
 *      한 겹 더 감싸여 있고(`kgProperties.ts` 참고) 키 이름도 세대마다 다르다.
 *      정규화 창구를 거치지 않으면 모델에게 "빈 객체가 열 개" 를 보내게 된다.
 *
 * 사본에 붙이므로 **대화 도중 선택을 바꾸면 다음 턴부터 반영된다**(아카데미는
 * opener가 얼어붙어 있어 반영되지 않는다).
 *
 * 회귀 = `npx tsx scripts/inquiry-conversation-test/run.mts`
 */
import type { InquirySelectedSource } from '../types';
import { kgEvidenceList, kgSourceLabel, kgSourceList } from './kgProperties';

/**
 * 블록 전체의 상한. `achievementContext`(6,000자)와 같은 자릿수로 둔다 — 코치
 * 답변은 `max_tokens` 220으로 묶여 있어 프롬프트가 아니라 **사람의 대화 피로**가
 * 이 기능의 병목이고, Solar Pro 4 컨텍스트에서 이 정도는 1%도 되지 않는다.
 */
export const CONVERSATION_PRIMER_BUDGET = 5000;

/** 근거 원문 한 건의 길이. 문장 하나가 들어갈 만큼만 — 코치는 요약이 아니라 단서가 필요하다. */
const EVIDENCE_LIMIT = 180;

export interface ConversationPrimerResult {
  /** 첫 메시지 뒤에 덧붙일 텍스트. 붙일 것이 없으면 빈 문자열. */
  text: string;
  /** 실제로 실린 선택 항목 수. */
  includedCount: number;
  /** 예산 때문에 빠진 선택 항목 수. 0이면 전부 실렸다. */
  droppedCount: number;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/**
 * 선택 하나 → 코치가 읽을 한 줄.
 *
 * 노드(`kg_entity`)와 원본 기록(`activity_record`)은 모양이 다르지만 코치에게는
 * 둘 다 "학생이 고른 자기 경험"이다. 같은 모양으로 눕혀서 보낸다.
 */
function summarizeSource(source: InquirySelectedSource): Record<string, unknown> | null {
  const snapshot = source.snapshot ?? {};

  if (source.source_kind === 'activity_record') {
    const label = kgSourceLabel(snapshot) || '생기부 기록';
    const content = text(snapshot.content).slice(0, EVIDENCE_LIMIT);
    if (!content && !label) return null;
    return { 고른것: '생기부 기록', 기록: label, 원문: content };
  }

  const label = text(snapshot.label);
  if (!label) return null;
  const properties = snapshot.properties as Record<string, unknown> | null | undefined;
  const from = kgSourceList(properties).map(kgSourceLabel).filter(Boolean).slice(0, 3);
  const evidence = kgEvidenceList(properties).join(' / ').slice(0, EVIDENCE_LIMIT);
  const hint = text(snapshot.relation_hint) || text(source.relation_hint);

  return {
    고른것: text(snapshot.type) || '노드',
    이름: label,
    ...(from.length ? { 출처: from.join(' · ') } : {}),
    ...(evidence ? { 원문근거: evidence } : {}),
    // 관계 힌트는 학생이 "이 별에서 이렇게 이어지고 싶다"고 직접 말한 것이다.
    // 설계 단계(graph stage)만 쓰던 값인데, 방향을 정하는 대화에서야말로 쓸모가 있다.
    ...(hint ? { 이어가고싶은방식: hint } : {}),
  };
}

/**
 * 선택 노드·기록과 학생이 직접 적어 둔 방향을, 코치의 첫 메시지 뒤에 붙일
 * 한 덩어리로 만든다.
 *
 * 예산을 넘으면 **뒤에서부터** 버리고 그 사실을 문장으로 남긴다 — 조용히
 * 사라지면 "코치가 12번째 별을 무시했다"를 아무도 눈치채지 못한다.
 */
export function buildConversationPrimer(input: {
  selectedSources?: InquirySelectedSource[];
  userRequirements?: string;
  budget?: number;
}): ConversationPrimerResult {
  const budget = input.budget ?? CONVERSATION_PRIMER_BUDGET;
  const direction = (input.userRequirements ?? '').trim().slice(0, 1200);
  const summaries = (input.selectedSources ?? [])
    .map(summarizeSource)
    .filter((row): row is Record<string, unknown> => row !== null);

  if (summaries.length === 0 && !direction) {
    return { text: '', includedCount: 0, droppedCount: 0 };
  }

  const directionBlock = direction
    ? `\n학생이 이미 적어 둔 탐구 방향(학생 본인의 말이다): ${direction}`
    : '';

  const head =
    '\n\n[아래는 학생이 화면에서 이미 고르고 적어 둔 것이다. 학생의 실제 기록이므로 없는 경험을 지어내지 말고, 여기서 이어질 수 있는 방향을 함께 찾는다. 첫 질문부터 학생이 고른 것을 구체적으로 짚어 주고, 이미 고른 것을 처음부터 다시 묻지 않는다. 고른 것이 탐구 방향과 어울리지 않아 보이면 그 점을 물어도 좋다.]';
  const tail = '\n</선택한_기록>';

  // 항목을 하나씩 담아 보며 예산을 지킨다. 남는 자리를 미리 계산하려면 생략
  // 안내 문구 길이를 알아야 하는데 그 길이가 개수에 따라 변해 순환이 된다 —
  // 그래서 "담고 나서 넘치면 되돌린다".
  const kept: Record<string, unknown>[] = [];
  for (const row of summaries) {
    const candidate = [...kept, row];
    const dropped = summaries.length - candidate.length;
    const note = dropped > 0 ? `\n(고른 것이 많아 ${dropped}개는 생략했다.)` : '';
    const length =
      head.length + directionBlock.length + '\n<선택한_기록>\n'.length +
      JSON.stringify(candidate).length + tail.length + note.length;
    if (length > budget) break;
    kept.push(row);
  }

  const droppedCount = summaries.length - kept.length;
  const note = droppedCount > 0 ? `\n(고른 것이 많아 ${droppedCount}개는 생략했다.)` : '';
  const body = kept.length
    ? `\n<선택한_기록>\n${JSON.stringify(kept)}${tail}${note}`
    : '';

  return {
    text: `${head}${directionBlock}${body}`,
    includedCount: kept.length,
    droppedCount,
  };
}
