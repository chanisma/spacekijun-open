import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InquiryGraphCanvas } from '@/features/inquiry-design/components/InquiryGraphCanvas';
import { ENTITY_TYPE_LABELS } from '@/features/inquiry-design/utils/inquiryGraph';
import { ScenePanel } from './GameSurface';
import { gameAsset } from './gameAsset';
import gameStyles from './game.module.css';
import styles from './friends.module.css';
import { GUESTBOOK_MAX } from './friendsService';
import { demoFriendsApi, liveFriendsApi, type FriendsApi } from './friendsDemo';

const when = (iso: string) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const EMPTY = new Set<string>();

/**
 * 친구의 방 — 비동기 방문 (2026-10-04 사용자 결정). 친구가 꾸민 방과 친구의 리아를 보고 방명록을 남긴다.
 * 친구가 «망원경 보여 주기»를 켰다면 친구의 별자리를 구경한다 — 서버가 이미 이름·연결선만 보내므로
 * 별을 눌러도 «이름과 종류»만 나온다(내 망원경의 기록 패널은 쓰지 않는다).
 */
export function FriendRoom({ friendId, friendName, reduced, onClose, preview = false }: { friendId: string; friendName: string; reduced: boolean; onClose: () => void; /** 관리자 «친구 화면 미리보기» — 견본 자료(friendsDemo.ts) */ preview?: boolean }) {
  const cache = useQueryClient();
  const api: FriendsApi = preview ? demoFriendsApi : liveFriendsApi;
  const key = ['academy-friend-room', preview ? 'preview' : 'live', friendId];
  const room = useQuery({ queryKey: key, queryFn: () => api.fetchFriendRoom(friendId), staleTime: preview ? 0 : 30_000 });
  const [view, setView] = useState<'room' | 'sky'>('room');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const write = useMutation({
    mutationFn: () => api.writeGuestbook(friendId, body),
    onSuccess: () => { setBody(''); setError(null); void cache.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteGuestbook(id),
    onSuccess: () => { setConfirm(null); void cache.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => setError(e.message),
  });
  const name = room.data?.owner.name ?? friendName;
  const length = [...body.trim()].length;

  if (view === 'sky') return <ScenePanel title={`${name}의 망원경`} onClose={() => setView('room')} backLabel={`← ${name}의 방으로`} className={styles.room} reduced={reduced}>
    <FriendSky friendId={friendId} name={name} api={api} preview={preview} />
  </ScenePanel>;

  return <ScenePanel title={`${name}의 방`} onClose={onClose} backLabel="← 친구 목록으로" className={styles.room} reduced={reduced}>
    {room.data && <img className={styles.roomBackdrop} src={gameAsset(room.data.room)} alt="" />}
    <div className={styles.roomShade} aria-hidden="true" />
    {room.data && <img className={styles.roomRia} src={gameAsset(room.data.ria)} alt={`${name}의 리아`} />}
    <header className={styles.roomHeading}><span>STARLIGHT DORMITORY · A FRIEND’S ROOM</span><h2>{name}의 방</h2></header>
    {room.isPending ? <p className={styles.status} role="status">친구의 방 문을 두드리는 중…</p>
      : room.isError ? <div className={styles.status} role="alert"><p>{room.error.message}</p><button className={styles.ghost} onClick={() => void room.refetch()}>다시 두드리기</button></div>
      : room.data && <div className={styles.roomSide}>
        <section className={styles.guestbook} aria-label="방명록">
          <h3>방명록</h3>
          <ul className={styles.entries}>
            {room.data.guestbook.length ? room.data.guestbook.map(entry => <li key={entry.id} className={styles.entry}>
              <header><strong>{entry.author_name}</strong><span>{when(entry.created_at)}</span>
                {entry.can_delete && (confirm === entry.id
                  ? <><button onClick={() => remove.mutate(entry.id)} disabled={remove.isPending}>정말 지우기</button><button onClick={() => setConfirm(null)}>그만두기</button></>
                  : <button onClick={() => setConfirm(entry.id)} aria-label={`${entry.author_name}의 방명록 지우기`}>지우기</button>)}
              </header>
              <p>{entry.body}</p>
            </li>) : <li className={styles.empty}>아직 남긴 글이 없어요. 첫 방명록을 남겨 보세요.</li>}
          </ul>
          <form onSubmit={event => { event.preventDefault(); if (length) write.mutate(); }}>
            <textarea className={styles.textarea} value={body} maxLength={GUESTBOOK_MAX} onChange={event => setBody(event.target.value)} placeholder={`${name}에게 남길 말`} aria-label="방명록 글" />
            <div className={styles.writeRow}><span>{length}/{GUESTBOOK_MAX}</span><button className={styles.button} disabled={write.isPending || !length}>방명록 남기기</button></div>
          </form>
          {error && <p className={styles.message} data-tone="error" role="alert">{error}</p>}
        </section>
        <section className={styles.telescopeCard} aria-label="친구의 망원경">
          {room.data.owner.share_telescope
            ? <><button className={styles.button} onClick={() => setView('sky')}>{name}의 망원경 구경하기</button><p>별 이름과 연결선만 보여요.</p></>
            : <p>{name}이(가) 아직 망원경을 열어 두지 않았어요. 친구가 친구 목록에서 «망원경 보여 주기»를 켜면 구경할 수 있어요.</p>}
        </section>
      </div>}
  </ScenePanel>;
}

function FriendSky({ friendId, name, api, preview }: { friendId: string; name: string; api: FriendsApi; preview: boolean }) {
  const sky = useQuery({ queryKey: ['academy-friend-sky', preview ? 'preview' : 'live', friendId], queryFn: () => api.fetchFriendConstellation(friendId, name), staleTime: 60_000 });
  const [focus, setFocus] = useState<string | null>(null);
  const focused = useMemo(() => sky.data?.kgEntities.find(entity => entity.entity_id === focus) ?? null, [sky.data, focus]);
  const selected = useMemo(() => focus ? new Set([focus]) : EMPTY, [focus]);
  return <div className={styles.sky}>
    <header className={styles.skyHeading}><span>A FRIEND’S TELESCOPE</span><h2>{name}의 별자리</h2><p>별 이름과 별 사이의 길만 보여요. 기록의 문장과 근거는 친구만 볼 수 있어요.</p></header>
    <div className={styles.skyCanvas}>
      {sky.isPending ? <p className={styles.status} role="status">친구의 망원경을 맞추는 중…</p>
        : sky.isError ? <p className={styles.status} role="alert">{sky.error.message}</p>
        : sky.data && !sky.data.kgEntities.length ? <p className={styles.status}>아직 별자리가 그려지지 않았어요.</p>
        : sky.data && <div className={gameStyles.fullConstellation} aria-label={`${name}의 별자리`}>
          <InquiryGraphCanvas constellation workspace={sky.data} savedDesigns={[]} selectedNodeIds={selected} selectedEdgeIds={EMPTY}
            onToggleNode={id => setFocus(current => current === id ? null : id)} onToggleEdge={() => {}} kgVersionId={null} onKgVersionChange={() => {}} />
        </div>}
      {focused && <p className={styles.skyNote} role="status"><small>{ENTITY_TYPE_LABELS[focused.type ?? ''] ?? '별'}</small>{focused.label}</p>}
    </div>
  </div>;
}
