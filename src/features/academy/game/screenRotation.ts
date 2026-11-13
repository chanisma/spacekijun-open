/**
 * 휴대폰 가로/세로 바꾸기 (2026-10-03 사용자 요청 «모바일 환경에서 가로/세로 모드를 변경할 수 있는 아이콘»).
 *
 * 브라우저가 해 줄 수 있는 것이 둘로 갈린다:
 *  ① 안드로이드 크롬 등 — 전체 화면에 들어간 뒤 `screen.orientation.lock()` 으로 **진짜** 화면 방향을 잠근다.
 *  ② 아이폰 사파리 등 — 웹이 화면 방향을 바꿀 수단이 없다(lock 미지원). 그래서 **아카데미를 90° 돌린 iframe 에 다시 띄운다**.
 *
 * ⚠️ ②를 «게임 화면에 CSS transform 만 거는» 방식으로 하지 말 것 — 처음엔 그렇게 짰다가 버렸다.
 *  돌려도 뷰포트는 그대로라 `100dvh`·`100vw`·미디어 쿼리가 전부 **세로 화면 기준**으로 계산된다
 *  (모달 최대 높이가 804px 인데 돌린 상자는 390px 높이 → 넘침, 휴대폰 배치가 가로 상자에 끼워짐).
 *  Phaser 도 캔버스의 돌아간 상자(getBoundingClientRect)로 눌린 자리를 계산해 좌표를 따로 되돌려야 한다.
 *  iframe 은 **자기 뷰포트**(844×390)를 가지므로 CSS·미디어 쿼리·Phaser 좌표가 손대지 않아도 맞고,
 *  돌아간 iframe 안의 눌림 판정은 브라우저가 맞춰 준다.
 *
 * 순수 함수만 둔다(노드에서 잰다 — `scripts/academy-test/screen-rotation.test.ts`).
 */
export type RotationDeg = 0 | 90 | -90;

/**
 * 단추를 눌렀을 때 무엇을 할까. 지금 바뀌어 있으면 **원래대로**, 아니면 지금 방향의 반대로.
 * 돌린 iframe 은 세로 화면에서 가로로 볼 때 90°(휴대폰을 왼쪽으로 눕혀 쥐는 쪽), 가로 화면에서 세로로 볼 때 -90°.
 */
export type OrientationState = { mode: 'none' } | { mode: 'native'; target: 'landscape' | 'portrait' } | { mode: 'rotated'; deg: Exclude<RotationDeg, 0> };
export function orientationTarget(portraitNow: boolean): 'landscape' | 'portrait' { return portraitNow ? 'landscape' : 'portrait'; }
export function fallbackRotation(portraitNow: boolean): Exclude<RotationDeg, 0> { return portraitNow ? 90 : -90; }
/** 단추 문구 — 지금 상태에서 누르면 일어날 일. */
export function orientationButtonLabel(state: OrientationState, portraitNow: boolean): string {
  if (state.mode !== 'none') return '화면 방향 원래대로';
  return portraitNow ? '가로 화면으로 보기' : '세로 화면으로 보기';
}

/** 돌린 iframe 표시 — 주소의 `rotated=1`. iframe 안의 아카데미가 «나는 돌려진 쪽»임을 안다(단추가 부모에게 되돌려 달라고 한다). */
export const ROTATED_PARAM = 'rotated';
/** iframe → 부모: «원래대로 돌려 줘, 나는 지금 이 장소에 있어». */
export const UNROTATE_MESSAGE = 'academy:unrotate';

/** iframe 이 불러올 주소 = **지금 이 문서의 실제 주소**(window.location) + rotated=1. 라우터 경로로 다시 짓지 않는다 — 운영에선 같지만 테스트 하네스처럼 라우터가 문서 주소와 다른 곳에서도 같은 문서를 다시 불러야 한다. */
export function rotatedFrameSrc(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.set(ROTATED_PARAM, '1');
  return `${pathname}?${params.toString()}`;
}
export function isRotatedEmbed(search: string, framed: boolean): boolean {
  return framed && new URLSearchParams(search).get(ROTATED_PARAM) === '1';
}
/** iframe 이 알려 준 장소로 돌아간다 — 아카데미 밖 주소는 받지 않는다(메시지는 같은 출처만 받지만 한 번 더 막는다). */
export function safeAcademyPath(path: unknown): string {
  return typeof path === 'string' && /^\/academy(\/[a-z-]+)?\/?$/.test(path) ? path : '/academy';
}
