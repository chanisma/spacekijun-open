import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { getModalBackHistory } from '@/lib/modalBackHistory';

/**
 * 라우터가 지금 그리는 위치를 모달 기록 관리자(`lib/modalBackHistory`)에 알린다.
 * **`BrowserRouter` 안에 하나만** 둔다(`App.tsx`). 화면을 그리지 않는다.
 *
 * 이것이 없으면 관리자는
 *   ① 모달 항목 사이의 popstate 를 라우터에게서 감추지 못해, `?task=id` 처럼 URL 로
 *      여는 모달이 뒤로가기로 닫히자마자 `useSearchParams` effect 에 의해 **다시 열리고**
 *   ② 라우터의 replace 가 깊이 표시를 덮어쓴 것을 알아채지 못해, 모달이 열린 채
 *      다음 뒤로가기가 **이전 페이지로 이동**한다.
 */
export function ModalBackRouterSync(): null {
  const location = useLocation();
  useEffect(() => {
    getModalBackHistory()?.noteRouterLocation(
      `${location.pathname}${location.search}${location.hash}`,
      location.key,
    );
  }, [location]);
  return null;
}
