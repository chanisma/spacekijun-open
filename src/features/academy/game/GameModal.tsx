import { useContext, useRef, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import styles from './game.module.css';
import { GameSurfaceContext } from './surfaceContext';
import { isBlockedByEscapeGuard, useModalBackClose } from '@/components/ui/modal-back';

export function GameModal({ title, children, onClose, className = '', reduced = false, onEscapeKeyDown }: { title: string; children: ReactNode; onClose: () => void; className?: string; reduced?: boolean; onEscapeKeyDown?: (event: KeyboardEvent) => void }) {
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const surface = useContext(GameSurfaceContext);
  // Radix 를 직접 쓰므로 공용 Dialog 처럼 자동으로 붙지 않는다. 휴대폰 뒤로가기 = Esc 와 같은
  // 규칙(창가의 하늘처럼 Esc 가 "한 단계 나가기"인 모달은 뒤로가기도 한 단계씩 나간다).
  useModalBackClose(Boolean(surface), () => {
    if (!isBlockedByEscapeGuard(onEscapeKeyDown)) onClose();
  });
  if (!surface) return null;
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal container={surface}>
      <Dialog.Overlay className={styles.veil} />
      <Dialog.Content className={`${styles.modal} ${className}`} data-reduced={reduced} aria-describedby={undefined} onEscapeKeyDown={onEscapeKeyDown} onCloseAutoFocus={event => {
        event.preventDefault();
        const previous = returnFocus.current;
        const hiddenMenu = previous?.closest('details:not([open])');
        if (previous?.isConnected && !hiddenMenu) previous.focus();
        else surface.parentElement?.querySelector<HTMLElement>('details > summary')?.focus();
      }}>
        <Dialog.Title className={styles.srOnly}>{title}</Dialog.Title>
        {/* 기호 «×» 대신 선 두 개로 그린다 — 글꼴마다 × 가 3px 남짓 아래로 처져 동그란 단추 안에서 가운데가 맞지 않았다(UI 점검 2026-10-03). */}
        <Dialog.Close className={styles.close} aria-label="닫기"><span className={styles.closeMark} aria-hidden="true" /></Dialog.Close>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
