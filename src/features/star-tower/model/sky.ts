/**
 * 하늘 — 한국 시각을 따라 색이 바뀌고, 높이 올라갈수록 우주에 가까워진다.
 *
 * 그림 한 장이 아니라 코드로 그리는 이유: 같은 탑이 아침·노을·밤·비에 다른 그림이 되어야 한다.
 * 집중하는 25분 사이에 해가 지는 것 자체가 이 게임의 보상이다.
 */

export type Rgb = [number, number, number];

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** [시각, 위, 가운데, 수평선, 바다] — 시각 사이는 선형 보간 */
const KEYS: [number, Rgb, Rgb, Rgb, Rgb][] = (
  [
    [0, '#070a24', '#121844', '#232a5e', '#0b1236'],
    [4.5, '#0b0f30', '#1d2356', '#3a3466', '#121a40'],
    [6, '#2a2f6e', '#8a5a8c', '#f2a37a', '#3a3f6e'],
    [8, '#4a78c8', '#8fb8e0', '#f4d8b0', '#3d6a9a'],
    [12, '#3f86d6', '#7fb6e6', '#cfe8f2', '#3a78a8'],
    [16, '#4f7ccc', '#a0b8e0', '#f6dcb4', '#456f9e'],
    [18.2, '#3b2a6b', '#c9577a', '#ffb27a', '#5a3f72'],
    [19.4, '#1c1748', '#5a2f6e', '#b85a6a', '#2a2350'],
    [21, '#0a0d2c', '#171c4c', '#2a2c62', '#0e1438'],
    [24, '#070a24', '#121844', '#232a5e', '#0b1236'],
  ] as const
).map((k) => [k[0], hex(k[1]), hex(k[2]), hex(k[3]), hex(k[4])]);

export interface SkyPalette {
  top: Rgb;
  mid: Rgb;
  hor: Rgb;
  sea: Rgb;
}

export function palette(hour: number): SkyPalette {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (KEYS[i + 1][0] < h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a[0]) / (b[0] - a[0]);
  return { top: mix(a[1], b[1], t), mid: mix(a[2], b[2], t), hor: mix(a[3], b[3], t), sea: mix(a[4], b[4], t) };
}

/** 0 = 한낮, 1 = 한밤. 해 뜨고 지는 무렵 1.6시간에 걸쳐 바뀐다. */
export function nightness(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const d = h < 12 ? h : 24 - h;
  return Math.max(0, Math.min(1, (6.3 - d) / 1.6));
}

/** 우주 색 — 높이 올라갈수록 하늘이 이 색에 가까워진다(낮에도 조금). */
export const SPACE: Rgb = [10, 8, 34];
export const SKY_SPAN = 360;

export function spaceBlend(altitude: number, night: number): number {
  const t = Math.max(0, Math.min(1, (altitude - SKY_SPAN) / 700));
  return t * (0.55 + 0.45 * night);
}

/** 지금 한국 시각(소수 시) */
export function kstHour(now: number): number {
  const d = new Date(now);
  return (d.getUTCHours() + 9) % 24 + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/** 날씨 — 한국 날짜 + 3시간 칸으로 정한다(같은 시각엔 누구에게나 같은 날씨). 비 12%. */
export type Weather = 'clear' | 'rain';
export function weatherAt(now: number): Weather {
  const kst = new Date(now + 9 * 3600_000);
  const key = `${kst.getUTCFullYear()}-${kst.getUTCMonth()}-${kst.getUTCDate()}-${Math.floor(kst.getUTCHours() / 3)}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100) < 12 ? 'rain' : 'clear';
}

/** 비가 그친 낮 — 지난 3시간 칸이 비였고 지금은 맑다(무지개) */
export function rainbowAt(now: number): boolean {
  return weatherAt(now) === 'clear' && weatherAt(now - 3 * 3600_000) === 'rain';
}

/** 유성우가 내리는 밤 — 한국 날짜 해시로 나흘에 하루쯤(누구에게나 같은 밤) */
export function meteorShowerAt(now: number): boolean {
  const kst = new Date(now + 9 * 3600_000 - 12 * 3600_000); // 자정을 넘겨도 같은 밤으로
  const key = `${kst.getUTCFullYear()}-${kst.getUTCMonth()}-${kst.getUTCDate()}-meteor`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 4) === 0;
}

/** 계절 — 한국 달력(3~5 봄 · 6~8 여름 · 9~11 가을 · 12~2 겨울) */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export function seasonAt(now: number): Season {
  const m = new Date(now + 9 * 3600_000).getUTCMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

/** 4×4 바이엘 — 하늘 그라데이션을 도트답게 계단 지게 */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
