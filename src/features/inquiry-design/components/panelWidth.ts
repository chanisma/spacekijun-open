/**
 * 우측 패널의 **폭 단계** (2026-09-12 사용자 요청).
 *
 * 1단(430px)은 근거를 고르고 결과를 훑기엔 충분하지만, 분석 결과를 **자세히 읽고
 * 비교하는** 데는 좁다(보완 방향 35건·추천 3건이 한 줄에 20자씩 흐른다).
 * 2단은 거의 화면 끝까지 넓히고, 그때는 기능별 입력·결과를 나누어 각각 스크롤한다(PanelColumns).
 *
 * 폭을 세 패널이 각자 적어 두면 갈라진다 — 손잡이 위치까지 같은 값을 봐야 하므로
 * 클래스와 픽셀 표현을 **한 곳**에 둔다.
 */
export type PanelWidthMode = 'compact' | 'wide';

/**
 * ⚠️ **`vw` 를 쓰지 않는다.** `100vw` 는 앱 사이드바(280px)를 포함한 **화면 전체** 폭이라,
 * 그래프 영역보다 넓게 계산되어 패널이 컨테이너 왼쪽으로 삐져나가고 `overflow-hidden` 에
 * 잘린다(실측: 2단에서 카드 왼쪽이 통째로 잘려 날짜·배지가 안 보였다).
 *
 * 패널의 기준 상자는 `InquiryDesignPage` 의 `<section className="relative …">` 이므로
 * `100%` 가 정확히 그 영역이다. 4rem 을 남기는 것은 캔버스 가장자리를 잡을 여지다.
 */
export const PANEL_WIDTH_CLASS: Record<PanelWidthMode, string> = {
  compact: 'w-[430px]',
  wide: 'w-[min(1240px,calc(100%-4rem))]',
};

/**
 * 패널 바깥 손잡이의 `right` 값. 패널 폭 + 바깥 여백(1rem)이다.
 * CSS 문자열인 이유: 2단은 `min()`·`calc()` 라 픽셀 숫자로 표현할 수 없다.
 */
export const PANEL_HANDLE_RIGHT: Record<PanelWidthMode, string> = {
  compact: '446px',
  // 폭과 **같은 식**이어야 손잡이가 패널 모서리에 붙는다(`right` 의 % 도 기준 상자 폭이다).
  wide: 'calc(min(1240px, 100% - 4rem) + 1rem)',
};

