import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * 별빛 친구의 «맺기» 부분만 — 코드 · 요청 · 받기 · 끊기 (2026-10-15 분리).
 *
 * 아카데미와 다마고찌가 **같은 친구 관계**를 쓴다(표 `academy_friendships` 하나). 다마고찌 안에서도 친구를
 * 맺게 하면서 이 부분만 떼어 냈다 — `friendsService.ts` 는 탐구 설계·공방 모듈을 끌어오므로 다마고찌가
 * 그것을 import 하면 그 코드가 다마고찌 청크에 실린다. `friendsService.ts` 는 이 파일을 그대로 다시 내보낸다.
 *
 * **캐시 열쇠도 하나다**(`friendsQueryKey`) — 다마고찌에서 받은 요청이 아카데미 목록에 곧바로 반영되려면
 * 두 화면이 같은 열쇠를 읽어야 한다.
 */
const db = supabase as unknown as SupabaseClient;

export interface FriendSummary { id: string; name: string; since: string | null; share_telescope: boolean }
export interface FriendRequest { id: string; user_id: string; name: string; created_at: string }
export interface FriendsState {
  eligible: boolean;
  admin: boolean;
  code?: string;
  share_telescope?: boolean;
  friends?: FriendSummary[];
  incoming?: FriendRequest[];
  outgoing?: FriendRequest[];
}
export type FriendsAction = 'request' | 'respond' | 'cancel' | 'remove' | 'share' | 'reset_code';
/** 어느 화면에서 맺었는가 — 상대에게 가는 알림이 그 화면으로 열린다(서버 `friend_notify`). */
export type FriendsSurface = 'academy' | 'tamagotchi';

/** 접두어 `['academy-friends']` 로 무효화하면 두 화면의 친구 목록이 함께 새로 읽힌다 */
export const FRIENDS_QUERY_ROOT = ['academy-friends'] as const;
export const friendsQueryKey = (userId: string) => [...FRIENDS_QUERY_ROOT, userId] as const;

/** `7BUBRH2L` → `7BUB-RH2L` — 소리 내어 불러 주기 쉽게 넷씩 끊는다. 저장은 하이픈 없이. */
export function formatFriendCode(code: string | undefined | null) {
  const clean = (code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
/** 입력칸 정규화 — 소문자·공백·하이픈을 받아 준다(서버도 같은 규칙으로 다시 정규화한다). */
export function normalizeFriendCode(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw Error(error?.message || fallback);
}

export async function fetchFriends(): Promise<FriendsState> {
  const { data, error } = await db.rpc('academy_friends_read');
  if (error) fail(error, '친구 목록을 불러오지 못했어요. 다시 열어 주세요.');
  return data as FriendsState;
}

/**
 * @param surface 요청·받기를 어느 화면에서 했는가. 서버가 상대에게 보내는 알림의 제목과 열리는 곳을 정한다
 *   (생략 = 아카데미 — 종전 동작). 다마고찌만 쓰는 학생에게 아카데미로 가는 알림은 열 수 없는 화면이다
 *   (아카데미 친구는 제3장을 마쳐야 열린다).
 */
export async function writeFriends(
  action: FriendsAction,
  payload: Record<string, unknown> = {},
  surface: FriendsSurface = 'academy',
): Promise<Record<string, unknown>> {
  const body = surface === 'academy' ? payload : { ...payload, from: surface };
  const { data, error } = await db.rpc('academy_friends_write', { p_action: action, p_payload: body });
  if (error) fail(error, '친구 목록을 바꾸지 못했어요. 다시 시도해 주세요.');
  return data as Record<string, unknown>;
}
