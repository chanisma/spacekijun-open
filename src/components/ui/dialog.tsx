import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ModalSurfaceContext, useModalSurface, useModalPortalContainer } from './modal-surface'
import { splitDialogClasses, resolveMobilePresentation, type MobileDialogPresentation } from './dialog-layout'
import { createBackClosableRoot, useModalBackEscapeGuard } from './modal-back'
import './modal.css'

// 휴대폰 뒤로가기 = 맨 위 모달 닫기(`modal-back.tsx`). 소비처는 아무것도 하지 않아도 된다.
const Dialog = createBackClosableRoot(DialogPrimitive.Root, 'Dialog')

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

// Context to provide Dialog container to nested Popovers.
//
// Why nested Select/Popover content is scoped to the Dialog's own box instead
// of document.body: Radix Select and Radix Dialog each independently call
// aria-hidden's hideOthers() on their own content when they open. If the
// Select portals to document.body (a sibling of DialogContent, not a
// descendant), Select's hideOthers() call hides DialogContent itself —
// including the still-focused trigger button inside it — which the browser
// blocks (you can't aria-hide an element containing focus) and which also
// desyncs the two primitives' idea of "what's the current modal layer."
// Net effect: the dropdown renders but clicks inside it don't register.
// Scoping the portal inside DialogContent keeps both hideOthers() calls
// operating on a consistent nested hierarchy instead of fighting each other.
//
// The outer surface always allows overflow. Padding and scrolling live in a
// separate viewport, so scoped portals can extend beyond the dialog border.
export const useDialogContainer = () => React.useContext(ModalSurfaceContext)?.container ?? null

/**
 * Hook to resolve the correct portal container for nested UI elements.
 * Automatically uses Dialog container if inside a Dialog, otherwise uses the provided container.
 */
export const usePortalContainer = (explicitContainer?: HTMLElement | null) => {
  return useModalPortalContainer(explicitContainer)
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-slate-950/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideCloseButton?: boolean;
  /**
   * 휴대폰(< `MOBILE_MODAL_BREAKPOINT`)에서의 표시 방식 (2026-09-20).
   *
   * 기본값 `'auto'` 는 **className 에 선언된 데스크톱 크기에서 유도**한다
   * (`resolveMobilePresentation` — 넓거나 높게 선언했으면 전체화면).
   * 유도가 틀리는 모달만 명시한다:
   *   - `'fullscreen'` 좁게 선언했지만 실제로는 입력이 많은 편집기
   *   - `'center'`     넓게 선언했지만 사실은 확인·안내 한 줄
   *   - `'sheet'`      아래에서 올라오는 선택 시트(공용 `PickerContent` 전용)
   *
   * 배치는 전부 CSS(`modal.css`)가 한다 — JS 로 뷰포트를 재면 첫 렌더가 한 번
   * 잘못 그려지고(폭을 모른 채 마운트) 회전·키보드 전환마다 다시 계산해야 한다.
   */
  mobile?: MobileDialogPresentation | 'auto';
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideCloseButton = false, mobile = 'auto', style, onSubmit, ...props }, ref) => {
  const modal = useModalSurface(ref)
  const classes = splitDialogClasses(className)
  const presentation = resolveMobilePresentation(className, mobile)
  // 뒤로가기도 Esc 와 같은 가드를 거친다(저장 중·작성 중이면 닫히지 않는다)
  useModalBackEscapeGuard(props.onEscapeKeyDown)

  return (
    <DialogPortal>
      <DialogOverlay style={{ zIndex: modal.layer }} />
      <DialogPrimitive.Content
        ref={modal.ref}
        data-slot="dialog-content"
        data-mobile={presentation}
        aria-describedby={props['aria-describedby'] ?? undefined}
        className={cn(
          "fixed left-[50%] top-[50%] flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col translate-x-[-50%] translate-y-[-50%] rounded-3xl border border-border/70 bg-background p-0 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          // 직계 자식의 자동 최소 크기 해제 (2026-08-14).
          // 이 박스는 grid(일부 화면은 flex로 덮어씀)라 자식이 기본 `min-width:auto`를
          // 갖는다 = "내용의 min-content보다 좁아질 수 없다". 긴 파일명처럼 줄바꿈
          // 기회가 없는 문자열(밑줄·점만 있는 이름)이 하나라도 들어오면 그 자식이
          // 다이얼로그 폭을 넘겨 밀려나고, overflow-x-hidden을 건 화면에서는 아예
          // 잘려서 안 보인다. min-w-0을 줘야 안쪽의 truncate/break-words가 비로소 먹는다.
          "[&>*]:min-w-0",
          classes.surface
        )}
        {...props}
        style={{ ...style, overflow: 'visible', zIndex: modal.layer + 1 }}
        onSubmit={(event) => { event.stopPropagation(); onSubmit?.(event) }}
      >
        <ModalSurfaceContext.Provider value={modal.scope}>
          <div data-slot="dialog-viewport" data-default-padding={!classes.customPadding}
            className={cn('app-dialog-viewport grid gap-4 overflow-y-auto p-6', classes.viewport)}>
            {children}
          </div>
          {!hideCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none sm:right-3 sm:top-3 sm:h-8 sm:w-8">
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sr-only">닫기</span>
            </DialogPrimitive.Close>
          )}
        </ModalSurfaceContext.Provider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn(
      "flex shrink-0 flex-col space-y-1.5 border-b border-border/60 pb-4 text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      // break-words: 제목에 파일명 등 긴 비분할 문자열이 들어와도 넘치지 않고 접힌다
      // (한 줄로 자르고 싶으면 호출부에서 truncate를 덧붙일 것)
      "min-w-0 break-words text-lg font-semibold leading-tight tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("min-w-0 break-words text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
