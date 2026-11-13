/**
 * 무대 좌표 — 목업과 포인터를 **같은 상수에서** 유도하기 위한 도구.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * `Pointer` 의 웨이포인트는 씬 컨테이너 기준 **%** 인데, 목업 안 요소는 보통 **px**
 * 로 배치한다. 둘을 따로 적으면 "포인터가 버튼 위에 있는가" 를 눈으로 맞춰야 하고
 * (원래 스킬은 캡처 스크립트로 확정하라고 한다), 목업을 조금만 옮겨도 조용히 어긋난다.
 *
 * 그래서 **버튼 자리를 `Rect` 상수로 한 번만 적고** 목업은 그 상수로 배치, 포인터는
 * `centerOf(rect)` 로 같은 상수를 참조한다. 포인터가 대상 위에 오는 것이 계산이 아니라
 * **구성으로 보장**된다 — 배치를 바꿔도 포인터가 따라온다.
 *
 * 좌표계는 `WalkthroughStage` 의 고정 캔버스(1280×720) px 다.
 */
import { STAGE_H, STAGE_W } from './WalkthroughStage';

export interface Rect { x: number; y: number; w: number; h: number }

/** 캔버스 px → 씬 % (가로) */
export const pctX = (x: number): number => (x / STAGE_W) * 100;
/** 캔버스 px → 씬 % (세로) */
export const pctY = (y: number): number => (y / STAGE_H) * 100;

/** 사각형의 중심을 씬 % 로 — 포인터 웨이포인트에 그대로 넣는다 */
export function centerOf(r: Rect): { x: number; y: number } {
  return { x: pctX(r.x + r.w / 2), y: pctY(r.y + r.h / 2) };
}

/** 사각형을 절대배치 style 로 — 목업이 같은 상수를 쓰게 한다 */
export function boxOf(r: Rect): {
  position: 'absolute'; left: number; top: number; width: number; height: number;
} {
  return { position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h };
}

/**
 * 창 안의 상대 사각형을 캔버스 절대 사각형으로.
 * 창을 옮기면 그 안의 버튼도 함께 따라오므로 배치를 나중에 조정하기 쉽다.
 * `chrome` = 제목줄 높이(AppWindow 기본 ≈ 38px) — 본문 기준으로 적을 때 넘긴다.
 */
export function inWindow(win: Rect, rel: Rect, chrome = 0): Rect {
  return { x: win.x + rel.x, y: win.y + chrome + rel.y, w: rel.w, h: rel.h };
}

/** `AppWindow` 제목줄 높이(패딩 9px×2 + 내용 ≈ 20px). 창 본문 좌표 계산의 기준 */
export const WINDOW_CHROME = 38;
