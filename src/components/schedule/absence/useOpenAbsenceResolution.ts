/**
 * 「결강 처리」 모달을 여는 URL 파라미터와 그 여닫이.
 * 모달 자체는 `AbsenceResolutionHost`(App 에 하나)가 이 파라미터를 보고 그린다.
 * 알림 목적지(`notificationNavigation` 의 `/schedule?absence=`)와 **같은 이름**이어야 한다.
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const ABSENCE_PARAM = 'absence';

/** 현재 화면 위에 결강 처리 모달을 연다 (replace — 뒤로가기는 모달 관리자가 맡는다) */
export function useOpenAbsenceResolution() {
  const [, setSearchParams] = useSearchParams();
  return useCallback(
    (meetingId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(ABSENCE_PARAM, meetingId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
}
