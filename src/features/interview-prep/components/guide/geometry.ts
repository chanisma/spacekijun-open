/**
 * 면접 준비 안내 씬의 **자리** — 목업과 포인터가 함께 보는 단 하나의 출처.
 *
 * ── 왜 별도 파일인가 ───────────────────────────────────────────────────────
 * ① **fast-refresh** — 한 파일이 컴포넌트와 상수를 함께 내보내면 갱신이 깨진다.
 * ② **회귀가 실제 값을 본다** — 테스트가 좌표를 베껴 쓰면, 좌표를 잘못 적었을 때
 *    테스트도 똑같이 잘못 적혀 통과한다(업무 흐름 안내에서 실제로 한 칸 어긋났던 사고).
 *
 * ── 규칙 ───────────────────────────────────────────────────────────────────
 * `*_REL` 은 **창 본문 기준**(제목줄 아래) 좌표다. 목업은 `boxOf(rel)` 로 그리고,
 * 포인터는 `centerOf(inWindow(win, rel, CH))` 로 같은 상수를 참조한다. 그래서 배치를
 * 옮겨도 포인터가 따라오고, "포인터가 버튼 위에 있는가"를 눈으로 맞출 필요가 없다.
 *
 * **흐름(flow) 배치에 기대지 말 것** — 알약·칩은 너비가 글자 수에 달려 있어서,
 * 자리를 손으로 적으면 조용히 빗나간다(실제로 ③의 세그먼트가 14px 어긋났다).
 */
import { inWindow, WINDOW_CHROME as CH, type Rect } from '@/components/walkthrough/stageCoords';

/* ① 오늘의 질문 — 홈 카드 → 면접 준비 */
export const A_W1: Rect = { x: 28, y: 64, w: 392, h: 236 };
export const A_GET_REL: Rect = { x: 30, y: 112, w: 130, h: 28 };
export const A_W2: Rect = { x: 336, y: 182, w: 590, h: 320 };
/** 근거 기록 칩. 부모 span 이 (16,48)에 있으므로 씬은 이 값에서 그 오프셋을 뺀다. */
export const A_CHIP_REL: Rect = { x: 16, y: 128, w: 122, h: 20 };
export const A_GET = inWindow(A_W1, A_GET_REL, CH);
export const A_CHIP = inWindow(A_W2, A_CHIP_REL, CH);

/* ② 답하고 피드백 — 창 하나(답변칸과 피드백이 같은 자리에 이어 나온다) */
export const B_W: Rect = { x: 120, y: 66, w: 720, h: 420 };
export const B_AREA_REL: Rect = { x: 16, y: 104, w: 662, h: 70 };
export const B_SEND_REL: Rect = { x: 566, y: 172, w: 112, h: 28 };
export const B_AREA = inWindow(B_W, B_AREA_REL, CH);
export const B_SEND = inWindow(B_W, B_SEND_REL, CH);

/* ③ 연습 — 세그먼트 알약 2개와 활동 카드 */
export const C_W: Rect = { x: 90, y: 66, w: 780, h: 420 };
export const C_SEG1_REL: Rect = { x: 16, y: 146, w: 62, h: 24 };
export const C_SEG2_REL: Rect = { x: 82, y: 146, w: 156, h: 24 };
export const C_CARD_REL: Rect = { x: 16, y: 194, w: 220, h: 62 };
export const C_FILTER = inWindow(C_W, C_SEG2_REL, CH);
export const C_CARD = inWindow(C_W, C_CARD_REL, CH);

/* ④ 기록과 선생님 — 클릭이 없는 단계라 포인터 대상이 없다 */
export const D_W1: Rect = { x: 26, y: 70, w: 450, h: 400 };
export const D_W2: Rect = { x: 500, y: 150, w: 430, h: 330 };

/** 회귀가 읽는 목록. 창은 무대 안에, 포인터 대상은 그 창 본문 안에 있어야 한다. */
export const GUIDE_GEOMETRY: Record<string, { windows: Rect[]; targets: Rect[] }> = {
  today: { windows: [A_W1, A_W2], targets: [A_GET, A_CHIP] },
  answer: { windows: [B_W], targets: [B_AREA, B_SEND] },
  practice: { windows: [C_W], targets: [C_FILTER, C_CARD] },
  record: { windows: [D_W1, D_W2], targets: [] },
};
