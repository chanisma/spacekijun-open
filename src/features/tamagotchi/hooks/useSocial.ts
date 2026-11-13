/**
 * 함께(Phase 5) — 친구 · 교환 · 캐릭터 의뢰 훅. 교환·의뢰는 코인·물건을 바꾸므로 상점·코인 상태도 함께 새로 읽는다.
 * 입힌 캐릭터는 여기서 받아 컬러 화면 그리개에 넣는다(`setCustomCharacter`) — 못 받으면 기본 캐릭터로 그린다(깨진 그림을 보이지 않는다).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { characterService, socialService } from '../services/socialService';
import { decorService } from '../services/decorService';
import { SHOP_KEY } from './useShop';
import { CREDIT_KEY } from './useCredit';
import { setCustomCharacter, type CustomPose } from '../color/characters';
import type { PixelBuf } from '../color/pixel';
import type { PetSkin } from '../services/petService';
import { loadCharacterSheet } from '../color/customCharacter';
import { loadArtSheet } from '../color/artSprites';
// 친구 «맺기»는 아카데미와 같은 관계·같은 RPC 다 — 가벼운 core 만 가져온다(friendsService 는 탐구 설계·공방을 끌어온다)
import { FRIENDS_QUERY_ROOT, fetchFriends, friendsQueryKey, writeFriends, type FriendsAction } from '@/features/academy/game/friendsCore';

export const FRIENDS_KEY = ['tama-friends'] as const;
export const CHARACTER_KEY = ['tama-character'] as const;
export const DECOR_ORDER_KEY = ['tama-decor', 'mine'] as const;

/** 다마고찌 친구 창에서 하는 친구 «맺기» 일 — 아카데미의 share(망원경 공개)는 아카데미에만 있다 */
export type BefriendAction = Exclude<FriendsAction, 'share'>;

/**
 * @param me 로그인한 사용자 id — 친구 코드·요청 목록을 아카데미와 **같은 캐시 열쇠**(`friendsQueryKey(me)`)로 읽는다.
 *   그래서 다마고찌에서 받은 요청이 아카데미 친구 창에도 곧바로 반영된다(반대도 같다).
 */
export function useSocial(enabled: boolean, me: string | null = null) {
  const qc = useQueryClient();
  const friends = useQuery({ queryKey: FRIENDS_KEY, enabled, queryFn: socialService.friends, staleTime: 15_000 });
  // 친구 맺기(2026-10-15) — 코드 · 받은/보낸 요청. 받은 요청 수가 기기 아래 «친구» 단추의 배지가 되므로 창이 닫혀 있어도
  // 1분마다 다시 읽는다(아카데미 친구 창과 같은 주기).
  const codes = useQuery({
    queryKey: me ? friendsQueryKey(me) : [...FRIENDS_QUERY_ROOT, 'anonymous'],
    enabled: enabled && !!me,
    queryFn: fetchFriends,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: FRIENDS_KEY });
    void qc.invalidateQueries({ queryKey: SHOP_KEY });
  };
  const trade = useMutation({
    mutationFn: ({ action, payload }: { action: 'propose' | 'accept' | 'decline' | 'cancel'; payload: Record<string, unknown> }) =>
      socialService.trade(action, payload),
    onSuccess: refreshAll,
  });
  const pat = useMutation({ mutationFn: socialService.pat, onSuccess: () => void qc.invalidateQueries({ queryKey: FRIENDS_KEY }) });
  // 친구가 생기거나 끊기면 친구 펫 목록(tama_friends_read)도 바뀐다 — 두 목록을 함께 새로 읽는다
  const befriend = useMutation({
    mutationFn: ({ action, payload }: { action: BefriendAction; payload?: Record<string, unknown> }) =>
      writeFriends(action, payload ?? {}, 'tamagotchi'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: FRIENDS_QUERY_ROOT });
      void qc.invalidateQueries({ queryKey: FRIENDS_KEY });
    },
  });
  return { friends, codes, trade, pat, befriend };
}

/**
 * @param gachaCharacterId 가챠로 모아 꾸미기에서 고른 캐릭터(자리 'character', 2026-10-13).
 *   의뢰로 받은 캐릭터를 입고 있으면 그쪽이 먼저다(내가 주문한 것이 가챠 물건보다 앞선다).
 */
