// ========================================
// 창의적 체험활동 (/activities)
//
// 화면 구조(2026-08-27 개편):
//   헤더(검색·범주·필터·기록 — 타이틀 없음)
//   → 진로·분야 카테고리 타일 그리드
//   → 분야 선택 시 타일이 좌측 레일로 이동 + 우측에 활동 목록(게시글 스타일)
//   → 활동 선택 시 상세 모달
//
// 교사·학생이 같은 라우트를 쓰고 useActivityAccess로 분기한다
// (admin이 학생 시점 미리보기를 그대로 볼 수 있어야 한다).
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useDebounce } from '@/hooks/use-debounce';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { ActivitiesHeader, ALL_FILTER, type ActivityScope } from './components/ActivitiesHeader';
import { ActivitiesGuideDialog } from './components/guide/ActivitiesGuideDialog';
import { ActivityDetailDialog } from './components/ActivityDetailDialog';
import { ActivityFormDialog } from './components/ActivityFormDialog';
import { CategoryBoard } from './components/CategoryBoard';
import { ActivityDraftWidget, type ActivityDraftSeed } from './components/ActivityDraftWidget';
import { ProposalBoard } from './components/ProposalBoard';
import { InquiryExploreBoard } from './components/InquiryExploreBoard';
import { InquiryActivityDialog } from './components/InquiryActivityDialog';
import { ProposalFormDialog } from './components/ProposalFormDialog';
import {
  useActivities,
  useActivity,
  useActivityParticipants,
  useCreateActivity,
  useDeleteActivity,
  useUpdateActivity,
} from './hooks/useActivities';
import { useActivityAccess } from './hooks/useActivityAccess';
import { useActivityHosts, useMyActivityHosts } from './hooks/useActivityHosts';
import { useActivityProposals, useCreateProposal, useReviewProposal } from './hooks/useActivityProposals';
import { getAreaGroup, type ActivityAreaGroup } from './utils/activityLabels';
import type { ActivityProposalInput, ActivityProposalRow, ActivityListItem } from './types';
import { UNCATEGORIZED } from './utils/categories';
import type { ActivityWithContext, ParticipantInput } from './types';

