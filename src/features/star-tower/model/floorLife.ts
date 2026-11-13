/**
 * 층이 살아 움직이기 — 층마다 «가만히 있을 때의 움직임» 하나와 «누르면 일어나는 일» 하나.
 *
 * 움직임의 자리(굴뚝 끝 · 수조 · 무전기 불빛)는 사람이 좌표로 적지 않고 그림에서 찾는다(scene/assets.ts 의 anchors) —
 * codex 로 그림을 다시 그려도 좌표를 고칠 필요가 없게.
 */
import type { Emote } from '../scene/pixelBubble';
import type { SoundName } from '../audio/ambience';

export type IdleFx = 'smoke' | 'steam' | 'bubbles' | 'blink';

export interface FloorLife {
  idle?: IdleFx;
  emote: Emote;
  sound: SoundName;
  /** 누르면 화면 위에 뜨는 한 줄 */
  line: string;
  /** 누르면 일어나는 짧은 연출 — 기본은 반짝이 */
  burst?: 'notes' | 'smoke' | 'bubbles' | 'steam' | 'spark';
}

export const FLOOR_LIFE: Record<string, FloorLife> = {
  base: { emote: 'wave', sound: 'splash', line: '낚시꾼이 «오늘은 뭐가 걸릴까» 하고 중얼거린다.' },
  cabin: { emote: 'wave', sound: 'knock', line: '둥근 문 위의 문패가 바람에 달그락거린다.' },
  kitchen: { idle: 'smoke', emote: 'flame', sound: 'sizzle', line: '생선 굽는 냄새가 탑 전체로 퍼진다.', burst: 'smoke' },
  library: { emote: 'book', sound: 'page', line: '누가 읽다 만 책장이 한 장 넘어간다.' },
  garden: { emote: 'heart', sound: 'chirp', line: '해먹이 살랑 흔들리고, 귤 하나가 떨어질 뻔한다.' },
  workshop: { emote: 'spark', sound: 'saw', line: '톱질 소리가 두 번 난다. 다음 층을 다듬는 중이다.' },
  bedroom: { emote: 'zzz', sound: 'yawn', line: '누군가 조각 이불 속에서 뒤척인다.' },
  greenhouse: { emote: 'spark', sound: 'water', line: '토마토 잎에서 물방울이 또르르 굴러떨어진다.' },
  radio: { idle: 'blink', emote: 'note', sound: 'blip', line: '지지직… 먼 곳의 노래가 잠깐 들렸다 사라진다.' },
  smokehouse: { idle: 'smoke', emote: 'flame', sound: 'sizzle', line: '줄줄이 걸린 훈제 생선이 흔들린다.', burst: 'smoke' },
  tearoom: { idle: 'steam', emote: 'heart', sound: 'steam', line: '찻주전자가 «쉬익» 하고 김을 낸다.', burst: 'steam' },
  music: { emote: 'note', sound: 'notes', line: '축음기가 물결 소리에 맞춰 몇 소절을 연주한다.', burst: 'notes' },
  maproom: { emote: 'spark', sound: 'tick', line: '나침반 바늘이 빙글 돌다 북쪽에 멈춘다.' },
  aquarium: { idle: 'bubbles', emote: 'bubble', sound: 'bubble', line: '수조 친구들이 한쪽으로 우르르 몰려온다.', burst: 'bubbles' },
  bathhouse: { idle: 'steam', emote: 'heart', sound: 'water', line: '구리 욕조에서 따뜻한 김이 피어오른다.', burst: 'steam' },
  bell: { emote: 'bell', sound: 'bell', line: '종이 «댕—» 하고 울린다. 멀리서 고래가 대답한다.' },
  study: { emote: 'spark', sound: 'chalk', line: '칠판의 별자리에 선이 하나 더 그어진다.' },
  observatory: { emote: 'spark', sound: 'chime', line: '망원경이 천천히 돌아 별 하나를 겨눈다.' },
};
