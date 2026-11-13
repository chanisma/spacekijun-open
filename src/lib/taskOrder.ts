// ========================================
// 절차적 할 일의 순서 번호 — 1부터 (2026-09-23 사용자 결정)
//
// `task.order_index` 는 **저장값이 곧 화면에 보이는 번호**다(1, 2, 3 …). 0 은 절차가 아닌
// 일회성 할 일의 자리다 — 할 일 상세가 `order_index === 0` 을 일회성으로 읽는다.
//
// 종전엔 규칙이 둘이었다: 새 할 일·업무 만들기 미리보기·할 일 상세는 1부터였는데, AI 생성·
// 문서 분석 초안은 배열 위치(0부터)를 그대로 저장했고, 내 할 일·노드·복사 미리보기는 0부터라
// 가정해 `+1` 해서 보여 줬다. 그래서 대부분(1부터 저장된) 업무의 첫 단계가 "순서 2"로 보였다.
// 새 코드는 번호를 직접 계산하지 말고 이 모듈을 쓸 것.
// ========================================

export const FIRST_STEP_ORDER = 1;

/** 배열 위치(0부터) → 저장할 순서 번호(1부터) */
export function stepOrderAt(index: number): number {
  return index + FIRST_STEP_ORDER;
}

/** 이 업무의 가장 큰 순서 다음 번호 — 절차가 없으면 1 */
export function nextStepOrder(maxExisting: number | null | undefined): number {
  return typeof maxExisting === 'number' && Number.isFinite(maxExisting)
    ? Math.max(FIRST_STEP_ORDER, Math.floor(maxExisting) + 1)
    : FIRST_STEP_ORDER;
}

/** 입력칸 값 → 순서 번호. 비었거나 1 미만이면 1 */
export function parseStepOrderInput(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= FIRST_STEP_ORDER ? value : FIRST_STEP_ORDER;
}

// ========================================
// 순서 칸에서 자리 바꾸기 — 내 업무 관리 표 (2026-09-26)
//
// 한 할 일의 자리를 «일회성» 또는 «절차 N번째»로 옮긴다. 번호만 바꾸면 같은 번호가 둘이 되므로
// **이 업무의 절차 전체를 1부터 다시 매긴다**(끼워 넣은 자리 뒤는 한 칸씩 밀린다). 원래 번호에
// 구멍이 있었다면(1, 2, 5) 그것도 이때 메워진다.
//
// 반환값은 **실제로 바뀌는 행만**이다 — 쓰기가 필요 없는 행까지 보내면 동시 편집 중인 다른
// 매니저의 변경을 옛 값으로 덮을 수 있다.
// ========================================

export type StepPlacement = number | 'one_time';

export interface StepOrderTask {
  id: string;
  type?: string | null;
  order_index?: number | null;
}

export interface StepOrderChange {
  id: string;
  type: 'procedural' | 'one_time';
  order_index: number;
}

/** 화면과 같은 절차 정렬 — 번호 없는 것은 뒤, 같으면 id */
function compareSteps(a: StepOrderTask, b: StepOrderTask): number {
  const ai = a.order_index ?? 9999;
  const bi = b.order_index ?? 9999;
  return ai === bi ? a.id.localeCompare(b.id) : ai - bi;
}

export function planStepPlacement(
  tasks: StepOrderTask[],
  movedId: string,
  target: StepPlacement,
): StepOrderChange[] {
  const moved = tasks.find((t) => t.id === movedId);
  if (!moved) return [];

  const steps = tasks
    .filter((t) => t.type === 'procedural' && t.id !== movedId)
    .sort(compareSteps);

  const next = new Map<string, { type: 'procedural' | 'one_time'; order_index: number }>();
  if (target === 'one_time') {
    next.set(movedId, { type: 'one_time', order_index: 0 });
  } else {
    const at = Math.min(Math.max(Math.floor(target), FIRST_STEP_ORDER), steps.length + 1) - FIRST_STEP_ORDER;
    steps.splice(at, 0, moved);
  }
  steps.forEach((t, index) => next.set(t.id, { type: 'procedural', order_index: stepOrderAt(index) }));

  const changes: StepOrderChange[] = [];
  for (const task of tasks) {
    const want = next.get(task.id);
    if (!want) continue;
    if (task.type !== want.type || (task.order_index ?? null) !== want.order_index) {
      changes.push({ id: task.id, ...want });
    }
  }
  return changes;
}
