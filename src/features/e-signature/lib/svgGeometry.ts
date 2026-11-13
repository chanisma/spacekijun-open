/**
 * rhwp 가 그린 페이지 SVG 에서 기하 정보를 읽는다.
 *
 * `viewBox="0 0 W H"` 하나에서 **화면 비율**과 **용지 크기(HWPUNIT)** 를 함께 얻는다.
 * 파싱이 두 곳에 흩어지면 한쪽만 고쳐 두 값이 어긋나므로 여기로 모은다.
 */

/** A4 세로 210×297mm */
const A4_RATIO = 297 / 210;
const A4_HU = { width: Math.round(8.2677 * 7200), height: Math.round(11.6929 * 7200) };

function viewBox(svg: string): { w: number; h: number } | null {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

/** 높이 ÷ 너비. 폭이 정해지면 높이가 따라온다. */
export function ratioFromSvg(svg: string): number {
  const box = viewBox(svg);
  return box ? box.h / box.w : A4_RATIO;
}

/**
 * 용지 크기(HWPUNIT).
 *
 * rhwp 는 96dpi 픽셀로 그리므로 `× 7200/96 = ×75`. 못 읽으면 A4 로 떨어진다 —
 * 0 으로 두면 서명 크기가 0 이 되어 **아무것도 안 찍힌 것처럼 보인다**.
 */
export function pageSizeHuFromSvg(svg: string): { width: number; height: number } {
  const box = viewBox(svg);
  if (!box) return A4_HU;
  return { width: Math.round(box.w * 75), height: Math.round(box.h * 75) };
}
