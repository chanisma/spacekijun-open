/**
 * 기기 모양 두 벌 — 3D 모델(deviceScene) · 껍데기 그림(shellTheme) · 2D 기기가 같은 값을 읽는다.
 * 한쪽만 바꾸면 버튼 아래 «A B C» 글씨가 버튼에서 비껴 찍힌다(오류 없이).
 *
 *  · classic — 1996 년 P1 모양: 작은 흑백 LCD(32×16) · 인쇄된 아이콘 · 큰 버튼 셋 · 위쪽 고리와 볼 체인
 *  · color   — 최근 컬러 기종(Pix 2021 · Uni 2023 · Paradise 2025) 모양: 128×128 컬러 화면이 얼굴을 거의 채우고,
 *              테는 얇은 검은 광택, 버튼은 작고, 위에는 돌리는 다이얼(Paradise), 체인은 왼쪽 어깨 고리에 건다.
 *  · digimon — 디지털 몬스터 COLOR(2021~, 1997 년 모양 그대로) 를 실물 사진으로 옮김(2026-10-07 사용자 요청 «실제 이미지 찾아서»):
 *              가로로 긴 둥근 네모(63×44×19mm) · 몸 전체에 돌벽돌 돋을무늬(같은 색) · 화면을 두른 다른 색의 «창틀»(오른쪽 열쇠 구멍 탭) ·
 *              정사각 컬러 화면 · 화면 오른쪽 세로 버튼 셋 + 작은 리셋 구멍 · 오른쪽 아래 모서리의 고리.
 *  · suitcase — 학생 의뢰 «교실 밖 세상»(2026-11-06, 기기 종류 의뢰 첫 배송): 세워 둔 여행 가방 — 둥근 네모 몸 · 위 손잡이 ·
 *              네 모서리 가죽 보호대 · 가운데 컬러 화면 · 아래 한 줄 동그란 버튼 셋 · 우표·스티커(shell 그림) · 뒷면 구석 체리 각인.
 *              볼 체인 대신 손잡이를 단다(chain: false).
 */
import { PANEL_ASPECT } from '../lcd/lcdPainter';

export type DeviceStyle = 'classic' | 'color' | 'digimon' | 'suitcase';

/** 화면(그리개)·알림·페이지 꾸밈은 두 갈래뿐 — 클래식만 흑백 LCD 이고 나머지는 모두 컬러(2026-10-07 사용자 결정) */
export const uiStyleOf = (style: DeviceStyle): 'classic' | 'color' => (style === 'classic' ? 'classic' : 'color');

export interface DeviceModel {
  style: DeviceStyle;
  /** 외곽선 — 달걀(기본) · 둥근 네모(디지털) */
  shape?: 'egg' | 'brick';
  H: number;
  W: number;
  depth: number;
  bevelT: number;
  bevelS: number;
  domeFront: number;
  domeBack: number;
  screen: { x?: number; y: number; w: number; h: number; radius: number; pad: number; bezelRadius: number };
  buttons: { y: number; r: number; xs: readonly number[]; arc: readonly number[] };
  /** 위쪽 다이얼(컬러) */
  dial: boolean;
  /** 볼 체인 고리 자리 — 달걀 외곽선의 각도(라디안, 0 = 오른쪽, π/2 = 위) */
  lugAngle: number;
  /** 체인이 뻗는 방향(없으면 고리 방향을 위로 기울인다) — 아래 모서리 고리는 아래로 늘어진다 */
  lugDir?: readonly [number, number];
  /** 둥근 네모의 모서리 날카로움(초타원 지수, 클수록 네모) */
  cornerN?: number;
  /** 화면을 두른 창틀(디지털형) — 바깥 크기·막대 굵기·오른쪽 열쇠 구멍 탭 */
  frame?: { x: number; y: number; w: number; h: number; bar: number; tab: { w: number; h: number } };
  /** 볼 체인을 달지 않는다(손잡이가 있는 여행 가방형) — 없으면 단다 */
  chain?: false;
  /** 위 손잡이(여행 가방형) — 두 다리 사이 폭 · 몸 위로 솟는 높이 · 끈 굵기 */
  handle?: { w: number; h: number; thick: number };
  /** 네 모서리 보호대(여행 가방형) — 모서리에서 안쪽으로 덮는 길이 */
  corners?: number;
  /** 바닥 바퀴 넷(여행 가방형, 2026-11-06 사용자 지시 «캐리어라 바퀴가 있어야») — 반지름 · 가운데에서 좌우 거리 · 바퀴 폭 */
  wheels?: { r: number; x: number; w: number };
}

