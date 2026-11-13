// 「오늘」 데이터 — 기존 훅을 모아 순수 판정(model/todayFeed)에 넘긴다 (2026-11-08, P0)
// 새 쿼리를 만들지 않는다: 각 출처의 기존 훅·쿼리 키를 그대로 써서 다른 화면과 캐시를 나눈다.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentUserResourceId } from '@/hooks/usePermissions';
import { useMyTasksJsonb } from '@/hooks/useTasksJsonb';
import { useTodayMeetings } from '@/hooks/useTodayMeetings';
import { useMyCollectRequests } from '@/features/task-workflow/hooks/useCollectInput';
import { useSignatureRequests } from '@/features/e-signature/hooks/useSignatureRequests';
import { myTurn } from '@/features/e-signature/lib/signatureFlow';
import { useMyPendingApprovals } from '@/features/approval/hooks/useApprovals';
import { listOfficialDocs } from '@/features/official-docs/officialDocService';
import { isUserAssignee, type AssigneeData } from '@/lib/assigneeUtils';
import { todayKeyKst } from '@/lib/taskVisibility';
import { shiftDateKey } from '@/lib/officialDocInbox';
import { buildTodayFeed, type FeedSignature, type FeedTask, type TodayFeed } from '../model/todayFeed';

/** 공문은 최근 60일 접수분만 본다 — 그보다 오래 판단 대기인 공문은 판단함에서 */
export const TODAY_DOC_WINDOW_DAYS = 60;

export interface TodayMeeting {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

export const TODAY_FEED_QUERY_PREFIXES = [
  ['my-tasks-jsonb'], ['today-meetings'], ['work-today'],
] as const;

export function useTodayFeed() {
  const { user, profile, isAdmin } = useAuth();
  const { data: myResourceId } = useCurrentUserResourceId();
  const today = todayKeyKst();

  const tasksQ = useMyTasksJsonb(true);
  const { data: requests = [], isLoading: loadingRequests } = useMyCollectRequests();
  const { data: signatureRequests = [] } = useSignatureRequests();
  const { data: approvals = [] } = useMyPendingApprovals();
  const meetingsQ = useTodayMeetings(myResourceId ?? null);

  // 공문 — 관리자는 전부, 교직원은 결재권자가 본인인 것만 온다(RLS «담당 본인 읽기», 2026-11-08 P2).
  // 화면은 어느 쪽이든 «결재권자 = 내 이름»만 싣는다(myPendingDocs)
  const docsQ = useQuery({
    queryKey: ['work-today', 'official-docs', today],
    // mine = 서버가 «결재권자 = 나 · 결정 없음»만 준다(2026-11-12 — 관리자 60일 치 424건·6.6초 → 17건). 화면의 myPendingDocs 거름은 그대로 둔다
    queryFn: () => listOfficialDocs({ from: shiftDateKey(today, -TODAY_DOC_WINDOW_DAYS), to: null, mine: true }),
    enabled: !!profile?.name,
    staleTime: 5 * 60 * 1000,
  });
  const docsById = useMemo(() => new Map((docsQ.data?.docs ?? []).map((d) => [d.id, d])), [docsQ.data]);

  const me = useMemo(() => ({ userId: user?.id ?? null, name: profile?.name ?? null }), [user?.id, profile?.name]);

  // 서명 — 홈 «서명 대기» 카드와 같은 판정(myTurn)
  const signatures: FeedSignature[] = useMemo(
    () => signatureRequests
      .filter((r) => myTurn(
        r.signers.map((s) => ({
          id: s.id, orderIndex: s.orderIndex, roleLabel: s.roleLabel,
          signerUserId: s.signerUserId, signerName: s.signerName, status: s.status, fields: s.fields,
        })),
        r.status, me,
      ).isMyTurn)
      .map((r) => ({ id: r.id, title: r.title, requesterName: r.requesterName, dueAt: r.dueAt ?? null })),
    [signatureRequests, me],
  );

  const feed: TodayFeed = useMemo(() => buildTodayFeed({
    today,
    myResourceId: myResourceId ?? null,
    myName: profile?.name ?? null,
    tasks: (tasksQ.data?.assigned_tasks ?? []) as unknown as FeedTask[],
    requests,
    signatures,
    approvals: approvals.map((a) => ({ id: a.id, title: a.title, requesterName: a.requester_name, createdAt: a.created_at })),
    docs: docsQ.data?.docs ?? [],
  }), [today, myResourceId, profile?.name, tasksQ.data, requests, signatures, approvals, docsQ.data]);

  // 오늘 일정 — 홈 «오늘 일정» 카드와 같은 거름(업무 일정은 내가 담당일 때만)
  const meetings: TodayMeeting[] = useMemo(() => (meetingsQ.data ?? [])
    .filter((m: { kind: string; meta: unknown }) => {
      const meta = m.meta as { assignee?: AssigneeData } | null;
      if (m.kind !== 'duty') return true;
      return !!profile?.name && isUserAssignee(meta?.assignee, profile.name);
    })
    .map((m: { id: string; kind: string; starts_at: string; ends_at: string; meta: unknown; section?: { name?: string } | null }) => {
      const meta = m.meta as { title?: string; section_name?: string; date_only?: boolean } | null;
      return {
        id: m.id,
        title: meta?.title || meta?.section_name || m.section?.name || '일정',
        kind: m.kind,
        startsAt: m.starts_at,
        endsAt: m.ends_at,
        allDay: !!meta?.date_only,
      };
    }), [meetingsQ.data, profile?.name]);

  return {
    today,
    feed,
    meetings,
    myResourceId: myResourceId ?? null,
    me: myResourceId && profile?.name ? { id: myResourceId, name: profile.name } : null,
    docsById,
    isAdmin,
    isLoading: tasksQ.isLoading || loadingRequests,
    /** 공문은 따로 온다 — 오는 동안 화면이 «확인 중»을 말하게 */
    docsLoading: docsQ.isLoading,
    error: tasksQ.error as Error | null,
  };
}
