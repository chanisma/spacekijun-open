/**
 * 서명 칸(field)의 좌표계와 배치 계산 — **순수 로직 단일 출처**.
 *
 * 세 포맷(HWPX·PDF·이미지)이 서로 다른 단위를 쓰는데도 같은 데이터를 쓸 수 있는 이유가
 * 여기에 있다. 저장은 **페이지 크기 대비 0~1 정규화 좌표**이고, 각 날인 엔진이 자기 단위로
 * 환산한다:
 *
 *   화면 미리보기  → CSS px (렌더 배율에 따라 매번 다름)
 *   PDF           → PDF point (72dpi, **원점이 좌하단**)
 *   HWPX          → HWPUNIT (1/7200 inch, 원점 좌상단)
 *   이미지        → 원본 픽셀
 *
 * 픽셀로 저장하면 확대/축소·DPI 변경에 값이 깨지고, 포맷마다 다른 숫자가 된다.
 *
 * React·DOM 비의존(회귀 테스트 = `npx tsx scripts/signature-field-test/run.mts`).
 */

/** 페이지 위에 사용자가 그린 사각형. 좌표·크기 모두 페이지 대비 0~1 */
export interface PageBoxPlacement {
  kind: 'page-box';
  /** 0-based 페이지 번호 */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * HWPX 결재란처럼 **칸 이름으로 셀을 찾아** 넣는 배치.
 * 결재를 흡수하기 위한 형태 — 좌표가 아니라 "'교감' 칸 아래"를 가리킨다.
 */
export interface HwpxCellPlacement {
  kind: 'hwpx-cell';
  label: string;
}

export type SignaturePlacement = PageBoxPlacement | HwpxCellPlacement;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 최소 박스 크기(정규화). 이보다 작으면 서명이 보이지 않아 실수로 간주한다. */
export const MIN_BOX_SIZE = 0.01;

export function isPageBox(p: SignaturePlacement): p is PageBoxPlacement {
  return p.kind === 'page-box';
}

/** 0~1 로 자른다. 드래그가 페이지 밖으로 나가는 것은 정상이므로 오류로 만들지 않는다. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 드래그한 두 점 → 정규화 사각형.
 *
 * 어느 방향으로 끌든(우하향·좌상향) 같은 결과를 준다 — 사용자는 방향을 의식하지 않는다.
 * 컨테이너 크기로 나누므로 화면 배율이 달라도 같은 값이 나온다.
 */
export function rectFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  container: { width: number; height: number },
): Rect | null {
  if (container.width <= 0 || container.height <= 0) return null;

  const x1 = clamp01(Math.min(start.x, end.x) / container.width);
  const y1 = clamp01(Math.min(start.y, end.y) / container.height);
  const x2 = clamp01(Math.max(start.x, end.x) / container.width);
  const y2 = clamp01(Math.max(start.y, end.y) / container.height);

  const w = x2 - x1;
  const h = y2 - y1;
  if (w < MIN_BOX_SIZE || h < MIN_BOX_SIZE) return null;

  return { x: x1, y: y1, w, h };
}

/** 정규화 사각형 → 임의 좌표계의 픽셀 사각형(원점 좌상단). */
export function rectToPixels(rect: Rect, page: { width: number; height: number }): Rect {
  return {
    x: rect.x * page.width,
    y: rect.y * page.height,
    w: rect.w * page.width,
    h: rect.h * page.height,
  };
}

/**
 * **비율을 유지한 채** 서명을 칸 안에 넣는다(contain).
 *
 * 칸에 맞춰 늘리면(stretch) 서명이 찌그러져 본인 사인처럼 보이지 않는다 — 서명은
 * 모양 자체가 신원이라 왜곡하면 안 된다. 남는 방향은 가운데 정렬한다.
 *
 * @param signature 서명 원본 크기(획 좌표계 w/h 또는 이미지 px)
 * @param box       놓을 칸(같은 좌표계의 픽셀)
 */
export function fitContain(
  signature: { width: number; height: number },
  box: Rect,
): Rect {
  if (signature.width <= 0 || signature.height <= 0 || box.w <= 0 || box.h <= 0) {
    return { x: box.x, y: box.y, w: 0, h: 0 };
  }
  const scale = Math.min(box.w / signature.width, box.h / signature.height);
  const w = signature.width * scale;
  const h = signature.height * scale;
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

/**
 * PDF 좌표로 변환.
 *
 * **PDF 는 원점이 좌하단**이라 y 를 뒤집어야 한다. 이 한 줄을 빠뜨리면 서명이
 * 위아래 대칭 위치에 찍히는데, 페이지 가운데 근처면 얼추 맞아 보여서 늦게 발견된다.
 */
export function rectToPdf(rect: Rect, page: { width: number; height: number }): Rect {
  const px = rectToPixels(rect, page);
  return { x: px.x, y: page.height - px.y - px.h, w: px.w, h: px.h };
}

/** HWPUNIT = 1/7200 inch. PDF point(1/72 inch) 의 100배다. */
export const HWPUNIT_PER_INCH = 7200;

/** 정규화 사각형 → HWPUNIT(원점 좌상단, HWPX 와 같음). */
export function rectToHwpUnit(rect: Rect, page: { widthHu: number; heightHu: number }): Rect {
  return rectToPixels(rect, { width: page.widthHu, height: page.heightHu });
}

/** 유효한 배치인가 — 저장 전 검증. 잘못된 값은 조용히 무시하지 말고 걸러 낸다. */
export function isValidPlacement(value: unknown): value is SignaturePlacement {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (p.kind === 'hwpx-cell') {
    return typeof p.label === 'string' && p.label.trim().length > 0;
  }
  if (p.kind !== 'page-box') return false;
  const nums = ['page', 'x', 'y', 'w', 'h'] as const;
  if (!nums.every((k) => typeof p[k] === 'number' && Number.isFinite(p[k] as number))) return false;
  const { page, x, y, w, h } = p as unknown as PageBoxPlacement;
  if (!Number.isInteger(page) || page < 0) return false;
  if (x < 0 || y < 0 || w < MIN_BOX_SIZE || h < MIN_BOX_SIZE) return false;
  // 페이지를 넘어가는 박스는 잘린 서명이 된다
  return x + w <= 1.0001 && y + h <= 1.0001;
}

export function parsePlacements(value: unknown): SignaturePlacement[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidPlacement);
}
