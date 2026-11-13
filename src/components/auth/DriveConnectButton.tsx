// ========================================
// [드라이브 연결] — 구글 팝업으로 먼저, 안 되면 페이지 이동으로 (2026-10-01)
//
// 팝업(googleIdentityPopup)은 화면을 떠나지 않아 고른 파일·입력이 남는다. 실패(팝업 차단·창 닫음·
// 이 주소가 구글 클라이언트에 등록되지 않음 — 개발 서버 localhost 가 그렇다)하면 그 자리에
// [페이지 이동으로 연결]을 보인다. 페이지 이동은 고른 파일을 잃으므로 대안으로만 둔다.
// ========================================

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { popupReauth } from '@/services/googlePopupReauth';
import { preloadGoogleIdentity } from '@/services/googleIdentityPopup';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface DriveConnectButtonProps {
  /** 연결되면 부른다 — 화면이 «연결됨» 상태로 바뀐다 */
  onConnected: () => void;
  /** 페이지 이동으로 연결할 때 돌아올 주소 */
  returnPath: string;
  className?: string;
}

export function DriveConnectButton({ onConnected, returnPath, className }: DriveConnectButtonProps) {
  const { signInWithGoogle } = useAuth();
  const [phase, setPhase] = useState<'idle' | 'popup' | 'failed' | 'redirecting'>('idle');

  // 버튼이 보일 때 구글 스크립트를 미리 받는다 — 누른 뒤에 받으면 브라우저가 팝업을 막을 수 있다
  useEffect(() => { void preloadGoogleIdentity().catch(() => undefined); }, []);

  const connectWithPopup = async () => {
    setPhase('popup');
    const ok = await popupReauth();
    if (ok) {
      setPhase('idle');
      onConnected();
    } else {
      setPhase('failed');
    }
  };

  const connectWithRedirect = async () => {
    setPhase('redirecting');
    try {
      // 전체 리다이렉트 재인증 — 여기 도달하면 곧 페이지가 이동한다
      await signInWithGoogle(returnPath);
    } catch (e) {
      setPhase('failed');
      toast.error(e instanceof Error ? e.message : '드라이브 연결을 시작하지 못했습니다.');
    }
  };

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 bg-white text-xs"
        disabled={phase === 'popup' || phase === 'redirecting'}
        onClick={() => void connectWithPopup()}
      >
        {phase === 'popup' ? '구글 창에서 연결 중…' : '드라이브 연결'}
      </Button>
      {(phase === 'failed' || phase === 'redirecting') && (
        <span className="text-[11px] leading-snug">
          구글 창이 막혔거나 닫혔습니다.{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2 disabled:opacity-60"
            disabled={phase === 'redirecting'}
            onClick={() => void connectWithRedirect()}
          >
            {phase === 'redirecting' ? '이동 중…' : '페이지 이동으로 연결'}
          </button>
          <span className="opacity-80"> (고른 파일은 다시 골라야 합니다)</span>
        </span>
      )}
    </span>
  );
}
