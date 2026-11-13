import type { Npc, Place } from './world';
import { WORLD_HEIGHT } from './worldDepth';

/**
 * 장소마다 인물이 서는 자리 — Phaser(createWorld)와 화면 겹층(이야기 표식)이 함께 쓴다 (2026-10-04 createWorld 에서 옮김).
 * createWorld 는 Phaser 를 들여 지연 로드되므로, 자리 표만 이 가벼운 모듈에 둔다(표식 계산이 Phaser 를 끌고 오지 않게).
 * 좌표: x·y = 발의 자리(세계 폭·높이 대비 0~1), 높이 = 세계 픽셀(세계 1536×1024).
 */
// Feet are anchored on each room's floor; furniture sets the apparent scale.
export const roomActors = {
  plaza: { playerHeight: 285, npcHeight: 360, npcX: .51, npcY: .79 },
  library: { playerHeight: 310, npcHeight: 395, npcX: .76, npcY: .80 },
  observatory: { playerHeight: 330, npcHeight: 420, npcX: .81, npcY: .81 },
  post: { playerHeight: 335, npcHeight: 430, npcX: .76, npcY: .82 },
  dorm: { playerHeight: 400, npcHeight: 390, npcX: .67, npcY: .82 },
} as const;
/**
 * 터줏대감 NPC 외에 **이야기가 풀어 준 인물**이 서는 자리 (2026-10-03).
 * 테오는 제5장이 시작된 뒤 광장에 서 있어야 하는데(핫스팟 `lamplighter` 는 있었다) 그림이 없어 **표식만 떠 있었다** —
 * `placeNpcs` 가 장소당 한 명이라 둘째 인물을 그릴 자리가 없었다. 자리는 핫스팟 표식(x 73%) 곁, 발은 바닥선.
 */
export const extraActors: Partial<Record<Place, Partial<Record<Npc, { x: number; y: number; height: number; flip?: boolean }>>>> = {
  plaza: { lamplighter: { x: .78, y: .83, height: 335, flip: true } },
  library: { serin: { x: .30, y: .81, height: 350 } },
};

/**
 * 그 장소에 그려진 인물의 **머리 위** 자리(세계 대비 %) — 이야기 표식(«!»)을 올려 둘 곳. 그려지지 않는 인물이면 null.
 * 그림 원점이 발(.5, 1)이라 머리 = 발 y − 그림 높이. 머리 끝에서 조금 띄워 얼굴을 가리지 않는다.
 */
export function npcHeadPoint(place: Place, npc: Npc, placeNpc: Npc | null, extras: readonly Npc[] = []): { x: number; y: number } | null {
  const HEAD_MARGIN = -0.012; // 머리 끝보다 살짝 위 — 그림 위쪽 여백이 거의 없다(스크린샷으로 맞춤)
  if (placeNpc === npc) { const a = roomActors[place]; return { x: a.npcX * 100, y: (a.npcY - a.npcHeight / WORLD_HEIGHT + HEAD_MARGIN) * 100 }; }
  const spot = extraActors[place]?.[npc];
  if (spot && extras.includes(npc)) return { x: spot.x * 100, y: (spot.y - spot.height / WORLD_HEIGHT + HEAD_MARGIN) * 100 };
  return null;
}

/** 그 장소에 그려진 인물의 **발** 자리(세계 대비 %) — 인물 이름표를 그 바로 아래에 단다(2026-10-04). 그려지지 않으면 null. */
export function npcFootPoint(place: Place, npc: Npc, placeNpc: Npc | null, extras: readonly Npc[] = []): { x: number; y: number } | null {
  if (placeNpc === npc) { const a = roomActors[place]; return { x: a.npcX * 100, y: a.npcY * 100 }; }
  const spot = extraActors[place]?.[npc];
  if (spot && extras.includes(npc)) return { x: spot.x * 100, y: spot.y * 100 };
  return null;
}
