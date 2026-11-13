import { useState, useEffect } from 'react';

/**
 * 모바일 디바이스를 감지하는 커스텀 훅
 * 화면 크기와 User Agent를 기반으로 모바일 여부 판단
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      // 화면 크기로 먼저 확인 (768px 이하는 모바일로 간주)
      const screenWidth = window.innerWidth;
      const isSmallScreen = screenWidth <= 768;

      // User Agent를 통한 모바일 디바이스 감지
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = [
        'mobile', 'android', 'iphone', 'ipad', 'ipod',
        'blackberry', 'windows phone', 'opera mini'
      ];

      const isMobileUserAgent = mobileKeywords.some(keyword =>
        userAgent.includes(keyword)
      );

      // 터치 기능 지원 여부
      const hasTouchSupport = 'ontouchstart' in window ||
        navigator.maxTouchPoints > 0;

      // 모바일 판정: 작은 화면이거나 모바일 User Agent이거나 터치 지원
      setIsMobile(isSmallScreen || isMobileUserAgent ||
        (hasTouchSupport && screenWidth <= 1024));
    };

    // 초기 감지
    checkIsMobile();

    // 화면 크기 변경 감지
    const handleResize = () => {
      checkIsMobile();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return isMobile;
}