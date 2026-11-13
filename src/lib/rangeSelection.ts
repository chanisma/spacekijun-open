/**
 * 목록 체크박스의 Shift 범위 선택 (순수 로직, React 비의존)
 *
 * 동작 = 파일 탐색기·메일함과 같다.
 *  - 그냥 클릭 → 그 항목만 토글하고 **앵커**를 그 자리로 옮긴다.
 *  - Shift+클릭 → 앵커부터 클릭한 항목까지를 **클릭한 항목의 새 상태로 통일**한다.
 *    (꺼져 있던 것을 Shift+클릭하면 구간이 전부 켜지고, 켜져 있던 것을 누르면 전부 꺼진다)
 *
 * **앵커를 인덱스가 아니라 키로 들고 있는 이유**: 정렬·필터·삭제로 목록이 흔들리면
 * 인덱스는 엉뚱한 행을 가리킨다. 키가 지금 목록에 없으면(=사라졌으면) 범위를 만들지 않고
 * 평범한 단일 토글로 떨어뜨린다 — 조용히 엉뚱한 구간을 선택하는 것보다 낫다.
 */

export interface RangeToggleInput<K> {
  /** 화면에 보이는 순서 그대로의 키 목록 */
  keys: K[];
  /** 현재 선택 집합 (변경하지 않는다) */
  selected: ReadonlySet<K>;
  /** 방금 클릭한 항목의 키 */
  key: K;
  /** 직전에 클릭한 항목의 키. 없으면 null */
  anchorKey: K | null;
  shiftKey: boolean;
}

export interface RangeToggleResult<K> {
  /** 새 선택 집합 (입력은 그대로 둔다) */
  selected: Set<K>;
  /** 다음 앵커 — 호출부가 저장한다 */
  anchorKey: K;
  /** 실제로 범위가 적용됐는가 (앵커가 없거나 사라졌으면 false) */
  usedRange: boolean;
}

export function toggleWithRange<K>({
  keys,
  selected,
  key,
  anchorKey,
  shiftKey,
}: RangeToggleInput<K>): RangeToggleResult<K> {
  const next = new Set(selected);
  // 클릭한 항목이 갖게 될 상태 — 구간 전체가 이 상태로 통일된다
  const turnOn = !next.has(key);

  const index = keys.indexOf(key);
  const anchorIndex = anchorKey === null ? -1 : keys.indexOf(anchorKey);
  const usedRange = shiftKey && index !== -1 && anchorIndex !== -1 && anchorIndex !== index;

  if (usedRange) {
    const from = Math.min(anchorIndex, index);
    const to = Math.max(anchorIndex, index);
    for (let i = from; i <= to; i += 1) {
      if (turnOn) next.add(keys[i]);
      else next.delete(keys[i]);
    }
  } else if (turnOn) {
    next.add(key);
  } else {
    next.delete(key);
  }

  // **Shift+클릭은 앵커를 옮기지 않는다** — 앵커가 고정돼야 Shift+클릭을 이어 하며
  // 구간을 넓히거나 줄일 수 있다(탐색기·메일함과 동일). 그냥 클릭만 앵커를 옮긴다.
  return { selected: next, anchorKey: usedRange ? (anchorKey as K) : key, usedRange };
}
