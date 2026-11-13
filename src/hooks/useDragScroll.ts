// 가로 스크롤 영역을 마우스로 끌어 이동시키는 공용 훅.
// 타임라인·간트처럼 넓은 가로 영역을 스크롤바 없이 훑을 때 사용한다.
import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/** 드래그로 인정할 최소 이동 거리(px) — 이하면 클릭으로 통과시킨다 */
const DRAG_THRESHOLD = 4;

interface DragScrollOptions {
  /** 실제 드래그가 시작되는 순간 1회 호출 (툴팁 닫기 등) */
  onDragStart?: () => void;
}

/**
 * 가로 스크롤 컨테이너를 마우스 드래그로 이동시킨다.
 *
 * - 임계값(4px)을 넘겨야 드래그로 보므로 **컨테이너 안의 버튼 클릭이 그대로 살아 있고**,
 *   드래그였던 경우에만 뒤따르는 click을 capture 단계에서 삼켜 오작동을 막는다.
 * - 네이티브 가로 스크롤바 위에서 시작한 포인터는 가로채지 않는다.
 * - 터치·펜은 브라우저 기본 스크롤에 맡긴다(마우스 좌클릭만 처리).
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  options: DragScrollOptions = {},
) {
  const { onDragStart } = options;
  const drag = useRef({
    pointerId: null as number | null,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });
  const suppressClick = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback((event: ReactPointerEvent<T>) => {
    const element = event.currentTarget;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (element.scrollWidth <= element.clientWidth + 4) return;

    // 네이티브 가로 스크롤바 영역에서 시작한 드래그는 브라우저에 맡긴다
    const scrollbarHeight = element.offsetHeight - element.clientHeight;
    const bounds = element.getBoundingClientRect();
    if (scrollbarHeight > 0 && event.clientY >= bounds.bottom - scrollbarHeight) return;

    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: element.scrollLeft,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<T>) => {
      const state = drag.current;
      if (state.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - state.startX;
      if (!state.moved && Math.abs(deltaX) < DRAG_THRESHOLD) return;

      if (!state.moved) {
        state.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
        onDragStart?.();
      }

      event.preventDefault();
      event.currentTarget.scrollLeft = state.scrollLeft - deltaX;
    },
    [onDragStart],
  );

  const finish = useCallback((event: ReactPointerEvent<T>, shouldSuppressClick: boolean) => {
    const state = drag.current;
    if (state.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (shouldSuppressClick && state.moved) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }

    state.pointerId = null;
    state.moved = false;
    setIsDragging(false);
  }, []);

  const onClickCapture = useCallback((event: ReactMouseEvent<T>) => {
    if (!suppressClick.current) return;

    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    isDragging,
    /** 스크롤 컨테이너에 그대로 펼쳐 넣는다 */
    dragScrollProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<T>) => finish(event, true),
      onPointerCancel: (event: ReactPointerEvent<T>) => finish(event, false),
      onClickCapture,
    },
  };
}
