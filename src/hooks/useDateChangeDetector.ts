// ========================================
// Date Change Detector Hook
// 자정 감지 및 날짜 기반 쿼리 자동 무효화
// ========================================

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 날짜 변경(자정 통과)을 감지하여 날짜 기반 쿼리를 자동으로 무효화하는 훅
 *
 * 사용 목적:
 * - 브라우저를 장시간 열어둔 채로 자정이 지나면 날짜 기반 데이터가 자동 갱신되도록 함
 * - 사용자가 수동으로 새로고침할 필요 없음
 *
 * 동작 원리:
 * - 1분마다 현재 날짜를 체크
 * - 날짜가 변경되면 날짜 기반 쿼리 키를 무효화
 * - TanStack Query가 자동으로 refetch 실행
 *
 * 성능 영향:
 * - 1분마다 날짜 문자열 비교 (CPU 사용량 무시 가능)
 * - 실제 무효화는 하루 1회만 발생 (자정 시)
 * - 네트워크 요청은 병렬로 실행되어 0.2-0.5초 소요
 */
export function useDateChangeDetector() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // 현재 날짜를 문자열로 저장 (비교용)
    let lastDate = new Date().toDateString();

    const checkDateChange = () => {
      const currentDate = new Date().toDateString();

      // 날짜가 변경되었는지 확인
      if (currentDate !== lastDate) {
        console.log('🗓️ 날짜 변경 감지:', lastDate, '→', currentDate);
        console.log('📊 날짜 기반 쿼리 무효화 시작...');

        // 날짜 기반 쿼리 모두 무효화
        queryClient.invalidateQueries({ queryKey: ['today-timetable'] });
        queryClient.invalidateQueries({ queryKey: ['today-meetings'] });
        queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
        queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });

        console.log('✅ 날짜 기반 쿼리 무효화 완료');

        // 마지막 날짜 업데이트
        lastDate = currentDate;
      }
    };

    // 1분(60000ms)마다 날짜 변경 체크
    const interval = setInterval(checkDateChange, 60000);

    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      clearInterval(interval);
    };
  }, [queryClient]);
}
