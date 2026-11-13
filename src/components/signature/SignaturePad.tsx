import React from 'react';
import { Button } from '@/components/ui/button';
import { Eraser, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildSignatureStrokes,
  type Point,
  type SignatureStrokes,
} from '@/lib/signatureStrokes';

/**
 * 직접 서명 입력 패드 (기능 비종속 공용 부품).
 *
 * 결과물은 PNG data URL이 아니라 **획 좌표**(`SignatureStrokes`)다 —
 * 저장 형식·이유는 `src/lib/signatureStrokes.ts` 참조.
 *
 * `SignatureCanvas`(프로필 서명 등록용)와 별개로 두는 이유: 그쪽은 dataURL을 뱉고
 * 이미지 업로드 기능이 붙어 있어 반환 타입과 목적이 다르다.
 */

interface SignaturePadProps {
  onChange: (strokes: SignatureStrokes | null) => void;
  /**
   * 캔버스 가로:세로 비. 서명은 가로로 길다.
   * **높이는 반드시 이 값으로 조절한다** — 아래 `className` 주의 참고.
   */
  aspectRatio?: number;
  /**
   * 루트 컨테이너 클래스.
   *
   * **높이 클래스(`h-24` 등)를 주지 말 것.** 루트는 캔버스 박스와 버튼 줄(한 획 취소·지우기)을
   * 함께 담는 `space-y-2` 컨테이너다. 고정 높이를 걸면 캔버스가 그것을 넘겨 **버튼 줄이
   * 밖으로 흘러나와 아래 요소와 겹친다**(2026-09-03 전자서명 화면에서 실제 발생 —
   * QR 블록 위에 버튼이 겹쳐 그려졌다). 높이는 `aspectRatio` 로 준다.
   */
  className?: string;
  disabled?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onChange,
  aspectRatio = 2.5,
  className,
  disabled = false,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  /** 획별 원본 점(CSS 픽셀). 단순화·정규화는 저장 시점에만 한다. */
  const strokesRef = React.useRef<Point[][]>([]);
  const drawingRef = React.useRef(false);
  const sizeRef = React.useRef({ width: 0, height: 0 });

  const [isEmpty, setIsEmpty] = React.useState(true);

  // 저장 형식으로 변환해 상위로 올린다.
  const emit = React.useCallback(() => {
    const { width, height } = sizeRef.current;
    const strokes = buildSignatureStrokes(strokesRef.current, width, height);
    setIsEmpty(!strokes);
    onChange(strokes);
  }, [onChange]);

  /** 저장된 원본 점으로 캔버스를 다시 그린다(리사이즈·되돌리기·초기화 공용). */
  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = sizeRef.current;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      if (stroke.length === 1) {
        // 톡 찍은 점: 같은 자리로 이어 그리면 linecap이 점으로 만들어 준다.
        ctx.lineTo(stroke[0].x, stroke[0].y);
      } else {
        for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }, []);

  /**
   * 캔버스 해상도를 devicePixelRatio에 맞춘다.
   * 이걸 안 하면 고밀도 화면에서 그리는 선이 흐릿하게 보인다(저장 데이터는 벡터라 무관하지만
   * 서명하는 순간의 체감 품질이 달라진다).
   */
  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(width / aspectRatio));
      const previousWidth = sizeRef.current.width;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      // 이후 모든 좌표를 CSS 픽셀로 다룰 수 있게 한 번만 스케일을 건다.
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 폭이 바뀌면 이미 그린 획도 같은 비율로 옮겨야 서명이 어긋나지 않는다.
      if (previousWidth > 0 && previousWidth !== width) {
        const ratio = width / previousWidth;
        strokesRef.current = strokesRef.current.map((stroke) =>
          stroke.map((p) => ({ x: p.x * ratio, y: p.y * ratio })),
        );
      }

      sizeRef.current = { width, height };
      redraw();
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [aspectRatio, redraw]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    // 포인터를 캔버스 밖으로 끌어도 이벤트를 계속 받는다(획이 중간에 끊기지 않게).
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokesRef.current.push([pointFrom(e)]);
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke) return;

    // 펜·터치는 한 프레임에 여러 표본을 모아 보낸다. 다 받아야 곡선이 매끄럽다.
    const coalesced = typeof e.nativeEvent.getCoalescedEvents === 'function'
      ? e.nativeEvent.getCoalescedEvents()
      : [];
    if (coalesced.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      for (const ev of coalesced) {
        stroke.push({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
      }
    } else {
      stroke.push(pointFrom(e));
    }
    redraw();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    emit();
  };

  const handleUndo = () => {
    strokesRef.current.pop();
    redraw();
    emit();
  };

  const handleClear = () => {
    strokesRef.current = [];
    redraw();
    emit();
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        ref={wrapRef}
        className={cn(
          'relative rounded-lg border-2 border-dashed bg-white',
          disabled ? 'border-gray-200 opacity-60' : 'border-pink-200',
        )}
      >
        <canvas
          ref={canvasRef}
          className="block w-full rounded-lg"
          // touch-action:none 이 없으면 서명하는 동안 페이지가 스크롤된다.
          style={{ touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-gray-400">이 칸에 손가락이나 마우스로 서명하세요</span>
          </div>
        )}
        {/* 서명선 — 어디에 쓰는지 감을 준다 */}
        <div className="pointer-events-none absolute inset-x-6 bottom-5 border-b border-dashed border-gray-200" />
      </div>

      {/*
        안내 문구("한 번에 이어 쓰지 않아도 됩니다")는 제거했다 —
        획을 끊어 써도 되는 것은 서명 패드의 기본 기대라 굳이 말할 필요가 없고,
        좁은 패널에서는 버튼과 자리를 다투기만 했다. 버튼만 오른쪽에 남긴다.
      */}
      <div className="flex items-center justify-end">
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={disabled || isEmpty}
            className="h-8 px-2.5 text-xs"
          >
            <Undo2 className="mr-1 h-3.5 w-3.5" />
            한 획 취소
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={disabled || isEmpty}
            className="h-8 px-2.5 text-xs"
          >
            <Eraser className="mr-1 h-3.5 w-3.5" />
            지우기
          </Button>
        </div>
      </div>
    </div>
  );
};
