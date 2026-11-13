/**
 * 걸어 다니는 장소의 깊이 (2026-10-03 사용자 요청 «캐릭터 이동기능이 있는 공간에서는 깊이에 따른 캐릭터 표시»).
 *
 * 종전엔 플레이어를 NPC 보다 **늦게** 그렸을 뿐이라, 바닥 안쪽(위쪽)으로 걸어 들어가도 늘 NPC 앞에 떴다 —
 * 루온 뒤로 지나가는데 루온의 얼굴을 덮는 식이었다. 이제 모든 인물(NPC·이야기 인물·플레이어)이
 * **발 높이(바닥선 y)** 를 깊이로 쓴다: 화면 아래쪽(가까운 쪽)에 선 사람이 앞에 그려진다.
 * 크기도 같은 축을 따른다 — 안쪽으로 들어갈수록 작아진다.
 *
 * Phaser 를 들이지 않는 순수 함수라 노드에서 바로 잰다(`scripts/academy-test/world-depth.test.ts`).
 */
export const WORLD_HEIGHT = 1024;
/** 걸을 수 있는 바닥 띠(화면 높이 비율) — createWorld 의 클릭 영역과 같은 값. */
export const FLOOR_TOP = 0.65, FLOOR_BOTTOM = 0.88;
/** 배경은 0, 인물은 발 높이, 떠다니는 빛 알갱이는 늘 맨 앞. */
export const BACKDROP_DEPTH = 0;
export const MOTE_DEPTH = WORLD_HEIGHT + 100;

/** 인물의 깊이 = 발이 닿은 바닥선 y(px). 같은 줄이면 나중에 그린 것이 앞(Phaser 의 같은 깊이 규칙). */
export function actorDepth(feetY: number) { return Math.round(feetY * 10) / 10; }

/**
 * 플레이어 크기 — 바닥 띠 맨 안쪽 0.8배 ~ 맨 앞 1.03배(그 사이 선형). 기준 자리(0.83, 처음 서는 곳)에서 ≈ 0.98.
 * 종전 0.86~1.03 은 너무 얕아서 안쪽으로 걸어가도 거의 줄지 않았다.
 */
export function perspectiveScale(feetY: number, height = WORLD_HEIGHT) {
  const t = feetY / height;
  return Math.min(1.1, Math.max(0.8, 0.8 + (t - FLOOR_TOP) * 1.0));
}