export function useCharacterOrders(enabled: boolean, gachaCharacterId: string | null = null) {
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: CHARACTER_KEY, enabled, queryFn: characterService.mine, staleTime: 20_000, refetchInterval: 60_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: CHARACTER_KEY });
    void qc.invalidateQueries({ queryKey: CREDIT_KEY });
    void qc.invalidateQueries({ queryKey: SHOP_KEY });
  };
  const write = useMutation({
    mutationFn: ({ action, payload }: { action: 'submit' | 'cancel' | 'equip'; payload: Record<string, unknown> }) => characterService.write(action, payload),
    onSuccess: refresh,
  });

  // 입힌 캐릭터를 그리개에 — 바뀔 때만 다시 받는다
  const equippedId = mine.data?.equipped ?? null;
  const equippedPath = mine.data?.orders.find((o) => o.id === equippedId)?.image_path ?? null;
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // 스킨이 바뀌면(펫을 바꿨거나 갈아입었거나) 먼저 벗긴다 — 새 그림을 받는 사이 앞 스킨이 남아 보이지 않게(2026-10-14)
    setCustomCharacter(null);
    if (!equippedPath && !gachaCharacterId) return () => { alive = false; };
    const frames = equippedPath
      ? characterService.signedUrl(equippedPath).then(loadCharacterSheet)
      : loadArtSheet(gachaCharacterId!).then((f) => { if (!f) throw new Error('캐릭터를 불러오지 못했어요.'); return f; });
    frames
      .then((frames) => { if (alive) { setCustomCharacter(frames); setLoadError(null); } })
      .catch((e) => { if (alive) { setCustomCharacter(null); setLoadError(e instanceof Error ? e.message : '캐릭터를 불러오지 못했어요.'); } });
    return () => { alive = false; };
  }, [equippedPath, gachaCharacterId]);
  // 화면을 떠나면 기본 캐릭터로(다른 계정·체험 모드에 남지 않게)
  useEffect(() => () => setCustomCharacter(null), []);

  return { mine, write, equippedId, loadError };
}

/** 꾸미기 의뢰(2026-10-08) — 배송되면 나만의 물건이 상점 읽기에 실려 오므로 상점도 함께 새로 읽는다 */
export function useDecorOrders(enabled: boolean) {
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: DECOR_ORDER_KEY, enabled, queryFn: decorService.mine, staleTime: 20_000, refetchInterval: 60_000 });
  const write = useMutation({
    mutationFn: ({ action, payload }: { action: 'submit' | 'cancel'; payload: Record<string, unknown> }) => decorService.write(action, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DECOR_ORDER_KEY });
      void qc.invalidateQueries({ queryKey: CREDIT_KEY });
      void qc.invalidateQueries({ queryKey: SHOP_KEY });
    },
  });
  // 배송을 알아채면 상점을 다시 읽어 나만의 물건을 받는다
  const delivered = (mine.data ?? []).filter((o) => o.status === 'delivered').length;
  useEffect(() => { if (delivered > 0) void qc.invalidateQueries({ queryKey: SHOP_KEY }); }, [delivered, qc]);
  return { mine, write };
}

export type SocialController = ReturnType<typeof useSocial>;
export type DecorOrderController = ReturnType<typeof useDecorOrders>;
export type CharacterController = ReturnType<typeof useCharacterOrders>;

/**
 * 쉬는 펫 하나의 스킨 그림(2026-10-14 — 스킨은 펫마다). 함께하는 펫의 스킨은 useCharacterOrders 가 그리개에 넣고,
 * 펫 집의 쉬는 펫은 이 훅으로 따로 받는다. 의뢰 캐릭터의 그림 주소는 내 의뢰 목록에서 찾는다(못 찾으면 기본 그림).
 */
export function usePetSkinFrames(skin: PetSkin | null, orders: { id: string; image_path?: string | null }[] | undefined) {
  const orderPath = skin?.orderId ? orders?.find((o) => o.id === skin.orderId)?.image_path ?? null : null;
  const itemId = skin?.itemId ?? null;
  const [frames, setFrames] = useState<Record<CustomPose, PixelBuf> | null>(null);
  useEffect(() => {
    let alive = true;
    setFrames(null);
    if (!orderPath && !itemId) return () => { alive = false; };
    const job = orderPath ? characterService.signedUrl(orderPath).then(loadCharacterSheet) : loadArtSheet(itemId!);
    job.then((f) => { if (alive) setFrames(f ?? null); }).catch(() => { if (alive) setFrames(null); });
    return () => { alive = false; };
  }, [orderPath, itemId]);
  return frames;
}
