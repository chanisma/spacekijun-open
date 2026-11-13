/**
 * 하늘의 방문자 — 탑이 높아질수록 다른 하늘(2026-10-10 사용자 요청: «높이 올라갈수록 다양한 경험 — 비공정이 날아다니는 것 같은»).
 *
 * 방문자는 «세계 높이 띠»에 산다. 탑이 그 높이에 닿아야(unlockAt) 나타나고, 카메라가 그 띠를 보고 있을 때만 지나간다.
 * 쉬는 동안 카메라가 탑 꼭대기를 보므로, 새 층을 올리면 그 높이의 하늘이 저절로 눈앞에 온다.
 *
 * 누르면 반응한다(보상 없음 — 사용자 결정). 처음 누른 방문자는 도감 «하늘의 방문자»에 남는다(서버 `tower_meet`).
 * ⚠️ key 와 unlockAt 은 서버 `tower_private.visitor_table()` 과 두 벌 — 회귀가 대조한다.
 */

import type { Emote } from '../scene/pixelBubble';
import type { SoundName } from '../audio/ambience';

export type Motion = 'flap' | 'drift' | 'bob' | 'rise' | 'swim';

export interface Visitor {
  key: string;
  name: string;
  story: string;
  /** 누르면 화면 아래에 뜨는 한 줄 */
  reaction: string;
  emote: Emote;
  sound: SoundName;
  /** 사는 높이(수면 = 0) */
  band: [number, number];
  /** 쌓은 층이 이만큼이어야 나타난다 */
  unlockAt: number;
  /** 스프라이트(프레임 둘이면 날갯짓) */
  sprites: string[];
  motion: Motion;
  /** 지나가는 속도(내부 화소/초) */
  speed: [number, number];
  /** 나올 빈도(상대값) */
  weight: number;
  /** 밤에만 */
  nightOnly?: boolean;
  /** 완성한 탑이 이만큼이어야 나타난다(등성 방문자, 2026-10-23) — unlockAt(지금 탑 층)과 둘 다 만족해야 한다 */
  towersAt?: number;
}

