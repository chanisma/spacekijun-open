/**
 * 별까지 쌓기 — «등성» 랭크(2026-10-15 사용자 결정, docs/features/star-tower.md §10).
 *
 * 랭크 = 별의 겉보기 등급. 숫자가 작을수록 밝다. 완성한 탑이 없으면 7등성(맨눈에 안 보이는 별),
 * 탑 하나를 완성할 때마다 1씩 밝아진다 — 6등성 → … → 1등성 → 0등성 → −1등성(시리우스) …, 끝이 없다.
 *
 * 서버의 정본은 «완성한 탑의 수»(tower_state.towers) 하나다. 등성은 여기서만 유도한다(두 벌 금지).
 * 빛깔은 분광형(M→K→G→F→A→B→O)을 빌린 «게임의 표현»이다 — 실제 별의 밝기와 색은 서로 무관하다(화면도 그렇게 말한다).
 */

export type Rgb = [number, number, number];

/** 완성한 탑이 0개일 때의 등성 */
export const BASE_MAGNITUDE = 7;

export function magnitudeOf(towers: number): number {
  return BASE_MAGNITUDE - Math.max(0, Math.floor(towers));
}

/** «6등성» · «0등성» · «−1등성»(음수는 진짜 빼기표) */
export function magnitudeLabel(m: number): string {
  return `${m < 0 ? `−${-m}` : m}등성`;
}

/** 그 밝기를 실제 하늘의 무엇에 견줄 수 있나 — 별 이름의 등급은 실제 값(반올림) */
export function magnitudeNote(m: number): string {
  if (m >= 7) return '맨눈에는 아직 안 보이는 별 — 탑을 완성하면 6등성이 돼요';
  if (m === 6) return '맨눈으로 겨우 보이는 별 — 아주 어두운 하늘에서만';
  if (m === 5) return '불빛 없는 시골 하늘에서 보이는 별';
  if (m === 4) return '도시 변두리 하늘에서도 보이는 별';
  if (m === 3) return '별자리의 모양을 이루는 별';
  if (m === 2) return '북극성(2.0등성)만큼';
  if (m === 1) return '스피카(1.0등성)만큼 — 온 하늘에 스무 개 남짓한 1등성';
  if (m === 0) return '직녀성 베가(0.0등성)만큼';
  if (m === -1) return '시리우스(−1.5등성)만큼 — 밤하늘에서 가장 밝은 별';
  if (m >= -3) return '목성만큼 — 이제 어떤 별보다 밝아요';
  if (m === -4) return '금성(−4.6등성)만큼 — 해 진 뒤 가장 먼저 뜨는 빛';
  if (m > -12) return '금성보다 밝은 빛 — 낮에도 보일지 몰라요';
  if (m > -26) return '보름달(−12.7등성)만큼';
  return '해(−26.7등성)만큼 — 더 밝을 수 없어요';
}

/** 빛깔 — 탑을 완성할 때마다 붉은 별에서 푸른 별로(분광형을 빌렸다). 0개면 흐린 잿빛 */
export const STAR_TINTS: { cls: string; name: string; rgb: Rgb }[] = [
  { cls: 'M', name: '붉은 별', rgb: [255, 150, 120] },
  { cls: 'K', name: '주황 별', rgb: [255, 196, 140] },
  { cls: 'G', name: '노란 별', rgb: [255, 236, 170] },
  { cls: 'F', name: '연노랑 별', rgb: [255, 248, 214] },
  { cls: 'A', name: '흰 별', rgb: [238, 244, 255] },
  { cls: 'B', name: '푸른 흰 별', rgb: [196, 214, 255] },
  { cls: 'O', name: '푸른 별', rgb: [160, 184, 255] },
];

export function starTint(towers: number): { cls: string; name: string; rgb: Rgb } {
  if (towers <= 0) return { cls: '', name: '희미한 별', rgb: [150, 150, 175] };
  return STAR_TINTS[Math.min(STAR_TINTS.length, Math.floor(towers)) - 1];
}

export function rgbCss([r, g, b]: Rgb, a = 1): string {
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/** 장면의 «나의 별» 크기(화소) — 팔 길이·번짐. 탑이 늘수록 커지되 저해상도 장면을 덮지 않게 상한 */
export function starGlyph(towers: number): { arm: number; glow: number } {
  const t = Math.max(0, Math.floor(towers));
  return { arm: Math.min(6, 1 + t), glow: Math.min(9, 2 + t * 1.5) };
}

export interface PastTower { floors: string[]; doneAt: string | null }

/** 랭크 판 사다리 — 7등성부터 «지금 다음 둘»까지(지금이 깊으면 위쪽은 잘라 낸다) */
export function rankLadder(towers: number, keep = 8): { m: number; towers: number; reached: boolean; current: boolean }[] {
  const now = magnitudeOf(towers);
  const rows = [];
  for (let m = BASE_MAGNITUDE; m >= now - 2; m--) {
    rows.push({ m, towers: BASE_MAGNITUDE - m, reached: m >= now, current: m === now });
  }
  return rows.slice(Math.max(0, rows.length - keep));
}