export const CLASSIC_MODEL: DeviceModel = {
  style: 'classic',
  H: 5.4,
  W: 4.7,
  depth: 0.7,
  bevelT: 0.45,
  bevelS: 0.42,
  domeFront: 0.2,
  domeBack: 0.12,
  screen: { y: 0.42, w: 2.56, h: 2.56 / PANEL_ASPECT, radius: 0.14, pad: 0.21, bezelRadius: 0.42 },
  buttons: { y: -1.5, r: 0.3, xs: [-0.98, 0, 0.98], arc: [0, -0.14, 0] },
  dial: false,
  lugAngle: Math.PI / 2,
};

export const COLOR_MODEL: DeviceModel = {
  style: 'color',
  H: 5.9,
  W: 5.2,
  depth: 0.8,
  bevelT: 0.48,
  bevelS: 0.44,
  domeFront: 0.16,
  domeBack: 0.14,
  // 화면 모서리가 달걀의 둥근 어깨(베벨) 안쪽에 들어오도록 잰 값 — 크기를 키우면 위 모서리가 베벨 경사로 넘어간다
  screen: { y: 0.2, w: 2.7, h: 2.7, radius: 0.12, pad: 0.16, bezelRadius: 0.5 },
  buttons: { y: -2.0, r: 0.24, xs: [-0.9, 0, 0.9], arc: [0, -0.1, 0] },
  dial: true,
  lugAngle: Math.PI * 0.68,
};

/** 디지털 몬스터형 — 버튼은 화면 오른쪽 세로 줄(arc 가 세로 자리), 화면은 왼쪽으로 비켜 선다 */
export const DIGIMON_MODEL: DeviceModel = {
  style: 'digimon',
  shape: 'brick',
  cornerN: 7,
  // 실물 63 × 44 × 19 mm — 단위 = 1 cm
  H: 4.4,
  W: 6.3,
  depth: 1.12,
  bevelT: 0.39,
  bevelS: 0.3,
  // 앞면이 평평하다 — 부풀림이 있으면 옆면 경계(벽돌 ↔ 매끈한 옆)가 톱니처럼 갈린다
  domeFront: 0,
  domeBack: 0,
  // 정사각 컬러 화면(128×128) — 창틀 안, 몸 가운데보다 왼쪽
  screen: { x: -0.72, y: 0.04, w: 2.05, h: 2.05, radius: 0.05, pad: 0.12, bezelRadius: 0.12 },
  buttons: { y: 0.04, r: 0.27, xs: [2.2, 2.2, 2.2], arc: [0.9, 0, -0.9] },
  dial: false,
  lugAngle: -Math.PI * 0.25,
  lugDir: [0.82, -0.57],
  frame: { x: -0.56, y: 0.04, w: 3.3, h: 3.02, bar: 0.17, tab: { w: 0.44, h: 0.74 } },
};

/** 여행 가방형(학생 의뢰 «교실 밖 세상») — 세로로 선 둥근 네모, 화면은 가운데, 버튼은 아래 한 줄(호 없이) */
export const SUITCASE_MODEL: DeviceModel = {
  style: 'suitcase',
  shape: 'brick',
  cornerN: 5,
  H: 5.6,
  W: 4.8,
  depth: 1.05,
  bevelT: 0.3,
  bevelS: 0.3,
  domeFront: 0.05,
  domeBack: 0.05,
  // 모서리 보호대(안쪽 1.65 · 2.05 부터)와 겹치지 않게 — 화면 테 위 끝 1.71, 버튼 끝 x 1.21
  screen: { y: 0.25, w: 2.6, h: 2.6, radius: 0.1, pad: 0.16, bezelRadius: 0.34 },
  buttons: { y: -1.85, r: 0.26, xs: [-0.95, 0, 0.95], arc: [0, 0, 0] },
  dial: false,
  lugAngle: Math.PI / 2,
  chain: false,
  handle: { w: 1.7, h: 0.62, thick: 0.12 },
  corners: 0.75,
  wheels: { r: 0.2, x: 1.72, w: 0.15 },
};

export const MODELS: Record<DeviceStyle, DeviceModel> = { classic: CLASSIC_MODEL, color: COLOR_MODEL, digimon: DIGIMON_MODEL, suitcase: SUITCASE_MODEL };

/** 평면 UV 투영: 기기 좌표 → 껍데기 그림 캔버스 픽셀 */
export const toShellCanvas = (m: DeviceModel, x: number, y: number, size: number): [number, number] =>
  [(x / m.W + 0.5) * size, (0.5 - y / m.H) * size];

function rawEgg(t: number): [number, number] {
  const s = Math.sin(t);
  return [Math.cos(t) * (1 - 0.12 * s), s * (s < 0 ? 0.92 : 1)];
}

const EGG_BOX = (() => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 720; i += 1) {
    const [x, y] = rawEgg((i / 720) * Math.PI * 2);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
})();

