import type { InquiryWorkspace, KgEntityRow, KgRelationRow } from '@/features/inquiry-design/types';
import * as live from './friendsService';
import type { FriendRoom, FriendsAction, FriendsState, GuestbookEntry } from './friendsService';

/**
 * 별빛 친구 «미리보기» — 학생이 아닌 관리자가 친구 신청 흐름을 직접 눌러 볼 수 있게 (2026-10-04 사용자 요청
 * «관리자도 친구 신청 시스템이 어떻게 구성되는지 볼 수 있어야 함»).
 *
 * 친구 기능은 학생끼리만이라 관리자는 실제로 친구를 맺을 수 없다(서버가 거부한다). 그래서 같은 화면을
 * **메모리 속 견본 자료**로 그린다 — 코드·요청 보내기·받기·방 방문·방명록·망원경이 학생과 똑같이 움직이되
 * 아무것도 저장되지 않고 새로고침하면 처음으로 돌아간다. 실제 서비스와 **같은 함수 모양**이라 화면은 어느 쪽인지 모른다.
 */
export interface FriendsApi {
  fetchFriends: typeof live.fetchFriends;
  writeFriends: typeof live.writeFriends;
  fetchFriendRoom: typeof live.fetchFriendRoom;
  writeGuestbook: typeof live.writeGuestbook;
  deleteGuestbook: typeof live.deleteGuestbook;
  fetchFriendConstellation: typeof live.fetchFriendConstellation;
}
export const liveFriendsApi: FriendsApi = live;

const DEMO_CODE = 'STAR7KJN';
const PEER_CODE = 'LUNA4RVX'; // 요청을 보내 볼 수 있는 견본 학생의 코드 — 화면이 힌트로 보여 준다
export const DEMO_PEER_CODE = PEER_CODE;
const now = () => new Date().toISOString();
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

type Store = { state: Required<Omit<FriendsState, 'eligible' | 'admin'>>; rooms: Record<string, { room: string; ria: string; guestbook: GuestbookEntry[] }> };
function seed(): Store {
  return {
    state: {
      code: DEMO_CODE, share_telescope: false,
      friends: [
        { id: 'demo-byeol', name: '견본 학생 별님', since: ago(9), share_telescope: true },
        { id: 'demo-eunha', name: '견본 학생 은하수', since: ago(3), share_telescope: false },
      ],
      incoming: [{ id: 'demo-req-in', user_id: 'demo-saebyeok', name: '견본 학생 새벽', created_at: ago(1) }],
      outgoing: [],
    },
    rooms: {
      'demo-byeol': { room: 'dorm-rose', ria: 'ria-rose', guestbook: [{ id: 'demo-g1', author_id: 'demo-eunha', author_name: '견본 학생 은하수', body: '방 분위기가 정말 포근하다! 다음엔 같이 별 보러 가자 ✦', created_at: ago(2), can_delete: false }] },
      'demo-eunha': { room: 'dorm-stars', ria: 'ria-player', guestbook: [] },
      'demo-saebyeok': { room: 'dorm', ria: 'ria-player', guestbook: [] },
      'demo-moon': { room: 'dorm', ria: 'ria-player', guestbook: [] },
    },
  };
}
let store = seed();
/** 미리보기를 처음 상태로(친구 창을 다시 열 때마다 새로 시작한다). */
export function resetFriendsDemo() { store = seed(); }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const wait = () => new Promise(r => setTimeout(r, 120)); // 실제 왕복처럼 아주 잠깐 — 단추가 «처리 중»을 보여 줄 틈

