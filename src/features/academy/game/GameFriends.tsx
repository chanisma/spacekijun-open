import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GameModal } from './GameModal';
import styles from './friends.module.css';
import {
  deleteGuestbook, fetchFriends, fetchGuestbookAdmin, formatFriendCode, friendsQueryKey, normalizeFriendCode,
  type FriendSummary, type FriendsAction,
} from './friendsService';
import { DEMO_PEER_CODE, demoFriendsApi, liveFriendsApi, resetFriendsDemo, type FriendsApi } from './friendsDemo';

const when = (iso: string) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/**
 * 별빛 친구 목록 (2026-10-04). 친구 코드로 맺고(명단을 보여 주지 않는다), 받은 요청을 받거나 거절하고,
 * 친구의 방을 방문한다. «망원경 보여 주기»는 여기서 켠다 — 켜도 친구에게는 별 이름과 연결선만 간다.
 * 학생이 아니면(교직원 체험) 안내만. 관리자는 «친구 화면 미리보기»(학생과 같은 화면을 견본 자료로 — friendsDemo.ts)와
 * 방명록 관리를 본다(2026-10-04 사용자 요청 «관리자도 친구 신청 시스템이 어떻게 구성되는지 볼 수 있어야 함»).
 */
export function GameFriends({ userId, reduced, onClose, onVisit }: { userId: string; reduced: boolean; onClose: () => void; onVisit: (friend: FriendSummary, preview: boolean) => void }) {
  const query = useQuery({ queryKey: friendsQueryKey(userId), queryFn: fetchFriends, enabled: !!userId });
  const [tab, setTab] = useState<'preview' | 'guestbook'>('preview');
  const data = query.data;
  return <GameModal title="별빛 친구" onClose={onClose} className={styles.panel} reduced={reduced}>
    <span className={styles.kicker}>STARLIGHT FRIENDS</span>
    <h2>별빛 친구</h2>
    {query.isPending ? <p role="status">친구 목록을 펼치고 있어요…</p>
      : query.isError ? <div role="alert"><p>{query.error.message}</p><button className={styles.ghost} onClick={() => void query.refetch()}>다시 펼치기</button></div>
      // 관리자는 친구도 맺고(2026-11-06 — 선생님도 친구) 방명록 관리도 한다
      : data?.eligible && data.admin ? <>
        <div className={styles.tabs} role="tablist" aria-label="친구 화면 보기">
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>내 친구</button>
          <button type="button" role="tab" aria-selected={tab === 'guestbook'} onClick={() => setTab('guestbook')}>방명록 관리</button>
        </div>
        {tab === 'preview' ? <FriendsBody api={liveFriendsApi} queryKey={friendsQueryKey(userId)} onVisit={friend => onVisit(friend, false)} /> : <AdminGuestbook />}
      </>
      : data?.eligible ? <FriendsBody api={liveFriendsApi} queryKey={friendsQueryKey(userId)} onVisit={friend => onVisit(friend, false)} />
      : data?.admin ? <>
        <div className={styles.tabs} role="tablist" aria-label="친구 화면 보기">
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>친구 화면 미리보기</button>
          <button type="button" role="tab" aria-selected={tab === 'guestbook'} onClick={() => setTab('guestbook')}>방명록 관리</button>
        </div>
        {tab === 'preview' ? <FriendsBody api={demoFriendsApi} queryKey={['academy-friends', 'preview']} preview onVisit={friend => onVisit(friend, true)} /> : <AdminGuestbook />}
      </>
      : <p className={styles.lead}>친구 기능은 학생과 선생님이 쓰는 기능이에요. 직원 계정·체험에서는 열리지 않아요.</p>}
  </GameModal>;
}

