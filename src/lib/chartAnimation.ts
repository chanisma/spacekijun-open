/**
 * recharts `<Line>` 등장 애니메이션 공용 설정 — "점 먼저, 선 나중".
 *
 * 문제: recharts 2.x의 `<Line>`은 **그리기 애니메이션이 끝나기 전까지 점(dot)을 렌더링하지 않는다**.
 *   `node_modules/recharts/lib/cartesian/Line.js` `renderDots()`
 *   → `if (isAnimationActive && !this.state.isAnimationFinished) return null;`
 *   기본 `animationDuration`이 1500ms라, 그 1.5초 동안 데이터 포인트가 통째로 보이지 않는다.
 *   이 게이트는 prop으로 끌 수 없다(애니메이션을 켠 채 점만 먼저 그릴 방법이 없음).
 *
 * 해결: 순서를 뒤집는다. recharts의 JS 애니메이션을 끄면 점과 선이 즉시 정적으로 렌더되고,
 * 선 그리기는 CSS(`stroke-dashoffset`)가 대신한다 → 점이 먼저 뜨고 선이 이어진다.
 *
 * `pathLength={1}`이 핵심이다. SVG `pathLength`는 경로 길이를 주어진 값으로 정규화하므로,
 * 경로의 실제 픽셀 길이를 몰라도 `stroke-dasharray: 1` + `dashoffset 1→0`으로 그릴 수 있다.
 * (recharts는 `pathLength`를 SVG 속성 허용 목록에 두고 있어 `<Line>` → 곡선 `<path>`로 그대로 전달된다.)
 *
 * 스타일 정의 = `src/index.css`의 `.chart-line-draw` / `.chart-line-fade`.
 * 두 파일은 클래스명으로 묶여 있으니 한쪽만 바꾸지 말 것.
 */

/**
 * 실선 `<Line>` 기본값 — 점은 즉시, 선은 CSS로 이어 그린다.
 *
 * ```tsx
 * <Line {...drawLineProps} type="monotone" dataKey="국어" stroke="#3b82f6" />
 * ```
 *
 * 개별 값을 덮어써야 하면 스프레드 **뒤에** 적는다(뒤에 오는 prop이 이긴다).
 */
export const drawLineProps = {
  isAnimationActive: false,
  pathLength: 1,
  className: 'chart-line-draw',
} as const;

/**
 * 점선(`strokeDasharray`를 쓰는) `<Line>` 전용.
 *
 * CSS의 `stroke-dasharray`는 SVG presentation attribute보다 우선순위가 높다. 그래서
 * 점선 Line에 {@link drawLineProps}를 쓰면 그리기용 `dasharray: 1`이 점선 패턴을 덮어
 * 실선으로 보인다. 이런 Line은 그리기 대신 페이드인으로 등장시킨다.
 */
export const fadeLineProps = {
  isAnimationActive: false,
  className: 'chart-line-fade',
} as const;

/**
 * 애니메이션을 완전히 끈다 — 한 화면에 차트가 여러 개라 등장 효과가 부담스러운 경우.
 * 점이 즉시 보인다는 목적은 동일하게 달성된다.
 */
export const staticLineProps = {
  isAnimationActive: false,
} as const;
