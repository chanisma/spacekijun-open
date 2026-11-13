/**
 * 좌우로 늘린 장소 배경 (2026-10-03 사용자 제안 — «모바일 가로에서는 이미지 양옆을 확대한 듯한 배경 대신, 원본을 좌우로 조금 더 확장»).
 *
 * 세계 평면은 높이 × 1.5 라 화면이 3:2 보다 넓으면(휴대폰 가로 · 넓은 모니터) 양옆이 빈다. 종전엔 같은 그림을 `cover` 로
 * 크게 깔아 양옆이 «확대한 가장자리»로 보였다. 이 그림들은 원본(1536×1024)을 가운데에 그대로 두고 좌우를 384px 씩
 * 이어 그린 2304×1024(2.25:1)라, «높이 100% · 가운데»로 깔면 가운데가 세계 캔버스와 정확히 겹쳐 장면이 양옆으로 이어진다.
 * 만든 방법·재현 = `scripts/academy-wide-art/`(codex CLI 내장 image_generation + compose.py).
 * 맞춤 제작한 방(서명된 https 원화)은 늘린 판이 없으므로 종전 배경 그대로다.
 */
export const WIDE_BACKDROP_ASSETS = ['plaza', 'library', 'observatory', 'post', 'dorm', 'dorm-rose', 'dorm-stars'] as const;
const WIDE = new Set<string>(WIDE_BACKDROP_ASSETS);

export function wideBackdrop(asset: string): string | null {
  return WIDE.has(asset) ? `/images/academy-game/wide/${asset}.jpg` : null;
}
