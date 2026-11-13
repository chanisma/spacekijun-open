/**
 * 한 줄로 자르고 **0.5초 머물면** 전문을 띄우는 글 (2026-09-26 — 내 업무 관리 표 · 내 할 일 목록).
 *
 * - 오버레이는 **잘렸을 때만** 뜬다(짧은 제목 위에서 같은 글이 또 뜨면 방해만 된다).
 *   단 `overlay` 를 주면(제목 + 설명처럼 행에 안 보이는 글) 잘리지 않아도 띄운다.
 * - `onClick` 이 있으면 버튼이 된다 — 제목 클릭 = 상세.
 * - Tooltip 은 터치에서 열리지 않는다(CLAUDE.md §4-1). 여기서는 괜찮다 — 오버레이는 덤이고,
 *   전문은 누르면 열리는 상세 모달이 언제나 보여 준다. **눌러야 하는 명단**에는 쓰지 말 것.
 * - 네이티브 `title` 을 함께 달지 말 것 — 1초 뒤 브라우저 풍선이 하나 더 뜬다.
 */
import { useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const CLAMPED_TEXT_DELAY_MS = 500;

export function ClampedText({
  text, className, onClick, ariaLabel, overlay,
}: {
  text: string;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  /** 오버레이에 보일 글 — 기본은 `text`. 주면 잘리지 않아도 띄운다 */
  overlay?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const body = overlay ?? text;
  const base = 'block min-w-0 max-w-full truncate';

  return (
    <Tooltip
      delayDuration={CLAMPED_TEXT_DELAY_MS}
      open={open}
      onOpenChange={(next) => {
        const el = ref.current;
        const clipped = !!el && el.scrollWidth > el.clientWidth;
        setOpen(next && (clipped || overlay !== undefined));
      }}
    >
      <TooltipTrigger asChild>
        {onClick ? (
          <button
            ref={ref as React.Ref<HTMLButtonElement>}
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            className={cn(
              base,
              'rounded text-left transition-colors hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
          >
            {text}
          </button>
        ) : (
          <span ref={ref as React.Ref<HTMLSpanElement>} className={cn(base, className)}>{text}</span>
        )}
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        className="max-h-64 max-w-md overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed"
      >
        {body}
      </TooltipContent>
    </Tooltip>
  );
}
