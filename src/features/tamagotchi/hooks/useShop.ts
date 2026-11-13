/** 가챠 · 꾸미기 · 외상 — 서버 상태 훅(Phase 3). 코인 지갑이 같으므로 코인 상태(useCredit)도 함께 새로 읽는다. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shopService, type ShopStatus } from '../services/shopService';
import { CREDIT_KEY } from './useCredit';
import type { ItemSlot } from '../model/catalog';

export const SHOP_KEY = ['tama-shop'] as const;

export function useShop(enabled: boolean) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: SHOP_KEY, enabled, queryFn: shopService.read, staleTime: 20_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: SHOP_KEY });
    void qc.invalidateQueries({ queryKey: CREDIT_KEY });
  };
  // 뽑기 결과는 연출이 끝난 뒤에 화면(도감)에 드러나야 한다 — 그래서 성공 시 바로 다시 읽지 않고 호출부가 refresh 한다
  const draw = useMutation({ mutationFn: (machine: string = 'all') => shopService.draw(machine) });
  const equip = useMutation({
    mutationFn: ({ slot, item }: { slot: ItemSlot; item: string | null }) => shopService.equip(slot, item),
    onSuccess: (equipped) => qc.setQueryData<ShopStatus>(SHOP_KEY, (prev) => (prev ? { ...prev, equipped } : prev)),
  });
  const payDebt = useMutation({ mutationFn: shopService.payDebt, onSuccess: refresh });
  return { status, draw, equip, payDebt, refresh };
}

export type ShopController = ReturnType<typeof useShop>;
