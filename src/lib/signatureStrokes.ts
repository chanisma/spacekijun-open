/**
 * 서명 획(stroke) 벡터 — 저장 형식의 단일 출처.
 *
 * 서명을 PNG로 굽지 않고 "그린 좌표" 그대로 보관한다.
 *   - 크기: 일반적인 서명이 1~2KB (같은 서명의 PNG data URL은 5~15KB)
 *   - 인쇄: SVG path라 A4 600dpi에서도 선명하다(래스터는 셀 안에서 뭉갠다)
 *   - 수명: Storage 파일이 아니라 DB 값이라 고아 파일·공개 URL 문제가 없다
 *
 * 저장 형식 (DB `training_signature.strokes`):
 *   { v: 1, w: 폭, h: 높이, s: [[x,y,x,y,...], ...] }
 *
 * 좌표를 `{x,y}` 객체가 아니라 **평탄 배열**로 두는 이유는 순전히 크기다 —
 * 점 하나당 JSON 오버헤드가 `{"x":123,"y":45}` 17바이트에서 `123,45` 6바이트로 줄어,
 * 300점 서명 기준 5KB가 1.8KB가 된다.
 *
 * React 비의존 순수 모듈(회귀 테스트 = `npx tsx scripts/training-signature-test/run.mts`).
 */

export interface SignatureStrokes {
  /** 형식 버전. 형식을 바꾸면 올리고 읽는 쪽에서 분기한다. */
  v: 1;
  /** 좌표계 폭 (SVG viewBox 기준) */
  w: number;
  /** 좌표계 높이 */
  h: number;
  /** 획별 평탄 좌표: [x0,y0,x1,y1,...] */
  s: number[][];
}

export interface Point {
  x: number;
  y: number;
}

/** 정규화 기준 폭. 높이는 원본 비율을 따라간다. */
export const SIGNATURE_NORMALIZED_WIDTH = 600;

/**
 * 단순화 허용 오차(정규화 좌표 기준, 폭 600에 대해).
 * 1.2면 육안으로 구분되지 않으면서 점 수가 대략 1/3로 준다.
 */
export const DEFAULT_SIMPLIFY_EPSILON = 1.2;

/** 잉크 주위 여백(정규화 좌표). 인쇄 셀에서 획이 테두리에 닿지 않게 한다. */
const TRIM_PADDING = 8;

/** DB CHECK 제약(`training_signature_strokes_shape`)과 같은 상한. */
export const MAX_STROKES = 300;

// ---------------------------------------------------------------------------
// 생성
// ---------------------------------------------------------------------------

export interface BuildOptions {
  /** 단순화 허용 오차. 0이면 단순화하지 않는다. */
  epsilon?: number;
  /** 잉크 경계로 잘라낼지 여부(기본 true) */
  trim?: boolean;
}

/**
 * 캔버스 좌표로 그린 획들을 저장 형식으로 변환한다.
 *
 * @param rawStrokes 획별 점 목록 (캔버스 CSS 픽셀 좌표)
 * @param sourceWidth  캔버스 폭
 * @param sourceHeight 캔버스 높이
 */
export function buildSignatureStrokes(
  rawStrokes: Point[][],
  sourceWidth: number,
  sourceHeight: number,
  options: BuildOptions = {},
): SignatureStrokes | null {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) return null;
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return null;

  const epsilon = options.epsilon ?? DEFAULT_SIMPLIFY_EPSILON;
  const scale = SIGNATURE_NORMALIZED_WIDTH / sourceWidth;
  const width = SIGNATURE_NORMALIZED_WIDTH;
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const scaled: number[][] = [];
  for (const stroke of rawStrokes) {
    if (!stroke || stroke.length === 0) continue;

    const points = stroke
      .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
      .map((p) => ({ x: p.x * scale, y: p.y * scale }));
    if (points.length === 0) continue;

    const simplified = epsilon > 0 ? simplify(points, epsilon) : points;
    const flat: number[] = [];
    for (const p of simplified) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      // 반올림 후 직전 점과 같아지면 버린다(획 길이만 늘리고 모양에 기여하지 않음).
      if (flat.length >= 2 && flat[flat.length - 2] === x && flat[flat.length - 1] === y) continue;
      flat.push(x, y);
    }
    if (flat.length >= 2) scaled.push(flat);
    if (scaled.length >= MAX_STROKES) break;
  }

  if (scaled.length === 0) return null;

  const strokes: SignatureStrokes = { v: 1, w: width, h: height, s: scaled };
  return options.trim === false ? strokes : trimSignature(strokes);
}

/**
 * 잉크 경계로 잘라내 좌표계를 다시 잡는다. 인쇄 셀을 꽉 채우기 위한 것.
 *
 * 새 경계는 원본 폭·높이로 자르지 **않는다**. 손가락을 캔버스 밖으로 끌면 포인터 이벤트가
 * 캔버스 범위를 벗어난 좌표를 뱉는데(모바일에서 흔하다), 원본 크기로 클램프하면
 * 잉크가 viewBox 밖에 남아 렌더 시 잘린다.
 */
export function trimSignature(strokes: SignatureStrokes, padding = TRIM_PADDING): SignatureStrokes {
  const box = signatureBounds(strokes);
  if (!box) return strokes;

  const minX = Math.floor(box.minX - padding);
  const minY = Math.floor(box.minY - padding);
  const maxX = Math.ceil(box.maxX + padding);
  const maxY = Math.ceil(box.maxY + padding);

  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  return {
    v: 1,
    w,
    h,
    s: strokes.s.map((flat) => {
      const moved = new Array<number>(flat.length);
      for (let i = 0; i < flat.length; i += 2) {
        moved[i] = flat[i] - minX;
        moved[i + 1] = flat[i + 1] - minY;
      }
      return moved;
    }),
  };
}

