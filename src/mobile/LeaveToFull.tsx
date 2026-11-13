import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MobileLoading } from './MobileShell';

/**
 * 모바일 앱에 없는 주소(본 앱 화면으로 가는 링크 등) — 주소를 다시 불러 본 앱을 띄운다.
 * main.tsx 는 '/' 가 아닌 주소를 본 앱으로 보내므로 되돌아오지 않는다.
 */
export function LeaveToFull() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    window.location.replace(pathname + search + hash);
  }, [pathname, search, hash]);
  return <MobileLoading label="웹사이트를 여는 중…" />;
}
