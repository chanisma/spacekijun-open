// 세로 휠을 가로 스크롤로 돌리는 공용 훅 — 타임라인·간트처럼 가로로 긴 영역용.
import { useEffect, type RefObject } from 'react';

/** `deltaMode === 1`(줄 단위, 파이어폭스 마우스)일 때 한 줄을 몇 px 로 볼지 */
const LINE_HEIGHT_PX = 32;

interface WheelScrollXOptions {
  /** 대상 요소가 조건부로 렌더될 때 effect 를 다시 걸기 위한 값 */
  enabled?: boolean;
  /**
   * 컨테이너 왼쪽의 고정 열 폭(px). **그 위에서는 휠을 가로채지 않는다** — 고정된 목록 열은
   * 위아래로, 그 오른쪽 **영역 전체**(막대 위만이 아니라 빈칸·머리글까지)는 좌우로 움직인다
   * (2026-09-21 사용자 결정). 세로로 빠져나갈 길이
   * 항상 있으므로 그래프 위에서는 끝에 닿아도 페이지로 넘기지 않는다(넘기면 같은 휠이
   * 어떤 때는 가로, 어떤 때는 세로로 움직여 예측할 수 없다).
   */
  ignoreLeft?: number;
}

/**
 * 가로 스크롤 컨테이너 위에서 마우스 휠을 굴리면 좌우로 움직이게 한다.
 *
 * - **React 의 `onWheel` 로는 못 만든다** — React 는 wheel 을 passive 로 등록해
 *   `preventDefault()` 가 무시되고(콘솔 경고만 남는다) 페이지가 함께 스크롤된다.
 *   그래서 ref 에 `{ passive: false }` 로 직접 단다.
 * - 가로로 넘치지 않으면(예: 연 단위 = 폭 맞춤) 아무것도 가로채지 않는다.
 * - 트랙패드의 가로 제스처(`deltaX`)·Shift+휠(브라우저 기본 가로 스크롤)·Ctrl+휠(확대)은
 *   건드리지 않는다.
 */
export function useWheelScrollX<T extends HTMLElement>(
  ref: RefObject<T>,
  { enabled = true, ignoreLeft = 0 }: WheelScrollXOptions = {},
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4) return;

      // 고정 목록 열 위 — 세로 스크롤에 맡긴다
      if (ignoreLeft > 0 && event.clientX - el.getBoundingClientRect().left < ignoreLeft) return;

      const delta = event.deltaMode === 1 ? event.deltaY * LINE_HEIGHT_PX : event.deltaY;
      event.preventDefault();
      el.scrollLeft = Math.min(max, Math.max(0, el.scrollLeft + delta));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, enabled, ignoreLeft]);
}
