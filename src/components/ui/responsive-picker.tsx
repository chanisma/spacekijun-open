import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsMobileModal } from '@/hooks/useIsMobileModal';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';

/**
 * 선택기(검색 드롭다운)의 표시 방식 — 데스크톱 팝오버 / 휴대폰 시트 (2026-09-20).
 *
 * **왜 필요한가.** 팝오버는 마우스용 부품이다. 휴대폰에서는
 *   ① 트리거에 붙어 뜨므로 화면 아래쪽 입력에서 열면 목록이 접히고
 *   ② 키보드가 올라오면 남는 높이가 200px 남짓이라 두세 줄만 보이며
 *   ③ 바깥을 탭하면 닫히는데 그 "바깥"이 목록 바로 옆 몇 px 이다.
 * 아래에서 올라오는 시트는 셋 다 해결한다(높이 고정·엄지 근처·닫기 버튼).
 *
 * **왜 부품으로 뺐는가.** 소비처가 `SearchableMultiSelect`·`SearchableSelect`·
 * `DepartmentSelect` 셋이고 전부 `Popover + Command` 같은 모양이다. 각자
 * 분기하면 셋이 서서히 달라진다(한 곳만 닫기 버튼이 없다든지).
 *
 * **중첩 주의.** 시트는 `Dialog` 라서 모달 안에서 열면 모달 속 모달이 된다.
 * `modal-surface.tsx` 의 레이어 스택이 z-index 를 쌓아 주고, `DialogPortal` 은
 * container 를 넘기지 않아 body 로 나간다(`docs/nested-modal-pitfalls.md` 규약).
 * 반대로 팝오버 경로는 종전대로 `usePortalContainer` 가 바깥 모달 안으로 넣는다 —
 * **두 경로의 규칙이 반대인 것은 의도된 것**이다.
 */

type PickerContextValue = { mobile: boolean };
const PickerContext = React.createContext<PickerContextValue>({ mobile: false });

/** 시트로 뜨는 중인가. 소비처가 목록 높이·자동 포커스를 가를 때 쓴다. */
export function usePickerMobile(): boolean {
  return React.useContext(PickerContext).mobile;
}

export interface PickerRootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal?: boolean;
  children: React.ReactNode;
}

export function PickerRoot({ open, onOpenChange, modal, children }: PickerRootProps) {
  const mobile = useIsMobileModal();
  const value = React.useMemo(() => ({ mobile }), [mobile]);
  const Root = mobile ? Dialog : Popover;
  return (
    <PickerContext.Provider value={value}>
      <Root open={open} onOpenChange={onOpenChange} modal={modal}>{children}</Root>
    </PickerContext.Provider>
  );
}

export const PickerTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof PopoverTrigger>
>((props, ref) => {
  const { mobile } = React.useContext(PickerContext);
  const Trigger = mobile ? DialogTrigger : PopoverTrigger;
  return <Trigger ref={ref} {...props} />;
});
PickerTrigger.displayName = 'PickerTrigger';

export interface PickerContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof PopoverContent>, 'title'> {
  /** 시트 머리글이자 접근성 제목. 팝오버 경로에서는 쓰이지 않는다. */
  title: React.ReactNode;
  /** 시트 머리글 아래 한 줄 설명(선택). */
  description?: React.ReactNode;
  /** 시트에서만 붙는 하단 고정 영역 — 여러 개 고르는 선택기의 [완료] 등. */
  mobileFooter?: React.ReactNode;
  /** 시트 본문에 덧붙일 클래스(팝오버의 `className` 과 섞이지 않는다). */
  sheetClassName?: string;
}

