import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * OAuth 콜백 페이지
 *
 * 팝업 모드 (?popup=true): postMessage로 결과 전달 후 자동 닫힘
 * 일반 모드: 홈으로 리다이렉트
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPopup = searchParams.get('popup') === 'true';

  useEffect(() => {
    async function handleCallback() {
      // Supabase가 URL hash에서 세션을 자동으로 파싱
      const { data: { session }, error } = await supabase.auth.getSession();

      if (isPopup) {
        // 팝업 모드: opener에게 결과 전달 후 닫기
        const success = !error && !!session?.provider_token;

        if (window.opener) {
          window.opener.postMessage(
            { type: 'google-oauth-callback', success },
            window.location.origin
          );
        }

        // 잠시 대기 후 팝업 닫기
        setTimeout(() => window.close(), 500);
      } else {
        // 일반 모드: 홈으로 리다이렉트
        navigate('/', { replace: true });
      }
    }

    handleCallback();
  }, [isPopup, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        <p className="text-sm text-muted-foreground">
          {isPopup ? '인증 처리 중...' : '로그인 처리 중...'}
        </p>
      </div>
    </div>
  );
}
