import { useEffect, useState } from 'react';

/**
 * 분 단위 시간 상태를 사용하는 화면을 현재 시각에 맞춰 다시 렌더링한다.
 *
 * 첫 갱신을 다음 분 경계에 맞춘 뒤 1분마다 갱신하며, 백그라운드 탭에서
 * 타이머가 지연된 경우를 위해 포커스와 visibility 복귀 시에도 즉시 갱신한다.
 */
export function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let intervalId: number | undefined;

    const updateNow = () => {
      setNow(new Date());
    };

    const millisecondsUntilNextMinute = 60_000 - (Date.now() % 60_000) + 25;
    const timeoutId = window.setTimeout(() => {
      updateNow();
      intervalId = window.setInterval(updateNow, 60_000);
    }, millisecondsUntilNextMinute);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateNow();
      }
    };

    window.addEventListener('focus', updateNow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener('focus', updateNow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return now;
}
