/**
 * `?absence=<일정 id>` 로 「결강 처리」 모달을 여는 전역 호스트. `App.tsx` 에 **하나만** 둔다.
 *
 * 왜 전역인가: 입구가 셋이고 사는 곳이 다 다르다 —
 *   ① 일정 생성 모달(스케줄·공지 링크 선택기·업무 흐름·일정 설문이 각자 띄운다, 저장하면 닫히며
 *      호스트에 따라 언마운트된다) ② 일정 상세(스케줄·대시보드 카드·통합 검색) ③ 알림(`/schedule?absence=`).
 * 각자 모달을 품으면 생성 모달이 닫히는 순간 결강 처리도 함께 사라지는 호스트가 생긴다.
 * URL 하나로 모으면 어디서 열어도 같은 모달이고, 상세 모달 위에 열면 그 위에 겹쳐 뜬다.
 *
 * 열고 닫기는 `replace` 다 — 휴대폰 뒤로가기는 모달 관리자(`modalBackHistory`)가 이미 맡는다.
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAbsenceMeeting } from '@/services/absenceLessonService';
import { AbsenceResolutionDialog } from './AbsenceResolutionDialog';
import { ABSENCE_PARAM } from './useOpenAbsenceResolution';

export function AbsenceResolutionHost() {
  const [searchParams, setSearchParams] = useSearchParams();
  const meetingId = searchParams.get(ABSENCE_PARAM);

  const { data: meeting } = useQuery({
    queryKey: ['absence-meeting', meetingId],
    queryFn: () => fetchAbsenceMeeting(meetingId!),
    enabled: !!meetingId,
    staleTime: 30 * 1000,
  });

  const close = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(ABSENCE_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  // 일정이 지워졌거나 볼 수 없으면 조용히 아무것도 그리지 않는다 — 파라미터만 남아도 해가 없다
  if (!meetingId || !meeting || meeting.id !== meetingId) return null;

  return (
    <AbsenceResolutionDialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      meeting={meeting}
    />
  );
}