/** 외곽선 위 한 점(각도 t) — 정확히 (W−2·inset)×(H−2·inset) 상자에 맞춘다 */
export function eggPoint(m: DeviceModel, t: number, inset = 0): [number, number] {
  if (m.shape === 'brick') {
    // 둥근 네모(초타원) — 지수가 클수록 모서리가 각지다
    const c = Math.cos(t), s = Math.sin(t);
    const n = m.cornerN ?? 4;
    const x = Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = Math.sign(s) * Math.abs(s) ** (2 / n);
    return [x * (m.W / 2 - inset), y * (m.H / 2 - inset)];
  }
  const [x, y] = rawEgg(t);
  return [(x - EGG_BOX.cx) * ((m.W - inset * 2) / EGG_BOX.w), (y - EGG_BOX.cy) * ((m.H - inset * 2) / EGG_BOX.h)];
}

/** 달걀 외곽선 — 위가 12% 좁고 바닥이 8% 납작하다. 몸통 모델과 껍데기 그림의 금테가 같은 곡선을 따른다. */
export function eggOutline(m: DeviceModel, segments = 160, inset = 0): [number, number][] {
  return Array.from({ length: segments }, (_, i) => eggPoint(m, (i / segments) * Math.PI * 2, inset));
}

/**
 * 모서리 보호대 한 장의 윤곽(sx·sy = ±1 — 어느 모서리) — 바깥은 몸 외곽선을 따르고, 안쪽은 오목한 곡선.
 * 3D(deviceScene)·2D·미리보기가 같은 윤곽을 쓴다. 반환 = 바깥 호(위 → 옆) + 안쪽 곡선을 근사한 점들(닫힌 다각형).
 */
export function cornerCapOutline(m: DeviceModel, sx: 1 | -1, sy: 1 | -1, outset = 0, segments = 48): [number, number][] {
  const c = m.corners ?? 0;
  const ix = m.W / 2 - c;
  const iy = m.H / 2 - c;
  const arc: [number, number][] = [];
  // 사분면을 위(세로 끝) → 옆(가로 끝) 순서로 훑는다
  for (let i = 0; i <= 180; i += 1) {
    const t = (Math.PI / 2) * (1 - i / 180);
    const [x, y] = eggPoint(m, t, -outset);
    if (x >= ix && y >= iy) arc.push([x * sx, y * sy]);
  }
  if (!arc.length) return [];
  const [ax, ay] = arc[0];
  const [bx, by] = arc[arc.length - 1];
  const start: [number, number] = [ix * sx, ay];
  const end: [number, number] = [bx, iy * sy];
  const ctrl: [number, number] = [ix * sx, iy * sy];
  const inner: [number, number][] = [];
  for (let i = 1; i < segments; i += 1) {
    const u = i / segments;
    // end → ctrl → start 순서의 2차 곡선(오목한 안쪽)
    inner.push([
      (1 - u) ** 2 * end[0] + 2 * (1 - u) * u * ctrl[0] + u ** 2 * start[0],
      (1 - u) ** 2 * end[1] + 2 * (1 - u) * u * ctrl[1] + u ** 2 * start[1],
    ]);
  }
  void ax;
  return [start, ...arc, end, ...inner];
}

/** 모서리 보호대 위 징(리벳) 자리 — 안쪽 모서리에서 외곽 모서리 쪽으로 62% */
export function cornerRivet(m: DeviceModel, sx: 1 | -1, sy: 1 | -1): [number, number] {
  const c = m.corners ?? 0;
  const [ox, oy] = eggPoint(m, Math.PI / 4);
  const ix = m.W / 2 - c, iy = m.H / 2 - c;
  return [(ix + (ox - ix) * 0.62) * sx, (iy + (oy - iy) * 0.62) * sy];
}

/** 바퀴 축의 높이(몸 바닥 아래) — 받침 높이 + 반지름. 3D·2D·미리보기 공용 */
export const wheelAxleY = (m: DeviceModel) => -m.H / 2 - 0.12 - (m.wheels?.r ?? 0);

/** 위 손잡이의 중심선(앞에서 본 모양) — 두 다리는 몸 윗면에 앉고 가운데는 평평하게 솟는다 */
export function handlePath(m: DeviceModel): [number, number][] {
  const h = m.handle;
  if (!h) return [];
  const top = m.H / 2;
  const x = h.w / 2;
  return [
    [-x, top - 0.04], [-x + 0.02, top + h.h * 0.45], [-x + 0.18, top + h.h * 0.88], [-x + 0.45, top + h.h],
    [0, top + h.h], [x - 0.45, top + h.h], [x - 0.18, top + h.h * 0.88], [x - 0.02, top + h.h * 0.45], [x, top - 0.04],
  ];
}