/** 친구 화면 본문 — 학생(실제 서비스)과 미리보기(견본 자료)가 같은 화면을 쓴다. */
function FriendsBody({ api, queryKey, preview = false, onVisit }: { api: FriendsApi; queryKey: readonly unknown[]; preview?: boolean; onVisit: (friend: FriendSummary) => void }) {
  const cache = useQueryClient();
  // 미리보기는 창을 열 때마다 처음 상태로 — 앞사람이 눌러 둔 것이 남아 있으면 흐름을 처음부터 볼 수 없다.
  useEffect(() => { if (preview) { resetFriendsDemo(); void cache.invalidateQueries({ queryKey }); } }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = useQuery({ queryKey, queryFn: () => api.fetchFriends() });
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null); // 'reset' | `remove:<id>`
  const [copied, setCopied] = useState(false);
  const act = useMutation({
    mutationFn: ({ action, payload }: { action: FriendsAction; payload?: Record<string, unknown> }) => api.writeFriends(action, payload),
    onSuccess: (result, { action }) => {
      setConfirm(null);
      if (action === 'request') {
        setCode('');
        setMessage({ tone: 'ok', text: result.status === 'accepted' ? `${result.name} 학생과 친구가 되었어요. 서로 요청을 보냈거든요!` : `${result.name} 학생에게 친구 요청을 보냈어요. 받아 주면 친구 목록에 나타나요.` });
      } else if (action === 'reset_code') setMessage({ tone: 'ok', text: '새 친구 코드를 만들었어요. 예전 코드로는 더 이상 요청을 보낼 수 없어요.' });
      else setMessage(null);
      void cache.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => setMessage({ tone: 'error', text: error.message }),
  });
  const run = (action: FriendsAction, payload?: Record<string, unknown>) => act.mutate({ action, payload });
  const data = query.data;
  const busy = act.isPending;

  const copy = async () => {
    if (!data?.code) return;
    try { await navigator.clipboard.writeText(formatFriendCode(data.code)); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setMessage({ tone: 'error', text: '복사하지 못했어요. 코드를 길게 눌러 직접 골라 주세요.' }); }
  };

  return query.isPending ? <p role="status">친구 목록을 펼치고 있어요…</p>
      : query.isError ? <div role="alert"><p>{query.error.message}</p><button className={styles.ghost} onClick={() => void query.refetch()}>다시 펼치기</button></div>
      : data ? <>
        {preview
          ? <p className={styles.previewNote}>미리보기 · 학생에게 보이는 친구 화면이에요. 견본 학생으로 요청을 보내고(코드 <b>{formatFriendCode(DEMO_PEER_CODE)}</b>), 받은 요청을 받고, 친구의 방과 망원경을 둘러볼 수 있어요. 여기서 누른 것은 저장되지 않아요.</p>
          : <p className={styles.lead}>친구 코드를 서로 알려 주면 친구가 될 수 있어요. 친구의 기숙사를 방문해 방명록을 남겨 보세요.</p>}

        <section className={styles.section} aria-label="나의 친구 코드">
          <h3>나의 친구 코드 <small>친구에게만 알려 주세요</small></h3>
          <div className={styles.codeRow}>
            <output className={styles.code} aria-label={`친구 코드 ${formatFriendCode(data.code)}`}>{formatFriendCode(data.code)}</output>
            <button className={styles.ghost} onClick={() => void copy()}>{copied ? '복사했어요' : '복사'}</button>
            {confirm === 'reset'
              ? <><button className={styles.danger} disabled={busy} onClick={() => run('reset_code')}>새 코드로 바꾸기</button><button className={styles.ghost} onClick={() => setConfirm(null)}>그만두기</button></>
              : <button className={styles.ghost} onClick={() => setConfirm('reset')}>코드 바꾸기</button>}
          </div>
          {confirm === 'reset' && <p className={styles.muted}>코드가 원치 않는 곳에 퍼졌을 때 바꿔요. 이미 맺은 친구는 그대로예요.</p>}
        </section>

        <section className={styles.section} aria-label="망원경 공개">
          <button type="button" role="switch" aria-checked={!!data.share_telescope} className={styles.switch} disabled={busy} onClick={() => run('share', { on: !data.share_telescope })}>
            <span aria-hidden="true" />
            <span><strong>친구에게 나의 망원경 보여 주기</strong>
              <span className={styles.muted}>켜면 친구가 내 별자리를 구경할 수 있어요. 별 이름과 연결선만 보여요.</span></span>
          </button>
        </section>

        <section className={styles.section} aria-label="친구 맺기">
          <h3>친구 코드로 친구 맺기</h3>
          <form className={styles.form} onSubmit={event => { event.preventDefault(); if (normalizeFriendCode(code).length === 8) run('request', { code }); else setMessage({ tone: 'error', text: '친구 코드 8자리를 적어 주세요.' }); }}>
            <input className={styles.input} value={code} onChange={event => setCode(event.target.value)} placeholder="ABCD-1234" maxLength={11} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-label="친구 코드" />
            <button className={styles.button} disabled={busy || !code.trim()}>요청 보내기</button>
          </form>
          {message && <p className={styles.message} data-tone={message.tone} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        </section>

        {!!data.incoming?.length && <section className={styles.section} aria-label="받은 친구 요청">
          <h3>받은 친구 요청 <small>{data.incoming.length}개</small></h3>
          <ul className={styles.list}>{data.incoming.map(request => <li key={request.id} className={styles.row}>
            <span className={styles.name} title={request.name}>{request.name}<small>{when(request.created_at)}</small></span>
            <span className={styles.actions}>
              <button className={styles.button} disabled={busy} onClick={() => run('respond', { id: request.id, accept: true })}>친구 되기</button>
              <button className={styles.ghost} disabled={busy} onClick={() => run('respond', { id: request.id, accept: false })}>거절</button>
            </span></li>)}</ul>
        </section>}

        <section className={styles.section} aria-label="나의 친구">
          <h3>나의 친구 <small>{data.friends?.length ?? 0}명</small></h3>
          {data.friends?.length ? <ul className={styles.list}>{data.friends.map(friend => <li key={friend.id} className={styles.row}>
            <span className={styles.name} title={friend.name}>{friend.name}</span>
            {friend.share_telescope && <span className={styles.badge}>망원경 공개</span>}
            <span className={styles.actions}>
              {confirm === `remove:${friend.id}`
                ? <><button className={styles.danger} disabled={busy} onClick={() => run('remove', { user_id: friend.id })}>친구 끊기</button><button className={styles.ghost} onClick={() => setConfirm(null)}>그만두기</button></>
                : <><button className={styles.button} onClick={() => onVisit(friend)}>방 방문하기</button><button className={styles.ghost} aria-label={`${friend.name} 친구 끊기`} onClick={() => setConfirm(`remove:${friend.id}`)}>끊기</button></>}
            </span></li>)}</ul>
            : <p className={styles.empty}>아직 친구가 없어요. 친구 코드를 주고받아 보세요.</p>}
        </section>

        {!!data.outgoing?.length && <section className={styles.section} aria-label="보낸 친구 요청">
          <h3>보낸 요청 <small>친구가 받아 주기를 기다리는 중</small></h3>
          <ul className={styles.list}>{data.outgoing.map(request => <li key={request.id} className={styles.row}>
            <span className={styles.name} title={request.name}>{request.name}<small>{when(request.created_at)}</small></span>
            <span className={styles.actions}><button className={styles.ghost} disabled={busy} onClick={() => run('cancel', { id: request.id })}>요청 취소</button></span></li>)}</ul>
        </section>}
      </> : null;
}

/** 관리자 — 모든 방명록을 최신순으로 보고 지운다(안전). 학생 화면에는 보이지 않는다. */
function AdminGuestbook() {
  const cache = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ['academy-guestbook-admin'],
    queryFn: ({ pageParam }) => fetchGuestbookAdmin(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.length === 100 ? last[last.length - 1].created_at : undefined,
  });
  const remove = useMutation({ mutationFn: deleteGuestbook, onSuccess: () => void cache.invalidateQueries({ queryKey: ['academy-guestbook-admin'] }) });
  const [confirm, setConfirm] = useState<string | null>(null);
  const entries = list.data?.pages.flat() ?? [];
  return <>
    <p className={styles.lead}>학생들이 서로의 기숙사에 남긴 방명록이에요. 부적절한 글은 지울 수 있어요(지운 글은 되살릴 수 없어요).</p>
    {list.isPending ? <p role="status">방명록을 불러오는 중…</p> : list.isError ? <p role="alert">{list.error.message}</p>
      : entries.length ? <ul className={styles.list}>{entries.map(entry => <li key={entry.id} className={styles.adminEntry}>
        <header><strong>{entry.author_name}</strong><span>→ {entry.owner_name}의 방</span><span>{when(entry.created_at)}</span></header>
        <p>{entry.body}</p>
        <div className={styles.actions}>{confirm === entry.id
          ? <><button className={styles.danger} disabled={remove.isPending} onClick={() => remove.mutate(entry.id, { onSuccess: () => setConfirm(null) })}>지우기</button><button className={styles.ghost} onClick={() => setConfirm(null)}>그만두기</button></>
          : <button className={styles.ghost} onClick={() => setConfirm(entry.id)}>이 글 지우기</button>}</div>
      </li>)}</ul>
      : <p className={styles.empty}>아직 방명록이 없어요.</p>}
    {remove.isError && <p className={styles.message} data-tone="error" role="alert">{remove.error.message}</p>}
    {list.hasNextPage && <button className={styles.ghost} disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>더 보기</button>}
  </>;
}
