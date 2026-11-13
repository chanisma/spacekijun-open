import { useCallback, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

/** 회전이 눈에 보이도록 최소한 이만큼은 돈다 — 캐시가 빠르면 깜빡임조차 안 보여 «눌러도 아무 일 없음»이 된다 */
const MIN_SPIN_MS = 500;

/**
 * 화면의 [새로고침] (2026-10-11).
 *
 * 종전 버튼이 «동작하지 않는» 것처럼 보인 이유 두 가지:
 *  ① 화면을 이루는 쿼리 중 **일부만** 다시 불렀다(시간표 = 수업만, 메모·교체 요청 배지·쉬는 날은 그대로).
 *  ② 회전 표시가 `isLoading`(첫 로드에만 참)에 묶여 있어 다시 불러오는 동안 아무 표시가 없었다.
 *
 * 그래서 화면이 쓰는 쿼리 키 **접두어 목록**을 받아 그 아래 활성 쿼리를 전부 다시 부르고
 * (`refetchQueries` 는 staleTime 과 무관하게 실제로 요청한다), 끝날 때까지 `refreshing` 을 참으로 둔다.
 * 쿼리가 아닌 자료(급식 등)는 `extra` 로 함께 기다린다.
 */
export function usePageRefresh(prefixes: QueryKey[], extra?: () => Promise<unknown> | unknown) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  // 렌더마다 새 배열이 와도 최신 값을 쓴다
  const latest = useRef({ prefixes, extra });
  latest.current = { prefixes, extra };

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    const started = Date.now();
    try {
      const { prefixes: keys, extra: more } = latest.current;
      await Promise.all([
        ...keys.map((queryKey) => queryClient.refetchQueries({ queryKey, type: 'active' }, { throwOnError: true })),
        Promise.resolve(more?.()),
      ]);
    } catch (error) {
      console.error('[새로고침] 실패', error);
      toast.error('일부 정보를 다시 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      const wait = MIN_SPIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      running.current = false;
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refresh, refreshing };
}
