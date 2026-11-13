import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { ModalSurfaceContext, useModalSurface } from './modal-surface'
import { splitDialogClasses } from './dialog-layout'
import { createBackClosableRoot, useModalBackEscapeGuard } from './modal-back'
import './modal.css'

// 휴대폰 뒤로가기 = 취소(Esc 와 같다). `modal-back.tsx` 참고.
const AlertDialog = createBackClosableRoot(AlertDialogPrimitive.Root, 'AlertDialog')

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-slate-950/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, style, onSubmit, ...props }, ref) => {
  const modal = useModalSurface(ref)
  const classes = splitDialogClasses(className)
  useModalBackEscapeGuard(props.onEscapeKeyDown)
  return (
  <AlertDialogPortal>
    <AlertDialogOverlay style={{ zIndex: modal.layer }} />
    <AlertDialogPrimitive.Content
      ref={modal.ref}
      data-slot="alert-dialog-content"
      className={cn(
        "fixed left-[50%] top-[50%] flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg flex-col translate-x-[-50%] translate-y-[-50%] rounded-3xl border border-border/70 bg-background shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        // grid 자식의 자동 최소 크기 해제 — 이유는 dialog.tsx의 같은 주석 참조.
        // 삭제 확인창은 본문에 파일명·리소스명을 그대로 끼워 넣는 곳이라 특히 잘 터진다.
        "[&>*]:min-w-0",
        classes.surface
      )}
      {...props}
      style={{ ...style, overflow: 'visible', padding: 0, zIndex: modal.layer + 1 }}
      onSubmit={(event) => { event.stopPropagation(); onSubmit?.(event) }}
    >
      <ModalSurfaceContext.Provider value={modal.scope}>
        <div data-slot="dialog-viewport" data-default-padding={!classes.customPadding}
          className={cn('app-dialog-viewport grid gap-4 overflow-y-auto p-6', classes.viewport)}>{children}</div>
      </ModalSurfaceContext.Provider>
    </AlertDialogPrimitive.Content>
  </AlertDialogPortal>
  )
})
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn(
      "flex shrink-0 flex-col space-y-2 border-b border-border/60 pb-4 text-left",
      className
    )}
    {...props}
  />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
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
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("min-w-0 break-words text-lg font-semibold", className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("min-w-0 break-words text-sm text-muted-foreground", className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      buttonVariants({ variant: "outline" }),
      "mt-0",
      className
    )}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
