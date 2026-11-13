import * as React from 'react';
import { MOBILE_MODAL_BREAKPOINT } from '@/components/ui/dialog-layout';

const QUERY = `(max-width: ${MOBILE_MODAL_BREAKPOINT - 0.02}px)`;

/**
 * 모달·드롭다운이 "휴대폰 모양"으로 떠야 하는 폭인가 (2026-09-20).
 *
 * `use-mobile.tsx` 의 `useIsMobile()`(768px)과 **일부러 다른 훅**이다. 그쪽은
 * 네비게이션·레이아웃 경계(md)이고 이쪽은 모달 경계(sm)라, 하나로 합치면
 * 700px 태블릿에서 드롭다운만 시트로 뜨고 모달은 가운데 뜨는 어긋남이 생긴다.
 * 경계값 단일 출처 = `MOBILE_MODAL_BREAKPOINT`(= `modal.css` 의 미디어 쿼리).
 *
 * 첫 렌더에서 이미 정답을 안다 — `useEffect` 뒤에 켜지면 피커가 데스크톱
 * 팝오버로 한 번 마운트됐다가 시트로 다시 마운트된다(열려 있으면 깜빡인다).
 */
export function useIsMobileModal(): boolean {
  const [matches, setMatches] = React.useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : false,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return matches;
}
