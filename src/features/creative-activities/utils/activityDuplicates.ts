// ========================================
// 중복 활동 판정 — 순수 로직 (React 비의존)
//
// "이미 같은 활동이 있는 경우"의 답은 **두 가지이고 서로 다르다.**
//   같은 학년도 → 여러 동아리가 함께 하는 활동이므로 **합류**(주최·참여자를 더한다)
//   지난 학년도 → **계보 연결**(이어받기)
//
// 활동을 하나 더 만드는 것은 둘 다 아니다 — 그러면 같은 활동이 목록에 둘로 갈라지고
// 계보도 참여 집계도 어긋난다.
// ========================================

/**
 * 이름 비교용 정규화.
 *
 * 학교에서 같은 활동이 이렇게 적힌다:
 *   "혈액형 판별 실험", "혈액형판별실험", "혈액형 판별 실험(2학기)", "2026 혈액형 판별 실험"
 * 공백·괄호·연도·기수 표기를 걷어내야 같은 것으로 보인다.
 */
export function normalizeActivityName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    // 괄호 안 부연 제거 — "(2학기)", "(1차)"
    .replace(/[([{（【][^)\]}）】]*[)\]}）】]/g, ' ')
    // 앞뒤 연도·회차 표기.
    // **`\b`를 뒤에 쓰지 않는다** — JS의 `\b`는 `[A-Za-z0-9_]` 기준이라 한글 뒤에서는
    // 경계로 인식되지 않는다("2차"의 `차` 뒤에서 매칭이 통째로 실패했다).
    // 대신 `(?![가-힣])`로 낱말 중간을 피한다.
    .replace(/(19|20)\d{2}\s*(년|학년도)?/g, ' ')
    .replace(/\d+\s*(학기|회차|차시|차|회|기)(?![가-힣])/g, ' ')
    // 이어가기·심화 같은 계보 접미는 비교에서 제외 — 원래 활동을 찾아야 한다
    .replace(/(이어가기|이어받기|심화|후속|part\s*\d+)/g, ' ')
    // 구분 기호
    .replace(/[·⋅・:：\-–—_/\\,.]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * 두 활동 이름이 사실상 같은가.
 *
 * 정규화 후 **완전 일치 또는 한쪽이 다른 쪽을 포함**하면 같은 것으로 본다.
 * 포함까지 보는 이유: "혈액형 판별 실험"과 "혈액형 판별 실험 심화"는 같은 계열이고,
 * 교사에게 보여 주면 합류든 이어받기든 옳은 선택을 할 수 있다.
 *
 * **너무 짧은 이름은 판정하지 않는다** — "실험" 같은 두 글자가 모든 활동에 걸린다.
 */
export function isSimilarActivityName(a: string, b: string): boolean {
  const x = normalizeActivityName(a);
  const y = normalizeActivityName(b);
  if (x.length < 3 || y.length < 3) return x.length > 0 && x === y;
  if (x === y) return true;

  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  // 포함 판정은 짧은 쪽이 충분히 길 때만 — 3글자가 20글자에 우연히 포함되는 것은 신호가 아니다
  if (shorter.length < 4) return false;
  return longer.includes(shorter);
}

/** 중복 후보를 만났을 때 화면이 제시할 길 */
export type DuplicateAction = 'join' | 'continue' | 'separate';

export const DUPLICATE_ACTION_LABELS: Record<DuplicateAction, string> = {
  join: '이 활동에 합류',
  continue: '이어받기',
  separate: '별개 활동으로',
};

/**
 * 같은 학년도인가에 따라 권하는 길이 다르다.
 *
 * 같은 해 = 여러 동아리가 함께 한 하나의 활동 → 합류
 * 지난 해 = 올해 이어받는 것 → 계보 연결
 */
export function suggestedAction(sameYear: boolean): DuplicateAction {
  return sameYear ? 'join' : 'continue';
}