export const PickerContent = React.forwardRef<HTMLDivElement, PickerContentProps>(
  ({ className, sheetClassName, title, description, mobileFooter, children, style, align = 'start', ...props }, ref) => {
    const { mobile } = React.useContext(PickerContext);
    const sheetRef = React.useRef<HTMLDivElement | null>(null);
    const composedRef = React.useCallback((node: HTMLDivElement | null) => {
      sheetRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }, [ref]);

    /**
     * 시트가 열릴 때 **검색 입력이 아니라 시트 자체**로 포커스를 옮긴다.
     *
     * 둘 다 필요한 동작이다:
     *   ① 검색 입력을 잡으면 키보드가 즉시 올라와 목록이 두세 줄로 줄고,
     *      `position: fixed; bottom: 0` 인 시트가 키보드 뒤로 들어간다.
     *   ② 그렇다고 포커스를 그냥 두면 **바깥 모달의 입력에 포커스가 남는다**
     *      (실측 확인) — 키보드 사용자는 시트 안으로 들어갈 수 없고,
     *      Esc 도 어느 레이어가 받을지 모호해진다.
     * 시트 컨테이너는 Radix 가 `tabindex="-1"` 을 붙여 두므로 포커스를 받을 수 있다.
     */
    const handleOpenAutoFocus = React.useCallback((event: Event) => {
      event.preventDefault();
      sheetRef.current?.focus({ preventScroll: true });
    }, []);

    /**
     * 검색을 시작하면 시트를 최대 높이로 편다 (2026-09-20).
     *
     * **키보드는 `position: fixed; bottom: 0` 을 덮는다.** 모바일 브라우저의
     * 기본값(`interactive-widget=resizes-visual`)에서 키보드는 레이아웃 뷰포트를
     * 줄이지 않으므로, 아래 붙은 시트는 키보드 **뒤로** 들어간다. 짧은 시트(2~3줄)는
     * 통째로 가려진다. 뷰포트 메타를 `resizes-content` 로 바꾸면 해결되지만,
     * 그건 앱 전체에 걸려 **모바일 하단 내비가 키보드 위로 올라와** 입력 중에
     * 화면을 가린다 — 하나를 고치려고 다른 하나를 깬다.
     *
     * 그래서 시트 쪽에서만 처리한다: 입력에 포커스가 들어오면 높이를 85dvh 로
     * 고정해 시트 **윗부분(검색창 + 결과 앞줄)이 키보드 위로 올라오게** 한다.
     * 닫히면 언마운트되므로 상태는 저절로 초기화된다.
     */
    const [expanded, setExpanded] = React.useState(false);
    const handleFocusCapture = React.useCallback((event: React.FocusEvent<HTMLDivElement>) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') setExpanded(true);
    }, []);

    if (!mobile) {
      return (
        <PopoverContent ref={ref} className={className} align={align} style={style} {...props}>
          {children}
        </PopoverContent>
      );
    }

    // 팝오버 전용 props(align·sideOffset·avoidCollisions…)는 Dialog 가 모르는 값이라
    // 넘기지 않는다. 닫힐 때 포커스 복귀만 Radix 공통이라 이어 받는다.
    const { onCloseAutoFocus } = props as { onCloseAutoFocus?: (event: Event) => void };

    return (
      <DialogContent
        ref={composedRef}
        mobile="sheet"
        hideCloseButton
        className={cn('flex flex-col gap-0 overflow-hidden p-0', sheetClassName)}
        data-sheet-expanded={expanded ? 'true' : undefined}
        onFocusCapture={handleFocusCapture}
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {/* 잡고 내리는 손잡이 — 시트라는 것을 말해 주는 관습적 표시 */}
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
        <div className="flex shrink-0 items-start gap-2 px-4 pb-3 pt-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold">{title}</DialogTitle>
            {description
              ? <DialogDescription className="mt-0.5 text-xs">{description}</DialogDescription>
              : <DialogDescription className="sr-only">목록에서 선택하세요</DialogDescription>}
          </div>
          <DialogClose
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">닫기</span>
          </DialogClose>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t">{children}</div>
        {mobileFooter ? (
          <div className="shrink-0 border-t bg-background px-4 py-3">{mobileFooter}</div>
        ) : null}
      </DialogContent>
    );
  },
);
PickerContent.displayName = 'PickerContent';