export const demoFriendsApi: FriendsApi = {
  async fetchFriends() { await wait(); return { eligible: true, admin: false, ...clone(store.state) }; },
  async writeFriends(action: FriendsAction, payload: Record<string, unknown> = {}) {
    await wait();
    const s = store.state;
    if (action === 'request') {
      const code = live.normalizeFriendCode(String(payload.code ?? ''));
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw Error('친구 코드 8자리를 확인해 주세요.');
      if (code === s.code) throw Error('내 친구 코드예요. 친구의 코드를 적어 주세요.');
      if (code !== PEER_CODE) throw Error(`그 코드의 친구를 찾지 못했어요. (미리보기에서는 ${live.formatFriendCode(PEER_CODE)} 로 보내 볼 수 있어요)`);
      if (s.friends.some(f => f.id === 'demo-moon')) throw Error('이미 친구예요.');
      if (s.outgoing.some(r => r.user_id === 'demo-moon')) throw Error('이미 친구 요청을 보냈어요. 친구가 받아 주기를 기다려 주세요.');
      s.outgoing.unshift({ id: 'demo-req-out', user_id: 'demo-moon', name: '견본 학생 달빛', created_at: now() });
      return { status: 'pending', name: '견본 학생 달빛' };
    }
    if (action === 'respond') {
      const r = s.incoming.find(x => x.id === payload.id);
      if (!r) throw Error('받은 친구 요청을 찾지 못했어요.');
      s.incoming = s.incoming.filter(x => x.id !== r.id);
      if (payload.accept) s.friends.push({ id: r.user_id, name: r.name, since: now(), share_telescope: false });
      return { status: payload.accept ? 'accepted' : 'declined' };
    }
    if (action === 'cancel') { s.outgoing = s.outgoing.filter(x => x.id !== payload.id); return { status: 'cancelled' }; }
    if (action === 'remove') { s.friends = s.friends.filter(x => x.id !== payload.user_id); return { status: 'removed' }; }
    if (action === 'share') { s.share_telescope = !!payload.on; return { share_telescope: s.share_telescope }; }
    if (action === 'reset_code') { s.code = s.code === DEMO_CODE ? 'SKY9WQPE' : DEMO_CODE; return { code: s.code }; }
    throw Error('친구 목록에서 할 일을 선택해 주세요.');
  },
  async fetchFriendRoom(id: string): Promise<FriendRoom> {
    await wait();
    const f = store.state.friends.find(x => x.id === id);
    if (!f) throw Error('친구의 방만 방문할 수 있어요.');
    const room = store.rooms[id] ?? { room: 'dorm', ria: 'ria-player', guestbook: [] };
    return { owner: { id, name: f.name, share_telescope: f.share_telescope }, room: room.room, ria: room.ria, guestbook: clone(room.guestbook) };
  },
  async writeGuestbook(ownerId: string, body: string) {
    await wait();
    const text = body.trim();
    if (!text || [...text].length > live.GUESTBOOK_MAX) throw Error('방명록은 1자에서 200자까지 적을 수 있어요.');
    const entry: GuestbookEntry = { id: `demo-g-${Date.now()}`, author_id: 'demo-me', author_name: '나(미리보기)', body: text, created_at: now(), can_delete: true };
    (store.rooms[ownerId] ??= { room: 'dorm', ria: 'ria-player', guestbook: [] }).guestbook.unshift(entry);
    return entry;
  },
  async deleteGuestbook(id: string) {
    await wait();
    for (const room of Object.values(store.rooms)) room.guestbook = room.guestbook.filter(e => !(e.id === id && e.can_delete));
  },
  async fetchFriendConstellation(friendId: string, friendName: string): Promise<InquiryWorkspace> {
    await wait();
    const sid = `friend:${friendId}`, v = 'demo-kg';
    const e = (entity_id: string, label: string, type: string, grade: number) => ({ id: entity_id, entity_id, label, type, properties: { grade }, kg_version_id: v, student_id: sid }) as KgEntityRow;
    const r = (id: string, source_entity_id: string, target_entity_id: string, relation_type: string) => ({ id, source_entity_id, target_entity_id, relation_type, properties: { layer: 'local' }, kg_version_id: v, student_id: sid }) as KgRelationRow;
    const kgJson = { source_stats: { extraction_engine: 'solar-pro4-seg-v8' } } as unknown as NonNullable<InquiryWorkspace['kgJson']>;
    return {
      student: { id: '친구', name: friendName, grade: null, class_num: null, number: null },
      kgVersion: { id: v, student_id: sid, version: 1, kg_json: kgJson, source_categories: [], created_by: null, created_at: '' },
      kgVersions: [], kgJson,
      kgEntities: [e('i1', '천문학', 'Interest', 1), e('a1', '별의 밝기 관측', 'Activity', 1), e('a2', '변광성 자료 분석', 'Activity', 2), e('c1', '자료 해석', 'Competency', 2), e('b1', '코스모스', 'Book', 1)],
      kgRelations: [r('r1', 'a1', 'i1', 'MOTIVATED_BY'), r('r2', 'a2', 'a1', 'DEEPENS'), r('r3', 'a2', 'c1', 'DEMONSTRATED'), r('r4', 'b1', 'a1', 'INSPIRED')],
      targets: [], activityRecords: [], savedDesigns: [], comprehensiveRecommendations: [], historyEntityLabels: new Map(),
    };
  },
};
