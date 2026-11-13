/**
 * 코치 대화 기록 → `추가 컨텍스트 / 방향성` 필드 텍스트.
 *
 * 화면(InquiryDesignPage)에서 떼어 낸 순수 함수다. 예산 산술과 역방향 누적이
 * 얽혀 있어 눈으로만 검증하기 어렵고, 잘못되면 **조용히** 내용이 사라지는
 * 종류의 버그라 회귀 테스트가 붙는다(`scripts/inquiry-conversation-test/run.mts`).
 *
 * 지키는 우선순위: **사람이 쓴 글 > 최근 턴 > 오래된 턴**.
 *
 * 구 구현은 `\`${summary}\n\n${manual}\`.slice(0, 2000)` 한 줄이었는데 두 가지가
 * 조용히 사라졌다: ①대화는 뒤로 갈수록 구체적이라 방향이 확정된 마지막 턴이
 * 먼저 잘렸고, ②요약을 앞에 붙이는 구조라 요약이 예산을 채우면 학생이 직접
 * 타이핑한 요구사항이 통째로 증발했다.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationContextResult {
  /** 필드에 넣을 최종 텍스트. 길이는 항상 budget 이하. */
  text: string;
  /** 예산 때문에 버린 발언 수. 0이면 전부 반영됐다. */
  droppedCount: number;
}

const HEADER = '[코치 대화 요약]';
// 생략 안내 문구 자리. 실제로 생략될 때만 쓰이지만, 예산 계산이 두 갈래로
// 갈라지지 않게 항상 확보한다.
const OMISSION_RESERVE = 32;

/** 발언에 `코치N:` / `학생N:` 라벨을 붙인다(오래된 순 유지). */
export function labelTurns(turns: ConversationTurn[]): string[] {
  const lines: string[] = [];
  let userIdx = 0;
  let coachIdx = 0;
  for (const message of turns) {
    if (message.role === 'assistant') {
      coachIdx += 1;
      lines.push(`코치${coachIdx}: ${message.content}`);
    } else {
      userIdx += 1;
      lines.push(`학생${userIdx}: ${message.content}`);
    }
  }
  return lines;
}

export function buildConversationContext(
  turns: ConversationTurn[],
  manualRequirements: string,
  budget: number
): ConversationContextResult {
  const manual = manualRequirements.trim();
  const tail = manual ? `\n\n${manual}` : '';
  const lines = labelTurns(turns);

  const lineBudget = budget - HEADER.length - tail.length - OMISSION_RESERVE;

  // 뒤(최신)에서부터 담는다 — 예산이 모자라면 앞(오래된 것)이 남지 않는다.
  const kept: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const cost = lines[i].length + 1; // +1 = 줄바꿈
    if (used + cost > lineBudget) break;
    kept.unshift(lines[i]);
    used += cost;
  }
  // 마지막 한 줄조차 예산을 넘는 극단(학생이 장문을 붙여넣은 경우)에서도 가장
  // 최근 발언은 남긴다 — 요약이 통째로 비면 대화를 한 의미가 없어진다.
  if (kept.length === 0 && lines.length > 0 && lineBudget > 0) {
    kept.push(lines[lines.length - 1].slice(0, lineBudget));
  }

  const droppedCount = lines.length - kept.length;
  const body = droppedCount > 0
    ? [`…(앞선 ${droppedCount}개 발언 생략)`, ...kept].join('\n')
    : kept.join('\n');

  return {
    text: `${HEADER}\n${body}${tail}`.slice(0, budget),
    droppedCount,
  };
}
