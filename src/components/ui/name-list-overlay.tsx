// ========================================
// 사람 이름 목록을 좁은 자리에 깔끔하게 보여주는 공용 부품 (2026-08-22)
//
// 한 줄에 이름을 다 늘어놓으면 인원이 조금만 많아도 화면을 잡아먹고, 그렇다고 개수만
// 보여주면 "누가 들어 있는지"를 확인할 길이 사라진다. 그래서 **일정 인원까지는 그대로 펴고,
// 넘으면 앞 몇 명 + "외 N명"으로 줄인 뒤 눌러서 여는 오버레이에 전부** 담는다.
//
// **오버레이는 Popover다 — Tooltip도 HoverCard도 쓰지 말 것 (2026-09-04 정정).**
//
// 종전 규약은 "반드시 Tooltip"이었다. HoverCard를 금지한 근거는 맞다 —
// Radix `HoverCardTrigger`는 `onTouchStart`에서 `preventDefault()`를 호출해 클릭 합성을 끊어
// **감싼 요소의 탭이 통째로 죽는다**. 그런데 대안으로 지정한 Tooltip은 **터치에서 오버레이가
// 아예 열리지 않는다**:
//   @radix-ui/react-tooltip  onPointerMove: if (event.pointerType === "touch") return;
//                            onClick:       ...context.onClose   ← 탭하면 오히려 닫힌다
// 게다가 트리거가 `tabIndex` 없는 `<span>`이라 키보드 포커스도 받지 못했다. 결과적으로
// 휴대폰에서는 "앞 3명 외 N명" 명단을 **어떤 수단으로도 열 수 없었다** — 교사가 구성원을
// 확인하지 못한 채 태그·학급 그룹을 배정하게 된다.
//
// 즉 옛 규약은 "자식의 탭을 죽이지 마라"에는 답했지만 "터치에서 오버레이가 열리는가"를 묻지
// 않았다. Popover는 클릭/탭/키보드(Enter·Space) 모두로 열리고 포털이라 스크롤 컨테이너에
// 잘리지 않는다. 트리거는 진짜 `<button>`이라 포커스도 받는다.
//
// 주의: 이 부품은 **눌러야 하는 요소 안**(그룹 행·선택 칩)에 들어간다. 트리거 클릭이 부모의
// 선택 동작까지 발동시키면 안 되므로 `stopPropagation`이 필수다.
// ========================================

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** 이 인원까지는 이름을 줄에 그대로 편다. 넘으면 요약 + hover 오버레이 (사용자 결정) */
export const INLINE_NAME_LIMIT = 10;
/** 요약 줄에 앞세울 이름 수 */
export const NAME_PREVIEW_COUNT = 3;

/** 오버레이 안 명단 — 이름 알약을 흘려 담는다(인원이 많아도 스캔이 쉽다) */
export function NameList({ names, title }: { names: string[]; title?: string }) {
  return (
    <>
      <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
        {title ?? "포함된 대상"} {names.length}명
      </p>
      <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto">
        {names.map((name, i) => (
          // 동명이인이 있을 수 있어 이름만으로는 key가 유일하지 않다
          <span
            key={`${name}-${i}`}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
          >
            {name}
          </span>
        ))}
      </div>
    </>
  );
}

/** 눌러서 명단을 띄우는 래퍼. 탭·클릭·키보드 모두로 열린다(위 헤더 주석 참고) */
export function NameOverlay({
  names,
  side = "right",
  title,
  children,
}: {
  names: string[];
  side?: "top" | "right" | "bottom" | "left";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        className="w-72 p-2.5"
        // 부모(그룹 행·선택 칩)가 클릭으로 선택을 수행하므로, 오버레이 안의 클릭이
        // 거기까지 올라가면 명단을 보려다 선택이 바뀐다.
        onClick={(e) => e.stopPropagation()}
      >
        <NameList names={names} title={title} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * 이름 목록 요약 — 적으면 그대로, 많으면 "앞 N명 외 M명" + 눌러서 여는 오버레이.
 * `className`으로 톤을 넘길 수 있다(호출부 배경색에 맞추기 위함).
 */
export function NamePreview({
  names,
  className,
  side = "right",
  title,
  inlineLimit = INLINE_NAME_LIMIT,
  previewCount = NAME_PREVIEW_COUNT,
}: {
  names: string[];
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  title?: string;
  inlineLimit?: number;
  previewCount?: number;
}) {
  if (names.length === 0) return null;
  if (names.length <= inlineLimit) {
    return (
      <span className={cn("truncate text-[11px] text-muted-foreground", className)}>
        {names.join(" · ")}
      </span>
    );
  }
  const summary = `${names.slice(0, previewCount).join(" · ")} 외 ${names.length - previewCount}명`;
  return (
    <NameOverlay names={names} side={side} title={title}>
      <button
        type="button"
        // 부모가 클릭으로 선택을 수행한다 — 명단을 보려다 선택이 바뀌면 안 된다.
        onClick={(e) => e.stopPropagation()}
        aria-label={`${title ?? "포함된 대상"} ${names.length}명 전체 보기`}
        className={cn(
          "truncate text-left text-[11px] text-muted-foreground",
          "underline decoration-dotted underline-offset-2",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm",
          className
        )}
      >
        {summary}
      </button>
    </NameOverlay>
  );
}