export default function CreativeActivitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const access = useActivityAccess();
  const { data: term } = useAcademicTerm();
  const { data: hosts = [] } = useActivityHosts();

  const [scope, setScope] = useState<ActivityScope>(() =>
    searchParams.get('scope') === 'proposals' || searchParams.get('proposal') ? 'proposals' : 'browse'
  );
  const proposalLinkId = searchParams.get('proposal');
  const proposalScope = searchParams.get('scope') === 'proposals';
  useEffect(() => {
    if (proposalScope || proposalLinkId) setScope('proposals');
  }, [proposalScope, proposalLinkId]);
  const [search, setSearch] = useState('');
  const [areaGroup, setAreaGroup] = useState<ActivityAreaGroup | null>(null);
  const [hostId, setHostId] = useState<string>(ALL_FILTER);
  const [year, setYear] = useState<string>(ALL_FILTER);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  /** 탐구 탐색에서 연 활동. 이웃을 눌러 이어 갈 수 있어야 하므로 id 만 들고 있는다. */
  const [inquiryId, setInquiryId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  /** 사용 방법 — 지금 보고 있는 세그먼트(`scope`)의 안내를 연다 */
  const [guideOpen, setGuideOpen] = useState(false);

  // **상세·편집은 id 로 들고 전문을 따로 받는다.** 목록 행(`ActivityListItem`)에는
  // 본문 전문이 없다 — 발췌만 온다(전송량 −46.2%). 목록 객체를 그대로 폼에 실으면
  // 잘린 본문이 저장되어 원본을 덮으므로, 그 경로를 아예 만들지 않는다.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 제안 → 활동 개설. 저장이 끝나면 이 제안에 resulting_activity_id를 잇는다.
  const [formSeed, setFormSeed] = useState<
    | (ActivityDraftSeed & { lineageParentId?: string | null })
    | null
  >(null);
  const [seedProposalId, setSeedProposalId] = useState<string | null>(null);

  // 제안 작성. '이 활동 이어가기'로 열리면 그 활동이 계보 부모가 된다.
  const [proposalFormOpen, setProposalFormOpen] = useState(false);
  const [proposalParent, setProposalParent] = useState<ActivityWithContext | null>(null);

  // 서버 필터 — 영역 그룹은 여러 area 값으로 펼쳐지므로 클라이언트에서 거른다.
  const serverFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      hostId: hostId === ALL_FILTER ? null : hostId,
      academicYear: year === ALL_FILTER ? null : Number(year),
    }),
    [debouncedSearch, hostId, year]
  );

  const { data: allActivities = [], isLoading } = useActivities(serverFilters);

  // ?activity=<id> 딥링크 — 공지 내부 링크 `[[activity:id|라벨]]`가 여기로 들어온다.
  // 목록에 없을 수도 있으므로(필터·연도 밖) 단건 조회로 폴백한다.
  //
  // **한 번만 소비한다.** 상세를 열면 URL에 같은 id가 남는데, 수정하러 상세를 닫는
  // 순간 조건(`deepLinked && !detail`)이 다시 참이 되어 상세가 폼 위로 되살아난다
  // (실제 버그였다). 소비한 id를 기억해 두 번 열지 않는다.
  const deepLinkId = searchParams.get('activity');
  const consumedDeepLink = useRef<string | null>(null);
  const wantsDeepLink = !!deepLinkId && consumedDeepLink.current !== deepLinkId && !detailId;
  const { data: deepLinked } = useActivity(wantsDeepLink ? deepLinkId : null);

  // 전문(본문·meta 포함)은 여기서만 온다. 열려 있을 때 한 건뿐이라 값이 싸다.
  const { data: detail = null } = useActivity(detailId);
  const { data: editing = null } = useActivity(editingId);
  const { data: editingParticipants = [] } = useActivityParticipants(editingId);

  const createMutation = useCreateActivity();
  const updateMutation = useUpdateActivity();
  const deleteMutation = useDeleteActivity();

  // 학생이 기록할 때 고를 수 있는 주최 = 내 소속 동아리
  const { data: myHosts = [] } = useMyActivityHosts(
    access.clubOnly ? access.myStudentCode : null,
    term?.year ?? null
  );

  const { data: proposals = [], isLoading: proposalsLoading } = useActivityProposals(
    access.myStudentCode
  );
  const createProposal = useCreateProposal();
  const reviewProposal = useReviewProposal();

  const pendingProposalCount = useMemo(
    () => proposals.filter((p) => p.status === 'submitted' || p.status === 'reviewing').length,
    [proposals]
  );

  const mineIds = useMemo(
    () => new Set(allActivities.filter((a) => access.canManage(a)).map((a) => a.id)),
    [allActivities, access]
  );

  /** 범위(전체/내 것) + 영역 그룹까지 적용한 목록. 카테고리 타일이 이 결과로 만들어진다. */
  const activities = useMemo(() => {
    let list = allActivities;
    if (scope === 'mine' && !access.isStudent) list = list.filter((a) => mineIds.has(a.id));
    if (areaGroup) list = list.filter((a) => getAreaGroup(a.area) === areaGroup);
    return list;
  }, [allActivities, scope, areaGroup, mineIds, access.isStudent]);

  const areaGroupCounts = useMemo(() => {
    const base = scope === 'mine' && !access.isStudent
      ? allActivities.filter((a) => mineIds.has(a.id))
      : allActivities;
    const counts = new Map<ActivityAreaGroup, number>();
    for (const a of base) {
      const g = getAreaGroup(a.area);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return counts;
  }, [allActivities, scope, mineIds, access.isStudent]);

  const totalForChips = useMemo(
    () =>
      scope === 'mine' && !access.isStudent
        ? mineIds.size
        : allActivities.length,
    [scope, access.isStudent, mineIds, allActivities.length]
  );

  const yearOptions = useMemo(() => {
    const years = new Set(allActivities.map((a) => a.academic_year));
    if (term?.year) years.add(term.year);
    return [...years].sort((a, b) => b - a);
  }, [allActivities, term?.year]);

  // 딥링크로 들어온 활동을 상세 모달로 연다. RLS가 막으면 조용히 아무 일도 없다
  // (비공개 활동 링크를 받은 학생에게 오류 화면을 띄울 이유가 없다).
  useEffect(() => {
    if (!wantsDeepLink || !deepLinked) return;
    consumedDeepLink.current = deepLinked.id;
    setDetailId(deepLinked.id);
  }, [wantsDeepLink, deepLinked]);

  // 필터가 바뀌어 선택한 분야가 사라지면 첫 화면(타일 그리드)으로 되돌린다.
  // 그러지 않으면 "선택돼 있는데 목록이 빈" 상태로 갇힌다.
  useEffect(() => {
    if (!categoryKey) return;
    const stillExists = activities.some(
      (a) =>
        a.career_fields.includes(categoryKey) ||
        (categoryKey === UNCATEGORIZED && a.career_fields.length === 0)
    );
    if (!stillExists) setCategoryKey(null);
  }, [activities, categoryKey]);

  const openDetail = (activity: ActivityListItem | ActivityWithContext) => {
    setDetailId(activity.id);
    searchParams.set('activity', activity.id);
    setSearchParams(searchParams, { replace: true });
  };

  const closeDetail = () => {
    setDetailId(null);
    if (searchParams.has('activity')) {
      searchParams.delete('activity');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setFormSeed(null);
    setSeedProposalId(null);
    setFormOpen(true);
  };

  const startEdit = (activity: ActivityListItem | ActivityWithContext) => {
    setEditingId(activity.id);
    setFormSeed(null);
    setSeedProposalId(null);
    // setDetail(null)이 아니라 closeDetail() — URL의 ?activity=도 함께 지워야
    // 딥링크가 상세를 폼 위로 되살리지 않는다.
    closeDetail();
    setFormOpen(true);
  };

  /** 활동 상세의 '이 활동 이어가기' — 제안이 계보의 마디가 되는 입구 */
  const startContinue = (activity: ActivityWithContext) => {
    setProposalParent(activity);
    closeDetail();
    setProposalFormOpen(true);
  };

  const handleSubmit = async (payload: {
    input: Parameters<typeof createMutation.mutateAsync>[0]['input'];
    teachers: { resource_id: string; role: 'lead' | 'co' | 'support' }[];
    participants: ParticipantInput[];
    hostIds: string[];
  }) => {
    if (editing) {
      // 한 번의 저장 = 한 mutation = 토스트 하나.
      // 예전에는 셋으로 나뉘어 "수정했습니다" 뒤에 "변경 사항이 없습니다"가 따라붙었다.
      await updateMutation.mutateAsync({
        id: editing.id,
        patch: payload.input,
        teachers: payload.teachers,
        participants: payload.participants,
        hostIds: payload.hostIds,
      });
    } else {
      const created = await createMutation.mutateAsync(payload);
      // 제안에서 개설한 것이면 그 제안에 결과 활동을 잇는다 — 제안자가 결과를 볼 수 있어야 한다.
      if (seedProposalId && created?.activity?.id) {
        await reviewProposal.mutateAsync({
          id: seedProposalId,
          status: 'accepted',
          resultingActivityId: created.activity.id,
        });
      }
    }
    setFormOpen(false);
    setEditingId(null);
    setFormSeed(null);
    setSeedProposalId(null);
  };

  /**
   * AI 초안으로 활동 기록 폼을 연다.
   * **저장하지 않는다** — 이 기록이 생기부의 근거가 되므로 사람이 확인해야 한다.
   */
  const useDraft = (seed: ActivityDraftSeed) => {
    setEditingId(null);
    setSeedProposalId(null);
    setFormSeed(seed);
    setFormOpen(true);
  };

  // 동아리 화면 «활동 기록하기»(2026-11-11) — ?newActivityHost=<activity_host id> 로 주최를 채운 새 폼. 한 번만 소비한다
  const newHostParam = searchParams.get('newActivityHost');
  useEffect(() => {
    if (!newHostParam) return;
    setEditingId(null);
    setSeedProposalId(null);
    setFormSeed({ areaGroup: 'club', hostId: newHostParam });
    setFormOpen(true);
    searchParams.delete('newActivityHost');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newHostParam]);

  /** 제안을 활동으로 개설 — 폼을 제안 내용으로 씨앗 채워 연다 */
  const openProposalAsActivity = (proposal: ActivityProposalRow) => {
    setEditingId(null);
    setFormSeed({
      name: proposal.title.replace(/\s*이어가기$/, ''),
      areaGroup: getAreaGroup(proposal.area),
      careerFields: proposal.career_fields,
      lineageParentId: proposal.parent_activity_id,
    });
    setSeedProposalId(proposal.id);
    setFormOpen(true);
  };

  const submitProposal = async (input: ActivityProposalInput) => {
    await createProposal.mutateAsync(input);
    setProposalFormOpen(false);
    setProposalParent(null);
  };

  const handleDelete = async (activity: ActivityWithContext) => {
    if (!window.confirm(`'${activity.name}' 활동을 삭제할까요?\n참여 기록도 함께 사라집니다.`)) {
      return;
    }
    await deleteMutation.mutateAsync(activity.id);
    closeDetail();
  };

  const hasFilter =
    !!search || areaGroup !== null || hostId !== ALL_FILTER || year !== ALL_FILTER;

  const clearFilters = () => {
    setSearch('');
    setAreaGroup(null);
    setHostId(ALL_FILTER);
    setYear(ALL_FILTER);
  };

  const isMineScope = scope === 'mine';

  return (
    <Layout>
      {/* Layout의 <main>이 이미 p-2 sm:p-3 md:p-4 lg:p-6을 준다.
          여기서 패딩·max-width를 또 주면 다른 화면보다 안쪽으로 밀린다(연수 이수증과 동일 규약). */}
      <PageContainer className="relative">
        <ActivitiesHeader
          scope={scope}
          onScopeChange={(s) => {
            setScope(s);
            setCategoryKey(null);
          }}
          mineLabel={access.isStudent ? '내 활동' : '내 담당'}
          mineCount={access.isStudent ? 0 : mineIds.size}
          pendingProposalCount={pendingProposalCount}
          search={search}
          onSearchChange={setSearch}
          areaGroup={areaGroup}
          onAreaGroupChange={setAreaGroup}
          areaGroupCounts={areaGroupCounts}
          totalCount={totalForChips}
          year={year}
          onYearChange={setYear}
          yearOptions={yearOptions}
          hostId={hostId}
          onHostChange={setHostId}
          hosts={hosts}
          hasFilter={hasFilter}
          onClearFilters={clearFilters}
          canCreate={access.canCreate}
          onCreate={startCreate}
          onPropose={() => {
            setProposalParent(null);
            setProposalFormOpen(true);
          }}
          onGuide={() => setGuideOpen(true)}
        />

        {scope === 'explore' ? (
          <InquiryExploreBoard
            onOpenActivity={setInquiryId}
            /* 활동 기록 쓰기 권한이 있을 때만 — 학생에게는 버튼 자체를 그리지 않는다 */
            onSeedActivity={access.canCreate ? useDraft : undefined}
          />
        ) : scope === 'proposals' ? (
          <ProposalBoard
            proposals={proposals}
            highlightedProposalId={proposalLinkId}
            isLoading={proposalsLoading}
            myStudentCode={access.myStudentCode}
            myProfileId={access.myProfileId}
            canReview={access.canReview}
            isManager={access.isManager}
            onCreate={() => {
              setProposalParent(null);
              setProposalFormOpen(true);
            }}
            onOpenAsActivity={openProposalAsActivity}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <CategoryBoard
            activities={activities}
            selectedKey={categoryKey}
            onSelect={setCategoryKey}
            onOpenActivity={openDetail}
            canManage={access.canManage}
            emptyTitle={
              hasFilter
                ? '조건에 맞는 활동이 없습니다'
                : isMineScope
                  ? access.isStudent
                    ? '참여한 활동이 없습니다'
                    : '담당한 활동이 없습니다'
                  : '아직 기록된 활동이 없습니다'
            }
            emptyHint={
              hasFilter
                ? '검색어나 범주를 바꿔 보세요.'
                : isMineScope
                  ? access.isStudent
                    ? '활동에 참여하면 선생님이 등록해 주고, 여기에 쌓입니다.'
                    : '활동을 기록하거나 담당 교사로 지정되면 여기에 모입니다.'
                  : access.canCreate
                    ? '첫 활동을 기록해 보세요. 동아리 명단은 이미 등록돼 있어 참여자를 한 번에 불러올 수 있습니다.'
                    : '선생님이 활동을 기록하면 여기에 나타납니다.'
            }
          />
        )}
      </PageContainer>

      {/* 사용 방법 — 세그먼트마다 다른 안내가 열린다(전체·내 담당은 같은 보드라 하나) */}
      <ActivitiesGuideDialog tab={scope} open={guideOpen} onOpenChange={setGuideOpen} />

      <InquiryActivityDialog
        activityId={inquiryId}
        onClose={() => setInquiryId(null)}
        onOpenActivity={setInquiryId}
        onSeedActivity={access.canCreate ? useDraft : undefined}
      />

      <ActivityDetailDialog
        activity={detail}
        open={!!detail}
        onOpenChange={(v) => !v && closeDetail()}
        canManage={detail ? access.canManage(detail) : false}
        onEdit={startEdit}
        onDelete={handleDelete}
        isDeleting={deleteMutation.isPending}
        myStudentCode={access.myStudentCode}
        myProfileId={access.myProfileId}
        onContinue={startContinue}
      />

      <ActivityFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingId(null);
        }}
        activity={editing}
        initialParticipants={editing ? editingParticipants : undefined}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        myResourceId={access.myResourceId}
        seed={formSeed}
        clubOnly={access.clubOnly}
        myHosts={myHosts}
      />

      {/* AI 초안 — 활동을 만들 수 있는 사람에게만. 생기부 분석과 같은 자리(우측 하단) */}
      {access.canCreate && (
        <ActivityDraftWidget hosts={hosts} onUseDraft={useDraft} />
      )}

      <ProposalFormDialog
        open={proposalFormOpen}
        onOpenChange={(v) => {
          setProposalFormOpen(v);
          if (!v) setProposalParent(null);
        }}
        parentActivity={proposalParent}
        myStudentCode={access.myStudentCode}
        onSubmit={submitProposal}
        isSubmitting={createProposal.isPending}
      />
    </Layout>
  );
}