export const VISITORS: Visitor[] = [
  {
    key: 'gull', sound: 'gull', name: '갈매기', band: [20, 150], unlockAt: 0, sprites: ['gull-up', 'gull-down'], motion: 'flap', speed: [14, 22], weight: 6,
    story: '물에 잠긴 세상에서도 갈매기는 늘 같은 소리로 운다. 낚시꾼의 첫 번째 친구.', reaction: '갈매기가 «끼룩» 하고 한 바퀴 돈다.', emote: 'note',
  },
  {
    key: 'whale-tail', sound: 'splash', name: '바다 고래', band: [0, 0], unlockAt: 1, sprites: ['whale-tail'], motion: 'rise', speed: [0, 0], weight: 1.2,
    story: '옛 거리를 헤엄치는 고래. 꼬리만 보여 주고 다시 깊이 들어간다.', reaction: '고래가 꼬리로 물을 한 번 철썩 친다.', emote: 'heart',
  },
  {
    key: 'kite', sound: 'sparkle', name: '연', band: [110, 240], unlockAt: 2, sprites: ['kite'], motion: 'bob', speed: [8, 12], weight: 1.5,
    story: '누군가의 지붕에서 날려 보낸 연. 줄은 끊겼지만 아직 바람을 탄다.', reaction: '연이 꼬리를 흔들며 한 번 솟는다.', emote: 'spark',
  },
  {
    key: 'balloon', sound: 'sparkle', name: '열기구', band: [140, 300], unlockAt: 3, sprites: ['balloon'], motion: 'bob', speed: [4, 7], weight: 2,
    story: '기운 천을 덧댄 열기구. 바구니의 우체부가 탑마다 편지를 내려 준다.', reaction: '바구니에서 누군가 모자를 흔든다.', emote: 'wave',
  },
  {
    key: 'airship', sound: 'horn', name: '작은 비공정', band: [240, 460], unlockAt: 5, sprites: ['airship'], motion: 'drift', speed: [9, 15], weight: 2,
    story: '구름 사이를 오가는 정기선. 프로펠러 소리가 들리면 오후 세 시라는 뜻이다.', reaction: '비공정이 깃발을 흔들며 «뿌우» 하고 답한다.', emote: 'wave',
  },
  {
    key: 'island', sound: 'water', name: '떠 있는 섬', band: [300, 520], unlockAt: 7, sprites: ['island'], motion: 'drift', speed: [2, 3], weight: 1,
    story: '물이 차오를 때 함께 떠오른 언덕. 나무 한 그루가 아직 꽃을 피운다.', reaction: '섬의 폭포에서 물방울이 반짝 튄다.', emote: 'spark',
  },
  {
    key: 'sky-whale', sound: 'whale', name: '하늘 고래', band: [360, 620], unlockAt: 9, sprites: ['sky-whale'], motion: 'swim', speed: [5, 8], weight: 1,
    story: '바다 고래가 너무 높이 뛰어올랐다가 내려오지 않기로 한 것이라고들 한다. 등에 별이 박혀 있다.', reaction: '하늘 고래가 노래한다. 탑이 아주 조금 떨린다.', emote: 'heart',
  },
  {
    key: 'jellyfish', sound: 'bubble', name: '하늘 해파리', band: [460, 760], unlockAt: 11, sprites: ['jellyfish'], motion: 'bob', speed: [2, 4], weight: 1.5, nightOnly: true,
    story: '밤에만 떠오르는 해파리. 낮에는 구름 속에서 잔다.', reaction: '해파리가 몸을 한 번 오므렸다 편다.', emote: 'spark',
  },
  {
    key: 'satellite', sound: 'blip', name: '옛 인공위성', band: [620, 900], unlockAt: 13, sprites: ['satellite'], motion: 'drift', speed: [3, 5], weight: 1,
    story: '물이 차오르기 전에 쏘아 올린 것. 아직 무언가를 보내고 있다 — 받는 사람은 없지만.', reaction: '위성의 안테나가 «삐—» 하고 깜빡인다.', emote: 'spark',
  },
  {
    key: 'star-spirit', sound: 'sparkle', name: '별의 정령', band: [700, 1000], unlockAt: 15, sprites: ['star-spirit'], motion: 'bob', speed: [3, 6], weight: 1.2, nightOnly: true,
    story: '별자리에서 떨어져 나온 작은 별. 탑을 쌓은 사람에게만 내려온다.', reaction: '별의 정령이 졸린 눈으로 손을 흔든다.', emote: 'zzz',
  },
  // ── 등성 방문자(2026-10-23 — 탑을 완성할수록 새 손님) ── ⚠️ 서버 visitor_table() 의 towers_at 과 두 벌
  {
    key: 'paper-crane', sound: 'page', name: '종이학', band: [60, 260], unlockAt: 1, towersAt: 1, sprites: ['paper-crane'], motion: 'drift', speed: [6, 10], weight: 1.2,
    story: '지난 탑 꼭대기에서 접어 날린 종이학. 탑을 하나 완성할 때마다 바람을 타고 돌아온다.', reaction: '종이학이 날개를 한 번 접었다 편다.', emote: 'heart',
  },
  {
    key: 'sky-lantern', sound: 'chime', name: '풍등', band: [140, 460], unlockAt: 3, towersAt: 2, sprites: ['sky-lantern'], motion: 'bob', speed: [1, 3], weight: 1.3, nightOnly: true,
    story: '두 번째 탑을 쌓은 밤부터 어딘가에서 풍등이 오른다. 누가 띄우는지는 아무도 모른다.', reaction: '풍등의 불꽃이 살짝 흔들린다. 소원 하나가 지나간다.', emote: 'spark',
  },
  {
    key: 'cloud-fox', sound: 'chirp', name: '구름 여우', band: [300, 560], unlockAt: 7, towersAt: 4, sprites: ['cloud-fox'], motion: 'swim', speed: [8, 12], weight: 1,
    story: '구름 사이를 뛰어다니는 여우. 탑을 네 번 쌓은 사람만 그 꼬리를 본다고 한다.', reaction: '구름 여우가 꼬리를 흔들고 구름 속으로 쏙 숨는다.', emote: 'note',
  },
  {
    key: 'star-train', sound: 'horn', name: '별빛 기차', band: [650, 950], unlockAt: 13, towersAt: 6, sprites: ['star-train'], motion: 'drift', speed: [10, 14], weight: 0.8, nightOnly: true,
    story: '별과 별 사이를 달리는 작은 기차. 1등성이 된 별지기의 창가에 한 번씩 선다.', reaction: '기차가 «뿌—» 하고 기적을 울린다.', emote: 'spark',
  },
];

/** 이 방문자가 지금 하늘에 나올 수 있나 — 지금 탑 층(unlockAt) · 완성한 탑(towersAt) */
export function visitorUnlocked(v: Visitor, floors: number, towers: number): boolean {
  return floors >= v.unlockAt && towers >= (v.towersAt ?? 0);
}

export const VISITOR_BY_KEY: Record<string, Visitor> = Object.fromEntries(VISITORS.map((v) => [v.key, v]));

/** 비공정 상인 — 구름층에 닿으면 탑 옆에 정박해 새 교환을 연다(서버 tower_trade 의 상인 교환과 같은 문턱) */
export const MERCHANT_AT = 7;

/** 높이 띠의 이름 — 도감·안내가 쓴다 */
export const BANDS: { name: string; from: number }[] = [
  { name: '바다', from: 0 },
  { name: '구름 아래', from: 3 },
  { name: '구름층', from: 6 },
  { name: '높은 하늘', from: 10 },
  { name: '우주의 문턱', from: 14 },
];

/** 세계 높이로 띠 이름 — 방문자가 «어디를 지나가는가»(열리는 층과 다르다: 연은 2층에 열리지만 구름 아래를 난다) */
export function altitudeBand(altitude: number): string {
  if (altitude < 110) return '바다';
  if (altitude < 260) return '구름 아래';
  if (altitude < 460) return '구름층';
  if (altitude < 700) return '높은 하늘';
  return '우주의 문턱';
}

export function bandOf(floors: number): string {
  let name = BANDS[0].name;
  for (const b of BANDS) if (floors >= b.from) name = b.name;
  return name;
}
