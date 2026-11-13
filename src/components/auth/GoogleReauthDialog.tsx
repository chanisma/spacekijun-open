import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { popupReauth } from '@/services/googlePopupReauth';
import { preloadGoogleIdentity } from '@/services/googleIdentityPopup';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface GoogleReauthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoogleReauthDialog({ open, onOpenChange }: GoogleReauthDialogProps) {
  const { signInWithGoogle } = useAuth();
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  // 팝업이 실패했는지 — 실패하면 이유를 말하고 페이지 이동을 권한다(종전엔 아무 말 없이 모달이 남았다)
  const [popupFailed, setPopupFailed] = useState(false);

  // 모달이 뜨면 구글 스크립트를 미리 받는다 — 누른 뒤에 받으면 브라우저가 팝업을 막을 수 있다
  useEffect(() => {
    if (!open) return;
    setPopupFailed(false);
    void preloadGoogleIdentity().catch(() => undefined);
  }, [open]);

  const handlePopupReauth = async () => {
    setIsReauthenticating(true);
    try {
      // 구글 팝업으로 토큰만 새로 받는다 — 로그인 세션은 건드리지 않는다(2026-10-01, googleIdentityPopup.ts)
      const success = await popupReauth();
      if (success) {
        onOpenChange(false);
      } else {
        setPopupFailed(true);
      }
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleFullReauth = async () => {
    setIsReauthenticating(true);
    try {
      const currentPath = window.location.pathname + window.location.search;
      await signInWithGoogle(currentPath);
      onOpenChange(false);
    } finally {
      setIsReauthenticating(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <AlertDialogTitle>Google 인증 만료</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-2">
            <div>Google Drive/Calendar 토큰이 만료되었습니다.</div>
            <div className="text-sm text-muted-foreground">
              팝업으로 재인증하면 현재 페이지를 유지할 수 있습니다.
            </div>
            {popupFailed && (
              <div className="rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
                구글 창이 막혔거나 닫혔습니다. 다시 시도하거나 [페이지 이동 로그인]을 눌러 주세요.
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isReauthenticating}
          >
            나중에
          </Button>
          <Button
            variant="outline"
            onClick={handleFullReauth}
            disabled={isReauthenticating}
          >
            페이지 이동 로그인
          </Button>
          <Button
            onClick={handlePopupReauth}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={isReauthenticating}
          >
            {isReauthenticating ? '인증 중...' : '팝업 재인증'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
