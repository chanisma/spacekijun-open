/**
 * 인계 노트 — «내년의 나(또는 다음 담당자)에게 남기는 한 줄» (2026-09-24).
 *
 * 왜 `description` 으로 안 되는가: 설명은 **무엇을 하는 일인가**이고 인계 노트는 **작년에
 * 무엇이 문제였나**다. 둘을 한 칸에 섞으면 해마다 설명이 길어지다가 아무도 안 읽는다.
 *
 * 왜 새 표가 아닌가: 이 값의 수명은 할 일과 정확히 같고(할 일이 사라지면 함께 사라진다),
 * 읽는 곳도 그 할 일 화면뿐이다. `task.meta.handoverNote` 한 칸이면 **지난 업무 가져오기가
 * 계보를 타고 그대로 옮겨 준다**(`TASK_META_ROLLOVER_POLICY` 의 `keep`) — 표를 따로 두면
 * 가져오기 규칙표에 걸리지 않아 내년에 조용히 사라진다.
 *
 * 저장은 `task.meta` 얕은 병합 경로(`useUpdateTaskJsonb`)를 그대로 쓴다.
 */

/** 너무 길면 «인계»가 아니라 문서다 — 화면과 저장이 같은 상한을 쓴다 */
export const HANDOVER_NOTE_MAX = 1000;

export function readHandoverNote(meta: unknown): string {
  const value = (meta && typeof meta === 'object' ? (meta as { handoverNote?: unknown }).handoverNote : null);
  return typeof value === 'string' ? value : '';
}

export function hasHandoverNote(meta: unknown): boolean {
  return readHandoverNote(meta).trim().length > 0;
}

/**
 * 저장할 meta 조각. **빈 값은 키를 지운다**(`null`) — 빈 문자열로 남기면 «노트가 있다»는
 * 판정이 참이 되고, 내년으로도 빈 껍데기가 따라간다.
 */
export function buildHandoverNotePatch(next: string): { handoverNote: string | null } {
  const trimmed = next.trim().slice(0, HANDOVER_NOTE_MAX);
  return { handoverNote: trimmed.length > 0 ? trimmed : null };
}

/** 화면에 그대로 쓰는 안내 — 무엇을 적는 칸인지 한 줄로 말한다 */
export const HANDOVER_NOTE_HINT =
  '내년 담당자(또는 내년의 나)에게 남길 말 — 막혔던 곳, 미리 챙길 것, 실제 일정 등';