/** 잉크가 차지하는 사각형. 획이 없으면 null. */
export function signatureBounds(
  strokes: SignatureStrokes,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const flat of strokes.s) {
    for (let i = 0; i < flat.length; i += 2) {
      const x = flat[i];
      const y = flat[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// 검증 (DB에서 읽은 값은 신뢰하지 않는다)
// ---------------------------------------------------------------------------

/**
 * DB JSONB에서 읽은 값이 실제로 서명 형식인지 확인한다.
 * jsonb는 어떤 모양이든 담을 수 있으므로 렌더 전에 반드시 통과시킬 것.
 */
export function isSignatureStrokes(value: unknown): value is SignatureStrokes {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SignatureStrokes>;
  if (candidate.v !== 1) return false;
  if (!isPositiveNumber(candidate.w) || !isPositiveNumber(candidate.h)) return false;
  if (!Array.isArray(candidate.s) || candidate.s.length === 0) return false;

  return candidate.s.every(
    (stroke) =>
      Array.isArray(stroke) &&
      stroke.length >= 2 &&
      stroke.length % 2 === 0 &&
      stroke.every((n) => typeof n === 'number' && Number.isFinite(n)),
  );
}

/** DB 값을 안전하게 파싱한다. 형식이 아니면 null(렌더 생략). */
export function parseSignatureStrokes(value: unknown): SignatureStrokes | null {
  return isSignatureStrokes(value) ? value : null;
}

// ---------------------------------------------------------------------------
// 렌더
// ---------------------------------------------------------------------------

/**
 * 획별 SVG path `d` 문자열.
 *
 * 단순화로 점이 성기어진 상태라 직선으로 이으면 각져 보인다. 이웃 점의 중점을 잇는
 * 2차 베지어(quadratic)로 그려 손글씨 느낌을 살린다 — 점을 더 저장하지 않고 얻는 부드러움.
 */
export function strokePaths(strokes: SignatureStrokes, smooth = true): string[] {
  return strokes.s.map((flat) => {
    const n = flat.length / 2;
    if (n === 1) {
      // 점 하나(톡 찍은 획) — linecap="round"가 점으로 그려준다.
      return `M${flat[0]} ${flat[1]}L${flat[0]} ${flat[1]}`;
    }
    if (!smooth || n === 2) {
      let d = `M${flat[0]} ${flat[1]}`;
      for (let i = 2; i < flat.length; i += 2) d += `L${flat[i]} ${flat[i + 1]}`;
      return d;
    }

    let d = `M${flat[0]} ${flat[1]}`;
    for (let i = 2; i < flat.length - 2; i += 2) {
      const cx = flat[i];
      const cy = flat[i + 1];
      const mx = round1((cx + flat[i + 2]) / 2);
      const my = round1((cy + flat[i + 3]) / 2);
      d += `Q${cx} ${cy} ${mx} ${my}`;
    }
    d += `L${flat[flat.length - 2]} ${flat[flat.length - 1]}`;
    return d;
  });
}

export interface SvgOptions {
  /** 선 두께(정규화 좌표 기준) */
  strokeWidth?: number;
  color?: string;
  /** 픽셀 크기를 강제할 때 */
  width?: number;
  height?: number;
}

/** 독립 실행 가능한 `<svg>` 마크업. 다운로드·다른 문서에 끼워넣을 때 쓴다. */
export function strokesToSvgMarkup(strokes: SignatureStrokes, options: SvgOptions = {}): string {
  const { strokeWidth = 3.2, color = '#111827' } = options;
  const size =
    options.width && options.height ? ` width="${options.width}" height="${options.height}"` : '';
  const paths = strokePaths(strokes)
    .map((d) => `<path d="${d}"/>`)
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${strokes.w} ${strokes.h}"${size}` +
    ` fill="none" stroke="${color}" stroke-width="${strokeWidth}"` +
    ` stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}

// ---------------------------------------------------------------------------
// 계측
// ---------------------------------------------------------------------------

export function signaturePointCount(strokes: SignatureStrokes): number {
  return strokes.s.reduce((sum, flat) => sum + flat.length / 2, 0);
}

/** 저장될 바이트 수(JSON 직렬화 기준). DB CHECK 상한(40,000)과 비교하는 용도. */
export function estimateStoredBytes(strokes: SignatureStrokes): number {
  const json = JSON.stringify(strokes);
  // 좌표는 전부 ASCII라 UTF-8 바이트 수 = 문자 수.
  return json.length;
}

// ---------------------------------------------------------------------------
// 내부
// ---------------------------------------------------------------------------

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Ramer–Douglas–Peucker 단순화.
 * 포인터 이벤트는 초당 수백 점을 뱉는데 서명 모양에 기여하는 점은 그 일부다.
 * 양 끝점은 항상 보존되므로 획의 시작·끝이 잘리지 않는다.
 */
function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist <= epsilon) return [first, last];

  const head = simplify(points.slice(0, index + 1), epsilon);
  const tail = simplify(points.slice(index), epsilon);
  return head.slice(0, -1).concat(tail);
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // 시작=끝(획이 제자리로 돌아온 경우)이면 점 사이 거리로 대체한다.
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  const numerator = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  return numerator / Math.hypot(dx, dy);
}
