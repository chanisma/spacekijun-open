/**
 * 코인 경제 설정(2026-10-21) — 얻는 코인·쓰는 코인을 관리자가 Admin «코인 경제»에서 바꾼다.
 *
 * 정본은 DB 표 `coin_economy_setting` 하나이고 서버 함수가 `economy_private.num(키)` 로 읽는다.
 * 화면은 같은 표를 읽어 **자기 상수를 그 자리에서 갱신**한다 — 기능마다 `onCoinEconomy(적용 함수)` 를 등록하고,
 * 루트 화면이 `useCoinEconomy()` 를 부르면 값이 도착하는 순간 등록된 함수가 모두 돈다.
 * 상수를 바꾸는 방식이라 그 상수를 읽는 화면·3D 장면(React 밖 코드)을 하나하나 고치지 않는다.
 *
 * ⚠️ 설정을 못 읽으면(오프라인·옛 서버) 아무것도 바꾸지 않는다 — 코드의 기본값(= 시드 기본값)이 그대로 남는다.
 *    값이 어긋나도 서버가 정본이라 돈이 틀리게 움직이지는 않는다: 의뢰처럼 «확인한 값»을 보내는 곳은 서버가 거부하고,
 *    그 밖은 화면 숫자만 잠깐 낡는다.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CoinEconomyApp = 'study' | 'academy' | 'planner' | 'tamagotchi' | 'star-tower' | 'world-today' | 'interview' | 'isekai3d' | 'ranch';
export type CoinEconomyDirection = 'earn' | 'spend' | 'limit';

export interface CoinEconomySetting {
  key: string;
  app: CoinEconomyApp;
  direction: CoinEconomyDirection;
  label: string;
  note: string;
  unit: string;
  value: number;
  default_value: number;
  min_value: number;
  max_value: number;
  sort: number;
  updated_at: string;
  updated_by: string | null;
}

export type CoinEconomyValues = Readonly<Record<string, number>>;

export const COIN_ECONOMY_QUERY_KEY = ['coin-economy'] as const;

let current: CoinEconomyValues | null = null;
const appliers = new Set<(values: CoinEconomyValues) => void>();

/** 기능의 상수 갱신 함수를 등록한다. 이미 값이 있으면 바로 한 번 적용한다(모듈이 늦게 불러와진 경우). */
export function onCoinEconomy(apply: (values: CoinEconomyValues) => void): void {
  appliers.add(apply);
  if (current) apply(current);
}

/** 값 묶음을 적용한다 — 등록된 기능 전부. 같은 값을 다시 적용해도 결과가 같다. */
export function applyCoinEconomy(values: CoinEconomyValues): void {
  current = values;
  for (const apply of appliers) {
    try {
      apply(values);
    } catch (e) {
      console.warn('[coin-economy] 적용 실패', e);
    }
  }
}

/** 키의 값 — 없거나 정수가 아니면 fallback(코드 기본값) */
export function coinValue(values: CoinEconomyValues, key: string, fallback: number): number {
  const v = values[key];
  return Number.isInteger(v) ? v : fallback;
}

export function valuesOf(rows: Pick<CoinEconomySetting, 'key' | 'value'>[]): CoinEconomyValues {
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function fetchCoinEconomySettings(): Promise<CoinEconomySetting[]> {
  const { data, error } = await supabase
    .from('coin_economy_setting' as never)
    .select('*')
    .order('sort', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CoinEconomySetting[];
}

/**
 * 게임 루트에서 한 번 부른다. 값이 오면 등록된 상수를 갱신하고(쿼리 함수 안 — 그래서 다음 렌더부터 새 값),
 * 루트가 다시 그려져 아래 화면도 새 숫자를 읽는다.
 */
export function useCoinEconomy(enabled = true): CoinEconomyValues | null {
  const q = useQuery({
    queryKey: COIN_ECONOMY_QUERY_KEY,
    queryFn: async () => {
      const values = valuesOf(await fetchCoinEconomySettings());
      applyCoinEconomy(values);
      return values;
    },
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  if (q.data && q.data !== current) applyCoinEconomy(q.data); // 캐시에서 되살아난 값
  return q.data ?? null;
}
