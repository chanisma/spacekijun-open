import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { InquiryWorkspace, KgEntityRow, KgRelationRow } from '@/features/inquiry-design/types';
import { itemSupported } from './dormitoryModel';
import { workshopReference } from './workshopModel';
import { signWorkshopImages } from './workshopService';

/**
 * 별빛 친구 (2026-10-04 사용자 요청 — 친구 코드로 친구를 맺고, 친구의 기숙사를 방문해 방명록을 쓰고,
 * 친구가 허용했다면 망원경(별자리)을 구경한다). 서버 = `20261004120000_academy_friends.sql`.
 *
 * 학생끼리만 쓴다 — 교직원(체험 계정 포함)은 `eligible:false` 를 받고, 관리자는 방명록 관리만 본다.
 * 친구의 별자리는 서버가 이미 «이름과 연결선»만 남겨 보낸다(근거 문장·출처 활동·신뢰도는 오지 않는다).
 */
const db = supabase as unknown as SupabaseClient;

// 친구 «맺기»(코드·요청·받기·끊기)는 다마고찌와 함께 쓰므로 가벼운 파일로 떼어 냈다(2026-10-15) — 이름은 그대로 다시 내보낸다.
export * from './friendsCore';

export interface GuestbookEntry { id: string; author_id: string; author_name: string; body: string; created_at: string; can_delete: boolean }
export interface AdminGuestbookEntry { id: string; owner_id: string; owner_name: string; author_id: string; author_name: string; body: string; created_at: string }
export interface FriendRoom { owner: { id: string; name: string; share_telescope: boolean }; room: string; ria: string; guestbook: GuestbookEntry[] }

export const GUESTBOOK_MAX = 200;

function fail(error: { message?: string } | null, fallback: string): never {
  throw Error(error?.message || fallback);
}

type RawOutfit = Partial<Record<'room' | 'ria', { asset: string | null; image_path: string | null }>>;

/**
 * 친구가 지금 꾸민 방·입은 리아. 기숙사와 같은 규칙(`equipment`)이지만 친구의 장착품만 받는다:
 * 기본 그림 → 지원되는 장착품이면 그 그림, 맞춤 제작이면 서명 URL(저장소 정책이 «친구가 입은 그림»을 열어 준다).
 * 서명에 실패하면 기본 그림으로 둔다 — 방문 자체를 막을 이유는 아니다.
 */
async function resolveOutfit(outfit: RawOutfit) {
  const result = { room: workshopReference.room, ria: workshopReference.ria };
  const custom = (['room', 'ria'] as const).flatMap(slot => {
    const item = outfit[slot];
    return item?.asset?.startsWith('workshop:') && item.image_path && itemSupported(item.asset) ? [item.image_path] : [];
  });
  const signed = custom.length ? await signWorkshopImages(custom).catch(() => new Map<string, string>()) : new Map<string, string>();
  for (const slot of ['room', 'ria'] as const) {
    const item = outfit[slot];
    if (!item?.asset || !itemSupported(item.asset)) continue;
    if (item.asset.startsWith('workshop:')) { const url = item.image_path ? signed.get(item.image_path) : undefined; if (url) result[slot] = url; }
    else result[slot] = item.asset;
  }
  return result;
}

export async function fetchFriendRoom(friendId: string): Promise<FriendRoom> {
  const { data, error } = await db.rpc('academy_friend_room', { p_friend: friendId });
  if (error) fail(error, '친구의 방 문을 열지 못했어요. 다시 시도해 주세요.');
  const raw = data as { owner: FriendRoom['owner']; outfit: RawOutfit; guestbook: GuestbookEntry[] };
  const outfit = await resolveOutfit(raw.outfit ?? {});
  return { owner: raw.owner, room: outfit.room, ria: outfit.ria, guestbook: raw.guestbook ?? [] };
}

export async function writeGuestbook(ownerId: string, body: string): Promise<GuestbookEntry> {
  const { data, error } = await db.rpc('academy_guestbook_write', { p_action: 'write', p_payload: { owner_id: ownerId, body } });
  if (error) fail(error, '방명록을 남기지 못했어요. 다시 시도해 주세요.');
  return data as GuestbookEntry;
}

export async function deleteGuestbook(id: string): Promise<void> {
  const { error } = await db.rpc('academy_guestbook_write', { p_action: 'delete', p_payload: { id } });
  if (error) fail(error, '방명록을 지우지 못했어요.');
}

export async function fetchGuestbookAdmin(before?: string | null): Promise<AdminGuestbookEntry[]> {
  const { data, error } = await db.rpc('academy_guestbook_admin_read', { p_limit: 100, p_before: before ?? null });
  if (error) fail(error, '방명록 목록을 불러오지 못했어요.');
  return (data ?? []) as AdminGuestbookEntry[];
}

/**
 * 친구의 별자리 → 망원경 캔버스가 받는 작업 공간 모양. 설계·추천·활동 기록은 비워 둔다 —
 * 친구에게 보여 주는 것은 «별자리»뿐이다(사용자 결정). 버전 선택기도 없다(목록이 비어 있다).
 */
export async function fetchFriendConstellation(friendId: string, friendName: string): Promise<InquiryWorkspace> {
  const { data, error } = await db.rpc('academy_friend_constellation', { p_friend: friendId });
  if (error) fail(error, '친구의 망원경을 들여다보지 못했어요.');
  const raw = data as { version_id: string | null; version: number | null; engine?: string | null; entities: Omit<KgEntityRow, 'kg_version_id' | 'student_id'>[]; relations: Omit<KgRelationRow, 'kg_version_id' | 'student_id'>[] };
  const versionId = raw.version_id ?? '';
  const studentId = `friend:${friendId}`;
  // 캔버스는 kg_json.source_stats.extraction_engine 으로 신 KG(v7·v8)를 알아보고 학생 허브를 그리지 않는다 —
  // 원문이 든 kg_json 대신 서버가 꺼내 준 엔진 이름 한 줄만 그 자리에 둔다(내 망원경과 같은 그림이 되게).
  const kgJson = { source_stats: { extraction_engine: raw.engine ?? undefined } } as unknown as NonNullable<InquiryWorkspace['kgJson']>;
  return {
    // 구 KG 는 학생 허브 노드를 «이름 (id)»로 그린다 — 친구에게는 학적 코드 대신 «친구»라고 적는다.
    student: { id: '친구', name: friendName, grade: null, class_num: null, number: null },
    kgVersion: raw.version_id ? { id: versionId, student_id: studentId, version: raw.version ?? 0, kg_json: kgJson, source_categories: [], created_by: null, created_at: '' } : null,
    kgVersions: [],
    kgJson,
    kgEntities: (raw.entities ?? []).map(e => ({ ...e, kg_version_id: versionId, student_id: studentId })) as KgEntityRow[],
    kgRelations: (raw.relations ?? []).map(r => ({ ...r, kg_version_id: versionId, student_id: studentId })) as KgRelationRow[],
    targets: [],
    activityRecords: [],
    savedDesigns: [],
    comprehensiveRecommendations: [],
    historyEntityLabels: new Map(),
  };
}
