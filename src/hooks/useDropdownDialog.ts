import { useRef, useCallback } from 'react';

/**
 * DropdownMenu에서 Dialog를 열 때 발생하는 aria-hidden 포커스 충돌을 방지하는 훅.
 *
 * 문제: DropdownMenuItem에서 Dialog를 즉시 열면, DropdownMenuContent가
 * 닫히는 애니메이션 중에 아직 DOM에 남아있고 포커스를 가지고 있는데,
 * Dialog가 주변 요소에 aria-hidden="true"를 적용하여 충돌 발생.
 *
 * 해결: Dialog 열기를 onCloseAutoFocus 시점(DropdownMenu 완전 닫힘 후)으로 지연.
 *
 * @example
 * const { triggerDialog, dropdownContentProps } = useDropdownDialog();
 *
 * <DropdownMenuContent {...dropdownContentProps}>
 *   <DropdownMenuItem onSelect={() => triggerDialog(() => setDialogOpen(true))}>
 *     편집
 *   </DropdownMenuItem>
 * </DropdownMenuContent>
 */
export function useDropdownDialog() {
  const pendingActionRef = useRef<(() => void) | null>(null);

  const triggerDialog = useCallback((openFn: () => void) => {
    pendingActionRef.current = openFn;
  }, []);

  const dropdownContentProps = {
    onCloseAutoFocus: (e: Event) => {
      if (pendingActionRef.current) {
        e.preventDefault();
        pendingActionRef.current();
        pendingActionRef.current = null;
      }
    },
  };

  return { triggerDialog, dropdownContentProps };
}
