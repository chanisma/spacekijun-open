/**
 * 프롤로그 영상 (2026-10-15). 글로 읽는 프롤로그(`prologueStory.ts`)와 같은 이야기를 영상으로 만든 것.
 *
 * - 재생 전에는 유튜브를 **불러오지 않는다**(포스터는 우리 삽화) — 누르기 전엔 외부 요청이 없고 학교 회선에서도 가볍다.
 * - 쿠키 없는 도메인(`youtube-nocookie.com`)으로 넣는다.
 * - 끝났는지는 IFrame API 스크립트 없이 postMessage 로 듣는다(`enablejsapi=1` + `listening`). 못 들어도 감상에는 지장이 없다
 *   — 끝 화면이 안 뜰 뿐이다.
 * - 영상을 봐도 프롤로그 책갈피(`academy_prologues`)는 건드리지 않는다. 끝까지 봤는지 서버가 알 길이 없어
 *   «완료»로 적으면 관리자 깔때기의 «끝까지 읽음»이 거짓이 된다.
 */
export const prologueFilm = {
  id: 'kNABUBr49hs',
  title: '아직 이름 없는 별',
  poster: 'prologue-door',
} as const;

export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

export function prologueFilmEmbedUrl(origin: string | null, id: string = prologueFilm.id) {
  const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1', modestbranding: '1', enablejsapi: '1' });
  if (origin) params.set('origin', origin);
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${id}?${params}`;
}

export function prologueFilmWatchUrl(id: string = prologueFilm.id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** iframe 에게 «상태를 알려 달라»고 부탁하는 메시지 — 유튜브 위젯 규약. */
export const YOUTUBE_LISTENING_MESSAGE = JSON.stringify({ event: 'listening', id: 'academy-prologue-film', channel: 'widget' });

/** 유튜브 플레이어 상태 — -1 시작 전 · 0 끝 · 1 재생 · 2 멈춤 · 3 버퍼링 · 5 대기. */
export type YouTubePlayerState = -1 | 0 | 1 | 2 | 3 | 5;

/**
 * 위젯이 보내는 메시지에서 플레이어 상태를 꺼낸다. 두 모양이 온다 —
 * `{event:'onStateChange', info:0}` 과 `{event:'infoDelivery', info:{playerState:0}}`. 그 밖은 null.
 */
export function readYouTubeState(data: unknown): YouTubePlayerState | null {
  let message: unknown = data;
  if (typeof data === 'string') {
    try { message = JSON.parse(data); } catch { return null; }
  }
  if (!message || typeof message !== 'object') return null;
  const { event, info } = message as { event?: unknown; info?: unknown };
  const state = event === 'onStateChange' ? info
    : event === 'infoDelivery' && info && typeof info === 'object' ? (info as { playerState?: unknown }).playerState
    : undefined;
  return typeof state === 'number' && [-1, 0, 1, 2, 3, 5].includes(state) ? state as YouTubePlayerState : null;
}
