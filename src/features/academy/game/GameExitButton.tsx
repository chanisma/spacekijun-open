import { useContext, useState, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useNavigate } from 'react-router-dom';
import { GameSurfaceContext } from './surfaceContext';
import styles from './game.module.css';
import { useModalBackClose } from '@/components/ui/modal-back';

export function GameExitButton({ className, children }: { className: string; children: ReactNode }) {
  const surface = useContext(GameSurfaceContext);
  const navigate = useNavigate();
  // 휴대폰 뒤로가기 = [계속 머무르기]. 닫으려면 열림 상태를 알아야 해서 제어형으로 둔다.
  const [open, setOpen] = useState(false);
  useModalBackClose(open, () => setOpen(false));
  return <AlertDialog.Root open={open} onOpenChange={setOpen}>
    <AlertDialog.Trigger asChild><button type="button" className={className}>{children}</button></AlertDialog.Trigger>
    {surface && <AlertDialog.Portal container={surface}>
      <AlertDialog.Overlay className={`${styles.veil} ${styles.exitVeil}`} />
      <AlertDialog.Content className={`${styles.modal} ${styles.exitConfirm}`}>
        <span className={styles.kicker}>UNTIL WE MEET AGAIN</span>
        <AlertDialog.Title>아카데미를 나갈까요?</AlertDialog.Title>
        <AlertDialog.Description>아카데미를 나가 메인 화면으로 돌아가요. 아직 저장하지 않은 내용은 사라질 수 있어요.</AlertDialog.Description>
        <div className={styles.exitChoices}>
          <AlertDialog.Cancel className={styles.mapButton}>계속 머무르기</AlertDialog.Cancel>
          <AlertDialog.Action className={styles.goldButton} onClick={() => navigate('/')}>확인하고 나가기</AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>}
  </AlertDialog.Root>;
}
