/**
 * 별까지 쌓기 — 화면 글자 크기(2026-10-15).
 *
 * 갈무리11 은 한 글자가 12칸 격자라, 글꼴의 «한 칸»이 기기 화소 정수 개에 떨어질 때만 점이 번지지 않는다.
 * 데스크톱(dpr 1)에서는 그게 12px · 24px 뿐이었는데, 휴대폰에서 12px 는 너무 작았다(버튼·안내가 전부 깨알).
 * 그래서 손가락 기기는 «15px 이상이면서 한 칸 = 기기 화소 정수 개»인 가장 작은 크기를 고른다:
 *   dpr 3 → 16px(칸당 4화소) · dpr 2 → 18px(3) · dpr 2.625 → 18.29px(4) · dpr 2.75 → 17.45px(4)
 * 20px 을 넘게 되면(dpr 1 터치 기기) 한 단계 아래로 — 24px 은 화면을 다 덮는다.
 */
export const PIXEL_FONT_GRID = 12;
export const DESKTOP_FONT_PX = 12;
export const TOUCH_MIN_FONT_PX = 15;
export const TOUCH_MAX_FONT_PX = 20;

export function pixelFontSize(dpr: number, coarse: boolean): number {
  if (!coarse || !Number.isFinite(dpr) || dpr <= 0) return DESKTOP_FONT_PX;
  const sizeOf = (n: number) => (n * PIXEL_FONT_GRID) / dpr;
  let n = Math.max(1, Math.ceil((TOUCH_MIN_FONT_PX * dpr) / PIXEL_FONT_GRID));
  if (sizeOf(n) > TOUCH_MAX_FONT_PX && n > 1) n -= 1;
  // 소수점 둘째 자리까지(브라우저가 어차피 그 정도로 반올림한다)
  return Math.round(sizeOf(n) * 100) / 100;
}
