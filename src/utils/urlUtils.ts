import { ExternalMenu } from '@/hooks/useIframeMenus';

/**
 * 외부 메뉴의 URL을 디바이스에 맞게 선택하는 유틸리티 함수
 * @param menu - 외부 메뉴 객체
 * @param isMobile - 모바일 디바이스 여부
 * @returns 적절한 URL
 */
export function getMenuUrl(menu: ExternalMenu, isMobile: boolean): string {
  if (!menu.meta?.url) {
    return '#';
  }

  // 모바일이고 모바일 URL이 설정되어 있으면 모바일 URL 사용
  if (isMobile && menu.meta.mobileUrl?.trim()) {
    return menu.meta.mobileUrl;
  }

  // 그 외의 경우 데스크톱 URL 사용
  return menu.meta.url;
}

/**
 * 외부 링크 클릭 핸들러
 * @param url - 이동할 URL
 * @param target - 타겟 윈도우 (_blank 등)
 * @param rel - rel 속성
 */
export function handleExternalLinkClick(
  url: string,
  target?: string,
  rel?: string
) {
  // URL 유효성 검증
  try {
    new URL(url);
  } catch {
    console.warn('Invalid URL:', url);
    return;
  }

  if (target === '_blank') {
    // 새 창으로 열기
    window.open(url, target, 'noopener,noreferrer');
  } else {
    // 현재 창에서 이동
    window.location.href = url;
  }
}